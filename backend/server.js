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

// ── NCAA Data API (more reliable for tournament games) ────────
const ROUND_DATES = {
  "First Round":   ["2026/03/19", "2026/03/20"],
  "Second Round":  ["2026/03/21", "2026/03/22"],
  "Sweet 16":      ["2026/03/27", "2026/03/28"],
  "Elite 8":       ["2026/03/29", "2026/03/30"],
  "Final Four":    ["2026/04/04"],
  "Championship":  ["2026/04/06"],
};

const ALL_ROUND_DATES = Object.values(ROUND_DATES).flat();

const ESPN_RANKINGS = {
  mens: "https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/rankings",
  womens: "https://site.api.espn.com/apis/site/v2/sports/basketball/womens-college-basketball/rankings",
};

async function safeFetch(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

function getRoundFromDate(dateStr) {
  for (const [round, dates] of Object.entries(ROUND_DATES)) {
    if (dates.includes(dateStr)) return round;
  }
  return null;
}

// Fetch all tournament games across all round dates from NCAA scoreboard API
async function fetchAllTournamentGames(tournament) {
  const sport = tournament === "womens" ? "basketball-women" : "basketball-men";
  const allGames = [];

  await Promise.all(ALL_ROUND_DATES.map(async (dateStr) => {
    const url = `https://data.ncaa.com/casablanca/scoreboard/${sport}/d1/${dateStr}/scoreboard.json`;
    const data = await safeFetch(url);
    if (!data?.games?.length) return;

    const round = getRoundFromDate(dateStr);

    data.games.forEach(game => {
      const home = game.home;
      const away = game.away;

      // Only include seeded teams (= tournament games)
      if (!home?.seed && !away?.seed) return;

      allGames.push({
        id: game.game?.gameID || `${dateStr}-${home?.names?.short}-${away?.names?.short}`,
        round: round || "Tournament",
        date: dateStr,
        status: game.game?.gameState || "",
        statusDetail: game.game?.contestClock || "",
        region: game.game?.bracketRegion || null,
        home: {
          name: home?.names?.full || home?.names?.short || "TBD",
          shortName: home?.names?.short || "",
          seed: home?.seed ? parseInt(home.seed) : null,
          score: home?.score || null,
          record: home?.record || "",
          winner: game.game?.gameState === "final" && parseInt(home?.score || 0) > parseInt(away?.score || 0),
        },
        away: {
          name: away?.names?.full || away?.names?.short || "TBD",
          shortName: away?.names?.short || "",
          seed: away?.seed ? parseInt(away.seed) : null,
          score: away?.score || null,
          record: away?.record || "",
          winner: game.game?.gameState === "final" && parseInt(away?.score || 0) > parseInt(home?.score || 0),
        },
      });
    });
  }));

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

  // Check if opponent is already known for this round
  const scheduledGame = allGames.find(g =>
    g.round === targetRound &&
    (g.home.name === teamName || g.away.name === teamName)
  );
  if (scheduledGame) {
    const opp = scheduledGame.home.name === teamName ? scheduledGame.away : scheduledGame.home;
    if (opp.name && opp.name !== "TBD") {
      return [{ name: opp.name, seed: opp.seed, record: opp.record, confirmed: true }];
    }
  }

  // Get team's region
  const teamGames = allGames.filter(g => g.home.name === teamName || g.away.name === teamName);
  const teamRegion = teamGames.find(g => g.region)?.region || null;

  // Find teams still alive at target round - 1
  const prevRound = ROUND_ORDER[targetIdx - 1];
  const prevRoundGames = allGames.filter(g => g.round === prevRound);

  const aliveTeams = new Set();
  prevRoundGames.forEach(g => {
    if (g.status === "final") {
      if (g.home.winner) aliveTeams.add(g.home.name);
      if (g.away.winner) aliveTeams.add(g.away.name);
    } else {
      // Game not played yet — both teams still possible
      if (g.home.name !== "TBD") aliveTeams.add(g.home.name);
      if (g.away.name !== "TBD") aliveTeams.add(g.away.name);
    }
  });

  aliveTeams.delete(teamName);

  let candidates = Array.from(aliveTeams);

  // Filter to same region for rounds before Final Four
  if (teamRegion && targetIdx < 4) {
    const sameRegion = candidates.filter(name => {
      const g = allGames.find(game =>
        (game.home.name === name || game.away.name === name) && game.region === teamRegion
      );
      return !!g;
    });
    if (sameRegion.length > 0) candidates = sameRegion;
  }

  return candidates
    .filter(name => name !== teamName)
    .map(name => {
      const info = allTeamMap.get(name);
      return { name, seed: info?.seed || null, record: info?.record || "", confirmed: false };
    })
    .sort((a, b) => (a.seed || 99) - (b.seed || 99))
    .slice(0, 8);
}

// ── /api/bracket ─────────────────────────────────────────────
app.get("/api/bracket", async (req, res) => {
  const { tournament } = req.query;
  if (!tournament) return res.status(400).json({ error: "tournament required" });

  // Debug: test one URL directly
  const sport = tournament === "womens" ? "basketball-women" : "basketball-men";
  const testUrl = `https://data.ncaa.com/casablanca/scoreboard/${sport}/d1/2026/03/19/scoreboard.json`;
  console.log("Testing URL:", testUrl);
  const testData = await safeFetch(testUrl);
  console.log("Test response keys:", testData ? Object.keys(testData) : "null");
  console.log("Games count:", testData?.games?.length || 0);
  if (testData?.games?.length > 0) {
    console.log("First game sample:", JSON.stringify(testData.games[0]).slice(0, 300));
  }

  const games = await fetchAllTournamentGames(tournament);
  console.log("Total games fetched:", games.length);

  if (!games.length) {
    return res.json({ ok: true, teams: [], games: [], debug: { testUrl, testDataKeys: testData ? Object.keys(testData) : null, gamesInTest: testData?.games?.length || 0 } });
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

app.get("/health", (_req, res) => res.json({ status: "ok" }));
app.listen(PORT, () => console.log(`🏀 March Madness API running on port ${PORT}`));
