import type { BadgeVariant } from "$lib/ui/Badge.svelte";

const VALIDATABLE_EXTENSIONS = [".pdf", ".xml"];

/** The first dropped file the validator can read (PDF with ZUGFeRD XML, or plain XML). */
export function firstValidatableFile(paths: string[]): string | null {
  return (
    paths.find((path) => VALIDATABLE_EXTENSIONS.some((ext) => path.toLowerCase().endsWith(ext))) ??
    null
  );
}

export function validationVerdictLabel(valid: boolean): string {
  return valid ? "Bestanden" : "Abgelehnt";
}

export const VALIDATOR_UNAVAILABLE_MESSAGE =
  "Die Prüfung ist auf diesem Gerät nicht verfügbar. Bitte Zettel neu installieren oder auf die neueste Version aktualisieren.";

/** Name of the file without its folders; the validator reports Windows and POSIX paths. */
export function baseName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

const SEVERITY_META: Record<string, { label: string; variant: BadgeVariant }> = {
  error: { label: "Fehler", variant: "late" },
  warning: { label: "Warnung", variant: "open" },
  info: { label: "Hinweis", variant: "calm" },
};

/** Label and tone of a finding; an unknown severity is shown as reported, in the strictest tone. */
export function findingSeverityMeta(severity: string): { label: string; variant: BadgeVariant } {
  return SEVERITY_META[severity] ?? { label: severity, variant: SEVERITY_META.error.variant };
}