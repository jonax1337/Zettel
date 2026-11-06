import { describe, expect, it } from "vitest";
import { buildMailtoUrl } from "./mailto";

describe("buildMailtoUrl", () => {
  it("puts the recipient in the path and subject and body in the query", () => {
    expect(buildMailtoUrl({ to: "kunde@example.com", subject: "Rechnung", body: "Hallo" })).toBe(
      "mailto:kunde@example.com?subject=Rechnung&body=Hallo",
    );
  });

  it("encodes umlauts as UTF-8 percent sequences", () => {
    const url = buildMailtoUrl({ to: "a@b.de", subject: "Grüße für Müller", body: "" });

    expect(url).toContain("subject=Gr%C3%BC%C3%9Fe%20f%C3%BCr%20M%C3%BCller");
  });

  it("encodes & and = so they cannot split the query", () => {
    const url = buildMailtoUrl({ to: "a@b.de", subject: "Müller & Söhne = 100%", body: "x" });

    expect(url).toContain("subject=M%C3%BCller%20%26%20S%C3%B6hne%20%3D%20100%25&body=x");
  });

  it("turns every line break into CRLF", () => {
    const url = buildMailtoUrl({ to: "a@b.de", subject: "s", body: "eins\nzwei\r\ndrei" });

    expect(url).toContain("body=eins%0D%0Azwei%0D%0Adrei");
  });

  it("trims the recipient and leaves the field empty without one", () => {
    expect(buildMailtoUrl({ to: "  a@b.de ", subject: "s", body: "b" })).toMatch(/^mailto:a@b\.de\?/);
    expect(buildMailtoUrl({ to: "", subject: "s", body: "b" })).toBe("mailto:?subject=s&body=b");
  });

  it("escapes characters in the recipient that would end the address", () => {
    expect(buildMailtoUrl({ to: "a b@c.de?x", subject: "s", body: "b" })).toMatch(
      /^mailto:a%20b@c\.de%3Fx\?subject=/,
    );
  });
});
