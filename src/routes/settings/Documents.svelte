<script lang="ts">
  import SettingsShell from "./SettingsShell.svelte";
  import { loadSettings, saveSettings } from "$lib/db/queries";
  import type { Settings } from "$lib/db/schema";
  import {
    Button,
    Input,
    Label,
    Card,
    CardHeader,
    CardTitle,
    CardDescription,
    CardContent,
    Select,
    toast,
  } from "$lib/ui";

  let s = $state<Settings | null>(null);
  let loading = $state(true);
  let saving = $state(false);
  let error = $state<string | null>(null);

  const profileItems = [
    { value: "en16931", label: "EN 16931 / Comfort (Standard)" },
    { value: "basic", label: "BASIC (Factur-X 1.0)" },
    { value: "extended", label: "EXTENDED (Factur-X 1.0)" },
  ];

  const themeItems = [
    { value: "classic", label: "Klassisch" },
    { value: "modern", label: "Modern" },
    { value: "minimal", label: "Minimal" },
  ];

  $effect(() => {
    loadSettings()
      .then((row) => (s = row))
      .catch((e) => (error = String(e)))
      .finally(() => (loading = false));
  });

  async function onSubmit(e: SubmitEvent) {
    e.preventDefault();
    if (!s) return;
    saving = true;
    error = null;
    try {
      await saveSettings(s);
      toast.success("Einstellungen gespeichert");
    } catch (err) {
      error = String(err);
      toast.error("Speichern fehlgeschlagen", String(err));
    } finally {
      saving = false;
    }
  }
</script>

<SettingsShell
  title="Dokumente"
  description="Rechnungen, Angebote, Nummernkreise und E-Rechnung-Profil."
>
  {#if loading}
    <p class="text-sm text-muted-foreground">Lade…</p>
  {:else if error && !s}
    <p class="text-sm text-destructive">Fehler: {error}</p>
  {:else if s}
    <form onsubmit={onSubmit} class="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Rechnungen</CardTitle>
        </CardHeader>
        <CardContent>
          <div class="grid grid-cols-2 gap-4">
            <div class="flex flex-col gap-1.5">
              <Label>Nummern-Format</Label>
              <Input bind:value={s.invoiceNumberFormat} />
              <span class="text-xs text-muted-foreground">
                Platzhalter: {"{YYYY}"}, {"{NNNN}"}
              </span>
            </div>
            <div class="flex flex-col gap-1.5">
              <Label>Aktueller Zähler</Label>
              <Input type="number" min="0" bind:value={s.invoiceNumberCounter} />
            </div>
            <div class="flex flex-col gap-1.5 col-span-2">
              <Label>Standard-Zahlungsfrist (Tage)</Label>
              <Input type="number" min="0" bind:value={s.defaultPaymentTermsDays} />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Angebote</CardTitle>
        </CardHeader>
        <CardContent>
          <div class="grid grid-cols-2 gap-4">
            <div class="flex flex-col gap-1.5">
              <Label>Nummern-Format</Label>
              <Input bind:value={s.offerNumberFormat} />
              <span class="text-xs text-muted-foreground">
                Platzhalter: {"{YYYY}"}, {"{NNNN}"}
              </span>
            </div>
            <div class="flex flex-col gap-1.5">
              <Label>Aktueller Zähler</Label>
              <Input type="number" min="0" bind:value={s.offerNumberCounter} />
            </div>
            <div class="flex flex-col gap-1.5 col-span-2">
              <Label>Standard-Gültigkeit (Tage)</Label>
              <Input type="number" min="1" bind:value={s.defaultOfferValidityDays} />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>E-Rechnung & PDF</CardTitle>
          <CardDescription>
            ZUGFeRD-Profil bestimmt das eingebettete XML-Format. PDF-Design ist rein visuell.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div class="grid grid-cols-1 gap-4">
            <div class="flex flex-col gap-1.5">
              <Label>ZUGFeRD-Profil</Label>
              <Select bind:value={s.zugferdProfile} items={profileItems} />
              <span class="text-xs text-muted-foreground">
                EN 16931 deckt alle B2B-Standardfälle ab und ist als E-Rechnung universell akzeptiert.
              </span>
            </div>

            <div class="flex flex-col gap-1.5">
              <Label>PDF-Design</Label>
              <Select bind:value={s.pdfTheme} items={themeItems} />
              <span class="text-xs text-muted-foreground">
                Beeinflusst nur die visuelle Darstellung der PDF — das eingebettete ZUGFeRD-XML bleibt unverändert.
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      <div class="flex items-center gap-3">
        <Button type="submit" disabled={saving}>
          {saving ? "Speichere…" : "Speichern"}
        </Button>
        {#if error}
          <span class="text-sm text-destructive">{error}</span>
        {/if}
      </div>
    </form>
  {/if}
</SettingsShell>
