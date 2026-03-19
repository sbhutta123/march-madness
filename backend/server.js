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
  "First Round":   ["20260319", "20260320"],
  "Second Round":  ["20260321", "20260322"],
  "Sweet 16":      ["20260327", "20260328"],
  "Elite 8":       ["20260329", "20260330"],
  "Final Four":    ["20260404"],
  "Championship":  ["20260406"],
};

// ── Hardcoded 2026 bracket fallback ──────────────────────────
// Used if ESPN API is unreachable. Based on official 2026 bracket.
const MENS_BRACKET_2026 = [
  // East Region
  { id:"e1", round:"First Round", region:"East", home:{name:"Duke",seed:1,record:"32-3",score:null,winner:false}, away:{name:"Siena",seed:16,record:"24-10",score:null,winner:false} },
  { id:"e2", round:"First Round", region:"East", home:{name:"Ohio State",seed:8,record:"24-8",score:null,winner:false}, away:{name:"TCU",seed:9,record:"22-12",score:null,winner:true} },
  { id:"e3", round:"First Round", region:"East", home:{name:"St. John's",seed:5,record:"28-6",score:null,winner:false}, away:{name:"Northern Iowa",seed:12,record:"22-11",score:null,winner:false} },
  { id:"e4", round:"First Round", region:"East", home:{name:"Kansas",seed:4,record:"25-9",score:null,winner:false}, away:{name:"California Baptist",seed:13,record:"25-8",score:null,winner:false} },
  { id:"e5", round:"First Round", region:"East", home:{name:"Nebraska",seed:4,record:"28-6",score:null,winner:true}, away:{name:"Troy",seed:13,record:"22-13",score:null,winner:false} },
  { id:"e6", round:"First Round", region:"East", home:{name:"Wisconsin",seed:5,record:"21-13",score:null,winner:false}, away:{name:"High Point",seed:12,record:"28-6",score:null,winner:true} },
  { id:"e7", round:"First Round", region:"East", home:{name:"Louisville",seed:6,record:"24-10",score:null,winner:true}, away:{name:"South Florida",seed:11,record:"22-12",score:null,winner:false} },
  { id:"e8", round:"First Round", region:"East", home:{name:"UConn",seed:3,record:"26-8",score:null,winner:false}, away:{name:"VCU",seed:14,record:"24-10",score:null,winner:false} },
  // West Region
  { id:"w1", round:"First Round", region:"West", home:{name:"Florida",seed:1,record:"30-5",score:null,winner:false}, away:{name:"Norfolk State",seed:16,record:"25-9",score:null,winner:false} },
  { id:"w2", round:"First Round", region:"West", home:{name:"BYU",seed:4,record:"24-9",score:null,winner:false}, away:{name:"VCU",seed:13,record:"22-11",score:null,winner:false} },
  { id:"w3", round:"First Round", region:"West", home:{name:"Gonzaga",seed:3,record:"28-6",score:null,winner:false}, away:{name:"McNeese",seed:14,record:"28-5",score:null,winner:false} },
  { id:"w4", round:"First Round", region:"West", home:{name:"Vanderbilt",seed:6,record:"22-13",score:null,winner:false}, away:{name:"Troy",seed:11,record:"20-14",score:null,winner:false} },
  { id:"w5", round:"First Round", region:"West", home:{name:"UCLA",seed:7,record:"20-13",score:null,winner:false}, away:{name:"Utah State",seed:10,record:"25-9",score:null,winner:false} },
  { id:"w6", round:"First Round", region:"West", home:{name:"Arizona",seed:2,record:"27-7",score:null,winner:false}, away:{name:"Akron",seed:15,record:"26-8",score:null,winner:false} },
  // South Region
  { id:"s1", round:"First Round", region:"South", home:{name:"Houston",seed:2,record:"27-7",score:null,winner:false}, away:{name:"SFA",seed:15,record:"24-9",score:null,winner:false} },
  { id:"s2", round:"First Round", region:"South", home:{name:"Alabama",seed:3,record:"26-8",score:null,winner:false}, away:{name:"Robert Morris",seed:14,record:"22-12",score:null,winner:false} },
  { id:"s3", round:"First Round", region:"South", home:{name:"Michigan",seed:1,record:"29-6",score:null,winner:false}, away:{name:"UMES",seed:16,record:"20-14",score:null,winner:false} },
  { id:"s4", round:"First Round", region:"South", home:{name:"Iowa State",seed:2,record:"25-8",score:null,winner:false}, away:{name:"Lipscomb",seed:15,record:"23-11",score:null,winner:false} },
  // Midwest Region
  { id:"m1", round:"First Round", region:"Midwest", home:{name:"Auburn",seed:1,record:"30-4",score:null,winner:false}, away:{name:"Jacksonville State",seed:16,record:"21-13",score:null,winner:false} },
  { id:"m2", round:"First Round", region:"Midwest", home:{name:"Tennessee",seed:2,record:"27-7",score:null,winner:false}, away:{name:"Wofford",seed:15,record:"23-10",score:null,winner:false} },
  { id:"m3", round:"First Round", region:"Midwest", home:{name:"Kentucky",seed:3,record:"25-9",score:null,winner:false}, away:{name:"High Point",seed:14,record:"26-8",score:null,winner:false} },
  { id:"m4", round:"First Round", region:"Midwest", home:{name:"Purdue",seed:4,record:"24-10",score:null,winner:false}, away:{name:"Yale",seed:13,record:"24-7",score:null,winner:false} },
];

const WOMENS_BRACKET_2026 = [
  { id:"we1", round:"First Round", region:"Albany", home:{name:"South Carolina",seed:1,record:"33-1",score:null,winner:false}, away:{name:"Sacred Heart",seed:16,record:"20-12",score:null,winner:false} },
  { id:"we2", round:"First Round", region:"Albany", home:{name:"Notre Dame",seed:2,record:"27-6",score:null,winner:false}, away:{name:"Fordham",seed:15,record:"21-11",score:null,winner:false} },
  { id:"we3", round:"First Round", region:"Spokane", home:{name:"UCLA",seed:1,record:"29-5",score:null,winner:false}, away:{name:"UMES",seed:16,record:"18-14",score:null,winner:false} },
  { id:"we4", round:"First Round", region:"Spokane", home:{name:"LSU",seed:2,record:"26-7",score:null,winner:false}, away:{name:"Chattanooga",seed:15,record:"24-9",score:null,winner:false} },
  { id:"we5", round:"First Round", region:"Portland", home:{name:"Texas",seed:1,record:"28-5",score:null,winner:false}, away:{name:"Alabama A&M",seed:16,record:"17-15",score:null,winner:false} },
  { id:"we6", round:"First Round", region:"Portland", home:{name:"NC State",seed:3,record:"25-8",score:null,winner:false}, away:{name:"Richmond",seed:14,record:"22-10",score:null,winner:false} },
  { id:"we7", round:"First Round", region:"Greensboro", home:{name:"TCU",seed:1,record:"29-4",score:null,winner:false}, away:{name:"Bethune-Cookman",seed:16,record:"19-13",score:null,winner:false} },
  { id:"we8", round:"First Round", region:"Greensboro", home:{name:"UConn",seed:2,record:"28-5",score:null,winner:false}, away:{name:"FGCU",seed:15,record:"25-8",score:null,winner:false} },
];

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

function getRoundFromDate(dateStr) {
  for (const [round, dates] of Object.entries(ROUND_DATES)) {
    if (dates.includes(dateStr)) return round;
  }
  return null;
}

function parseESPNCompetitor(c) {
  return {
    name: c?.team?.displayName || "TBD",
    seed: c?.seed ? parseInt(c.seed) : null,
    score: c?.score || null,
    record: c?.records?.[0]?.summary || "",
    winner: c?.winner || false,
  };
}

// Fetch all tournament games by querying ESPN per round date
async function fetchAllTournamentGames(tournament) {
  const league = tournament === "womens"
    ? "womens-college-basketball"
    : "mens-college-basketball";
  const allGames = [];

  const allDates = Object.values(ROUND_DATES).flat();

  await Promise.all(allDates.map(async (dateStr) => {
    const url = `https://site.api.espn.com/apis/site/v2/sports/basketball/${league}/scoreboard?dates=${dateStr}&limit=50`;
    const data = await safeFetch(url);
    if (!data?.events?.length) return;

    const round = getRoundFromDate(dateStr);

    // Filter to tournament games only — must have seeded competitors
    const tourneyEvents = data.events.filter(e =>
      e.competitions?.[0]?.competitors?.some(c => c.seed)
    );

    tourneyEvents.forEach(event => {
      const comp = event.competitions?.[0];
      const competitors = comp?.competitors || [];
      const home = competitors.find(c => c.homeAway === "home");
      const away = competitors.find(c => c.homeAway === "away");
      const notes = comp?.notes || [];
      const region = notes.find(n => n.type === "rotation")?.headline ||
                     notes.find(n => n.headline?.match(/East|West|South|Midwest/))?.headline?.match(/(East|West|South|Midwest)/)?.[1] ||
                     null;

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

  if (allGames.length === 0) {
    console.log("ESPN returned no games — using hardcoded 2026 bracket fallback");
    return tournament === "womens" ? WOMENS_BRACKET_2026 : MENS_BRACKET_2026;
  }

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

app.get("/api/test", async (_req, res) => {
  const url = "https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/scoreboard?dates=20260319&groups=100&limit=50";
  try {
    const r = await fetch(url);
    const text = await r.text();
    res.json({ status: r.status, preview: text.slice(0, 800) });
  } catch(e) {
    res.json({ error: e.message });
  }
});

app.get("/health", (_req, res) => res.json({ status: "ok" }));
app.listen(PORT, () => console.log(`🏀 March Madness API running on port ${PORT}`));
