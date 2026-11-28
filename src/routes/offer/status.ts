import type { OfferStatus } from "$lib/db/schema";
import { statusMeta, type StatusTable } from "$lib/ui/status-meta";

export const OFFER_STATUS: StatusTable<OfferStatus> = {
  draft: { label: "Entwurf", variant: "draft" },
  sent: { label: "Versendet", variant: "open" },
  accepted: { label: "Angenommen", variant: "paid" },
  rejected: { label: "Abgelehnt", variant: "calm" },
  expired: { label: "Abgelaufen", variant: "calm" },
};

export const { label: OFFER_STATUS_LABEL, variant: OFFER_STATUS_VARIANT } = statusMeta(OFFER_STATUS);
