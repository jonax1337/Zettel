const STORAGE_KEY = "zettel.datev-export";

export const DATEV_LABEL_MAX_LENGTH = 30;

export type DatevExportSettings = {
  beraternr: number;
  mandantennr: number;
  bezeichnung: string;
};

export const DEFAULT_DATEV_EXPORT_SETTINGS: DatevExportSettings = {
  beraternr: 1001,
  mandantennr: 1,
  bezeichnung: "Zettel-Export",
};

function positiveInteger(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : fallback;
}

/** Tolerates missing, malformed or partial stored data; every bad field falls back to its default. */
export function parseDatevExportSettings(raw: string | null): DatevExportSettings {
  const defaults = DEFAULT_DATEV_EXPORT_SETTINGS;
  let stored: Partial<Record<keyof DatevExportSettings, unknown>> = {};
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (parsed && typeof parsed === "object") stored = parsed;
  } catch {
    return { ...defaults };
  }
  const label = typeof stored.bezeichnung === "string" ? stored.bezeichnung.trim() : "";
  return {
    beraternr: positiveInteger(stored.beraternr, defaults.beraternr),
    mandantennr: positiveInteger(stored.mandantennr, defaults.mandantennr),
    bezeichnung: label ? label.slice(0, DATEV_LABEL_MAX_LENGTH) : defaults.bezeichnung,
  };
}

export function loadDatevExportSettings(): DatevExportSettings {
  try {
    return parseDatevExportSettings(localStorage.getItem(STORAGE_KEY));
  } catch {
    return { ...DEFAULT_DATEV_EXPORT_SETTINGS };
  }
}

/** Half-typed input (an empty number field) is not worth remembering, so it is skipped. */
export function saveDatevExportSettings(settings: {
  beraternr: number | null;
  mandantennr: number | null;
  bezeichnung: string;
}): void {
  const { beraternr, mandantennr, bezeichnung } = settings;
  if (!positiveInteger(beraternr, 0) || !positiveInteger(mandantennr, 0) || !bezeichnung.trim()) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ beraternr, mandantennr, bezeichnung }));
  } catch {
    // Storage can be blocked or full; the export itself does not depend on it.
  }
}
