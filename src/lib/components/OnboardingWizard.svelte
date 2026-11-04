<script lang="ts">
  import { loadSettings, saveSettings } from "$lib/db/queries";
  import {
    Button,
    Input,
    Label,
    Checkbox,
    Card,
    CardHeader,
    CardTitle,
    CardDescription,
    CardContent,
    toast,
  } from "$lib/ui";
  import { ArrowLeft, ArrowRight, Sparkles, X } from "$lib/brand-icons";
  import { rememberOnboardingDismissed } from "./onboarding-dismissal";
  import { applyDraft, emptyDraft, STEP_COUNT, validateStep } from "./onboarding-draft";

  type Props = {
    onDone: () => void;
    onDismiss: () => void;
  };
  let { onDone, onDismiss }: Props = $props();

  let step = $state(1);
  let saving = $state(false);
  let error = $state<string | null>(null);
  const draft = $state(emptyDraft());

  function dismissForever() {
    rememberOnboardingDismissed();
    onDismiss();
  }

  function goNext() {
    error = validateStep(step, draft);
    if (!error) step += 1;
  }

  function goBack() {
    error = null;
    step -= 1;
  }

  async function finish() {
    saving = true;
    error = null;
    try {
      await saveSettings(applyDraft(await loadSettings(), draft));
      toast.success("Stammdaten gespeichert", "Du kannst jetzt loslegen.");
      onDone();
    } catch (e) {
      error = String(e);
      toast.error("Speichern fehlgeschlagen", String(e));
    } finally {
      saving = false;
    }
  }
</script>

<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
  <div class="relative max-w-2xl w-full max-h-[90vh] overflow-y-auto rounded-xl border bg-background shadow-2xl">
    <button
      type="button"
      onclick={dismissForever}
      aria-label="Nicht mehr anzeigen"
      title="Nicht mehr anzeigen"
      class="absolute top-4 right-4 inline-flex items-center justify-center size-8 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
    >
      <X class="size-4" />
    </button>

    <div class="p-8">
      <div class="flex items-center gap-3 mb-6">
        <Sparkles class="size-5 text-primary" />
        <h2 class="text-xl font-semibold tracking-tight">Willkommen bei Zettel</h2>
      </div>

      <div class="mb-6 flex gap-1.5">
        {#each Array(STEP_COUNT) as _, i (i)}
          <div
            class={"h-1.5 flex-1 rounded-full transition-colors " +
              (i + 1 <= step ? "bg-primary" : "bg-muted")}
          ></div>
        {/each}
      </div>

      {#if step === 1}
        <Card>
          <CardHeader>
            <CardTitle>Schritt 1: Firma & Adresse</CardTitle>
            <CardDescription>
              Diese Angaben erscheinen im Briefkopf jeder Rechnung. Pflicht für
              EN-16931-konforme E-Rechnungen.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div class="grid grid-cols-2 gap-4">
              <div class="col-span-2 flex flex-col gap-1.5">
                <Label>Firmenname <span class="text-destructive">*</span></Label>
                <Input bind:value={draft.companyName} required placeholder="z. B. Jonas Laux Digital" />
              </div>
              <div class="flex flex-col gap-1.5">
                <Label>Inhaber:in</Label>
                <Input bind:value={draft.ownerName} />
              </div>
              <div class="flex flex-col gap-1.5">
                <Label>E-Mail</Label>
                <Input type="email" bind:value={draft.email} />
              </div>
              <div class="col-span-2 flex flex-col gap-1.5">
                <Label>Straße & Nr. <span class="text-destructive">*</span></Label>
                <Input bind:value={draft.street} required />
              </div>
              <div class="flex flex-col gap-1.5">
                <Label>PLZ <span class="text-destructive">*</span></Label>
                <Input bind:value={draft.postalCode} required />
              </div>
              <div class="flex flex-col gap-1.5">
                <Label>Ort <span class="text-destructive">*</span></Label>
                <Input bind:value={draft.city} required />
              </div>
              <div class="flex flex-col gap-1.5">
                <Label>Land</Label>
                <Input bind:value={draft.country} maxlength={2} placeholder="DE" />
              </div>
            </div>
          </CardContent>
        </Card>
      {:else if step === 2}
        <Card>
          <CardHeader>
            <CardTitle>Schritt 2: Steuer</CardTitle>
            <CardDescription>
              Mindestens eine der beiden Identifikationen erforderlich.
              Kleinunternehmer:innen geben üblicherweise nur die Steuernummer an.
            </CardDescription>
          </CardHeader>
          <CardContent class="space-y-4">
            <div class="grid grid-cols-2 gap-4">
              <div class="flex flex-col gap-1.5">
                <Label>Steuernummer</Label>
                <Input bind:value={draft.taxNumber} placeholder="z. B. 12/345/67890" />
              </div>
              <div class="flex flex-col gap-1.5">
                <Label>USt-IdNr.</Label>
                <Input bind:value={draft.vatId} placeholder="z. B. DE123456789" />
              </div>
            </div>
            <label class="flex items-start gap-2 text-sm cursor-pointer select-none">
              <Checkbox bind:checked={draft.isKleinunternehmer} />
              <span>
                <span class="font-medium">Kleinunternehmer:in nach § 19 UStG</span>
                <span class="block text-xs text-muted-foreground mt-0.5">
                  Rechnungen weisen keine USt aus, der Hinweistext wird automatisch ergänzt.
                  Kann später jederzeit umgestellt werden.
                </span>
              </span>
            </label>
          </CardContent>
        </Card>
      {:else if step === 3}
        <Card>
          <CardHeader>
            <CardTitle>Schritt 3: Bankverbindung</CardTitle>
            <CardDescription>
              Erscheint im Fuß der Rechnung. Bei hinterlegter IBAN wird automatisch
              ein EPC-QR-Code für SEPA-Überweisung generiert.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div class="grid grid-cols-2 gap-4">
              <div class="col-span-2 flex flex-col gap-1.5">
                <Label>Bank</Label>
                <Input bind:value={draft.bankName} placeholder="z. B. Sparkasse Beispielstadt" />
              </div>
              <div class="flex flex-col gap-1.5">
                <Label>IBAN</Label>
                <Input bind:value={draft.bankIban} placeholder="DE…" />
              </div>
              <div class="flex flex-col gap-1.5">
                <Label>BIC</Label>
                <Input bind:value={draft.bankBic} />
              </div>
            </div>
            <p class="text-xs text-muted-foreground mt-3">
              Optional — kannst du auch später in den Einstellungen ergänzen.
            </p>
          </CardContent>
        </Card>
      {:else}
        <Card>
          <CardHeader>
            <CardTitle>Fertig.</CardTitle>
            <CardDescription>
              Du kannst jetzt deine erste Rechnung schreiben.
              Weitere Details (Logo, Steuerprofil, Mahnstufen, Skonto-Default)
              findest du jederzeit unter <strong>Einstellungen</strong>.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul class="text-sm space-y-1.5 text-muted-foreground">
              <li>• Lege unter <strong>Kunden</strong> deinen ersten Kontakt an.</li>
              <li>• Erstelle dann eine neue <strong>Rechnung</strong> — Entwürfe ziehen erst beim Versand eine echte Nummer.</li>
              <li>• Speichere ein Backup über <strong>Einstellungen → Daten</strong>.</li>
            </ul>
          </CardContent>
        </Card>
      {/if}

      {#if error}
        <p class="mt-4 text-sm text-destructive">{error}</p>
      {/if}

      <div class="mt-6 flex items-center justify-between gap-3">
        <button
          type="button"
          onclick={dismissForever}
          class="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          Nicht mehr anzeigen
        </button>
        <div class="inline-flex items-center gap-2">
          {#if step > 1}
            <Button type="button" variant="outline" onclick={goBack} disabled={saving}>
              <ArrowLeft class="size-4" />
              Zurück
            </Button>
          {/if}
          {#if step < STEP_COUNT}
            <Button type="button" onclick={goNext} disabled={saving}>
              Weiter
              <ArrowRight class="size-4" />
            </Button>
          {:else}
            <Button type="button" onclick={finish} disabled={saving}>
              {saving ? "Speichere…" : "Loslegen"}
              <Sparkles class="size-4" />
            </Button>
          {/if}
        </div>
      </div>
    </div>
  </div>
</div>
