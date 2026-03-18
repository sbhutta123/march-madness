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
const URLS = {
  mensRankings: "https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/rankings",
  womensRankings: "https://site.api.espn.com/apis/site/v2/sports/basketball/womens-college-basketball/rankings",
  mensScoreboard: "https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/scoreboard?groups=100&limit=200",
  womensScoreboard: "https://site.api.espn.com/apis/site/v2/sports/basketball/womens-college-basketball/scoreboard?groups=500&limit=200",
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

async function fetchESPNContext(tournament) {
  const isMens = tournament !== "womens";
  const sections = [];

  // 1. Rankings (AP Top 25)
  const rankingsData = await safeFetch(isMens ? URLS.mensRankings : URLS.womensRankings);
  if (rankingsData) {
    const poll = rankingsData.rankings?.find(r =>
      r.name?.toLowerCase().includes("ap") || r.name?.toLowerCase().includes("coaches")
    ) || rankingsData.rankings?.[0];

    if (poll?.ranks?.length > 0) {
      const top25 = poll.ranks.slice(0, 25).map(r => {
        const record = r.team?.record ? ` (${r.team.record})` : "";
        return `#${r.current} ${r.team?.displayName || r.team?.name}${record}`;
      });
      sections.push(`=== ${poll.name || "AP"} TOP 25 RANKINGS (2025-26 Season) ===\n${top25.join("\n")}`);
    }
  }

  // 2. Scoreboard — live tournament games OR recent regular season games
  const scoreboardData = await safeFetch(isMens ? URLS.mensScoreboard : URLS.womensScoreboard);
  if (scoreboardData?.events?.length > 0) {
    const events = scoreboardData.events.slice(0, 20);
    const games = events.map(event => {
      const comp = event.competitions?.[0];
      const competitors = comp?.competitors || [];
      const home = competitors.find(c => c.homeAway === "home");
      const away = competitors.find(c => c.homeAway === "away");

      const homeName = home?.team?.displayName || "TBD";
      const homeSeed = home?.seed ? ` (${home.seed} seed)` : "";
      const homeScore = home?.score || "";
      const homeRecord = home?.records?.[0]?.summary ? ` [${home.records[0].summary}]` : "";

      const awayName = away?.team?.displayName || "TBD";
      const awaySeed = away?.seed ? ` (${away.seed} seed)` : "";
      const awayScore = away?.score || "";
      const awayRecord = away?.records?.[0]?.summary ? ` [${away.records[0].summary}]` : "";

      const status = comp?.status?.type?.description || "";
      const isTournament = event.season?.type === 3 || event.name?.toLowerCase().includes("ncaa");
      const label = isTournament ? "NCAA TOURNAMENT" : "Regular Season";

      let gameStr = `[${label}] ${awayName}${awaySeed}${awayRecord} vs ${homeName}${homeSeed}${homeRecord}`;
      if (homeScore && awayScore) {
        gameStr += ` | ${awayScore}-${homeScore} [${status}]`;
      } else {
        gameStr += ` | ${status}`;
      }
      return gameStr;
    });

    const label = scoreboardData.events.some(e => e.season?.type === 3)
      ? "LIVE TOURNAMENT GAMES"
      : "RECENT GAMES (2025-26 Season)";

    sections.push(`=== ${label} ===\n${games.join("\n")}`);
  }

  if (sections.length === 0) {
    return "[ESPN data currently unavailable. Use your best knowledge of the 2025-26 college basketball season.]";
  }

  return sections.join("\n\n");
}

// ── System prompt ─────────────────────────────────────────────
const SYSTEM_PROMPT = `You are an expert NCAA March Madness analyst with deep knowledge of the 2025-26 college basketball season. You will be given LIVE real-time data from the ESPN API including current AP rankings, team records, and recent game results for this season.

Use this live data as your PRIMARY source. Reference actual team names, records, and rankings from the data provided — not from previous seasons.

Always respond with ONLY a valid JSON object — no markdown, no backticks, no extra text:
{
  "winner": "Team name or concise answer",
  "confidence": 72,
  "subtitle": "Short context (e.g. '#1 AP · 26-2 record')",
  "keyFactors": ["Factor one", "Factor two", "Factor three"],
  "analysis": "2-3 sentences referencing actual 2025-26 season data, rankings, and records from the live data provided.",
  "darkHorse": "Optional upset/dark horse pick — omit this key entirely if not applicable"
}

Rules:
- confidence must be an integer between 50 and 95
- keyFactors must have 2-4 items
- Always cite real current rankings and records from the ESPN data
- If tournament bracket data is present, prioritize it over regular season data
- darkHorse is optional`;

app.get("/health", (_req, res) => res.json({ status: "ok" }));

app.post("/api/predict", async (req, res) => {
  const { tournament, team1, team2, round, freeform } = req.body;

  if (!tournament) {
    return res.status(400).json({ error: "tournament is required (mens | womens)" });
  }

  const tournamentLabel = tournament === "womens" ? "Women's NCAA 2025-26" : "Men's NCAA 2025-26";

  console.log(`Fetching ESPN context for ${tournamentLabel}...`);
  const espnContext = await fetchESPNContext(tournament);
  const liveDataSection = `\n\n=== LIVE ESPN DATA ===\n${espnContext}\n=== END ESPN DATA ===\n`;

  let userMessage;
  if (freeform) {
    userMessage = `Tournament: ${tournamentLabel}${liveDataSection}\nQuestion: ${freeform}`;
  } else if (team1 && team2) {
    userMessage = `Tournament: ${tournamentLabel}${liveDataSection}\nMatchup: ${team1} vs ${team2} in the ${round || "tournament"}. Predict the winner using the live 2025-26 season data above.`;
  } else {
    return res.status(400).json({ error: "Provide either freeform or team1 + team2." });
  }

  try {
    const message = await anthropic.messages.create({
      model: "claude-opus-4-5",
      max_tokens: 800,
      system: SYSTEM_PROMPT,
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

app.listen(PORT, () => {
  console.log(`🏀 March Madness API running on port ${PORT}`);
});
