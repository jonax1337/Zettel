import type { OfferStatus } from "$lib/db/schema";
import type { StatusVariant } from "../invoice/status";

export const OFFER_STATUS_LABEL: Record<OfferStatus, string> = {
  draft: "Entwurf",
  sent: "Versendet",
  accepted: "Angenommen",
  rejected: "Abgelehnt",
  expired: "Abgelaufen",
};

export const OFFER_STATUS_VARIANT: Record<OfferStatus, StatusVariant> = {
  draft: "secondary",
  sent: "warning",
  accepted: "success",
  rejected: "destructive",
  expired: "outline",
};
