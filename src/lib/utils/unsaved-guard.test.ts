import { describe, expect, it } from "vitest";
import { createDirtyRegistry, isEdited, snapshotOf } from "./unsaved-guard";

describe("isEdited", () => {
  it("is false until a baseline exists", () => {
    expect(isEdited(null, { name: "x" })).toBe(false);
  });

  it("detects changed and reverted state", () => {
    const baseline = snapshotOf({ name: "Acme", items: [1, 2] });
    expect(isEdited(baseline, { name: "Acme", items: [1, 2] })).toBe(false);
    expect(isEdited(baseline, { name: "Acme GmbH", items: [1, 2] })).toBe(true);
    expect(isEdited(baseline, { name: "Acme", items: [1] })).toBe(true);
  });

  it("handles bigint values", () => {
    const baseline = snapshotOf({ cents: 100n });
    expect(isEdited(baseline, { cents: 100n })).toBe(false);
    expect(isEdited(baseline, { cents: 200n })).toBe(true);
  });

  it("treats unserialisable state as clean", () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(snapshotOf(cyclic)).toBeNull();
    expect(isEdited(snapshotOf(cyclic), cyclic)).toBe(false);
  });
});

describe("createDirtyRegistry", () => {
  it("is dirty while any registered form is dirty", () => {
    const registry = createDirtyRegistry();
    let a = false;
    let b = false;
    registry.register(() => a);
    registry.register(() => b);
    expect(registry.isDirty()).toBe(false);
    b = true;
    expect(registry.isDirty()).toBe(true);
  });

  it("forgets a form after it unregisters", () => {
    const registry = createDirtyRegistry();
    const unregister = registry.register(() => true);
    expect(registry.isDirty()).toBe(true);
    unregister();
    expect(registry.isDirty()).toBe(false);
  });
});
