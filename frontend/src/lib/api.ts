const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

export interface TeamInfo {
  name: string;
  seed: number | null;
  record: string;
  games: {
    round: string;
    opponent: string;
    opponentSeed: number | null;
    status: string;
    gameId: string;
  }[];
}

export interface BracketData {
  teams: TeamInfo[];
  games: GameInfo[];
}

export interface GameInfo {
  id: string;
  name: string;
  round: string;
  status: string;
  home: { name: string; seed: number | null; score: string | null; record: string; winner: boolean };
  away: { name: string; seed: number | null; score: string | null; record: string; winner: boolean };
}

export interface PredictPayload {
  tournament: "mens" | "womens";
  team1?: string;
  team2?: string;
  round?: string;
  freeform?: string;
  mode: "predict" | "analyze";
}

export interface Prediction {
  winner: string;
  confidence: number;
  subtitle?: string;
  keyFactors: string[];
  analysis: string;
  darkHorse?: string;
}

export async function fetchBracket(tournament: "mens" | "womens"): Promise<BracketData> {
  const res = await fetch(`${API_URL}/api/bracket?tournament=${tournament}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to fetch bracket");
  return data;
}

export async function fetchPrediction(payload: PredictPayload): Promise<Prediction> {
  const res = await fetch(`${API_URL}/api/predict`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Prediction failed.");
  return data.prediction as Prediction;
}
