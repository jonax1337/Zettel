import { accent } from "./accent.svelte";

export type ThemeMode = "system" | "light" | "dark";

const STORAGE_KEY = "zettel.theme";
const media = typeof window !== "undefined"
  ? window.matchMedia("(prefers-color-scheme: dark)")
  : null;

function readStored(): ThemeMode {
  if (typeof localStorage === "undefined") return "system";
  const v = localStorage.getItem(STORAGE_KEY);
  return v === "light" || v === "dark" || v === "system" ? v : "system";
}

function resolve(mode: ThemeMode): "light" | "dark" {
  if (mode === "system") return media?.matches ? "dark" : "light";
  return mode;
}

function apply(resolved: "light" | "dark") {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-theme", resolved);
  // accent depends on the resolved light/dark mode for its lightness curve
  void accent.refresh(resolved);
}

class ThemeStore {
  mode = $state<ThemeMode>(readStored());
  resolved = $state<"light" | "dark">(resolve(readStored()));

  constructor() {
    apply(this.resolved);
    media?.addEventListener("change", () => {
      if (this.mode === "system") {
        this.resolved = resolve("system");
        apply(this.resolved);
      }
    });
  }

  set(mode: ThemeMode) {
    this.mode = mode;
    this.resolved = resolve(mode);
    apply(this.resolved);
    try {
      localStorage.setItem(STORAGE_KEY, mode);
    } catch {}
  }

  cycle() {
    const next: ThemeMode =
      this.mode === "system" ? "light" : this.mode === "light" ? "dark" : "system";
    this.set(next);
  }
}

export const theme = new ThemeStore();
