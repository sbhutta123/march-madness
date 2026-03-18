require("dotenv").config();
const express = require("express");
const cors = require("cors");
const Anthropic = require("@anthropic-ai/sdk");
const rateLimit = require("express-rate-limit");

const app = express();
const PORT = process.env.PORT || 3001;

// ── Middleware ────────────────────────────────────────────────
app.use(express.json());

// Allow your GitHub Pages domain + localhost for dev
const allowedOrigins = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  // Replace with your actual GitHub Pages URL once deployed:
  process.env.FRONTEND_ORIGIN || "https://YOUR_GITHUB_USERNAME.github.io",
];

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (e.g. curl, Postman)
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      callback(new Error("Not allowed by CORS"));
    },
  })
);

// Rate limiting — 30 predictions per IP per 15 minutes
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: { error: "Too many requests. Please try again in a few minutes." },
});
app.use("/api/", limiter);

// ── Anthropic client ─────────────────────────────────────────
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ── System prompt ─────────────────────────────────────────────
const SYSTEM_PROMPT = `You are an expert NCAA March Madness analyst with deep knowledge of both the Men's and Women's college basketball tournaments. You factor in team statistics, seedings, coaching quality, recent form, historical tournament performance, key player matchups, and injury reports.

Always respond with ONLY a valid JSON object in this exact shape — no markdown, no backticks, no extra text:
{
  "winner": "Team name or concise answer",
  "confidence": 72,
  "subtitle": "Short context (e.g. '#1 seed · East Region' or '2025 Championship pick')",
  "keyFactors": ["Factor one", "Factor two", "Factor three"],
  "analysis": "2-3 sentences of sharp, specific analysis.",
  "darkHorse": "Optional upset/dark horse note — omit key entirely if not applicable"
}

Rules:
- confidence must be an integer between 50 and 95
- keyFactors must have 2-4 items
- analysis must be specific, not generic
- darkHorse is optional — only include it when genuinely relevant`;

// ── Routes ────────────────────────────────────────────────────
app.get("/health", (_req, res) => res.json({ status: "ok" }));

app.post("/api/predict", async (req, res) => {
  const { tournament, team1, team2, round, freeform } = req.body;

  if (!tournament) {
    return res.status(400).json({ error: "tournament is required (mens | womens)" });
  }

  const tournamentLabel =
    tournament === "womens" ? "Women's NCAA 2025" : "Men's NCAA 2025";

  let userMessage;
  if (freeform) {
    userMessage = `Tournament: ${tournamentLabel}\nQuestion: ${freeform}`;
  } else if (team1 && team2) {
    userMessage = `Tournament: ${tournamentLabel}\nMatchup: ${team1} vs ${team2} in the ${round || "tournament"}.\nPredict the winner with confidence and key reasons.`;
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

// ── Start ─────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`🏀 March Madness API running on port ${PORT}`);
});
