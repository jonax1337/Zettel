export type DroppedPdfSelection = {
  pdf: string | null;
  /** Dropped paths beyond the processed one, PDFs and other files alike. */
  ignoredCount: number;
};

function isPdf(path: string): boolean {
  return path.toLowerCase().endsWith(".pdf");
}

/** Only one PDF is processed per drop; everything else is reported as ignored. */
export function pickDroppedPdf(paths: string[]): DroppedPdfSelection {
  const pdf = paths.find(isPdf) ?? null;
  return { pdf, ignoredCount: pdf ? paths.length - 1 : 0 };
}
