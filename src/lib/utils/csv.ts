/** UTF-8-BOM, so Excel and DATEV detect the encoding. */
export const UTF8_BOM = "﻿";

export const CSV_LINE_BREAK = "\r\n";

/** Quotes a field only when it contains the `;` delimiter, a quote or a line break. */
export function escapeCsvField(value: string): string {
  if (/[;"\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
