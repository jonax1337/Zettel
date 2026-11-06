export const BACKUP_PASSWORD_MIN_LENGTH = 8;

export type FormProblem = { title: string; description?: string };

/** Local-time name suggested for a new backup file, e.g. `zettel-backup-20260503-0915.zip`. */
export function defaultBackupFilename(now: Date): string {
  const two = (n: number) => String(n).padStart(2, "0");
  const day = `${now.getFullYear()}${two(now.getMonth() + 1)}${two(now.getDate())}`;
  const time = `${two(now.getHours())}${two(now.getMinutes())}`;
  return `zettel-backup-${day}-${time}.zip`;
}

export function backupPasswordProblem(password: string, confirmation: string): FormProblem | null {
  if (password.length < BACKUP_PASSWORD_MIN_LENGTH) {
    return {
      title: "Passwort zu kurz",
      description: `Mindestens ${BACKUP_PASSWORD_MIN_LENGTH} Zeichen.`,
    };
  }
  if (password !== confirmation) return { title: "Passwörter stimmen nicht überein" };
  return null;
}

/** The backend reports an encrypted backup without a password with this marker in its error text. */
export function isPasswordRequiredError(error: unknown): boolean {
  return String(error).includes("password_required");
}

/**
 * `sealsFromBackup` is null when the invoice section was not restored; `droppedLiveSeals` is then 0.
 * `unlinkedTimeEntries` counts billed time entries that are open again.
 */
export type PartialRestoreOutcome = {
  sealsFromBackup: boolean | null;
  droppedLiveSeals: number;
  unlinkedTimeEntries: number;
};

/** One warning for what a partial restore did to the invoice seals; null when the chain came along intact. */
export function restoreSealWarning({ sealsFromBackup, droppedLiveSeals }: PartialRestoreOutcome): FormProblem | null {
  if (sealsFromBackup === false) {
    return {
      title: "Rechnungen ohne Siegel wiederhergestellt",
      description:
        "Die Sicherung stammt aus einer Version ohne Rechnungssiegel, die bisherige Hash-Kette wurde durch ihren Stand ersetzt. Die wiederhergestellten Rechnungen werden beim nächsten Start neu versiegelt – bitte danach die Integritätsprüfung unter Einstellungen → Daten ausführen.",
    };
  }
  if (droppedLiveSeals > 0) {
    const verb = droppedLiveSeals === 1 ? "wurde" : "wurden";
    return {
      title: "Rechnungssiegel verworfen",
      description: `${droppedLiveSeals} Rechnungssiegel aus der Zeit nach dieser Sicherung ${verb} verworfen, weil die Sicherung einen älteren Stand der Rechnungen enthält. Der Vorgang ist im Änderungsprotokoll vermerkt.`,
    };
  }
  return null;
}

/** Warns about billed time entries the restore detached from their invoices; null when none were. */
export function restoreTimeEntryWarning({ unlinkedTimeEntries }: PartialRestoreOutcome): FormProblem | null {
  if (unlinkedTimeEntries === 0) return null;
  const description =
    unlinkedTimeEntries === 1
      ? "1 Zeiteintrag war abgerechnet und ist jetzt wieder offen – bitte prüfen, bevor du ihn erneut abrechnest."
      : `${unlinkedTimeEntries} Zeiteinträge waren abgerechnet und sind jetzt wieder offen – bitte prüfen, bevor du sie erneut abrechnest.`;
  return { title: "Zeiteinträge wieder offen", description };
}
