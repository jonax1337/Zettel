<script lang="ts">
  import { Button, Card, CardContent, DatePicker, Label, Textarea, toast } from "$lib/ui";
  import { updateInvoiceInternalMeta } from "$lib/db/invoices";
  import type { Invoice } from "$lib/db/schema";
  import { fromIsoDate, toIsoDate } from "$lib/utils/date";

  type Props = {
    invoice: Invoice;
    /** Called after the notes were stored, so the parent can reload. */
    onSaved: () => Promise<void>;
  };
  let { invoice, onSaved }: Props = $props();

  let notesDraft = $state("");
  let followUpIso = $state("");
  let saving = $state(false);

  const storedNotes = $derived(invoice.notesInternal ?? "");
  const storedFollowUpIso = $derived(invoice.followUpDate ? toIsoDate(invoice.followUpDate) : "");
  const dirty = $derived(storedNotes !== notesDraft || storedFollowUpIso !== followUpIso);

  // Keyed on the stored values (not the invoice object) so a background refresh
  // of the invoice does not discard what is being typed.
  $effect(() => {
    notesDraft = storedNotes;
    followUpIso = storedFollowUpIso;
  });

  async function save() {
    if (saving) return;
    saving = true;
    try {
      await updateInvoiceInternalMeta(invoice.id, {
        notesInternal: notesDraft.trim() === "" ? null : notesDraft,
        followUpDate: followUpIso ? fromIsoDate(followUpIso) : null,
      });
      toast.success("Interne Notizen gespeichert");
      await onSaved();
    } catch (e) {
      toast.error("Speichern fehlgeschlagen", String(e));
    } finally {
      saving = false;
    }
  }
</script>

<Card class="mb-6">
  <CardContent class="space-y-4">
    <div>
      <h3 class="text-xs font-semibold uppercase text-muted-foreground tracking-wider">
        Interne Notizen & Wiedervorlage
      </h3>
      <p class="text-xs text-muted-foreground mt-0.5">Nur intern, erscheint nicht auf der Rechnung.</p>
    </div>
    <div class="flex flex-col gap-1.5">
      <Label for="notes-internal">Notizen (intern)</Label>
      <Textarea
        id="notes-internal"
        rows={3}
        bind:value={notesDraft}
        placeholder="z. B. Telefonat am … abgesprochen, Skonto gewährt, etc."
      />
    </div>
    <div class="flex flex-col gap-1.5 max-w-xs">
      <Label for="follow-up">Wiedervorlage am</Label>
      <DatePicker id="follow-up" bind:value={followUpIso} />
    </div>
    <div class="flex items-center gap-2">
      <Button onclick={save} disabled={!dirty || saving}>{saving ? "Speichere…" : "Speichern"}</Button>
      {#if dirty && !saving}
        <span class="text-xs text-muted-foreground">Ungespeicherte Änderungen.</span>
      {/if}
    </div>
  </CardContent>
</Card>
