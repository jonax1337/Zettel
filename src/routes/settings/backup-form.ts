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
