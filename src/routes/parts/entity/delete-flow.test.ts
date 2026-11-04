import { beforeEach, describe, expect, it, vi } from "vitest";

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("$lib/ui/toast.svelte", () => ({ toast }));

import { createDeleteFlow } from "./delete-flow.svelte";

type Row = { id: number; name: string };
const row: Row = { id: 7, name: "ACME" };

function setup(remove: (item: Row) => Promise<unknown> = async () => {}, withName = true) {
  const reload = vi.fn(async () => {});
  const flow = createDeleteFlow<Row>({
    remove,
    entityLabel: "Kunde",
    describe: withName ? (item) => item.name : undefined,
    reload,
  });
  return { flow, reload };
}

describe("createDeleteFlow", () => {
  beforeEach(() => {
    toast.success.mockClear();
    toast.error.mockClear();
  });

  it("opens the dialog for the asked item", () => {
    const { flow } = setup();
    flow.ask(row);
    expect(flow.open).toBe(true);
    expect(flow.target).toEqual(row);
  });

  it("removes the item, names it in the toast, clears the target and reloads", async () => {
    const remove = vi.fn(async () => {});
    const { flow, reload } = setup(remove);
    flow.ask(row);
    await flow.confirm();

    expect(remove).toHaveBeenCalledWith(expect.objectContaining({ id: 7 }));
    expect(toast.success).toHaveBeenCalledWith("Kunde gelöscht", '"ACME" wurde entfernt.');
    expect(flow.target).toBeNull();
    expect(reload).toHaveBeenCalledOnce();
  });

  it("toasts the label alone when no item name is described", async () => {
    const { flow } = setup(async () => {}, false);
    flow.ask(row);
    await flow.confirm();
    expect(toast.success).toHaveBeenCalledWith("Kunde gelöscht", undefined);
  });

  it("reports a failed removal and neither reloads nor drops the target", async () => {
    const { flow, reload } = setup(async () => {
      throw new Error("FK");
    });
    flow.ask(row);
    await flow.confirm();

    expect(toast.error).toHaveBeenCalledWith("Löschen fehlgeschlagen", "Error: FK");
    expect(toast.success).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
    expect(flow.target).toEqual(row);
  });

  it("does nothing when confirmed without a target", async () => {
    const remove = vi.fn(async () => {});
    const { flow } = setup(remove);
    await flow.confirm();
    expect(remove).not.toHaveBeenCalled();
  });
});
