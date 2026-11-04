import type { Settings } from "$lib/db/schema";

export const COMPANY_STEP = 1;
export const TAX_STEP = 2;
export const STEP_COUNT = 4;

const DEFAULT_COUNTRY = "DE";
const COUNTRY_CODE_LENGTH = 2;

export type OnboardingDraft = {
  companyName: string;
  ownerName: string;
  email: string;
  street: string;
  postalCode: string;
  city: string;
  country: string;
  taxNumber: string;
  vatId: string;
  isKleinunternehmer: boolean;
  bankName: string;
  bankIban: string;
  bankBic: string;
};

export function emptyDraft(): OnboardingDraft {
  return {
    companyName: "",
    ownerName: "",
    email: "",
    street: "",
    postalCode: "",
    city: "",
    country: DEFAULT_COUNTRY,
    taxNumber: "",
    vatId: "",
    isKleinunternehmer: true,
    bankName: "",
    bankIban: "",
    bankBic: "",
  };
}

/** The error to show when the user may not leave `step` yet, or null when the step is complete. */
export function validateStep(step: number, draft: OnboardingDraft): string | null {
  if (step === COMPANY_STEP) {
    const required = [draft.companyName, draft.street, draft.postalCode, draft.city];
    if (required.some((value) => !value.trim())) return "Bitte alle Pflichtfelder ausfüllen.";
  }
  if (step === TAX_STEP && !draft.taxNumber.trim() && !draft.vatId.trim()) {
    return "EN-16931 verlangt mindestens eine Steuernummer ODER USt-IdNr. (BR-CO-26).";
  }
  return null;
}

export function applyDraft(current: Settings, draft: OnboardingDraft): Settings {
  return {
    ...current,
    companyName: draft.companyName.trim(),
    ownerName: draft.ownerName.trim(),
    email: draft.email.trim(),
    street: draft.street.trim(),
    postalCode: draft.postalCode.trim(),
    city: draft.city.trim(),
    country:
      draft.country.trim().toUpperCase().slice(0, COUNTRY_CODE_LENGTH) || DEFAULT_COUNTRY,
    taxNumber: draft.taxNumber.trim(),
    vatId: draft.vatId.trim() || null,
    isKleinunternehmer: draft.isKleinunternehmer,
    bankName: draft.bankName.trim(),
    bankIban: draft.bankIban.trim(),
    bankBic: draft.bankBic.trim(),
  };
}
