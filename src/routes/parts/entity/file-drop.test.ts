import { beforeEach, describe, expect, it, vi } from "vitest";

const listen = vi.hoisted(() => ({ handler: null as null | ((e: { payload: unknown }) => void), unlisten: vi.fn(), resolve: null as null | ((u: () => void) => void) }));

vi.mock("@tauri-apps/api/webview", () => ({
  getCurrentWebview: () => ({
    onDragDropEvent: (handler: (e: { payload: unknown }) => void) => {
      listen.handler = handler;
      return new Promise<() => void>((resolve) => (listen.resolve = resolve));
    },
  }),
}));
vi.mock("$lib/ui", () => ({ toast: { warning: vi.fn() } }));

import { listenForFileDrop } from "./file-drop";

beforeEach(() => {
  listen.handler = null;
  listen.unlisten.mockClear();
});

describe("listenForFileDrop", () => {
  it("maps the webview events to hover and drop callbacks", () => {
    const onHover = vi.fn();
    const onDrop = vi.fn();
    listenForFileDrop({ onHover, onDrop });
    listen.handler?.({ payload: { type: "over" } });
    listen.handler?.({ payload: { type: "drop", paths: ["a.pdf"] } });
    expect(onHover.mock.calls).toEqual([[true], [false]]);
    expect(onDrop).toHaveBeenCalledWith(["a.pdf"]);
  });

  it("unlistens when disposed before the listener was registered", async () => {
    const stop = listenForFileDrop({ onHover: vi.fn(), onDrop: vi.fn() });
    stop();
    listen.resolve?.(listen.unlisten);
    await Promise.resolve();
    await Promise.resolve();
    expect(listen.unlisten).toHaveBeenCalledOnce();
  });
});
