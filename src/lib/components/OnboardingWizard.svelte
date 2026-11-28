<script lang="ts">
  import { errorMessage } from "$lib/utils/error-message";
  import { loadSettings, saveSettings } from "$lib/db/queries";
  import {
    Button,
    Dialog,
    IbanInput,
    Input,
    Label,
    toast,
  } from "$lib/ui";
  import { ArrowLeft, ArrowRight, Sparkles } from "$lib/brand-icons";
  import { rememberOnboardingDismissed } from "./onboarding-dismissal";
  import { applyDraft, emptyDraft, STEP_COUNT, validateStep } from "./onboarding-draft";

  type Props = {
    onDone: () => void;
    onDismiss: () => void;
  };
  let { onDone, onDismiss }: Props = $props();

  let open = $state(true);
  let step = $state(1);
  let saving = $state(false);
  let error = $state<string | null>(null);
  const draft = $state(emptyDraft());

  async function dismissForever() {
    await rememberOnboardingDismissed();
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
      error = errorMessage(e);
      toast.error("Speichern fehlgeschlagen", errorMessage(e));
    } finally {
      saving = false;
    }
  }
</script>

<Dialog
  bind:open
  title="Willkommen bei Zettel"
  class="max-w-2xl max-h-[90vh] overflow-y-auto p-8"
  onOpenChange={(isOpen) => {
    if (!isOpen) onDismiss();
  }}
>
  <div class="mb-6 flex gap-1.5" role="progressbar" aria-label="Fortschritt" aria-valuemin={1} aria-valuemax={STEP_COUNT} aria-valuenow={step}>
    {#each Array(STEP_COUNT) as _, i (i)}
      <div
        class={"h-1.5 flex-1 rounded-full transition-colors " +
          (i + 1 <= step ? "bg-primary" : "bg-muted")}
      ></div>
    {/each}
  </div>

  {#if step === 1}
    <div>
      <div class="mb-4 space-y-1">
        <h2 class="font-display text-lg font-extrabold">Schritt 1: Firma & Adresse</h2>
        <p class="text-sm text-muted-foreground">
          Diese Angaben erscheinen im Briefkopf jeder Rechnung. Pflicht für
          EN-16931-konforme E-Rechnungen.
        </p>
      </div>
      <div>
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
      </div>
    </div>
  {:else if step === 2}
    <div>
      <div class="mb-4 space-y-1">
        <h2 class="font-display text-lg font-extrabold">Schritt 2: Steuer</h2>
        <p class="text-sm text-muted-foreground">
          Mindestens eine der beiden Identifikationen erforderlich.
          Kleinunternehmer:innen geben üblicherweise nur die Steuernummer an.
        </p>
      </div>
      <div class="space-y-4">
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
        <fieldset class="space-y-2">
          <legend class="text-sm font-medium">
            Umsatzsteuer-Status <span class="text-destructive">*</span>
          </legend>
          <label class="flex items-start gap-2 text-sm cursor-pointer select-none">
            <input
              type="radio"
              name="tax-status"
              class="mt-1 accent-primary"
              checked={draft.isKleinunternehmer === true}
              onchange={() => (draft.isKleinunternehmer = true)}
            />
            <span>
              <span class="font-medium">Kleinunternehmer:in nach § 19 UStG</span>
              <span class="block text-xs text-muted-foreground mt-0.5">
                Rechnungen weisen keine USt aus, der Hinweistext wird automatisch ergänzt.
              </span>
            </span>
          </label>
          <label class="flex items-start gap-2 text-sm cursor-pointer select-none">
            <input
              type="radio"
              name="tax-status"
              class="mt-1 accent-primary"
              checked={draft.isKleinunternehmer === false}
              onchange={() => (draft.isKleinunternehmer = false)}
            />
            <span>
              <span class="font-medium">Regelbesteuerung</span>
              <span class="block text-xs text-muted-foreground mt-0.5">
                Rechnungen weisen Umsatzsteuer aus. Kann später jederzeit umgestellt werden.
              </span>
            </span>
          </label>
        </fieldset>
      </div>
    </div>
  {:else if step === 3}
    <div>
      <div class="mb-4 space-y-1">
        <h2 class="font-display text-lg font-extrabold">Schritt 3: Bankverbindung</h2>
        <p class="text-sm text-muted-foreground">
          Erscheint im Fuß der Rechnung. Bei hinterlegter IBAN wird automatisch
          ein EPC-QR-Code für SEPA-Überweisung generiert.
        </p>
      </div>
      <div>
        <div class="grid grid-cols-2 gap-4">
          <div class="col-span-2 flex flex-col gap-1.5">
            <Label>Bank</Label>
            <Input bind:value={draft.bankName} placeholder="z. B. Sparkasse Beispielstadt" />
          </div>
          <div class="flex flex-col gap-1.5">
            <Label>IBAN</Label>
            <IbanInput bind:value={draft.bankIban} placeholder="DE…" />
          </div>
          <div class="flex flex-col gap-1.5">
            <Label>BIC</Label>
            <Input bind:value={draft.bankBic} />
          </div>
        </div>
        <p class="text-xs text-muted-foreground mt-3">
          Optional — kannst du auch später in den Einstellungen ergänzen.
        </p>
      </div>
    </div>
  {:else}
    <div>
      <div class="mb-4 space-y-1">
        <h2 class="font-display text-lg font-extrabold">Fertig.</h2>
        <p class="text-sm text-muted-foreground">
          Du kannst jetzt deine erste Rechnung schreiben.
          Weitere Details (Logo, Steuerprofil, Mahnstufen, Skonto-Default)
          findest du jederzeit unter <strong>Einstellungen</strong>.
        </p>
      </div>
      <div>
        <ul class="text-sm space-y-1.5 text-muted-foreground">
          <li>• Lege unter <strong>Kunden</strong> deinen ersten Kontakt an.</li>
          <li>• Erstelle dann eine neue <strong>Rechnung</strong> — Entwürfe ziehen erst beim Versand eine echte Nummer.</li>
          <li>• Speichere ein Backup über <strong>Einstellungen</strong> unter „Daten und Backup“.</li>
        </ul>
      </div>
    </div>
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
          {saving ? "Speichern…" : "Loslegen"}
          <Sparkles class="size-4" />
        </Button>
      {/if}
    </div>
  </div>
</Dialog>
