import { describe, expect, it } from "vitest";
import { hasOwnNumber, issueActionLabel, issueDialogDescription, issuePanelText } from "./issue-wording";

const NEVER_NUMBERED = { number: "DRAFT-d349aaaabbbbcccc", isCreditNote: false };
const REOPENED = { number: "RE-2026-0012", isCreditNote: false };
const CREDIT_DRAFT = { number: "DRAFT-0098aaaabbbbcccc", isCreditNote: true };
const CREDIT_REOPENED = { number: "RE-2026-0017", isCreditNote: true };

describe("hasOwnNumber", () => {
  it("tells a placeholder from an issued number", () => {
    expect(hasOwnNumber(NEVER_NUMBERED)).toBe(false);
    expect(hasOwnNumber(REOPENED)).toBe(true);
  });
});

describe("issueActionLabel", () => {
  it("names the document that is issued", () => {
    expect(issueActionLabel(NEVER_NUMBERED)).toBe("Rechnung ausstellen");
    expect(issueActionLabel(CREDIT_DRAFT)).toBe("Stornorechnung ausstellen");
  });
});

describe("issueDialogDescription", () => {
  it("says a never-numbered invoice gets its number", () => {
    const text = issueDialogDescription(NEVER_NUMBERED, "pdf");
    expect(text).toContain("bekommt ihre Nummer");
    expect(text).not.toContain("behält");
  });

  it("says a reopened invoice keeps the number it has", () => {
    const text = issueDialogDescription(REOPENED, "pdf");
    expect(text).toContain("behält die Nummer RE-2026-0012");
    expect(text).not.toContain("bekommt ihre Nummer");
  });

  it("describes what happens to the PDF by purpose", () => {
    expect(issueDialogDescription(NEVER_NUMBERED, "pdf")).toContain("Danach wird die PDF erzeugt.");
    expect(issueDialogDescription(NEVER_NUMBERED, "mail")).toContain("Mail-Programm");
    expect(issueDialogDescription(NEVER_NUMBERED, "mark")).toContain("nicht erzeugt");
  });

  it("names the ways back for an invoice: credit note, or reopening while nothing is booked", () => {
    const text = issueDialogDescription(NEVER_NUMBERED, "pdf");
    expect(text).toContain("per Stornorechnung");
    expect(text).toContain("Zurück zu Entwurf");
  });

  it("does not offer a credit note for a credit note, and says what it does to the original", () => {
    for (const note of [CREDIT_DRAFT, CREDIT_REOPENED]) {
      const text = issueDialogDescription(note, "pdf");
      expect(text).toContain("Die Stornorechnung");
      expect(text).toContain("nicht durch eine weitere korrigiert");
      expect(text).not.toContain("per Stornorechnung");
      expect(text).toContain("ursprüngliche Rechnung");
    }
    expect(issueDialogDescription(CREDIT_REOPENED, "pdf")).toContain("behält die Nummer RE-2026-0017");
  });
});

describe("issuePanelText", () => {
  it("words the three cases apart", () => {
    expect(issuePanelText(NEVER_NUMBERED)).toContain("bekommt diese Rechnung ihre Nummer");
    expect(issuePanelText(REOPENED)).toContain("behält diese Rechnung die Nummer RE-2026-0012");
    expect(issuePanelText(CREDIT_DRAFT)).toContain("bekommt diese Stornorechnung ihre Nummer");
  });

  it("never promises a number to a document that already has one", () => {
    expect(issuePanelText(REOPENED)).not.toContain("bekommt");
  });
});
