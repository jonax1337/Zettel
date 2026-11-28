<script lang="ts">
  import { errorMessage } from "$lib/utils/error-message";
  import { startTimer, stopTimer, type TimeEntryListRow } from "$lib/db/time-entries";
  import type { ProjectListRow } from "$lib/db/projects";
  import { formatDuration, formatElapsed } from "$lib/time/duration";
  import { nowUnix } from "$lib/utils/date";
  import { Button, Input, Select, toast } from "$lib/ui";
  import { Clock, Square } from "$lib/brand-icons";
  import { projectSelectItems, selectableProjects } from "./project-options";

  type Props = {
    projects: ProjectListRow[];
    /** The running timer, read from the database so it survives an app restart. */
    running: TimeEntryListRow | null;
    onChanged: () => Promise<void>;
  };
  let { projects, running, onChanged }: Props = $props();

  const projectItems = $derived(projectSelectItems(selectableProjects(projects)));
  let projectId = $state("");
  let description = $state("");
  let busy = $state(false);

  $effect(() => {
    if (!projectItems.some((item) => item.value === projectId)) projectId = projectItems[0]?.value ?? "";
  });

  let now = $state(nowUnix());
  $effect(() => {
    if (!running) return;
    now = nowUnix();
    const ticker = setInterval(() => (now = nowUnix()), 1000);
    return () => clearInterval(ticker);
  });
  const elapsed = $derived(running?.startedAt == null ? "" : formatElapsed(now - running.startedAt));

  async function start() {
    busy = true;
    try {
      await startTimer(Number(projectId), description);
      description = "";
      await onChanged();
    } catch (e) {
      toast.error("Timer konnte nicht gestartet werden", errorMessage(e));
    } finally {
      busy = false;
    }
  }

  async function stop() {
    busy = true;
    try {
      const stopped = await stopTimer();
      toast.success("Timer gestoppt", `${formatDuration(stopped.durationMinutes ?? 0)} Std auf ${stopped.projectName}`);
      await onChanged();
    } catch (e) {
      toast.error("Timer konnte nicht gestoppt werden", errorMessage(e));
    } finally {
      busy = false;
    }
  }
</script>

<div class="mb-5 flex flex-wrap items-center gap-3 rounded-xl bg-surface py-3 pr-3 pl-[18px]">
  {#if running}
    <span class="size-2.5 shrink-0 animate-pulse rounded-full bg-primary" aria-hidden="true"></span>
    <div class="min-w-24 font-display text-[22px] font-extrabold tabular-nums" aria-live="off">{elapsed}</div>
    <div class="min-w-0 flex-1">
      <div class="truncate font-semibold">{running.customerName} · {running.projectName}</div>
      {#if running.description}
        <div class="truncate text-sm text-muted-foreground">{running.description}</div>
      {/if}
    </div>
    <Button variant="outline" onclick={stop} disabled={busy}>
      <Square class="size-3.5" />
      Stopp
    </Button>
  {:else if projectItems.length === 0}
    <p class="py-1 text-sm text-muted-foreground">
      Alle Projekte sind archiviert. Unter „Projekte“ ein Projekt anlegen oder wieder aktivieren, um einen Timer zu starten.
    </p>
  {:else}
    <span class="min-w-24 font-display text-[22px] font-extrabold text-muted-foreground tabular-nums" aria-hidden="true">0:00:00</span>
    <Select class="w-full min-w-48 flex-[1_1_220px] sm:w-72 sm:flex-none" bind:value={projectId} items={projectItems} aria-label="Projekt für den Timer" />
    <Input
      class="min-w-48 flex-[2_1_220px]"
      bind:value={description}
      placeholder="Woran arbeitest du?"
      aria-label="Woran arbeitest du?"
      onkeydown={(e) => e.key === "Enter" && !busy && start()}
    />
    <Button variant="outline" onclick={start} disabled={busy || projectId === ""}>
      <Clock class="size-4" />
      Timer starten
    </Button>
  {/if}
</div>
