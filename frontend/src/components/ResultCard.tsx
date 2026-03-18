"use client";

import { useEffect, useRef } from "react";
import { Prediction } from "@/lib/api";

interface Props {
  prediction: Prediction;
  matchupLabel: string;
  tournament: "mens" | "womens";
  round: string;
}

export default function ResultCard({ prediction, matchupLabel, tournament, round }: Props) {
  const barRef = useRef<HTMLDivElement>(null);
  const conf = Math.min(95, Math.max(50, prediction.confidence));

  useEffect(() => {
    // Trigger bar fill animation after mount
    const t = setTimeout(() => {
      if (barRef.current) {
        barRef.current.style.width = `${conf}%`;
      }
    }, 80);
    return () => clearTimeout(t);
  }, [conf]);

  const confColor =
    conf >= 80 ? "bg-emerald-500" : conf >= 65 ? "bg-orange-500" : "bg-amber-400";

  return (
    <div className="bg-court-700/60 border border-white/10 rounded-2xl p-5 space-y-4 backdrop-blur-sm animate-[fadeUp_0.4s_ease_forwards]">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-xs text-net/40 uppercase tracking-widest font-medium">
          {matchupLabel}
        </p>
        <span className="text-xs px-2.5 py-1 rounded-full bg-white/8 border border-white/10 text-net/50">
          {tournament === "mens" ? "Men's" : "Women's"} · {round}
        </span>
      </div>

      {/* Winner */}
      <div className="flex items-start gap-3">
        <span className="text-3xl mt-0.5">🏆</span>
        <div>
          <h2 className="font-display text-4xl text-orange-400 leading-none">
            {prediction.winner}
          </h2>
          {prediction.subtitle && (
            <p className="text-sm text-net/50 mt-1">{prediction.subtitle}</p>
          )}
        </div>
      </div>

      {/* Confidence bar */}
      <div>
        <div className="flex justify-between text-xs text-net/40 mb-1.5">
          <span>AI confidence</span>
          <span className="font-medium text-net/70">{conf}%</span>
        </div>
        <div className="h-2 w-full rounded-full bg-white/8 overflow-hidden">
          <div
            ref={barRef}
            className={`h-full rounded-full transition-[width] duration-700 ease-out ${confColor}`}
            style={{ width: "0%" }}
          />
        </div>
      </div>

      {/* Key factors */}
      {prediction.keyFactors?.length > 0 && (
        <div>
          <p className="text-xs text-net/40 uppercase tracking-widest mb-2 font-medium">
            Key factors
          </p>
          <div className="flex flex-wrap gap-2">
            {prediction.keyFactors.map((f) => (
              <span
                key={f}
                className="text-xs px-3 py-1 rounded-full bg-white/6 border border-white/10 text-net/70"
              >
                {f}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Analysis */}
      <p className="text-sm text-net/70 leading-relaxed border-t border-white/8 pt-4">
        {prediction.analysis}
      </p>

      {/* Dark horse */}
      {prediction.darkHorse && (
        <div className="bg-amber-900/25 border border-amber-500/20 rounded-xl px-4 py-3 text-sm text-amber-300/80">
          <span className="font-medium text-amber-400">Dark horse: </span>
          {prediction.darkHorse}
        </div>
      )}
    </div>
  );
}
