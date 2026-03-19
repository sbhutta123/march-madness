"use client";

import { useState, useEffect, useRef } from "react";
import { fetchBracket, fetchPrediction, Prediction, TeamInfo, PossibleOpponent } from "@/lib/api";
import ResultCard from "./ResultCard";

type Tournament = "mens" | "womens";
type RoundMode = "current" | "future";

const ALL_ROUNDS = ["First Round", "Second Round", "Sweet 16", "Elite 8", "Final Four", "Championship"];

function normalizeRound(str: string): string {
  const s = str.toLowerCase();
  if (s.includes("first") || s.includes("round of 64")) return "First Round";
  if (s.includes("second") || s.includes("round of 32")) return "Second Round";
  if (s.includes("sweet") || s.includes("16")) return "Sweet 16";
  if (s.includes("elite") || s.includes("eight") || s.includes("8")) return "Elite 8";
  if (s.includes("final four") || s.includes("semifinal")) return "Final Four";
  if (s.includes("championship") || s.includes("national") || s.includes("title")) return "Championship";
  return str;
}

const QUICK_QUESTIONS = {
  mens: [
    "Who will win the 2026 Men's championship?",
    "Best Cinderella pick for the Men's bracket?",
    "Which #1 seed is most likely to be upset?",
    "Top dark horse in the Men's tournament?",
  ],
  womens: [
    "Who will win the 2026 Women's championship?",
    "Best Cinderella pick for the Women's bracket?",
    "Which #1 seed is most likely to be upset?",
    "Top dark horse in the Women's tournament?",
  ],
};

export default function PredictorForm() {
  const [tournament, setTournament] = useState<Tournament>("mens");
  const [allTeams, setAllTeams] = useState<TeamInfo[]>([]);
  const [loadingTeams, setLoadingTeams] = useState(false);

  const [team1Search, setTeam1Search] = useState("");
  const [team1Selected, setTeam1Selected] = useState<TeamInfo | null>(null);
  const [team1Open, setTeam1Open] = useState(false);

  const [roundMode, setRoundMode] = useState<RoundMode>("current");
  const [currentRound, setCurrentRound] = useState<string>("");
  const [futureRound, setFutureRound] = useState<string>("");
  const [futureRounds, setFutureRounds] = useState<string[]>([]);

  const [team2Name, setTeam2Name] = useState("");
  const [team2Seed, setTeam2Seed] = useState<number | null>(null);
  const [possibleOpponents, setPossibleOpponents] = useState<PossibleOpponent[]>([]);
  const [opponentConfirmed, setOpponentConfirmed] = useState(false);
  const [teamEliminated, setTeamEliminated] = useState(false);

  const [freeform, setFreeform] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Prediction | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [matchupLabel, setMatchupLabel] = useState("");

  const team1Ref = useRef<HTMLDivElement>(null);

  // Load teams when tournament changes
  useEffect(() => {
    setAllTeams([]);
    setTeam1Selected(null);
    setTeam1Search("");
    resetOpponent();
    setCurrentRound("");
    setFutureRound("");
    setFutureRounds([]);
    setRoundMode("current");
    setTeamEliminated(false);
    setResult(null);
    setError(null);
    setLoadingTeams(true);

    fetchBracket(tournament)
      .then(data => setAllTeams(data.teams))
      .catch(() => setAllTeams([]))
      .finally(() => setLoadingTeams(false));
  }, [tournament]);

  function resetOpponent() {
    setTeam2Name("");
    setTeam2Seed(null);
    setPossibleOpponents([]);
    setOpponentConfirmed(false);
  }

  // When team1 changes, determine current round and future rounds
  useEffect(() => {
    resetOpponent();
    if (!team1Selected) {
      setCurrentRound("");
      setFutureRounds([]);
      setFutureRound("");
      setTeamEliminated(false);
      return;
    }

    const games = team1Selected.games;
    if (!games.length) {
      setCurrentRound("");
      setFutureRounds([]);
      setTeamEliminated(false);
      return;
    }

    // Find upcoming (not final) game = current round
    // A game is "upcoming" if not final — include TBD opponents (e.g. waiting on First Four)
    const upcoming = games.find(g => {
      const s = g.status?.toLowerCase() || "";
      return !s.includes("final") && !s.includes("post") && g.opponent;
    });

    // Find future rounds (possibleOpponents entries)
    const future = games
      .filter(g => g.possibleOpponents && g.possibleOpponents.length > 0 && g.opponent === "TBD")
      .map(g => normalizeRound(g.round))
      .filter(r => ALL_ROUNDS.includes(r));

    if (upcoming) {
      setCurrentRound(normalizeRound(upcoming.round));
      setTeamEliminated(false);
    } else {
      // All games are final — eliminated
      const completedRounds = games
        .filter(g => g.status?.toLowerCase().includes("final") || g.status?.toLowerCase().includes("post"))
        .map(g => normalizeRound(g.round));
      setCurrentRound(completedRounds[completedRounds.length - 1] || "");
      setTeamEliminated(true);
    }

    setFutureRounds(future);
    setFutureRound(future[0] || "");
    setRoundMode("current");
  }, [team1Selected]);

  // Resolve opponent whenever roundMode, currentRound, or futureRound changes
  useEffect(() => {
    resetOpponent();
    if (!team1Selected) return;

    const targetRound = roundMode === "current" ? currentRound : futureRound;
    if (!targetRound) return;

    const game = team1Selected.games.find(g => normalizeRound(g.round) === targetRound);
    if (!game) return;

    if (roundMode === "current" && game.opponent && game.opponent !== "TBD") {
      setTeam2Name(game.opponent);
      setTeam2Seed(game.opponentSeed);
      setOpponentConfirmed(true);
    } else if (roundMode === "future" && game.possibleOpponents?.length) {
      setPossibleOpponents(game.possibleOpponents);
      setOpponentConfirmed(false);
    }
  }, [roundMode, currentRound, futureRound, team1Selected]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (team1Ref.current && !team1Ref.current.contains(e.target as Node)) {
        setTeam1Open(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const filteredTeams = allTeams.filter(t =>
    t.name.toLowerCase().includes(team1Search.toLowerCase())
  );

  function selectTeam1(team: TeamInfo) {
    setTeam1Selected(team);
    setTeam1Search(team.name);
    setTeam1Open(false);
  }

  function selectPossibleOpponent(opp: PossibleOpponent) {
    setTeam2Name(opp.name);
    setTeam2Seed(opp.seed);
    setOpponentConfirmed(true);
  }

  const activeRound = roundMode === "current" ? currentRound : futureRound;

  async function handlePredict() {
    if (!team1Selected || !team2Name) return;
    setError(null);
    setResult(null);
    setMatchupLabel(`${team1Selected.name} vs ${team2Name}`);
    setLoading(true);
    try {
      const pred = await fetchPrediction({
        tournament,
        team1: team1Selected.name,
        team2: team2Name,
        round: activeRound,
        mode: "predict",
      });
      setResult(pred);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  async function handleAnalyze() {
    if (!freeform.trim()) return;
    setError(null);
    setResult(null);
    setMatchupLabel(freeform);
    setLoading(true);
    try {
      const pred = await fetchPrediction({ tournament, freeform, mode: "analyze" });
      setResult(pred);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  const canPredict = team1Selected && team2Name && !loading && !teamEliminated;
  const canAnalyze = freeform.trim().length > 0 && !loading;

  return (
    <div className="w-full max-w-2xl mx-auto space-y-6">

      {/* Tournament toggle */}
      <div className="flex gap-2">
        {(["mens", "womens"] as Tournament[]).map(t => (
          <button key={t} onClick={() => setTournament(t)}
            className={`px-5 py-2 rounded-full text-sm font-medium transition-all duration-200 border ${
              tournament === t
                ? "bg-orange-500 border-orange-500 text-white"
                : "bg-transparent border-white/20 text-net/60 hover:border-white/40 hover:text-net"
            }`}>
            {t === "mens" ? "Men's" : "Women's"} Tournament
          </button>
        ))}
      </div>

      {/* ── PREDICT panel ── */}
      <div className="bg-court-700/60 border border-white/10 rounded-2xl p-5 space-y-4 backdrop-blur-sm">
        <p className="text-xs text-orange-400/80 uppercase tracking-widest font-medium">Predict a matchup</p>

        {/* Team 1 search */}
        <div ref={team1Ref} className="relative">
          <label className="text-xs text-net/50 mb-1 block">Team</label>
          <input
            value={team1Search}
            onChange={e => { setTeam1Search(e.target.value); setTeam1Open(true); setTeam1Selected(null); resetOpponent(); }}
            onFocus={() => setTeam1Open(true)}
            placeholder={loadingTeams ? "Loading teams..." : "Search team..."}
            disabled={loadingTeams}
            className="w-full bg-court-900/80 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-net placeholder-net/25 focus:outline-none focus:border-orange-500/60 transition-colors"
          />
          {team1Open && filteredTeams.length > 0 && (
            <div className="absolute z-20 top-full mt-1 w-full bg-court-800 border border-white/15 rounded-xl overflow-hidden shadow-xl max-h-52 overflow-y-auto">
              {filteredTeams.map(team => (
                <button key={team.name} onClick={() => selectTeam1(team)}
                  className="w-full text-left px-4 py-2.5 text-sm text-net hover:bg-white/8 flex items-center justify-between gap-2 transition-colors">
                  <span>{team.name}</span>
                  <span className="text-xs text-net/40 shrink-0">{team.seed ? `#${team.seed}` : ""} {team.record}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Round mode toggle — only show if team is selected */}
        {team1Selected && !teamEliminated && (
          <div>
            <label className="text-xs text-net/50 mb-2 block">Round</label>
            <div className="flex gap-2">
              <button
                onClick={() => setRoundMode("current")}
                className={`flex-1 py-2 rounded-xl text-sm font-medium border transition-all duration-150 ${
                  roundMode === "current"
                    ? "bg-orange-500/20 border-orange-500/50 text-orange-400"
                    : "bg-transparent border-white/10 text-net/40 hover:border-white/25 hover:text-net/60"
                }`}>
                Current Round
                {currentRound && <span className="ml-1.5 text-xs opacity-70">· {currentRound}</span>}
              </button>
              {futureRounds.length > 0 && (
                <button
                  onClick={() => setRoundMode("future")}
                  className={`flex-1 py-2 rounded-xl text-sm font-medium border transition-all duration-150 ${
                    roundMode === "future"
                      ? "bg-orange-500/20 border-orange-500/50 text-orange-400"
                      : "bg-transparent border-white/10 text-net/40 hover:border-white/25 hover:text-net/60"
                  }`}>
                  Future Round
                </button>
              )}
            </div>

            {/* Future round selector */}
            {roundMode === "future" && futureRounds.length > 1 && (
              <select
                value={futureRound}
                onChange={e => setFutureRound(e.target.value)}
                className="w-full mt-2 bg-court-900/80 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-net focus:outline-none focus:border-orange-500/60 transition-colors">
                {futureRounds.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            )}
          </div>
        )}

        {/* Opponent */}
        {team1Selected && (
          <div>
            <label className="text-xs text-net/50 mb-1 block">
              Opponent
              {roundMode === "future" && !opponentConfirmed && possibleOpponents.length > 0 && (
                <span className="ml-2 text-amber-400/70">— select possible opponent</span>
              )}
            </label>

            {/* Confirmed opponent */}
            {opponentConfirmed && team2Name ? (
              <div className="w-full bg-court-900/80 border border-orange-500/30 rounded-xl px-4 py-2.5 text-sm text-net flex items-center justify-between">
                <span>
                  {team2Name}
                  {team2Seed && <span className="text-net/40 text-xs ml-1">(#{team2Seed})</span>}
                </span>
                {roundMode === "future" && (
                  <button onClick={() => { setOpponentConfirmed(false); setTeam2Name(""); }}
                    className="text-xs text-net/30 hover:text-net/60 ml-2">change</button>
                )}
              </div>
            ) : roundMode === "current" ? (
              /* Current round — auto-filling */
              <div className="w-full bg-court-900/80 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-net/30 min-h-[42px] flex items-center">
                Auto-filled from bracket
              </div>
            ) : possibleOpponents.length > 0 ? (
              /* Future round — possible opponents list */
              <div className="bg-court-900/80 border border-amber-500/20 rounded-xl overflow-hidden max-h-40 overflow-y-auto">
                {possibleOpponents.map(opp => (
                  <button key={opp.name} onClick={() => selectPossibleOpponent(opp)}
                    className="w-full text-left px-4 py-2.5 text-sm text-net hover:bg-white/8 flex items-center justify-between transition-colors border-b border-white/5 last:border-0">
                    <span>{opp.name}</span>
                    <span className="text-xs text-net/40 shrink-0">
                      {opp.seed ? `#${opp.seed}` : ""} {opp.record}
                      {opp.confirmed && <span className="text-orange-400 ml-1">✓</span>}
                    </span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        )}

        {teamEliminated && team1Selected && (
          <p className="text-xs text-red-400/70 text-center">{team1Selected.name} has been eliminated.</p>
        )}

        <button onClick={handlePredict} disabled={!canPredict}
          className="w-full py-3 rounded-xl font-display text-xl tracking-widest bg-orange-500 hover:bg-orange-400 active:bg-orange-600 text-white transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed">
          {loading && matchupLabel.includes("vs") ? "PREDICTING..." : "PREDICT"}
        </button>
      </div>

      {/* ── ANALYZE panel ── */}
      <div className="bg-court-700/60 border border-white/10 rounded-2xl p-5 space-y-4 backdrop-blur-sm">
        <p className="text-xs text-orange-400/80 uppercase tracking-widest font-medium">Ask a question</p>
        <div className="flex flex-wrap gap-2">
          {QUICK_QUESTIONS[tournament].map(q => (
            <button key={q} onClick={() => setFreeform(q)}
              className="text-xs px-3 py-1.5 rounded-full border border-white/15 text-net/60 hover:border-orange-500/50 hover:text-orange-400 transition-all duration-150">
              {q}
            </button>
          ))}
        </div>
        <input value={freeform} onChange={e => setFreeform(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") handleAnalyze(); }}
          placeholder="Who will win it all? Best upset pick? Who's the dark horse?"
          className="w-full bg-court-900/80 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-net placeholder-net/25 focus:outline-none focus:border-orange-500/60 transition-colors"
        />
        <button onClick={handleAnalyze} disabled={!canAnalyze}
          className="w-full py-3 rounded-xl font-display text-xl tracking-widest bg-court-600 hover:bg-court-700 border border-orange-500/40 hover:border-orange-500/70 text-orange-400 transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed">
          {loading && !matchupLabel.includes("vs") ? "ANALYZING..." : "ANALYZE"}
        </button>
      </div>

      {loading && (
        <div className="bg-court-700/40 border border-white/10 rounded-2xl p-5 space-y-3 animate-pulse">
          <div className="h-4 w-2/3 rounded shimmer" />
          <div className="h-8 w-1/2 rounded shimmer" />
          <div className="h-3 w-full rounded shimmer" />
          <div className="h-3 w-4/5 rounded shimmer" />
        </div>
      )}

      {error && (
        <div className="bg-red-900/30 border border-red-500/30 rounded-2xl p-4 text-red-300 text-sm">{error}</div>
      )}

      {result && !loading && (
        <ResultCard prediction={result} matchupLabel={matchupLabel} tournament={tournament} round={activeRound} />
      )}
    </div>
  );
}
