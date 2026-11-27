import { describe, expect, it } from "vitest";
import { errorMessage } from "./error-message";

describe("errorMessage", () => {
  it("returns the message of an Error without the class name", () => {
    expect(errorMessage(new Error("Der Kunde kann nicht gelöscht werden."))).toBe("Der Kunde kann nicht gelöscht werden.");
  });

  it("returns a rejected string as it is", () => {
    expect(errorMessage("database is locked")).toBe("database is locked");
  });

  it("describes anything else", () => {
    expect(errorMessage(42)).toBe("42");
    expect(errorMessage(undefined)).toBe("undefined");
  });
});
