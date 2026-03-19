require("dotenv").config();
const express = require("express");
const cors = require("cors");
const Anthropic = require("@anthropic-ai/sdk");
const rateLimit = require("express-rate-limit");

const app = express();
const PORT = process.env.PORT || 3001;

app.use(express.json());

const allowedOrigins = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  process.env.FRONTEND_ORIGIN || "https://sbhutta123.github.io",
];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error("Not allowed by CORS"));
  },
}));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: { error: "Too many requests. Please try again in a few minutes." },
});
app.use("/api/", limiter);

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ── ESPN API with date-range queries ─────────────────────────
const ROUND_DATES = {
  mens: {
    "First Round":  ["20260319", "20260320"],
    "Second Round": ["20260321", "20260322"],
    "Sweet 16":     ["20260327", "20260328"],
    "Elite 8":      ["20260329", "20260330"],
    "Final Four":   ["20260404"],
    "Championship": ["20260406"],
  },
  womens: {
    "First Round":  ["20260320", "20260321"],
    "Second Round": ["20260322", "20260323"],
    "Sweet 16":     ["20260327", "20260328"],
    "Elite 8":      ["20260329", "20260330"],
    "Final Four":   ["20260403"],
    "Championship": ["20260405"],
  },
};

const ESPN_RANKINGS = {
  mens: "https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/rankings",
  womens: "https://site.api.espn.com/apis/site/v2/sports/basketball/womens-college-basketball/rankings",
};

async function safeFetch(url) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) {
      console.error(`safeFetch ${url} -> ${res.status}`);
      return null;
    }
    return await res.json();
  } catch (e) {
    console.error(`safeFetch error ${url}:`, e.message);
    return null;
  }
}

function getRoundFromDate(dateStr, tournament) {
  const dates = ROUND_DATES[tournament] || ROUND_DATES.mens;
  for (const [round, roundDates] of Object.entries(dates)) {
    if (roundDates.includes(dateStr)) return round;
  }
  return null;
}

function parseESPNCompetitor(c) {
  const seed = c?.seed || c?.curatedRank?.current || null;
  return {
    name: c?.team?.displayName || "TBD",
    seed: seed ? parseInt(seed) : null,
    score: c?.score || null,
    record: c?.records?.[0]?.summary || c?.team?.record || "",
    winner: c?.winner || false,
  };
}

function isTournamentGame(event) {
  const notes = event.competitions?.[0]?.notes || [];
  return notes.some(n =>
    n.headline?.toLowerCase().includes("championship") ||
    n.headline?.toLowerCase().includes("ncaa")
  );
}

function extractRegionFromNotes(notes) {
  const headline = notes?.find(n => n.headline)?.headline || "";
  const match = headline.match(/(East|West|South|Midwest)/i);
  return match ? match[1] : null;
}

// Fetch all tournament games by querying ESPN per round date
async function fetchAllTournamentGames(tournament) {
  const league = tournament === "womens"
    ? "womens-college-basketball"
    : "mens-college-basketball";
  const allGames = [];

  const roundDates = ROUND_DATES[tournament] || ROUND_DATES.mens;
  const allDates = Object.values(roundDates).flat();

  await Promise.all(allDates.map(async (dateStr) => {
    const url = `https://site.api.espn.com/apis/site/v2/sports/basketball/${league}/scoreboard?dates=${dateStr}&groups=100&limit=100`;
    const data = await safeFetch(url);
    if (!data?.events?.length) return;

    const round = getRoundFromDate(dateStr, tournament);

    // Filter to NCAA tournament games using notes headline
    const tourneyEvents = data.events.filter(isTournamentGame);
    console.log(`${dateStr}: ${data.events.length} total events, ${tourneyEvents.length} tournament games`);

    tourneyEvents.forEach(event => {
      const comp = event.competitions?.[0];
      const competitors = comp?.competitors || [];
      const home = competitors.find(c => c.homeAway === "home");
      const away = competitors.find(c => c.homeAway === "away");
      const notes = comp?.notes || [];
      const region = extractRegionFromNotes(notes);

      allGames.push({
        id: event.id,
        round: round || "Tournament",
        date: dateStr,
        status: comp?.status?.type?.description || "",
        region,
        home: parseESPNCompetitor(home),
        away: parseESPNCompetitor(away),
      });
    });
  }));

  console.log(`Total tournament games fetched: ${allGames.length}`);
  return allGames;
}

async function fetchRankings(tournament) {
  const url = ESPN_RANKINGS[tournament === "womens" ? "womens" : "mens"];
  const data = await safeFetch(url);
  if (!data?.rankings?.length) return [];
  const poll = data.rankings.find(r => r.name?.toLowerCase().includes("ap")) || data.rankings[0];
  return (poll?.ranks || []).slice(0, 25).map(r => ({
    rank: r.current,
    name: r.team?.displayName || r.team?.name,
    record: r.team?.record || "",
  }));
}

const ROUND_ORDER = ["First Round", "Second Round", "Sweet 16", "Elite 8", "Final Four", "Championship"];

function getPossibleOpponents(teamName, targetRound, allGames, allTeamMap) {
  const targetIdx = ROUND_ORDER.indexOf(targetRound);
  if (targetIdx < 0) return [];

  // Get team's region from their first round game
  const teamGames = allGames.filter(g => g.home.name === teamName || g.away.name === teamName);
  const teamRegion = teamGames.find(g => g.region)?.region || null;

  // Build set of eliminated teams (lost a final game)
  const eliminated = new Set();
  allGames.forEach(g => {
    const s = g.status?.toLowerCase() || "";
    if (s.includes("final") || s.includes("post")) {
      if (!g.home.winner && g.away.winner) eliminated.add(g.home.name);
      if (!g.away.winner && g.home.winner) eliminated.add(g.away.name);
    }
  });

  // Get all teams from same region's first round games
  const regionTeams = new Map();
  const firstRoundGames = allGames.filter(g => g.round === "First Round");

  firstRoundGames
    .filter(g => targetIdx < 4 ? (!teamRegion || g.region === teamRegion) : true)
    .forEach(g => {
      [g.home, g.away].forEach(t => {
        if (t.name && t.name !== "TBD" && t.name !== teamName) {
          regionTeams.set(t.name, { name: t.name, seed: t.seed, record: t.record });
        }
      });
    });

  // Return non-eliminated candidates sorted by seed
  return Array.from(regionTeams.values())
    .filter(t => !eliminated.has(t.name))
    .sort((a, b) => (a.seed || 99) - (b.seed || 99))
    .slice(0, 8)
    .map(t => ({ ...t, confirmed: false }));
}

// ── /api/bracket ─────────────────────────────────────────────
app.get("/api/bracket", async (req, res) => {
  const { tournament } = req.query;
  if (!tournament) return res.status(400).json({ error: "tournament required" });

  const games = await fetchAllTournamentGames(tournament);

  if (!games.length) {
    return res.json({ ok: true, teams: [], games: [] });
  }

  // Build team map
  const teamMap = new Map();
  games.forEach(game => {
    [{ team: game.away, opp: game.home }, { team: game.home, opp: game.away }].forEach(({ team, opp }) => {
      if (!team.name || team.name === "TBD") return;
      if (!teamMap.has(team.name)) {
        teamMap.set(team.name, { name: team.name, seed: team.seed, record: team.record, games: [] });
      }
      teamMap.get(team.name).games.push({
        round: game.round,
        date: game.date,
        status: game.status,
        opponent: opp.name,
        opponentSeed: opp.seed,
        gameId: game.id,
        region: game.region,
      });
    });
  });

  const allTeams = Array.from(teamMap.values()).sort((a, b) => {
    if (a.seed && b.seed) return a.seed - b.seed;
    return a.name.localeCompare(b.name);
  });

  // Add possible opponents for future rounds
  allTeams.forEach(team => {
    const knownRounds = new Set(team.games.map(g => g.round));
    const lastKnownIdx = Math.max(...Array.from(knownRounds).map(r => ROUND_ORDER.indexOf(r)).filter(i => i >= 0));

    for (let i = lastKnownIdx + 1; i < ROUND_ORDER.length; i++) {
      const futureRound = ROUND_ORDER[i];
      const possible = getPossibleOpponents(team.name, futureRound, games, teamMap);
      if (possible.length > 0) {
        team.games.push({
          round: futureRound,
          date: null,
          status: "Upcoming",
          opponent: "TBD",
          opponentSeed: null,
          gameId: null,
          region: team.games[0]?.region || null,
          possibleOpponents: possible,
        });
      }
    }
  });

  return res.json({ ok: true, teams: allTeams, games });
});

// ── /api/predict ─────────────────────────────────────────────
app.post("/api/predict", async (req, res) => {
  const { tournament, team1, team2, round, freeform, mode } = req.body;
  if (!tournament) return res.status(400).json({ error: "tournament is required" });

  const tournamentLabel = tournament === "womens" ? "Women's NCAA 2026" : "Men's NCAA 2026";

  const [games, rankings] = await Promise.all([
    fetchAllTournamentGames(tournament),
    fetchRankings(tournament),
  ]);

  const lines = [];
  if (rankings.length > 0) {
    lines.push("=== AP RANKINGS ===");
    rankings.forEach(r => lines.push(`#${r.rank} ${r.name} (${r.record})`));
  }
  if (games.length > 0) {
    lines.push("\n=== 2026 NCAA TOURNAMENT BRACKET ===");
    games.forEach(g => {
      const away = `${g.away.name}${g.away.seed ? ` (#${g.away.seed})` : ""} ${g.away.record}`;
      const home = `${g.home.name}${g.home.seed ? ` (#${g.home.seed})` : ""} ${g.home.record}`;
      let line = `${away} vs ${home} | ${g.status}`;
      if (g.away.score !== null && g.home.score !== null) {
        line += ` | ${g.away.score}-${g.home.score}`;
        if (g.away.winner) line += ` | WINNER: ${g.away.name}`;
        else if (g.home.winner) line += ` | WINNER: ${g.home.name}`;
      }
      if (g.round) line += ` | ${g.round}`;
      if (g.region) line += ` | ${g.region} Region`;
      lines.push(line);
    });
  } else {
    lines.push("\n[No tournament data found]");
  }

  const liveSection = `\n\n=== LIVE 2026 NCAA TOURNAMENT DATA ===\n${lines.join("\n")}\n=== END DATA ===\n`;

  const systemPrompt = `You are an expert NCAA March Madness analyst for the 2026 tournament. You have live bracket data with real seeds, records, regions, and results. Use this as your PRIMARY source.

Always respond with ONLY a valid JSON object — no markdown, no backticks:
{
  "winner": "Team name or concise answer",
  "confidence": 72,
  "subtitle": "e.g. '#1 seed East · 29-3 record'",
  "keyFactors": ["Factor one", "Factor two", "Factor three"],
  "analysis": "2-3 sentences using real 2026 data.",
  "darkHorse": "Optional — omit key entirely if not applicable"
}
Rules: confidence 50-95 integer, keyFactors 2-4 items.
IMPORTANT: Before predicting, use web search to find current injury reports, recent player performance, and any breaking news about the teams. Search for things like "[team name] injuries 2026 NCAA tournament" or "[team name] vs [team name] prediction". Incorporate what you find into your analysis.`;

  let userMessage;
  if (mode === "analyze" && freeform) {
    userMessage = `Tournament: ${tournamentLabel}${liveSection}\nQuestion: ${freeform}`;
  } else if (team1 && team2) {
    userMessage = `Tournament: ${tournamentLabel}${liveSection}\nMatchup: ${team1} vs ${team2}${round ? ` in the ${round}` : ""}. Predict the winner.`;
  } else {
    return res.status(400).json({ error: "Provide team1+team2 or freeform." });
  }

  try {
    const messages = [{ role: "user", content: userMessage }];

    // First call with web search enabled
    let response = await anthropic.messages.create({
      model: "claude-opus-4-5",
      max_tokens: 2000,
      system: systemPrompt,
      tools: [{ type: "web_search_20250305", name: "web_search" }],
      messages,
    });

    // Agentic loop — keep going while Claude wants to search
    while (response.stop_reason === "tool_use") {
      messages.push({ role: "assistant", content: response.content });
      const toolResults = response.content
        .filter(b => b.type === "tool_use")
        .map(block => ({ type: "tool_result", tool_use_id: block.id, content: "Search completed." }));
      messages.push({ role: "user", content: toolResults });
      response = await anthropic.messages.create({
        model: "claude-opus-4-5",
        max_tokens: 2000,
        system: systemPrompt,
        tools: [{ type: "web_search_20250305", name: "web_search" }],
        messages,
      });
    }

    const raw = response.content.map(b => b.type === "text" ? b.text : "").join("");
    let parsed;
    try {
      parsed = JSON.parse(raw.replace(/```json|```/g, "").trim());
    } catch {
      const match = raw.match(/\{[\s\S]*\}/);
      if (!match) throw new Error("Model returned non-JSON response");
      parsed = JSON.parse(match[0]);
    }

    return res.json({ ok: true, prediction: parsed });
  } catch (err) {
    console.error("Predict error:", err.message);
    return res.status(500).json({ error: err.message || "Prediction failed." });
  }
});

app.get("/api/status", async (_req, res) => {
  const [mens, womens] = await Promise.all([
    fetchAllTournamentGames("mens"),
    fetchAllTournamentGames("womens"),
  ]);
  res.json({
    mens: { games: mens.length, live: mens.filter(g => g.status === "In Progress").length },
    womens: { games: womens.length, live: womens.filter(g => g.status === "In Progress").length },
  });
});

app.get("/health", (_req, res) => res.json({ status: "ok" }));
app.listen(PORT, () => console.log(`🏀 March Madness API running on port ${PORT}`));
