const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

export interface PredictPayload {
  tournament: "mens" | "womens";
  team1?: string;
  team2?: string;
  round?: string;
  freeform?: string;
}

export interface Prediction {
  winner: string;
  confidence: number;
  subtitle?: string;
  keyFactors: string[];
  analysis: string;
  darkHorse?: string;
}

export async function fetchPrediction(payload: PredictPayload): Promise<Prediction> {
  const res = await fetch(`${API_URL}/api/predict`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.error || "Prediction failed.");
  }

  return data.prediction as Prediction;
}
