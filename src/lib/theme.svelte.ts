export type ThemeMode = "system" | "light" | "dark";
type ResolvedTheme = "light" | "dark";

const STORAGE_KEY = "zettel.theme";
const NEXT_MODE: Record<ThemeMode, ThemeMode> = {
  system: "light",
  light: "dark",
  dark: "system",
};

const darkSchemeQuery = typeof window !== "undefined"
  ? window.matchMedia("(prefers-color-scheme: dark)")
  : null;

function isThemeMode(value: string | null): value is ThemeMode {
  return value === "light" || value === "dark" || value === "system";
}

function readStoredMode(): ThemeMode {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return isThemeMode(stored) ? stored : "system";
  } catch {
    // Storage missing or blocked: follow the system theme.
    return "system";
  }
}

function resolve(mode: ThemeMode): ResolvedTheme {
  if (mode === "system") return darkSchemeQuery?.matches ? "dark" : "light";
  return mode;
}

function applyToDocument(theme: ResolvedTheme) {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-theme", theme);
}

class ThemeStore {
  mode = $state<ThemeMode>(readStoredMode());
  resolved = $state<ResolvedTheme>(resolve(this.mode));

  constructor() {
    applyToDocument(this.resolved);
    darkSchemeQuery?.addEventListener("change", () => {
      if (this.mode === "system") this.update("system");
    });
  }

  set(mode: ThemeMode) {
    this.update(mode);
    try {
      localStorage.setItem(STORAGE_KEY, mode);
    } catch {
      // Storage blocked: the choice applies to this session only.
    }
  }

  cycle() {
    this.set(NEXT_MODE[this.mode]);
  }

  private update(mode: ThemeMode) {
    this.mode = mode;
    this.resolved = resolve(mode);
    applyToDocument(this.resolved);
  }
}

export const theme = new ThemeStore();
