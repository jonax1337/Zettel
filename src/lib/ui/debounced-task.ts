type DebouncedTaskOptions<Arg, Result> = {
  run: (arg: Arg) => Promise<Result>;
  onResult: (result: Result, arg: Arg) => void;
  onError: (error: unknown) => void;
  delayMs: number;
};

/**
 * Runs `run` after `delayMs` of quiet. Only the latest call may report:
 * starting another call or cancelling discards a pending timer and any call still in flight.
 */
export function createDebouncedTask<Arg, Result>({
  run,
  onResult,
  onError,
  delayMs,
}: DebouncedTaskOptions<Arg, Result>) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let generation = 0;

  function cancel() {
    if (timer) clearTimeout(timer);
    timer = null;
    generation++;
  }

  async function execute(arg: Arg) {
    const mine = generation;
    try {
      const result = await run(arg);
      if (mine === generation) onResult(result, arg);
    } catch (error) {
      if (mine === generation) onError(error);
    }
  }

  function schedule(arg: Arg) {
    cancel();
    timer = setTimeout(() => {
      timer = null;
      void execute(arg);
    }, delayMs);
  }

  function runNow(arg: Arg) {
    cancel();
    void execute(arg);
  }

  return { schedule, runNow, cancel };
}
