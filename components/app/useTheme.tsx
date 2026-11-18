"use client";

import { useCallback, useEffect, useState } from "react";
import { Icon } from "../bits";

/** Light or dark as picked on this device, or null to follow the system. */
export type Theme = "light" | "dark" | null;

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(null);
  // After mount: the server renders the page too and can't see this browser's choice.
  useEffect(() => {
    try {
      const t = localStorage.getItem("ml-theme");
      if (t === "light" || t === "dark") setThemeState(t);
    } catch {
      /* storage unavailable: system theme */
    }
  }, []);

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    try {
      if (t) localStorage.setItem("ml-theme", t);
      else localStorage.removeItem("ml-theme");
    } catch {
      /* per-device convenience only */
    }
    if (t) document.documentElement.dataset.theme = t;
    else delete document.documentElement.dataset.theme;
  }, []);

  const effectiveDark = () =>
    theme ? theme === "dark" : typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches;
  const toggleTheme = () => setTheme(effectiveDark() ? "light" : "dark");

  return { theme, setTheme, toggleTheme };
}

export function ThemeIcon({ theme }: { theme: Theme }) {
  // Shows the mode you would switch to.
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const f = () => setDark(theme ? theme === "dark" : mq.matches);
    f();
    mq.addEventListener("change", f);
    return () => mq.removeEventListener("change", f);
  }, [theme]);
  return dark ? <Icon.sun /> : <Icon.moon />;
}
