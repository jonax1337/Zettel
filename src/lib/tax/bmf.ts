import { invoke } from "@tauri-apps/api/core";
import type { FilingStatus } from "./income";

export interface BmfTaxResult {
  /** Jahres-ESt in Cent (LSTLZZ aus dem BMF-Lohnsteuer-Rechner). */
  est: number;
  /** Soli in Cent (SOLZLZZ). */
  soli: number;
  /** Veranlagungsjahr, das tatsächlich gerechnet wurde. */
  year: number;
}

interface CacheEntry {
  result: BmfTaxResult;
  ts: number;
}

const CACHE_PREFIX = "zettel.bmf.";
const TTL_MS = 24 * 60 * 60 * 1000;

function cacheKey(year: number, status: FilingStatus, zvECent: number): string {
  return `${CACHE_PREFIX}${year}:${status}:${zvECent}`;
}

/**
 * Versucht den BMF-Lohnsteuer-Rechner anzurufen. Bei Erfolg cache 24 h in
 * localStorage; bei Offline / Fehler → `null`, Aufrufer fällt auf lokalen
 * Tarif zurück.
 */
export async function fetchBmfIncomeTax(
  zvECent: number,
  status: FilingStatus,
  year: number,
): Promise<BmfTaxResult | null> {
  if (zvECent <= 0) {
    return { est: 0, soli: 0, year };
  }
  const key = cacheKey(year, status, zvECent);
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const entry = JSON.parse(raw) as CacheEntry;
      if (Date.now() - entry.ts < TTL_MS) return entry.result;
    }
  } catch {
    // Korrupte Cache-Einträge ignorieren, neu holen.
  }
  try {
    const result = await invoke<BmfTaxResult>("fetch_bmf_income_tax", {
      zvECent,
      status,
      year,
    });
    try {
      localStorage.setItem(key, JSON.stringify({ result, ts: Date.now() }));
    } catch {
      // localStorage voll oder unverfügbar — Cache-Verlust ist OK.
    }
    return result;
  } catch {
    return null;
  }
}

/** Cache komplett leeren — z. B. nach Steuerjahres-Wechsel oder manuellem Reset. */
export function clearBmfCache(): void {
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith(CACHE_PREFIX)) keys.push(k);
  }
  for (const k of keys) localStorage.removeItem(k);
}
