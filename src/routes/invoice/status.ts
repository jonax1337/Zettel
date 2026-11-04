import type { InvoiceStatus } from "$lib/db/schema";

export type StatusVariant = "secondary" | "warning" | "success" | "destructive" | "outline";

export const INVOICE_STATUS_LABEL: Record<InvoiceStatus, string> = {
  draft: "Entwurf",
  sent: "Versendet",
  partial: "Teilbezahlt",
  paid: "Bezahlt",
  cancelled: "Storniert",
};

export const INVOICE_STATUS_VARIANT: Record<InvoiceStatus, StatusVariant> = {
  draft: "secondary",
  sent: "warning",
  partial: "warning",
  paid: "success",
  cancelled: "outline",
};
