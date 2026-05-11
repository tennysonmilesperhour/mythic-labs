import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: "#f7f5f0",
        "bg-warm": "#f0ece4",
        "bg-deep": "#e8e2d8",
        fg: "#1a1814",
        "fg-dim": "#6a6560",
        "fg-ghost": "#a09a94",
        accent: "#8b7355",
        "accent-light": "#c4a882",
        line: "rgba(26,24,20,0.08)",
        "line-soft": "rgba(26,24,20,0.05)",
      },
      fontFamily: {
        display: ['"Cormorant Garamond"', "serif"],
        body: ['"Space Grotesk"', "sans-serif"],
        mono: ['"JetBrains Mono"', "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
