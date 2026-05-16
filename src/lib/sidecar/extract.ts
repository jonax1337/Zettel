import { invoke } from "@tauri-apps/api/core";

export type ExtractedParty = {
  name: string | null;
  street: string;
  postalCode: string;
  city: string;
  country: string;
  vatId: string | null;
  taxNumber: string | null;
  email: string | null;
};

export type ExtractedLineItem = {
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number; // cents
  vatRate: number;
  lineTotal: number; // cents
  categoryCode: string | null;
};

export type ExtractedInvoice = {
  invoiceNumber: string | null;
  typeCode: string;
  isCreditNote: boolean;
  issueDate: number | null;
  dueDate: number | null;
  deliveryDate: number | null;
  currency: string;
  reverseChargeType: "none" | "intra_eu" | "third_country";
  seller: ExtractedParty;
  buyer: ExtractedParty;
  lineItems: ExtractedLineItem[];
  totals: { subtotal: number; vatAmount: number; total: number };
};

export type ExtractResultFound = {
  success: true;
  found: true;
  profile: string;
  xmlFilename: string | null;
  data: ExtractedInvoice;
};

export type ExtractResultNotFound = {
  success: true;
  found: false;
};

export type ExtractResultError = {
  success: false;
  error: { code: string; message: string; details: string };
};

export type ExtractResult =
  | ExtractResultFound
  | ExtractResultNotFound
  | ExtractResultError;

export async function extractZugferd(pdfPath: string): Promise<ExtractResult> {
  return (await invoke("extract_zugferd", { pdfPath })) as ExtractResult;
}

export async function importExpensePdf(
  srcPath: string,
  vendorSlug?: string | null,
): Promise<string> {
  return (await invoke("import_expense_pdf", {
    srcPath,
    vendorSlug: vendorSlug ?? null,
  })) as string;
}
