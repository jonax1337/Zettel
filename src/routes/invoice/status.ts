import type { InvoiceStatus } from "$lib/db/schema";
import { statusMeta, type StatusTable } from "$lib/ui/status-meta";

export const INVOICE_STATUS: StatusTable<InvoiceStatus> = {
  draft: { label: "Entwurf", variant: "draft" },
  sent: { label: "Versendet", variant: "open" },
  partial: { label: "Teilbezahlt", variant: "open" },
  paid: { label: "Bezahlt", variant: "paid" },
  cancelled: { label: "Storniert", variant: "calm" },
};

export const { label: INVOICE_STATUS_LABEL, variant: INVOICE_STATUS_VARIANT } =
  statusMeta(INVOICE_STATUS);
