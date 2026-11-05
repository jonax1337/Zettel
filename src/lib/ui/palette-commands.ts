import { CREATE_ACTIONS, NAV_GROUPS, SETTINGS_PAGES } from "$lib/navigation";

export type PaletteCommandGroup = "create" | "navigate";

export type PaletteCommand = {
  id: string;
  label: string;
  route: string;
  group: PaletteCommandGroup;
  /** Extra search terms that are not part of the visible label. */
  keywords: string;
};

export const PALETTE_GROUP_LABEL: Record<PaletteCommandGroup, string> = {
  create: "Neu anlegen",
  navigate: "Gehe zu",
};

export function buildPaletteCommands(): PaletteCommand[] {
  const create = CREATE_ACTIONS.map<PaletteCommand>((a) => ({
    id: `create:${a.href}`,
    label: a.label,
    route: a.href,
    group: "create",
    keywords: a.keywords,
  }));
  const pages = NAV_GROUPS.flatMap((g) => g.items).map<PaletteCommand>((item) => ({
    id: `go:${item.href}`,
    label: item.label,
    route: item.href,
    group: "navigate",
    keywords: "",
  }));
  const settings = SETTINGS_PAGES.map<PaletteCommand>((page) => ({
    id: `go:${page.href}`,
    label: `Einstellungen: ${page.label}`,
    route: page.href,
    group: "navigate",
    keywords: "",
  }));
  return [...create, ...pages, ...settings];
}

function normalize(text: string): string {
  return text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/** Commands whose label or keywords contain every word of the query, in their original order. */
export function filterCommands(commands: PaletteCommand[], query: string): PaletteCommand[] {
  const words = normalize(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return commands;
  return commands.filter((c) => {
    const haystack = normalize(`${c.label} ${c.keywords}`);
    return words.every((w) => haystack.includes(w));
  });
}
