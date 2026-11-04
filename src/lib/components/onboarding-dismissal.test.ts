import { describe, expect, it } from "vitest";
import { dismissalKey } from "./onboarding-dismissal";

describe("dismissalKey", () => {
  it("keeps one flag per database", () => {
    expect(dismissalKey("sqlite:zettel.db")).not.toBe(dismissalKey("sqlite:zettel-sandbox.db"));
    expect(dismissalKey("sqlite:a.db")).not.toBe(dismissalKey("sqlite:b.db"));
  });

  it("falls back to a shared key when the database is unknown", () => {
    expect(dismissalKey(null)).toBe("zettel.onboarding.dismissed");
  });
});
