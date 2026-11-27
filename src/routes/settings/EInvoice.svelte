<script lang="ts">
  import SettingsFormPage from "./SettingsFormPage.svelte";
  import FormSection from "./FormSection.svelte";
  import FieldGrid from "./FieldGrid.svelte";
  import Field from "./Field.svelte";
  import type { Settings } from "$lib/db/schema";
  import { Select } from "$lib/ui";

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
</script>

<SettingsFormPage
  page="/settings/einvoice"
  description="Format der eingebetteten E-Rechnung und Aussehen der PDF."
>
  {#snippet children(s)}
    <FormSection>
      <FieldGrid>
        <Field
          label="ZUGFeRD-Profil"
          wide
          hint="Das Profil bestimmt das eingebettete XML-Format. EN 16931 deckt alle B2B-Standardfälle ab und ist als E-Rechnung universell akzeptiert."
        >
          <Select bind:value={s.zugferdProfile} items={profileItems} />
        </Field>
        <Field label="PDF-Design" hint="Rein visuell: Das eingebettete ZUGFeRD-XML bleibt unverändert.">
          <Select bind:value={s.pdfTheme} items={themeItems} />
        </Field>
        <Field
          label="Sprache der PDF"
          hint="Vorbelegung für neue Belege, pro Beleg änderbar. Das ZUGFeRD-XML bleibt sprachneutral."
        >
          <Select bind:value={s.defaultPdfLanguage} items={pdfLanguageItems} />
        </Field>
        <Field
          label="PDF-Engine"
          wide
          hint="Typst setzt das PDF mit eigenem Layout. Inhalt und eingebettetes E-Rechnungs-XML sind identisch."
        >
          <Select bind:value={s.pdfRenderer} items={rendererItems} />
        </Field>
      </FieldGrid>
    </FormSection>
  {/snippet}
</SettingsFormPage>
