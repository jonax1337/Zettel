<script lang="ts">
  import { untrack } from "svelte";
  import type { ProjectListRow } from "$lib/db/projects";
  import { createTimeEntry, updateTimeEntry, type TimeEntryListRow } from "$lib/db/time-entries";
  import { nowUnix, toIsoDate } from "$lib/utils/date";
  import { Button, DatePicker, Dialog, Input, Label, Select, toast } from "$lib/ui";
  import {
    emptyEntryForm,
    entryInputFromForm,
    formFromEntry,
    type EntryFormValues,
    type EntryMode,
  } from "./entry-form";
  import { projectSelectItems, selectableProjects } from "./project-options";

  type Props = {
    open: boolean;
    projects: ProjectListRow[];
    /** The open entry to edit; null creates a new one. */
    entry: TimeEntryListRow | null;
    /** Project preselected for a new entry. */
    defaultProjectId: string;
    onSaved: () => Promise<void>;
  };
  let { open = $bindable(), projects, entry, defaultProjectId, onSaved }: Props = $props();

  const MODES: { value: EntryMode; label: string }[] = [
    { value: "range", label: "Von–Bis" },
    { value: "duration", label: "Dauer" },
  ];

  let form = $state<EntryFormValues>(emptyEntryForm("", ""));
  let saving = $state(false);

  $effect(() => {
    if (!open) return;
    untrack(() => {
      form = entry ? formFromEntry(entry) : emptyEntryForm(defaultProjectId, toIsoDate(nowUnix()));
    });
  });

  const projectItems = $derived(projectSelectItems(selectableProjects(projects, entry?.projectId)));

  async function save() {
    saving = true;
    try {
      const input = entryInputFromForm(form, entry);
      if (entry) await updateTimeEntry(entry.id, input);
      else await createTimeEntry(input);
      toast.success(entry ? "Eintrag gespeichert" : "Eintrag angelegt");
      open = false;
      await onSaved();
    } catch (e) {
      toast.error("Speichern fehlgeschlagen", String(e));
    } finally {
      saving = false;
    }
  }
</script>

<Dialog bind:open title={entry ? "Zeiteintrag bearbeiten" : "Zeit erfassen"} dismissible={!saving}>
  <div class="flex flex-col gap-4">
    <div class="flex flex-col gap-1.5">
      <Label for="entry-project">Projekt</Label>
      <Select id="entry-project" bind:value={form.projectId} items={projectItems} placeholder="Projekt wählen…" />
    </div>
    <div class="flex flex-col gap-1.5">
      <Label for="entry-date">Datum</Label>
      <DatePicker id="entry-date" bind:value={form.date} />
    </div>
    <div class="flex flex-col gap-1.5">
      <span class="text-sm font-medium">Zeit</span>
      <div class="inline-flex gap-1" role="group" aria-label="Art der Zeiterfassung">
        {#each MODES as mode (mode.value)}
          <Button
            size="sm"
            variant={form.mode === mode.value ? "default" : "outline"}
            aria-pressed={form.mode === mode.value}
            onclick={() => (form.mode = mode.value)}
          >
            {mode.label}
          </Button>
        {/each}
      </div>
      {#if form.mode === "range"}
        <div class="grid grid-cols-2 gap-3">
          <div class="flex flex-col gap-1.5">
            <Label for="entry-start" class="text-xs text-muted-foreground">Von</Label>
            <Input id="entry-start" type="time" bind:value={form.start} />
          </div>
          <div class="flex flex-col gap-1.5">
            <Label for="entry-end" class="text-xs text-muted-foreground">Bis</Label>
            <Input id="entry-end" type="time" bind:value={form.end} />
          </div>
        </div>
      {:else}
        <Input id="entry-duration" bind:value={form.duration} placeholder="z. B. 1:30 oder 1,5" aria-label="Dauer in Stunden" />
      {/if}
    </div>
    <div class="flex flex-col gap-1.5">
      <Label for="entry-description">Beschreibung</Label>
      <Input id="entry-description" bind:value={form.description} placeholder="Optional" />
    </div>
  </div>
  {#snippet footer()}
    <Button variant="outline" onclick={() => (open = false)} disabled={saving}>Abbrechen</Button>
    <Button onclick={save} disabled={saving}>Speichern</Button>
  {/snippet}
</Dialog>
