import { describe, expect, it } from "vitest";
import {
  backupPasswordProblem,
  defaultBackupFilename,
  isPasswordRequiredError,
  restoreSealWarning,
  restoreTimeEntryWarning,
} from "./backup-form";

describe("defaultBackupFilename", () => {
  it("zero-pads month, day, hour and minute", () => {
    expect(defaultBackupFilename(new Date(2026, 0, 5, 9, 7))).toBe("zettel-backup-20260105-0907.zip");
  });
  it("uses two-digit values unchanged", () => {
    expect(defaultBackupFilename(new Date(2026, 11, 31, 23, 59))).toBe(
      "zettel-backup-20261231-2359.zip",
    );
  });
});

describe("backupPasswordProblem", () => {
  it("rejects a password shorter than 8 characters", () => {
    expect(backupPasswordProblem("1234567", "1234567")?.title).toBe("Passwort zu kurz");
  });
  it("accepts a password of exactly 8 characters", () => {
    expect(backupPasswordProblem("12345678", "12345678")).toBeNull();
  });
  it("rejects a confirmation that differs", () => {
    expect(backupPasswordProblem("12345678", "12345679")?.title).toBe(
      "Passwörter stimmen nicht überein",
    );
  });
});

describe("isPasswordRequiredError", () => {
  it("recognises the backend marker in strings and Error objects", () => {
    expect(isPasswordRequiredError("password_required")).toBe(true);
    expect(isPasswordRequiredError(new Error("restore: password_required"))).toBe(true);
  });
  it("ignores other failures", () => {
    expect(isPasswordRequiredError("disk full")).toBe(false);
  });
});

describe("restoreSealWarning", () => {
  it("stays silent when the invoices were not restored or the chain came along", () => {
    expect(restoreSealWarning({ sealsFromBackup: null, droppedLiveSeals: 0, unlinkedTimeEntries: 0 })).toBeNull();
    expect(restoreSealWarning({ sealsFromBackup: true, droppedLiveSeals: 0, unlinkedTimeEntries: 0 })).toBeNull();
  });

  it("explains a backup from before the seals without claiming the invoices are gone", () => {
    const warning = restoreSealWarning({ sealsFromBackup: false, droppedLiveSeals: 9, unlinkedTimeEntries: 0 });
    expect(warning?.title).toBe("Rechnungen ohne Siegel wiederhergestellt");
    expect(warning?.description).toContain("neu versiegelt");
    expect(warning?.description).not.toContain("nicht mehr vorhanden");
  });

  it("counts the seals a newer chain lost, singular and plural", () => {
    expect(restoreSealWarning({ sealsFromBackup: true, droppedLiveSeals: 1, unlinkedTimeEntries: 0 })?.description).toMatch(
      /^1 Rechnungssiegel .* wurde verworfen/,
    );
    expect(restoreSealWarning({ sealsFromBackup: true, droppedLiveSeals: 3, unlinkedTimeEntries: 0 })?.description).toMatch(
      /^3 Rechnungssiegel .* wurden verworfen/,
    );
  });
});

describe("restoreTimeEntryWarning", () => {
  const outcome = { sealsFromBackup: null, droppedLiveSeals: 0 };

  it("stays silent when no billed entry was detached from its invoice", () => {
    expect(restoreTimeEntryWarning({ ...outcome, unlinkedTimeEntries: 0 })).toBeNull();
  });

  it("tells how many billed entries are open again, singular and plural", () => {
    expect(restoreTimeEntryWarning({ ...outcome, unlinkedTimeEntries: 1 })?.description).toBe(
      "1 Zeiteintrag war abgerechnet und ist jetzt wieder offen – bitte prüfen, bevor du ihn erneut abrechnest.",
    );
    expect(restoreTimeEntryWarning({ ...outcome, unlinkedTimeEntries: 4 })?.description).toBe(
      "4 Zeiteinträge waren abgerechnet und sind jetzt wieder offen – bitte prüfen, bevor du sie erneut abrechnest.",
    );
  });
});
