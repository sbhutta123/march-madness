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

// ── ESPN API URLs ─────────────────────────────────────────────
const BRACKET_URLS = {
  mens: "https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/scoreboard?groups=100&limit=200",
  womens: "https://site.api.espn.com/apis/site/v2/sports/basketball/womens-college-basketball/scoreboard?groups=500&limit=200",
};

const RANKINGS_URLS = {
  mens: "https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/rankings",
  womens: "https://site.api.espn.com/apis/site/v2/sports/basketball/womens-college-basketball/rankings",
};

async function safeFetch(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// Returns all bracket games with teams, seeds, scores, and round info
async function fetchBracket(tournament) {
  const data = await safeFetch(BRACKET_URLS[tournament]);
  if (!data?.events?.length) return [];

  return data.events.map((event) => {
    const comp = event.competitions?.[0];
    const competitors = comp?.competitors || [];
    const home = competitors.find((c) => c.homeAway === "home");
    const away = competitors.find((c) => c.homeAway === "away");

    return {
      id: event.id,
      name: event.name,
      round: event.season?.slug || comp?.series?.title || event.name || "",
      status: comp?.status?.type?.description || "",
      home: {
        name: home?.team?.displayName || "TBD",
        seed: home?.seed || null,
        score: home?.score || null,
        record: home?.records?.[0]?.summary || "",
        winner: home?.winner || false,
      },
      away: {
        name: away?.team?.displayName || "TBD",
        seed: away?.seed || null,
        score: away?.score || null,
        record: away?.records?.[0]?.summary || "",
        winner: away?.winner || false,
      },
    };
  });
}

// Returns ranked teams list
async function fetchRankings(tournament) {
  const data = await safeFetch(RANKINGS_URLS[tournament]);
  if (!data?.rankings?.length) return [];

  const poll = data.rankings.find((r) =>
    r.name?.toLowerCase().includes("ap")
  ) || data.rankings[0];

  return (poll?.ranks || []).slice(0, 25).map((r) => ({
    rank: r.current,
    name: r.team?.displayName || r.team?.name,
    record: r.team?.record || "",
  }));
}

// Build a readable context string for Claude
function buildContext(bracket, rankings, team1, team2) {
  const lines = [];

  if (rankings.length > 0) {
    lines.push("=== CURRENT AP RANKINGS (2025-26) ===");
    rankings.forEach((r) => lines.push(`#${r.rank} ${r.name} (${r.record})`));
  }

  if (bracket.length > 0) {
    lines.push("\n=== LIVE TOURNAMENT BRACKET ===");
    bracket.forEach((g) => {
      const away = `${g.away.name}${g.away.seed ? ` (${g.away.seed} seed)` : ""} ${g.away.record}`;
      const home = `${g.home.name}${g.home.seed ? ` (${g.home.seed} seed)` : ""} ${g.home.record}`;
      let line = `${away} vs ${home} | ${g.status}`;
      if (g.away.score !== null && g.home.score !== null) {
        line += ` | Score: ${g.away.score}-${g.home.score}`;
      }
      if (g.round) line += ` | ${g.round}`;
      lines.push(line);
    });
  }

  return lines.join("\n");
}

// ── /api/bracket — returns teams + scheduled opponent for a given round ───
app.get("/api/bracket", async (req, res) => {
  const { tournament } = req.query;
  if (!tournament) return res.status(400).json({ error: "tournament required" });

  const bracket = await fetchBracket(tournament);

  // Build team list with their current/upcoming opponent per round
  const teams = new Map();

  bracket.forEach((game) => {
    [game.away, game.home].forEach((team, idx) => {
      const opponent = idx === 0 ? game.home : game.away;
      if (team.name && team.name !== "TBD") {
        if (!teams.has(team.name)) {
          teams.set(team.name, { name: team.name, seed: team.seed, record: team.record, games: [] });
        }
        teams.get(team.name).games.push({
          round: game.round,
          opponent: opponent.name,
          opponentSeed: opponent.seed,
          status: game.status,
          gameId: game.id,
        });
      }
    });
  });

  const teamList = Array.from(teams.values()).sort((a, b) => {
    if (a.seed && b.seed) return a.seed - b.seed;
    return a.name.localeCompare(b.name);
  });

  return res.json({ ok: true, teams: teamList, games: bracket });
});

// ── /api/predict ──────────────────────────────────────────────
app.post("/api/predict", async (req, res) => {
  const { tournament, team1, team2, round, freeform, mode } = req.body;

  if (!tournament) {
    return res.status(400).json({ error: "tournament is required" });
  }

  const tournamentLabel = tournament === "womens" ? "Women's NCAA 2025-26" : "Men's NCAA 2025-26";

  const [bracket, rankings] = await Promise.all([
    fetchBracket(tournament),
    fetchRankings(tournament),
  ]);

  const context = buildContext(bracket, rankings, team1, team2);
  const liveSection = `\n\n=== LIVE ESPN DATA ===\n${context || "[ESPN data unavailable]"}\n=== END ESPN DATA ===\n`;

  const systemPrompt = mode === "analyze"
    ? `You are an expert NCAA March Madness analyst. You have live 2025-26 ESPN data including AP rankings, team records, and the current tournament bracket. Answer the user's question with deep insight, referencing actual current teams, seeds, and results from the data provided.

Always respond with ONLY a valid JSON object:
{
  "winner": "Main answer or prediction",
  "confidence": 72,
  "subtitle": "Short context",
  "keyFactors": ["Factor one", "Factor two", "Factor three"],
  "analysis": "3-4 sentences of detailed analysis using real current data.",
  "darkHorse": "Optional — omit key if not applicable"
}`
    : `You are an expert NCAA March Madness analyst. You have live 2025-26 ESPN data. Predict the winner of the given matchup using real current seeds, records, and bracket data.

Always respond with ONLY a valid JSON object:
{
  "winner": "Winning team name",
  "confidence": 72,
  "subtitle": "e.g. '#2 seed vs #7 seed · East Region'",
  "keyFactors": ["Factor one", "Factor two", "Factor three"],
  "analysis": "2-3 sentences citing real current seeds and records.",
  "darkHorse": "Optional upset note — omit key if not applicable"
}`;

  let userMessage;
  if (mode === "analyze" && freeform) {
    userMessage = `Tournament: ${tournamentLabel}${liveSection}\nQuestion: ${freeform}`;
  } else if (team1 && team2) {
    userMessage = `Tournament: ${tournamentLabel}${liveSection}\nMatchup: ${team1} vs ${team2}${round ? ` in the ${round}` : ""}. Predict the winner.`;
  } else {
    return res.status(400).json({ error: "Provide team1 + team2 for predict, or freeform for analyze." });
  }

  try {
    const message = await anthropic.messages.create({
      model: "claude-opus-4-5",
      max_tokens: 900,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    });

    const raw = message.content.map((b) => (b.type === "text" ? b.text : "")).join("");

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

app.listen(PORT, () => {
  console.log(`🏀 March Madness API running on port ${PORT}`);
});
