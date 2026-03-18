import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "March Madness Predictor · AI-Powered",
  description:
    "AI predictions for the NCAA Men's and Women's March Madness tournaments. Powered by Claude.",
  openGraph: {
    title: "March Madness Predictor",
    description: "AI-powered bracket predictions for Men's & Women's NCAA tournaments",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen relative z-10">{children}</body>
    </html>
  );
}
