import PredictorForm from "@/components/PredictorForm";

export default function Home() {
  return (
    <main className="relative z-10 min-h-screen px-4 py-16">
      {/* Hero */}
      <div className="text-center mb-12 space-y-3">
        <p className="text-xs text-orange-400/80 uppercase tracking-[0.3em] font-medium">
          AI-Powered · 2025 NCAA Tournament
        </p>
        <h1 className="font-display text-6xl sm:text-8xl text-net leading-none">
          MARCH
          <br />
          <span className="text-orange-500">MADNESS</span>
          <br />
          PREDICTOR
        </h1>
        <p className="text-net/40 text-sm max-w-sm mx-auto leading-relaxed">
          Ask the AI to predict any matchup or championship outcome for the
          Men&apos;s and Women&apos;s tournaments.
        </p>
      </div>

      {/* Predictor */}
      <PredictorForm />

      {/* Footer */}
      <footer className="mt-20 text-center text-xs text-net/20 space-y-1">
        <p>Predictions are AI-generated and for entertainment purposes only.</p>
        <p>Powered by Claude · Built with Next.js</p>
      </footer>
    </main>
  );
}
