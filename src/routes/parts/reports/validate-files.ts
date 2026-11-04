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
