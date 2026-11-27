<script lang="ts">
  import SettingsFormPage from "./SettingsFormPage.svelte";
  import MailTemplateEditor from "./MailTemplateEditor.svelte";
  import { Segmented } from "$lib/ui";
  import { DEFAULT_MAIL_TEMPLATES, MAIL_PLACEHOLDERS } from "$lib/mail/templates";

  const kindItems = [
    { value: "invoice", label: "Rechnung" },
    { value: "offer", label: "Angebot" },
    { value: "reminder", label: "Mahnung" },
  ];

  let kind = $state("invoice");
</script>

<SettingsFormPage
  page="/settings/mail"
  description="Betreff und Text für „Per E-Mail senden“. Ein leeres Feld verwendet den Standardtext, der grau hinterlegt ist."
  hint="Gilt beim nächsten Senden per E-Mail."
>
  {#snippet children(s)}
    <div class="mb-4">
      <Segmented bind:value={kind} items={kindItems} ariaLabel="Vorlage" />
    </div>

    {#if kind === "invoice"}
      <MailTemplateEditor
        defaults={DEFAULT_MAIL_TEMPLATES.invoice}
        bind:subject={s.mailInvoiceSubject}
        bind:body={s.mailInvoiceBody}
      />
    {:else if kind === "offer"}
      <MailTemplateEditor
        defaults={DEFAULT_MAIL_TEMPLATES.offer}
        bind:subject={s.mailOfferSubject}
        bind:body={s.mailOfferBody}
      />
    {:else}
      <MailTemplateEditor
        defaults={DEFAULT_MAIL_TEMPLATES.reminder}
        bind:subject={s.mailReminderSubject}
        bind:body={s.mailReminderBody}
      />
    {/if}

    <p class="mt-5 text-[12.5px] text-muted-foreground">
      Platzhalter:
      {#each MAIL_PLACEHOLDERS as placeholder, i (placeholder.token)}
        <code class="font-mono text-foreground">{placeholder.token}</code> {placeholder.description}{i <
        MAIL_PLACEHOLDERS.length - 1
          ? ", "
          : "."}
      {/each}
      Bei Mahnungen steht <code class="font-mono text-foreground">{"{nummer}"}</code> für die
      Rechnungsnummer, <code class="font-mono text-foreground">{"{faellig}"}</code> für die neue
      Zahlungsfrist.
    </p>
  {/snippet}
</SettingsFormPage>
