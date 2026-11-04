import type { OfferStatus } from "$lib/db/schema";
import { statusMeta, type StatusTable } from "$lib/ui/status-meta";

export const OFFER_STATUS: StatusTable<OfferStatus> = {
  draft: { label: "Entwurf", variant: "secondary" },
  sent: { label: "Versendet", variant: "warning" },
  accepted: { label: "Angenommen", variant: "success" },
  rejected: { label: "Abgelehnt", variant: "destructive" },
  expired: { label: "Abgelaufen", variant: "outline" },
};

export const { label: OFFER_STATUS_LABEL, variant: OFFER_STATUS_VARIANT } = statusMeta(OFFER_STATUS);
