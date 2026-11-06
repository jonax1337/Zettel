<script lang="ts">
  import { startTimer, stopTimer, type TimeEntryListRow } from "$lib/db/time-entries";
  import type { ProjectListRow } from "$lib/db/projects";
  import { formatDuration, formatElapsed } from "$lib/time/duration";
  import { nowUnix } from "$lib/utils/date";
  import { Button, Card, CardContent, Input, Label, Select, toast } from "$lib/ui";
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
      toast.error("Timer konnte nicht gestartet werden", String(e));
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
      toast.error("Timer konnte nicht gestoppt werden", String(e));
    } finally {
      busy = false;
    }
  }
</script>

<Card class="mb-6">
  <CardContent>
    {#if running}
      <div class="flex flex-wrap items-center gap-4">
        <div class="font-mono text-3xl font-semibold tabular-nums" aria-live="off">{elapsed}</div>
        <div class="min-w-0 flex-1">
          <div class="font-medium truncate">{running.customerName} · {running.projectName}</div>
          {#if running.description}
            <div class="text-sm text-muted-foreground truncate">{running.description}</div>
          {/if}
        </div>
        <Button variant="destructive" onclick={stop} disabled={busy}>
          <Square class="size-3.5" />
          Stopp
        </Button>
      </div>
    {:else if projectItems.length === 0}
      <p class="text-sm text-muted-foreground">
        Alle Projekte sind archiviert. Unter „Projekte“ ein Projekt anlegen oder wieder aktivieren, um einen Timer zu starten.
      </p>
    {:else}
      <div class="grid grid-cols-1 @3xl:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)_auto] items-end gap-3">
        <div class="flex flex-col gap-1.5">
          <Label for="timer-project" class="text-xs text-muted-foreground">Projekt</Label>
          <Select id="timer-project" bind:value={projectId} items={projectItems} />
        </div>
        <div class="flex flex-col gap-1.5">
          <Label for="timer-description" class="text-xs text-muted-foreground">Woran arbeitest du?</Label>
          <Input
            id="timer-description"
            bind:value={description}
            placeholder="Beschreibung (optional)"
            onkeydown={(e) => e.key === "Enter" && !busy && start()}
          />
        </div>
        <Button onclick={start} disabled={busy || projectId === ""}>
          <Clock class="size-4" />
          Timer starten
        </Button>
      </div>
    {/if}
  </CardContent>
</Card>
