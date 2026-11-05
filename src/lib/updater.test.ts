import { describe, expect, it } from "vitest";
import { isPrerelease, resolveUpdateChannel } from "./updater";

describe("isPrerelease", () => {
  it("detects release candidates and other pre-release tags", () => {
    expect(isPrerelease("0.23.0-rc.1")).toBe(true);
    expect(isPrerelease("1.0.0-beta")).toBe(true);
  });

  it("treats plain and build-metadata versions as stable", () => {
    expect(isPrerelease("0.23.0")).toBe(false);
    expect(isPrerelease("0.23.0+build-5")).toBe(false);
  });
});

describe("resolveUpdateChannel", () => {
  it("keeps an explicit choice regardless of the installed version", () => {
    expect(resolveUpdateChannel("stable", "0.23.0-rc.1")).toBe("stable");
    expect(resolveUpdateChannel("beta", "0.23.0")).toBe("beta");
  });

  it("defaults to stable on a stable install", () => {
    expect(resolveUpdateChannel(null, "0.23.0")).toBe("stable");
  });

  it("defaults to beta on a pre-release install", () => {
    expect(resolveUpdateChannel(null, "0.23.0-rc.1")).toBe("beta");
  });

  it("ignores unknown stored values", () => {
    expect(resolveUpdateChannel("nightly", "0.23.0")).toBe("stable");
  });
});
