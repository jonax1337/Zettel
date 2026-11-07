import type { InvoiceStatus } from "$lib/db/schema";
import { statusMeta, type StatusTable } from "$lib/ui/status-meta";

export const INVOICE_STATUS: StatusTable<InvoiceStatus> = {
  draft: { label: "Entwurf", variant: "secondary" },
  sent: { label: "Versendet", variant: "warning" },
  partial: { label: "Teilbezahlt", variant: "warning" },
  paid: { label: "Bezahlt", variant: "success" },
  cancelled: { label: "Storniert", variant: "outline" },
};

export const { label: INVOICE_STATUS_LABEL, variant: INVOICE_STATUS_VARIANT } =
  statusMeta(INVOICE_STATUS);
