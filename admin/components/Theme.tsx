"use client";

import { useEffect, useState } from "react";

/**
 * Light and dark follow the system unless a choice was saved. The inline
 * script runs before paint so the first frame already has the right theme.
 */
const KEY = "mythic-theme";

export function ThemeScript() {
  const code = `(function(){try{var s=localStorage.getItem(${JSON.stringify(KEY)});var d=s?s==="dark":window.matchMedia("(prefers-color-scheme: dark)").matches;if(d)document.documentElement.setAttribute("data-theme","dark");else document.documentElement.setAttribute("data-theme","light");}catch(e){}})();`;
  return <script dangerouslySetInnerHTML={{ __html: code }} />;
}

export type Theme = "light" | "dark";

export function readTheme(): Theme {
  if (typeof document === "undefined") return "light";
  return document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
}

export function applyTheme(theme: Theme, persist = true) {
  document.documentElement.setAttribute("data-theme", theme);
  try {
    if (persist) localStorage.setItem(KEY, theme);
  } catch {
    // Storage is a convenience; the attribute alone restyles the page.
  }
  document.dispatchEvent(new CustomEvent("mythic:theme", { detail: theme }));
}

/** The current theme, kept in sync with toggles made anywhere on the page. */
export function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>("light");
  useEffect(() => {
    setTheme(readTheme());
    const onChange = (e: Event) => setTheme((e as CustomEvent<Theme>).detail);
    const onToggle = () => applyTheme(readTheme() === "dark" ? "light" : "dark");
    document.addEventListener("mythic:theme", onChange);
    document.addEventListener("mythic:toggle-theme", onToggle);
    return () => {
      document.removeEventListener("mythic:theme", onChange);
      document.removeEventListener("mythic:toggle-theme", onToggle);
    };
  }, []);
  return [theme, () => applyTheme(theme === "dark" ? "light" : "dark")];
}
