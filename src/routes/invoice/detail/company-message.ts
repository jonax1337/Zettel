const MISSING_LIST = /Firmendaten unvollständig: (.+?)\. Bitte/;

/** The labels of the missing company data, read back from the message the PDF guard wrote. */
export function missingFromCompanyMessage(message: string): string[] {
  const list = MISSING_LIST.exec(message)?.[1];
  return list ? list.split(", ") : [];
}
