/**
 * Keeps the rendered sheet of the document on screen. A reload keeps showing the old
 * sheet until the new one arrives; a different document starts blank. Only the newest
 * request may change the state. A rendering costs a sidecar call, so a reload whose
 * key matches the sheet on screen is skipped.
 */
export function createSheetLoader(render: (documentId: number) => Promise<string>) {
  let html = $state<string | null>(null);
  let loading = $state(false);
  let error = $state<string | null>(null);
  let shownId: number | null = null;
  let shownKey: string | null = null;
  let latest = 0;

  async function load(documentId: number, key: string) {
    if (shownId === documentId && shownKey === key && html !== null && error === null) {
      // What is on screen is current again; an answer still on its way belongs to a state that no longer holds.
      latest++;
      loading = false;
      return;
    }
    const request = ++latest;
    if (shownId !== documentId) {
      html = null;
      error = null;
      shownId = documentId;
      shownKey = null;
    }
    loading = true;
    try {
      const next = await render(documentId);
      if (request !== latest) return;
      html = next;
      shownKey = key;
      error = null;
    } catch (e) {
      if (request === latest) error = e instanceof Error ? e.message : String(e);
    } finally {
      if (request === latest) loading = false;
    }
  }

  /** The next load renders again, e.g. after a new PDF: the templates or company data may have changed. */
  function invalidate() {
    shownKey = null;
  }

  /** Forgets the sheet, e.g. when the document cannot be shown at all. */
  function clear() {
    latest++;
    html = null;
    error = null;
    loading = false;
    shownId = null;
    shownKey = null;
  }

  return {
    get html() {
      return html;
    },
    get loading() {
      return loading;
    },
    get error() {
      return error;
    },
    load,
    invalidate,
    clear,
  };
}
