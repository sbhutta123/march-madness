"use client";

import { useState, useEffect, useRef } from "react";
import { fetchBracket, fetchPrediction, Prediction, TeamInfo, PossibleOpponent } from "@/lib/api";
import ResultCard from "./ResultCard";

type Tournament = "mens" | "womens";

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

  const [team2Name, setTeam2Name] = useState("");
  const [team2Seed, setTeam2Seed] = useState<number | null>(null);
  const [possibleOpponents, setPossibleOpponents] = useState<PossibleOpponent[]>([]);
  const [opponentConfirmed, setOpponentConfirmed] = useState(false);

  const [availableRounds, setAvailableRounds] = useState<string[]>(ALL_ROUNDS);
  const [round, setRound] = useState(ALL_ROUNDS[0]);
  const [teamEliminated, setTeamEliminated] = useState(false);

  const [freeform, setFreeform] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Prediction | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [matchupLabel, setMatchupLabel] = useState("");

  const team1Ref = useRef<HTMLDivElement>(null);

  // Load teams on tournament change
  useEffect(() => {
    setAllTeams([]);
    setTeam1Selected(null);
    setTeam1Search("");
    setTeam2Name("");
    setTeam2Seed(null);
    setPossibleOpponents([]);
    setOpponentConfirmed(false);
    setAvailableRounds(ALL_ROUNDS);
    setRound(ALL_ROUNDS[0]);
    setTeamEliminated(false);
    setResult(null);
    setError(null);
    setLoadingTeams(true);

    fetchBracket(tournament)
      .then(data => setAllTeams(data.teams))
      .catch(() => setAllTeams([]))
      .finally(() => setLoadingTeams(false));
  }, [tournament]);

  // When team1 changes, set available rounds
  useEffect(() => {
    if (!team1Selected) {
      setAvailableRounds(ALL_ROUNDS);
      setRound(ALL_ROUNDS[0]);
      setTeam2Name("");
      setTeam2Seed(null);
      setPossibleOpponents([]);
      setOpponentConfirmed(false);
      setTeamEliminated(false);
      return;
    }

    const games = team1Selected.games;
    if (!games.length) {
      setAvailableRounds(ALL_ROUNDS);
      setRound(ALL_ROUNDS[0]);
      return;
    }

    const completedGames = games.filter(g => g.status?.toLowerCase().includes("final"));
    const upcomingGame = games.find(g => !g.status?.toLowerCase().includes("final"));

    if (upcomingGame) {
      const upcomingRound = normalizeRound(upcomingGame.round);
      const upcomingIdx = ALL_ROUNDS.indexOf(upcomingRound);
      const futureRounds = upcomingIdx >= 0 ? ALL_ROUNDS.slice(upcomingIdx) : ALL_ROUNDS;
      setAvailableRounds(futureRounds);
      setRound(upcomingRound || futureRounds[0]);
      setTeamEliminated(false);
    } else if (completedGames.length > 0) {
      const roundLabels = Array.from(new Set(games.map(g => normalizeRound(g.round)).filter(r => ALL_ROUNDS.includes(r))));
      roundLabels.sort((a, b) => ALL_ROUNDS.indexOf(a) - ALL_ROUNDS.indexOf(b));
      setAvailableRounds(roundLabels.length > 0 ? roundLabels : ALL_ROUNDS);
      setRound(roundLabels[roundLabels.length - 1] || ALL_ROUNDS[0]);
      setTeamEliminated(true);
    } else {
      setAvailableRounds(ALL_ROUNDS);
      setRound(ALL_ROUNDS[0]);
      setTeamEliminated(false);
    }
  }, [team1Selected]);

  // When round changes, resolve opponent
  useEffect(() => {
    if (!team1Selected) {
      setTeam2Name("");
      setTeam2Seed(null);
      setPossibleOpponents([]);
      setOpponentConfirmed(false);
      return;
    }

    const game = team1Selected.games.find(g => normalizeRound(g.round) === round);

    if (game) {
      if (game.opponent && game.opponent !== "TBD") {
        // Confirmed opponent
        setTeam2Name(game.opponent);
        setTeam2Seed(game.opponentSeed);
        setPossibleOpponents([]);
        setOpponentConfirmed(true);
      } else if (game.possibleOpponents && game.possibleOpponents.length > 0) {
        // Future round — show possible opponents
        setTeam2Name("");
        setTeam2Seed(null);
        setPossibleOpponents(game.possibleOpponents);
        setOpponentConfirmed(false);
      } else {
        setTeam2Name("TBD");
        setTeam2Seed(null);
        setPossibleOpponents([]);
        setOpponentConfirmed(false);
      }
    } else {
      setTeam2Name("");
      setTeam2Seed(null);
      setPossibleOpponents([]);
      setOpponentConfirmed(false);
    }
  }, [team1Selected, round]);

  // Outside click closes dropdown
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

  async function handlePredict() {
    if (!team1Selected || !team2Name || team2Name === "TBD") return;
    setError(null);
    setResult(null);
    setMatchupLabel(`${team1Selected.name} vs ${team2Name}`);
    setLoading(true);
    try {
      const pred = await fetchPrediction({ tournament, team1: team1Selected.name, team2: team2Name, round, mode: "predict" });
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

  const canPredict = team1Selected && team2Name && team2Name !== "TBD" && !loading && !teamEliminated;
  const canAnalyze = freeform.trim().length > 0 && !loading;

  return (
    <div className="w-full max-w-2xl mx-auto space-y-6">

      {/* Tournament toggle */}
      <div className="flex gap-2">
        {(["mens", "womens"] as Tournament[]).map(t => (
          <button key={t} onClick={() => setTournament(t)}
            className={`px-5 py-2 rounded-full text-sm font-medium transition-all duration-200 border ${
              tournament === t ? "bg-orange-500 border-orange-500 text-white"
              : "bg-transparent border-white/20 text-net/60 hover:border-white/40 hover:text-net"
            }`}>
            {t === "mens" ? "Men's" : "Women's"} Tournament
          </button>
        ))}
      </div>

      {/* ── PREDICT panel ── */}
      <div className="bg-court-700/60 border border-white/10 rounded-2xl p-5 space-y-4 backdrop-blur-sm">
        <p className="text-xs text-orange-400/80 uppercase tracking-widest font-medium">Predict a matchup</p>

        <div className="grid grid-cols-2 gap-3">
          {/* Team 1 searchable dropdown */}
          <div ref={team1Ref} className="relative">
            <label className="text-xs text-net/50 mb-1 block">Team</label>
            <input
              value={team1Search}
              onChange={e => { setTeam1Search(e.target.value); setTeam1Open(true); setTeam1Selected(null); setTeam2Name(""); setPossibleOpponents([]); }}
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

          {/* Team 2 — confirmed or picker */}
          <div>
            <label className="text-xs text-net/50 mb-1 block">
              Opponent
              {possibleOpponents.length > 0 && !opponentConfirmed && (
                <span className="ml-2 text-amber-400/70">— select possible opponent</span>
              )}
            </label>
            {opponentConfirmed && team2Name ? (
              <div className={`w-full bg-court-900/80 border rounded-xl px-4 py-2.5 text-sm flex items-center justify-between ${
                team2Name !== "TBD" ? "border-orange-500/30 text-net" : "border-white/10 text-net/30"
              }`}>
                <span>
                  {team2Name}
                  {team2Seed ? <span className="text-net/40 text-xs ml-1">(#{team2Seed})</span> : ""}
                </span>
                {possibleOpponents.length > 0 && (
                  <button onClick={() => { setOpponentConfirmed(false); setTeam2Name(""); }}
                    className="text-xs text-net/30 hover:text-net/60 ml-2">change</button>
                )}
              </div>
            ) : possibleOpponents.length > 0 ? (
              <div className="bg-court-900/80 border border-amber-500/20 rounded-xl overflow-hidden max-h-36 overflow-y-auto">
                {possibleOpponents.map(opp => (
                  <button key={opp.name} onClick={() => selectPossibleOpponent(opp)}
                    className="w-full text-left px-4 py-2 text-sm text-net hover:bg-white/8 flex items-center justify-between transition-colors border-b border-white/5 last:border-0">
                    <span>{opp.name}</span>
                    <span className="text-xs text-net/40 shrink-0">
                      {opp.seed ? `#${opp.seed}` : ""} {opp.record}
                      {opp.confirmed && <span className="text-orange-400 ml-1">✓</span>}
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="w-full bg-court-900/80 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-net/25 min-h-[42px] flex items-center">
                {team2Name || "Auto-filled from bracket"}
              </div>
            )}
          </div>
        </div>

        {/* Round dropdown */}
        <div>
          <label className="text-xs text-net/50 mb-1 block">Round</label>
          <select value={round} onChange={e => setRound(e.target.value)}
            className="w-full bg-court-900/80 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-net focus:outline-none focus:border-orange-500/60 transition-colors">
            {availableRounds.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>

        {teamEliminated && team1Selected && (
          <p className="text-xs text-red-400/70 text-center">{team1Selected.name} has been eliminated from the tournament.</p>
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
        <ResultCard prediction={result} matchupLabel={matchupLabel} tournament={tournament} round={round} />
      )}
    </div>
  );
}
