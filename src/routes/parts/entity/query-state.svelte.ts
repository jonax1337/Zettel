/**
 * Loading/error/data state of a list or page query. Only the newest `reload()`
 * may write its outcome, so a slow earlier request (e.g. for a previous search
 * term) can never overwrite a newer result.
 *
 * Reads that `fetch` makes before its first `await` are tracked when `reload()`
 * runs inside an `$effect`, so filters used there re-trigger the query.
 */
export function createQueryState<T>(initial: T, fetch: () => Promise<T>) {
  let data = $state(initial);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let latestRequest = 0;

  async function reload() {
    const request = ++latestRequest;
    const isLatest = () => request === latestRequest;
    loading = true;
    try {
      const result = await fetch();
      if (!isLatest()) return;
      data = result;
      error = null;
    } catch (e) {
      if (isLatest()) error = String(e);
    } finally {
      if (isLatest()) loading = false;
    }
  }

  return {
    get data() {
      return data;
    },
    get loading() {
      return loading;
    },
    get error() {
      return error;
    },
    reload,
  };
}
