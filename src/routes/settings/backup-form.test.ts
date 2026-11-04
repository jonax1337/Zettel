import { describe, expect, it } from "vitest";
import {
  backupPasswordProblem,
  defaultBackupFilename,
  isPasswordRequiredError,
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
