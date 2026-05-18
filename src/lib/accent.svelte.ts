import { invoke } from "@tauri-apps/api/core";

export type AccentKey =
  | "system"
  | "slate"
  | "indigo"
  | "violet"
  | "rose"
  | "emerald"
  | "amber"
  | "sky";

export type AccentMode = "light" | "dark";

type Palette = {
  primary: { light: string; dark: string };
  foreground: { light: string; dark: string };
};

export const ACCENT_PRESETS: Record<Exclude<AccentKey, "system">, Palette & { label: string; swatch: string }> = {
  slate: {
    label: "Schiefer",
    swatch: "oklch(0.45 0 0)",
    primary: { light: "oklch(0.205 0 0)", dark: "oklch(0.922 0 0)" },
    foreground: { light: "oklch(0.985 0 0)", dark: "oklch(0.205 0 0)" },
  },
  indigo: {
    label: "Indigo",
    swatch: "oklch(0.55 0.22 265)",
    primary: { light: "oklch(0.55 0.22 265)", dark: "oklch(0.72 0.18 265)" },
    foreground: { light: "oklch(0.985 0 0)", dark: "oklch(0.985 0 0)" },
  },
  violet: {
    label: "Violett",
    swatch: "oklch(0.55 0.24 295)",
    primary: { light: "oklch(0.55 0.24 295)", dark: "oklch(0.72 0.2 295)" },
    foreground: { light: "oklch(0.985 0 0)", dark: "oklch(0.985 0 0)" },
  },
  rose: {
    label: "Rosé",
    swatch: "oklch(0.62 0.22 15)",
    primary: { light: "oklch(0.62 0.22 15)", dark: "oklch(0.72 0.2 15)" },
    foreground: { light: "oklch(0.985 0 0)", dark: "oklch(0.985 0 0)" },
  },
  emerald: {
    label: "Smaragd",
    swatch: "oklch(0.6 0.16 160)",
    primary: { light: "oklch(0.55 0.16 160)", dark: "oklch(0.72 0.16 160)" },
    foreground: { light: "oklch(0.985 0 0)", dark: "oklch(0.985 0 0)" },
  },
  amber: {
    label: "Bernstein",
    swatch: "oklch(0.78 0.16 75)",
    primary: { light: "oklch(0.72 0.16 75)", dark: "oklch(0.82 0.14 75)" },
    foreground: { light: "oklch(0.2 0 0)", dark: "oklch(0.2 0 0)" },
  },
  sky: {
    label: "Himmel",
    swatch: "oklch(0.65 0.16 230)",
    primary: { light: "oklch(0.58 0.16 230)", dark: "oklch(0.75 0.14 230)" },
    foreground: { light: "oklch(0.985 0 0)", dark: "oklch(0.985 0 0)" },
  },
};

const STORAGE_KEY = "zettel.accent";

function readStored(): AccentKey {
  if (typeof localStorage === "undefined") return "indigo";
  const v = localStorage.getItem(STORAGE_KEY);
  if (v && (v === "system" || v in ACCENT_PRESETS)) return v as AccentKey;
  return "indigo";
}

function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

// Perceived luminance (sRGB → Y). Returns 0..1.
function luminance(r: number, g: number, b: number): number {
  const f = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

async function readSystemAccent(): Promise<Palette | null> {
  if (!isTauri()) return null;
  try {
    const rgb = await invoke<[number, number, number] | null>("get_system_accent_color");
    if (!rgb) return null;
    const [r, g, b] = rgb;
    const css = `rgb(${r} ${g} ${b})`;
    const isDarkColor = luminance(r, g, b) < 0.5;
    const fg = isDarkColor ? "oklch(0.985 0 0)" : "oklch(0.2 0 0)";
    return {
      primary: { light: css, dark: css },
      foreground: { light: fg, dark: fg },
    };
  } catch {
    return null;
  }
}

function applyPalette(p: Palette, mode: AccentMode) {
  if (typeof document === "undefined") return;
  const root = document.documentElement.style;
  root.setProperty("--primary", p.primary[mode]);
  root.setProperty("--primary-foreground", p.foreground[mode]);
  root.setProperty("--ring", p.primary[mode]);
}

class AccentStore {
  key = $state<AccentKey>(readStored());
  // resolved palette currently applied (after system-lookup if needed)
  resolved = $state<Palette>(ACCENT_PRESETS.slate);
  // Cache of the OS accent so toggling theme mode doesn't re-query Tauri.
  private systemPalette: Palette | null = null;

  async init(mode: AccentMode) {
    await this.refresh(mode);
  }

  /** Re-apply the current accent for the given theme mode (call after light/dark switch). */
  async refresh(mode: AccentMode) {
    const palette = await this.paletteFor(this.key);
    this.resolved = palette;
    applyPalette(palette, mode);
  }

  async set(key: AccentKey, mode: AccentMode) {
    this.key = key;
    try {
      localStorage.setItem(STORAGE_KEY, key);
    } catch {}
    await this.refresh(mode);
  }

  private async paletteFor(key: AccentKey): Promise<Palette> {
    if (key !== "system") return ACCENT_PRESETS[key];
    if (!this.systemPalette) {
      this.systemPalette = await readSystemAccent();
    }
    return this.systemPalette ?? ACCENT_PRESETS.slate;
  }
}

export const accent = new AccentStore();
