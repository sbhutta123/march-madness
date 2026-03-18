"use client";

import { useState } from "react";
import { fetchPrediction, Prediction } from "@/lib/api";
import ResultCard from "./ResultCard";

type Tournament = "mens" | "womens";

const ROUNDS = [
  "First Round",
  "Second Round",
  "Sweet 16",
  "Elite 8",
  "Final Four",
  "Championship",
];

const QUICK_PICKS = {
  mens: [
    "Who will win the 2025 Men's championship?",
    "Best Cinderella pick for the Men's bracket?",
    "Which #1 seed is most likely to be upset?",
    "Top dark horse team in the Men's tournament?",
  ],
  womens: [
    "Who will win the 2025 Women's championship?",
    "Best Cinderella pick for the Women's bracket?",
    "Which #1 seed is most likely to be upset?",
    "Top dark horse team in the Women's tournament?",
  ],
};

export default function PredictorForm() {
  const [tournament, setTournament] = useState<Tournament>("mens");
  const [team1, setTeam1] = useState("");
  const [team2, setTeam2] = useState("");
  const [round, setRound] = useState(ROUNDS[0]);
  const [freeform, setFreeform] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Prediction | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [matchupLabel, setMatchupLabel] = useState("");

  async function handlePredict() {
    setError(null);
    setResult(null);

    const label =
      freeform || (team1 && team2 ? `${team1} vs ${team2}` : "General prediction");
    setMatchupLabel(label);
    setLoading(true);

    try {
      const pred = await fetchPrediction({
        tournament,
        team1: team1 || undefined,
        team2: team2 || undefined,
        round,
        freeform: freeform || undefined,
      });
      setResult(pred);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") handlePredict();
  }

  return (
    <div className="w-full max-w-2xl mx-auto space-y-6">
      {/* Tournament Toggle */}
      <div className="flex gap-2">
        {(["mens", "womens"] as Tournament[]).map((t) => (
          <button
            key={t}
            onClick={() => { setTournament(t); setResult(null); setError(null); }}
            className={`px-5 py-2 rounded-full text-sm font-body font-medium transition-all duration-200 border ${
              tournament === t
                ? "bg-orange-500 border-orange-500 text-white"
                : "bg-transparent border-white/20 text-net/60 hover:border-white/40 hover:text-net"
            }`}
          >
            {t === "mens" ? "Men's" : "Women's"} Tournament
          </button>
        ))}
      </div>

      {/* Quick Picks */}
      <div>
        <p className="text-xs text-net/40 uppercase tracking-widest mb-2 font-medium">
          Quick questions
        </p>
        <div className="flex flex-wrap gap-2">
          {QUICK_PICKS[tournament].map((q) => (
            <button
              key={q}
              onClick={() => { setFreeform(q); setTeam1(""); setTeam2(""); }}
              className="text-xs px-3 py-1.5 rounded-full border border-white/15 text-net/60 hover:border-orange-500/50 hover:text-orange-400 transition-all duration-150"
            >
              {q}
            </button>
          ))}
        </div>
      </div>

      {/* Input Panel */}
      <div className="bg-court-700/60 border border-white/10 rounded-2xl p-5 space-y-4 backdrop-blur-sm">
        {/* Matchup inputs */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-net/50 mb-1 block">Team 1</label>
            <input
              value={team1}
              onChange={(e) => setTeam1(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="e.g. Duke"
              className="w-full bg-court-900/80 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-net placeholder-net/25 focus:outline-none focus:border-orange-500/60 transition-colors"
            />
          </div>
          <div>
            <label className="text-xs text-net/50 mb-1 block">Team 2</label>
            <input
              value={team2}
              onChange={(e) => setTeam2(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="e.g. Kansas"
              className="w-full bg-court-900/80 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-net placeholder-net/25 focus:outline-none focus:border-orange-500/60 transition-colors"
            />
          </div>
        </div>

        {/* Round */}
        <div>
          <label className="text-xs text-net/50 mb-1 block">Round</label>
          <select
            value={round}
            onChange={(e) => setRound(e.target.value)}
            className="w-full bg-court-900/80 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-net focus:outline-none focus:border-orange-500/60 transition-colors"
          >
            {ROUNDS.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </div>

        {/* Freeform */}
        <div>
          <label className="text-xs text-net/50 mb-1 block">
            Or ask anything
          </label>
          <input
            value={freeform}
            onChange={(e) => setFreeform(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Who will win the championship? Best upset pick?"
            className="w-full bg-court-900/80 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-net placeholder-net/25 focus:outline-none focus:border-orange-500/60 transition-colors"
          />
        </div>

        {/* Submit */}
        <button
          onClick={handlePredict}
          disabled={loading}
          className="w-full py-3 rounded-xl font-display text-xl tracking-widest bg-orange-500 hover:bg-orange-400 active:bg-orange-600 text-white transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? "ANALYZING..." : "PREDICT"}
        </button>
      </div>

      {/* Loading skeleton */}
      {loading && (
        <div className="bg-court-700/40 border border-white/10 rounded-2xl p-5 space-y-3 animate-pulse">
          <div className="h-4 w-2/3 rounded shimmer" />
          <div className="h-8 w-1/2 rounded shimmer" />
          <div className="h-3 w-full rounded shimmer" />
          <div className="h-3 w-4/5 rounded shimmer" />
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-red-900/30 border border-red-500/30 rounded-2xl p-4 text-red-300 text-sm">
          {error}
        </div>
      )}

      {/* Result */}
      {result && !loading && (
        <ResultCard
          prediction={result}
          matchupLabel={matchupLabel}
          tournament={tournament}
          round={round}
        />
      )}
    </div>
  );
}
