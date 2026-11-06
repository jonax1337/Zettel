<script lang="ts">
  import { untrack } from "svelte";
  import { listCustomers } from "$lib/db/queries";
  import { createProject, updateProject, type ProjectListRow } from "$lib/db/projects";
  import { Button, Dialog, Input, Label, Select, toast } from "$lib/ui";
  import { centsToPriceText } from "../parts/entity/format";
  import { parseHourlyRate } from "./project-form";

  type Props = {
    open: boolean;
    /** The project to edit; null creates a new one. */
    project: ProjectListRow | null;
    onSaved: () => Promise<void>;
  };
  let { open = $bindable(), project, onSaved }: Props = $props();

  let customerItems = $state<{ value: string; label: string }[]>([]);
  let customerId = $state("");
  let name = $state("");
  let rateText = $state("");
  let saving = $state(false);

  // Entries carry the customer into billing, so it is fixed once a project has entries.
  const customerLocked = $derived((project?.entryCount ?? 0) > 0);

  $effect(() => {
    if (!open) return;
    untrack(() => {
      customerId = project ? String(project.customerId) : "";
      name = project?.name ?? "";
      rateText = project ? centsToPriceText(project.hourlyRateCent) : "";
    });
    listCustomers()
      .then((customers) => (customerItems = customers.map((c) => ({ value: String(c.id), label: c.name }))))
      .catch((e) => toast.error("Kunden konnten nicht geladen werden", String(e)));
  });

  async function save() {
    const hourlyRateCent = parseHourlyRate(rateText);
    if (customerId === "") return toast.error("Bitte einen Kunden wählen.");
    if (hourlyRateCent === null) return toast.error("Bitte einen Stundensatz angeben (0 ist erlaubt).");
    saving = true;
    try {
      const input = { customerId: Number(customerId), name, hourlyRateCent };
      if (project) await updateProject(project.id, input);
      else await createProject(input);
      toast.success(project ? "Projekt gespeichert" : "Projekt angelegt");
      open = false;
      await onSaved();
    } catch (e) {
      toast.error("Speichern fehlgeschlagen", String(e));
    } finally {
      saving = false;
    }
  }
</script>

<Dialog bind:open title={project ? "Projekt bearbeiten" : "Neues Projekt"} dismissible={!saving}>
  <div class="flex flex-col gap-4">
    <div class="flex flex-col gap-1.5">
      <Label for="project-customer">Kunde</Label>
      <Select id="project-customer" bind:value={customerId} items={customerItems} placeholder="Kunde wählen…" disabled={customerLocked} />
      {#if customerLocked}
        <p class="text-xs text-muted-foreground">Der Kunde eines Projekts mit Zeiteinträgen lässt sich nicht ändern.</p>
      {/if}
    </div>
    <div class="flex flex-col gap-1.5">
      <Label for="project-name">Projektname</Label>
      <Input id="project-name" bind:value={name} placeholder="z. B. Website-Relaunch" />
    </div>
    <div class="flex flex-col gap-1.5">
      <Label for="project-rate">Stundensatz (netto, €)</Label>
      <Input id="project-rate" bind:value={rateText} inputmode="decimal" placeholder="z. B. 95,00" />
      <p class="text-xs text-muted-foreground">Gilt für noch nicht abgerechnete Einträge; abgerechnete behalten den Satz ihrer Rechnung.</p>
    </div>
  </div>
  {#snippet footer()}
    <Button variant="outline" onclick={() => (open = false)} disabled={saving}>Abbrechen</Button>
    <Button onclick={save} disabled={saving}>Speichern</Button>
  {/snippet}
</Dialog>
