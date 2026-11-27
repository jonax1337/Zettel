import { select } from "./client";

/**
 * Finished minutes per project, split the way the Zeiten summary splits them: an entry without an invoice
 * is open, an entry on an invoice is billed. A running timer has no duration yet and counts in neither.
 * An entry released from a discarded draft has its invoice link removed, so it is open again.
 */
export type ProjectTimeFigures = { openMinutes: number; billedMinutes: number };

export const EMPTY_PROJECT_TIME_FIGURES: ProjectTimeFigures = { openMinutes: 0, billedMinutes: 0 };

type FigureRow = { project_id: number; open_minutes: number; billed_minutes: number };

/** The figures of every project that has finished entries; a project without any is absent. */
export async function loadProjectTimeFigures(): Promise<Map<number, ProjectTimeFigures>> {
  const rows = await select<FigureRow>(
    `SELECT project_id,
            COALESCE(SUM(CASE WHEN invoice_id IS NULL THEN duration_minutes END), 0) AS open_minutes,
            COALESCE(SUM(CASE WHEN invoice_id IS NOT NULL THEN duration_minutes END), 0) AS billed_minutes
     FROM time_entries
     WHERE duration_minutes IS NOT NULL
     GROUP BY project_id`,
  );
  return new Map(
    rows.map((r) => [r.project_id, { openMinutes: r.open_minutes, billedMinutes: r.billed_minutes }]),
  );
}
