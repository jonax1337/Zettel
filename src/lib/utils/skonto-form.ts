import type { Settings } from "$lib/db/schema";

export type SkontoForm = {
  enabled: boolean;
  percent: number;
  days: number;
};

const FALLBACK_PERCENT = 2;
const FALLBACK_DAYS = 7;

export function defaultSkontoForm(): SkontoForm {
  return { enabled: false, percent: FALLBACK_PERCENT, days: FALLBACK_DAYS };
}

export function skontoFormFromSettings(
  settings: Pick<Settings, "defaultSkontoActive" | "defaultSkontoPercent" | "defaultSkontoDays">,
): SkontoForm {
  if (!settings.defaultSkontoActive) return defaultSkontoForm();
  return { enabled: true, percent: settings.defaultSkontoPercent, days: settings.defaultSkontoDays };
}

export function skontoFormFromStored(percent: number | null, days: number | null): SkontoForm {
  if (percent == null || days == null) return defaultSkontoForm();
  return { enabled: true, percent, days };
}

export function skontoInput(
  form: SkontoForm,
  allowed = true,
): { skontoPercent: number | null; skontoDays: number | null } {
  const active = form.enabled && allowed;
  return {
    skontoPercent: active ? form.percent : null,
    skontoDays: active ? form.days : null,
  };
}
