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

const TOURNAMENT_DATES = "20260319-20260407";

const ESPN_URLS = {
  mens: `https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/scoreboard?dates=${TOURNAMENT_DATES}&groups=50&limit=200`,
  womens: `https://site.api.espn.com/apis/site/v2/sports/basketball/womens-college-basketball/scoreboard?dates=${TOURNAMENT_DATES}&groups=50&limit=200`,
  mensRankings: "https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/rankings",
  womensRankings: "https://site.api.espn.com/apis/site/v2/sports/basketball/womens-college-basketball/rankings",
};

async function safeFetch(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

function parseCompetitor(c) {
  return {
    name: c?.team?.displayName || "TBD",
    abbrev: c?.team?.abbreviation || "",
    seed: c?.seed || null,
    score: c?.score || null,
    record: c?.records?.[0]?.summary || "",
    winner: c?.winner || false,
    id: c?.team?.id || null,
  };
}

function extractRegion(notes, name) {
  // Try to extract region from notes headline or event name
  const text = (notes?.map(n => n.headline).join(" ") || "") + " " + (name || "");
  const regions = ["East", "West", "South", "Midwest"];
  for (const r of regions) {
    if (text.includes(r)) return r;
  }
  return null;
}

function normalizeRoundName(str) {
  if (!str) return "";
  const s = str.toLowerCase();
  if (s.includes("first") || s.includes("1st") || s.includes("round of 64")) return "First Round";
  if (s.includes("second") || s.includes("2nd") || s.includes("round of 32")) return "Second Round";
  if (s.includes("sweet") || s.includes("16")) return "Sweet 16";
  if (s.includes("elite") || s.includes("eight") || s.includes("8")) return "Elite 8";
  if (s.includes("final four") || s.includes("semifinal")) return "Final Four";
  if (s.includes("championship") || s.includes("national") || s.includes("title")) return "Championship";
  return str;
}

async function fetchAllTournamentGames(tournament) {
  const data = await safeFetch(ESPN_URLS[tournament]);
  if (!data?.events?.length) return [];

  // Only keep events that have seeded teams (= tournament games)
  const events = data.events.filter(e =>
    e.competitions?.[0]?.competitors?.some(c => c.seed)
  );

  return events.map(event => {
    const comp = event.competitions?.[0];
    const competitors = comp?.competitors || [];
    const home = competitors.find(c => c.homeAway === "home");
    const away = competitors.find(c => c.homeAway === "away");
    const notes = comp?.notes || [];
    const roundNote = notes.find(n => n.headline)?.headline || event.name || "";
    const region = extractRegion(notes, event.name);

    return {
      id: event.id,
      name: event.name,
      round: normalizeRoundName(roundNote),
      rawRound: roundNote,
      region,
      date: event.date,
      status: comp?.status?.type?.description || "",
      home: parseCompetitor(home),
      away: parseCompetitor(away),
    };
  });
}

async function fetchRankings(tournament) {
  const data = await safeFetch(ESPN_URLS[tournament === "womens" ? "womensRankings" : "mensRankings"]);
  if (!data?.rankings?.length) return [];
  const poll = data.rankings.find(r => r.name?.toLowerCase().includes("ap")) || data.rankings[0];
  return (poll?.ranks || []).slice(0, 25).map(r => ({
    rank: r.current,
    name: r.team?.displayName || r.team?.name,
    record: r.team?.record || "",
  }));
}

// For a given team + round, return possible opponents:
// - If the game is already scheduled (opponent known): return that opponent only
// - If future round: return all still-alive teams in that round's opposite bracket half
function getPossibleOpponents(teamName, targetRound, allGames, allTeams) {
  const ROUND_ORDER = ["First Round", "Second Round", "Sweet 16", "Elite 8", "Final Four", "Championship"];
  const targetIdx = ROUND_ORDER.indexOf(targetRound);

  // Find the team's game in targetRound
  const teamGame = allGames.find(g =>
    g.round === targetRound &&
    (g.home.name === teamName || g.away.name === teamName)
  );

  if (teamGame) {
    // Opponent is already known
    const opp = teamGame.home.name === teamName ? teamGame.away : teamGame.home;
    if (opp.name && opp.name !== "TBD") {
      return [{ name: opp.name, seed: opp.seed, record: opp.record, confirmed: true }];
    }
  }

  // Future round — figure out which teams could potentially be the opponent
  // Find team's region by looking at their known games
  const teamGames = allGames.filter(g =>
    g.home.name === teamName || g.away.name === teamName
  );
  const teamRegion = teamGames.find(g => g.region)?.region || null;

  // For Final Four / Championship, opponents come from other regions
  // For rounds within a region, opponents come from the same region's other half

  // Get all teams still alive (not yet eliminated) or scheduled in relevant rounds
  const aliveTeams = new Set();
  allGames
    .filter(g => {
      const roundIdx = ROUND_ORDER.indexOf(g.round);
      return roundIdx >= targetIdx - 1; // games at or near target round
    })
    .forEach(g => {
      // Add winners of completed games
      if (g.status?.toLowerCase().includes("final")) {
        if (g.home.winner) aliveTeams.add(g.home.name);
        if (g.away.winner) aliveTeams.add(g.away.name);
      } else {
        // Upcoming games — both teams still alive
        if (g.home.name !== "TBD") aliveTeams.add(g.home.name);
        if (g.away.name !== "TBD") aliveTeams.add(g.away.name);
      }
    });

  // Remove the team itself
  aliveTeams.delete(teamName);

  // For regional rounds (up to Elite 8), filter to same region
  let candidates = Array.from(aliveTeams);
  if (teamRegion && targetIdx < 4) {
    const sameRegion = candidates.filter(name => {
      const g = allGames.find(game =>
        (game.home.name === name || game.away.name === name) && game.region === teamRegion
      );
      return !!g;
    });
    if (sameRegion.length > 0) candidates = sameRegion;
  }

  // Remove the team itself and enrich with seed/record
  return candidates
    .filter(name => name !== teamName)
    .map(name => {
      const teamInfo = allTeams.find(t => t.name === name);
      return {
        name,
        seed: teamInfo?.seed || null,
        record: teamInfo?.record || "",
        confirmed: false,
      };
    })
    .sort((a, b) => (a.seed || 99) - (b.seed || 99))
    .slice(0, 8); // cap at 8 options
}

// ── /api/bracket ─────────────────────────────────────────────
app.get("/api/bracket", async (req, res) => {
  const { tournament } = req.query;
  if (!tournament) return res.status(400).json({ error: "tournament required" });

  const games = await fetchAllTournamentGames(tournament);
  if (!games.length) return res.json({ ok: true, teams: [], games: [] });

  const ROUND_ORDER = ["First Round", "Second Round", "Sweet 16", "Elite 8", "Final Four", "Championship"];

  const teamMap = new Map();
  games.forEach(game => {
    [
      { team: game.away, opp: game.home },
      { team: game.home, opp: game.away },
    ].forEach(({ team, opp }) => {
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

  // For each team, compute possible opponents for rounds beyond their known games
  allTeams.forEach(team => {
    const knownRounds = new Set(team.games.map(g => g.round));
    const lastKnownIdx = Math.max(...Array.from(knownRounds).map(r => ROUND_ORDER.indexOf(r)));

    // Add possible opponent entries for future rounds
    for (let i = lastKnownIdx + 1; i < ROUND_ORDER.length; i++) {
      const futureRound = ROUND_ORDER[i];
      const possible = getPossibleOpponents(team.name, futureRound, games, allTeams);
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
  }

  const context = lines.join("\n");
  const liveSection = `\n\n=== LIVE ESPN DATA ===\n${context || "[ESPN data unavailable]"}\n=== END ESPN DATA ===\n`;

  const systemPrompt = `You are an expert NCAA March Madness analyst for the 2026 tournament. You have live ESPN bracket data with real seeds, records, regions, and results. Use this as your PRIMARY source.

Always respond with ONLY a valid JSON object — no markdown, no backticks:
{
  "winner": "Team name or concise answer",
  "confidence": 72,
  "subtitle": "e.g. '#1 seed East · 29-3 record'",
  "keyFactors": ["Factor one", "Factor two", "Factor three"],
  "analysis": "2-3 sentences using real 2026 data, seeds, records, and regions.",
  "darkHorse": "Optional upset pick — omit this key entirely if not applicable"
}
Rules: confidence 50-95 integer, keyFactors 2-4 items, always cite real seeds/records.`;

  let userMessage;
  if (mode === "analyze" && freeform) {
    userMessage = `Tournament: ${tournamentLabel}${liveSection}\nQuestion: ${freeform}`;
  } else if (team1 && team2) {
    userMessage = `Tournament: ${tournamentLabel}${liveSection}\nMatchup: ${team1} vs ${team2}${round ? ` in the ${round}` : ""}. Predict the winner.`;
  } else {
    return res.status(400).json({ error: "Provide team1+team2 or freeform." });
  }

  try {
    const message = await anthropic.messages.create({
      model: "claude-opus-4-5",
      max_tokens: 900,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    });

    const raw = message.content.map(b => b.type === "text" ? b.text : "").join("");
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
