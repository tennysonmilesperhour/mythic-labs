import type { Config } from "tailwindcss";

// Every color comes from a CSS variable so the dark theme (globals.css,
// [data-theme="dark"]) restyles the whole app without touching components.
// The rgb(... / <alpha-value>) form keeps opacity modifiers like bg-bg/70 working.
const rgb = (name: string) => `rgb(var(--${name}-rgb) / <alpha-value>)`;

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: rgb("bg"),
        "bg-warm": rgb("bg-warm"),
        "bg-deep": rgb("bg-deep"),
        fg: rgb("fg"),
        "fg-dim": rgb("fg-dim"),
        "fg-ghost": rgb("fg-ghost"),
        accent: rgb("accent"),
        "accent-light": rgb("accent-light"),
        line: "var(--hairline)",
        "line-soft": "var(--hairline-soft)",
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
