<script lang="ts">
  import { onMount } from "svelte";
  import SettingsShell from "./SettingsShell.svelte";
  import SettingsFormFooter from "./SettingsFormFooter.svelte";
  import DocumentNumberingCard from "./DocumentNumberingCard.svelte";
  import ExpenseCategoryEuerCard from "./ExpenseCategoryEuerCard.svelte";
  import MailTemplateEditor from "./MailTemplateEditor.svelte";
  import { SettingsForm } from "./settings-form.svelte";
  import type { Settings } from "$lib/db/schema";
  import { DEFAULT_MAIL_TEMPLATES, MAIL_PLACEHOLDERS } from "$lib/mail/templates";
  import {
    Input,
    Label,
    Card,
    CardHeader,
    CardTitle,
    CardDescription,
    CardContent,
    Checkbox,
    Select,
  } from "$lib/ui";

  type Choice<T> = { value: T; label: string }[];

  const profileItems: Choice<Settings["zugferdProfile"]> = [
    { value: "en16931", label: "EN 16931 / Comfort (Standard)" },
    { value: "basic", label: "BASIC (Factur-X 1.0)" },
    { value: "extended", label: "EXTENDED (Factur-X 1.0)" },
  ];

  const themeItems: Choice<Settings["pdfTheme"]> = [
    { value: "classic", label: "Klassisch" },
    { value: "modern", label: "Modern" },
    { value: "minimal", label: "Minimal" },
  ];

  const rendererItems: Choice<Settings["pdfRenderer"]> = [
    { value: "weasyprint", label: "WeasyPrint (Standard)" },
    { value: "typst", label: "Typst" },
  ];

  const pdfLanguageItems: Choice<Settings["defaultPdfLanguage"]> = [
    { value: "de", label: "Deutsch" },
    { value: "en", label: "Englisch" },
  ];

  const form = new SettingsForm();
  onMount(() => form.load());
</script>

<SettingsShell
  title="Dokumente"
  description="Rechnungen, Angebote, Nummernkreise, E-Mail-Vorlagen und E-Rechnung-Profil."
>
  {#if form.loading}
    <p class="text-sm text-muted-foreground">Lade…</p>
  {:else if form.error && !form.settings}
    <p class="text-sm text-destructive">Fehler: {form.error}</p>
  {:else if form.settings}
    {@const s = form.settings}
    <form onsubmit={(e) => form.submit(e)} class="space-y-6">
      <DocumentNumberingCard
        title="Rechnungen"
        bind:format={s.invoiceNumberFormat}
        bind:counter={s.invoiceNumberCounter}
        bind:defaultDays={s.defaultPaymentTermsDays}
        defaultDaysLabel="Standard-Zahlungsfrist (Tage)"
        defaultDaysMin={0}
      />

      <DocumentNumberingCard
        title="Angebote"
        bind:format={s.offerNumberFormat}
        bind:counter={s.offerNumberCounter}
        bind:defaultDays={s.defaultOfferValidityDays}
        defaultDaysLabel="Standard-Gültigkeit (Tage)"
        defaultDaysMin={1}
      />

      <Card>
        <CardHeader>
          <CardTitle>Skonto-Default</CardTitle>
          <CardDescription>
            Vorbelegung für neue Rechnungen und Angebote. Pro Beleg
            überschreibbar oder deaktivierbar.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <label class="flex items-center gap-2 text-sm cursor-pointer select-none">
            <Checkbox bind:checked={s.defaultSkontoActive} />
            <span>Standardmäßig Skonto anbieten</span>
          </label>
          {#if s.defaultSkontoActive}
            <div class="mt-3 ml-7 grid grid-cols-2 gap-3 max-w-md">
              <div class="flex flex-col gap-1.5">
                <Label class="text-xs">Prozent</Label>
                <Input
                  type="number"
                  min="0.1"
                  max="20"
                  step="0.1"
                  bind:value={s.defaultSkontoPercent}
                />
              </div>
              <div class="flex flex-col gap-1.5">
                <Label class="text-xs">Innerhalb (Tage)</Label>
                <Input
                  type="number"
                  min="1"
                  max="60"
                  step="1"
                  bind:value={s.defaultSkontoDays}
                />
              </div>
              <p class="col-span-2 text-xs text-muted-foreground">
                Wird strukturiert im ZUGFeRD-XML (BT-20) und als Textzeile auf
                der PDF ausgewiesen. Branchenüblich: 2 % / 7 Tage.
              </p>
            </div>
          {/if}
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

            <div class="flex flex-col gap-1.5">
              <Label>PDF-Engine</Label>
              <Select bind:value={s.pdfRenderer} items={rendererItems} />
              <span class="text-xs text-muted-foreground">
                Typst setzt das PDF mit eigenem Layout. Inhalt und eingebettete E-Rechnungs-XML sind identisch.
              </span>
            </div>

            <div class="flex flex-col gap-1.5">
              <Label>Standard-Sprache PDF</Label>
              <Select bind:value={s.defaultPdfLanguage} items={pdfLanguageItems} />
              <span class="text-xs text-muted-foreground">
                Vorbelegung für neue Rechnungen und Angebote. Pro Beleg
                überschreibbar. Das ZUGFeRD-XML bleibt sprach-neutral.
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>E-Mail-Vorlagen</CardTitle>
          <CardDescription>
            Betreff und Text für „Per E-Mail senden“. Ein leeres Feld verwendet den Standardtext
            (grau hinterlegt). Platzhalter:
            {#each MAIL_PLACEHOLDERS as placeholder, i (placeholder.token)}
              <code class="font-mono text-foreground">{placeholder.token}</code> {placeholder.description}{i <
              MAIL_PLACEHOLDERS.length - 1
                ? ", "
                : "."}
            {/each}
            Bei Mahnungen steht <code class="font-mono text-foreground">{"{nummer}"}</code> für die
            Rechnungsnummer, <code class="font-mono text-foreground">{"{faellig}"}</code> für die neue
            Zahlungsfrist.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div class="space-y-6">
            <MailTemplateEditor
              title="Rechnung"
              defaults={DEFAULT_MAIL_TEMPLATES.invoice}
              bind:subject={s.mailInvoiceSubject}
              bind:body={s.mailInvoiceBody}
            />
            <MailTemplateEditor
              title="Angebot"
              defaults={DEFAULT_MAIL_TEMPLATES.offer}
              bind:subject={s.mailOfferSubject}
              bind:body={s.mailOfferBody}
            />
            <MailTemplateEditor
              title="Mahnung"
              defaults={DEFAULT_MAIL_TEMPLATES.reminder}
              bind:subject={s.mailReminderSubject}
              bind:body={s.mailReminderBody}
            />
          </div>
        </CardContent>
      </Card>

      <ExpenseCategoryEuerCard />

      <SettingsFormFooter saving={form.saving} error={form.error} />
    </form>
  {/if}
</SettingsShell>
