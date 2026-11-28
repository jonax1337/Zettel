import { TAX_ID_LABEL } from "$lib/utils/company-completeness";

const MISSING_LIST = /Firmendaten unvollständig: (.+?)\. Bitte/;

/** The labels of the missing company data, read back from the message the PDF guard wrote. */
export function missingFromCompanyMessage(message: string): string[] {
  const list = MISSING_LIST.exec(message)?.[1];
  if (!list) return [];
  // The message drops the period of a label that ends the list, so the sentence has only one.
  return list.split(", ").map((label) => (`${label}.` === TAX_ID_LABEL ? TAX_ID_LABEL : label));
}
