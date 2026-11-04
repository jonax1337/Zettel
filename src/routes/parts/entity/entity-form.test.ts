import { beforeEach, describe, expect, it, vi } from "vitest";

const { push, toast } = vi.hoisted(() => ({
  push: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn() },
}));
vi.mock("svelte-spa-router", () => ({ push }));
vi.mock("$lib/ui/toast.svelte", () => ({ toast }));

import { createEntityForm } from "./entity-form.svelte";

type Record = { name: string };

function build(overrides: { mode?: "new" | "edit"; fetchById?: (id: number) => Promise<Record | null> } = {}) {
  const create = vi.fn().mockResolvedValue(1);
  const update = vi.fn().mockResolvedValue(undefined);
  const onLoaded = vi.fn();
  const entity = createEntityForm<Record>({
    mode: () => overrides.mode ?? "new",
    fetchById: overrides.fetchById ?? (async () => ({ name: "Acme" })),
    notFoundMessage: "Nicht gefunden.",
    onLoaded,
    create,
    update,
    createdMessage: "Angelegt",
    listRoute: "/things",
  });
  return { entity, create, update, onLoaded };
}

describe("createEntityForm", () => {
  beforeEach(() => vi.clearAllMocks());

  it("is loading only in edit mode until the record arrived", async () => {
    const edit = build({ mode: "edit" });
    expect(edit.entity.loading).toBe(true);

    await edit.entity.loadTarget("5");

    expect(edit.entity.loading).toBe(false);
    expect(build({ mode: "new" }).entity.loading).toBe(false);
  });

  it("hands the loaded record to the page", async () => {
    const { entity, onLoaded } = build({ mode: "edit" });

    await entity.loadTarget("5");

    expect(onLoaded).toHaveBeenCalledWith({ name: "Acme" });
    expect(entity.error).toBeNull();
  });

  it("shows the not-found message and still ends loading", async () => {
    const { entity, onLoaded } = build({ mode: "edit", fetchById: async () => null });

    await entity.loadTarget("5");

    expect(onLoaded).not.toHaveBeenCalled();
    expect(entity.error).toBe("Nicht gefunden.");
    expect(entity.loading).toBe(false);
  });

  it("reports a rejected fetch as error", async () => {
    const { entity } = build({ mode: "edit", fetchById: () => Promise.reject(new Error("db down")) });

    await entity.loadTarget("5");

    expect(entity.error).toBe("Error: db down");
    expect(entity.loading).toBe(false);
  });

  it("creates in new mode, announces it and returns to the list", async () => {
    const { entity, create, update } = build({ mode: "new" });

    await entity.save();

    expect(create).toHaveBeenCalledOnce();
    expect(update).not.toHaveBeenCalled();
    expect(toast.success).toHaveBeenCalledWith("Angelegt");
    expect(push).toHaveBeenCalledWith("/things");
    expect(entity.saving).toBe(false);
  });

  it("updates the loaded record in edit mode", async () => {
    const { entity, create, update } = build({ mode: "edit" });
    await entity.loadTarget("5");

    await entity.save();

    expect(update).toHaveBeenCalledWith(5);
    expect(create).not.toHaveBeenCalled();
    expect(toast.success).toHaveBeenCalledWith("Änderungen gespeichert");
  });

  it("refuses to update before a record was loaded", async () => {
    const { entity, update } = build({ mode: "edit", fetchById: async () => null });
    await entity.loadTarget("5");

    await entity.save();

    expect(update).not.toHaveBeenCalled();
    expect(entity.error).toBe("Error: Keine ID");
    expect(push).not.toHaveBeenCalled();
  });

  it("keeps the form open and shows the error when saving fails", async () => {
    const { entity, create } = build({ mode: "new" });
    create.mockRejectedValue(new Error("unique"));

    await entity.save();

    expect(entity.error).toBe("Error: unique");
    expect(toast.error).toHaveBeenCalledWith("Speichern fehlgeschlagen", "Error: unique");
    expect(push).not.toHaveBeenCalled();
    expect(entity.saving).toBe(false);
  });

  it("clears an earlier error when saving again", async () => {
    const { entity, create } = build({ mode: "new" });
    entity.reject("Land ungültig", "Land falsch");
    expect(entity.error).toBe("Land falsch");

    await entity.save();

    expect(create).toHaveBeenCalledOnce();
    expect(entity.error).toBeNull();
  });

  it("rejects with a toast and an inline error", () => {
    const { entity } = build();

    entity.reject("Land ungültig", "Land falsch");

    expect(entity.error).toBe("Land falsch");
    expect(toast.error).toHaveBeenCalledWith("Land ungültig", "Land falsch");
  });
});
