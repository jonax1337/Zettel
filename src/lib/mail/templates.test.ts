import { describe, expect, it } from "vitest";
import {
  composeMailText,
  DEFAULT_MAIL_TEMPLATES,
  fillMailPlaceholders,
  mailTemplateFor,
  type MailContext,
  type MailSettings,
} from "./templates";

const NO_CUSTOM_TEMPLATES: MailSettings = {
  mailInvoiceSubject: null,
  mailInvoiceBody: null,
  mailOfferSubject: null,
  mailOfferBody: null,
  mailReminderSubject: null,
  mailReminderBody: null,
};

// 2026-12-31 12:00 UTC, the same calendar day in every timezone.
const DUE = Date.UTC(2026, 11, 31, 12) / 1000;

const CONTEXT: MailContext = {
  number: "RE-2026-0007",
  totalCent: 123_456,
  currency: "EUR",
  dueDate: DUE,
  company: "Muster Design",
  customer: "Beispiel GmbH",
};

describe("fillMailPlaceholders", () => {
  it("replaces every known placeholder", () => {
    const text = "{nummer} | {betrag} | {faellig} | {firma} | {kunde}";

    expect(fillMailPlaceholders(text, CONTEXT)).toBe(
      "RE-2026-0007 | 1.234,56 € | 31.12.2026 | Muster Design | Beispiel GmbH",
    );
  });

  it("replaces a placeholder that appears more than once", () => {
    expect(fillMailPlaceholders("{nummer} / {nummer}", CONTEXT)).toBe("RE-2026-0007 / RE-2026-0007");
  });

  it("leaves unknown placeholders and stray braces as typed", () => {
    expect(fillMailPlaceholders("{foo} {NUMMER} {nummer", CONTEXT)).toBe("{foo} {NUMMER} {nummer");
  });

  it("formats the amount in the currency of the document", () => {
    const usd = { ...CONTEXT, currency: "USD", totalCent: 50_000 };

    expect(fillMailPlaceholders("{betrag}", usd)).toBe("500,00 $");
  });

  it("formats a zero-decimal currency without decimals", () => {
    const yen = { ...CONTEXT, currency: "JPY", totalCent: 120_000 };

    expect(fillMailPlaceholders("{betrag}", yen)).toContain("1.200");
    expect(fillMailPlaceholders("{betrag}", yen)).not.toContain(",");
  });

  it("renders a negative amount, as on a credit note", () => {
    expect(fillMailPlaceholders("{betrag}", { ...CONTEXT, totalCent: -5_000 })).toBe("-50,00 €");
  });

  it("renders an empty due date as nothing", () => {
    expect(fillMailPlaceholders("bis {faellig}.", { ...CONTEXT, dueDate: null })).toBe("bis .");
  });

  it("does not expand placeholders inside substituted values", () => {
    const tricky = { ...CONTEXT, customer: "{firma}" };

    expect(fillMailPlaceholders("{kunde}", tricky)).toBe("{firma}");
  });
});

describe("mailTemplateFor", () => {
  it("falls back to the default when nothing is stored", () => {
    expect(mailTemplateFor("invoice", NO_CUSTOM_TEMPLATES)).toEqual(DEFAULT_MAIL_TEMPLATES.invoice);
  });

  it("uses the stored template of the matching document type only", () => {
    const settings = { ...NO_CUSTOM_TEMPLATES, mailOfferSubject: "Ihr Angebot", mailOfferBody: "Text" };

    expect(mailTemplateFor("offer", settings)).toEqual({ subject: "Ihr Angebot", body: "Text" });
    expect(mailTemplateFor("invoice", settings)).toEqual(DEFAULT_MAIL_TEMPLATES.invoice);
  });

  it("falls back per field, so a custom subject keeps the default body", () => {
    const settings = { ...NO_CUSTOM_TEMPLATES, mailReminderSubject: "Erinnerung" };

    expect(mailTemplateFor("reminder", settings)).toEqual({
      subject: "Erinnerung",
      body: DEFAULT_MAIL_TEMPLATES.reminder.body,
    });
  });

  it("treats a blank template as unset", () => {
    const settings = { ...NO_CUSTOM_TEMPLATES, mailInvoiceBody: "  \n " };

    expect(mailTemplateFor("invoice", settings).body).toBe(DEFAULT_MAIL_TEMPLATES.invoice.body);
  });
});

describe("composeMailText", () => {
  it("produces a complete German invoice mail from the defaults", () => {
    const { subject, body } = composeMailText("invoice", NO_CUSTOM_TEMPLATES, CONTEXT);

    expect(subject).toBe("Rechnung RE-2026-0007");
    expect(body).toContain("Rechnung RE-2026-0007 über 1.234,56 €");
    expect(body).toContain("bis zum 31.12.2026");
    expect(body.endsWith("Mit freundlichen Grüßen\nMuster Design")).toBe(true);
  });

  it.each(["invoice", "offer", "reminder"] as const)(
    "leaves no placeholder behind in the %s defaults",
    (type) => {
      const { subject, body } = composeMailText(type, NO_CUSTOM_TEMPLATES, CONTEXT);

      expect(subject + body).not.toMatch(/\{[a-z]+\}/);
    },
  );

  it("fills a custom template", () => {
    const settings = { ...NO_CUSTOM_TEMPLATES, mailInvoiceSubject: "{firma}: Rechnung {nummer} für {kunde}" };

    expect(composeMailText("invoice", settings, CONTEXT).subject).toBe(
      "Muster Design: Rechnung RE-2026-0007 für Beispiel GmbH",
    );
  });
});

describe("composeMailText for a credit note", () => {
  const CREDIT_NOTE: MailContext = {
    ...CONTEXT,
    number: "RE-2026-0008",
    totalCent: -123_456,
    correctsInvoiceNumber: "RE-2026-0007",
  };

  it("announces the correction instead of asking for payment", () => {
    const { subject, body } = composeMailText("creditNote", NO_CUSTOM_TEMPLATES, CREDIT_NOTE);

    expect(subject).toBe("Stornorechnung RE-2026-0008");
    expect(body).toContain("Stornorechnung RE-2026-0008 zur Rechnung RE-2026-0007 über -1.234,56 €.");
    expect(body).toContain("gutgeschrieben bzw. erstattet");
    expect(body).not.toMatch(/überweisen|fällig|bis zum/);
    expect(body.endsWith("Mit freundlichen Grüßen\nMuster Design")).toBe(true);
  });

  it("leaves out the original invoice when it is unknown", () => {
    const { body } = composeMailText("creditNote", NO_CUSTOM_TEMPLATES, {
      ...CREDIT_NOTE,
      correctsInvoiceNumber: null,
    });

    expect(body).toContain("Stornorechnung RE-2026-0008 über");
    expect(body).not.toContain("zur Rechnung");
  });

  it("ignores a custom invoice template", () => {
    const settings = { ...NO_CUSTOM_TEMPLATES, mailInvoiceSubject: "Rechnung {nummer}" };

    expect(composeMailText("creditNote", settings, CREDIT_NOTE).subject).toBe("Stornorechnung RE-2026-0008");
  });

  it("does not expand placeholders inside the original invoice number", () => {
    const { body } = composeMailText("creditNote", NO_CUSTOM_TEMPLATES, {
      ...CREDIT_NOTE,
      correctsInvoiceNumber: "{firma}",
    });

    expect(body).toContain("zur Rechnung {firma}");
  });
});
