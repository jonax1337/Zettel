<script lang="ts">
  import { Button, Input, Textarea } from "$lib/ui";
  import type { MailTemplate } from "$lib/mail/templates";
  import Field from "./Field.svelte";
  import FieldGrid from "./FieldGrid.svelte";

  type Props = {
    /** Built-in text, shown as placeholder while the field is empty. */
    defaults: MailTemplate;
    subject: string | null;
    body: string | null;
  };
  let { defaults, subject = $bindable(), body = $bindable() }: Props = $props();

  const customized = $derived(!!subject?.trim() || !!body?.trim());

  function restoreDefaults() {
    subject = null;
    body = null;
  }
</script>

<FieldGrid>
  <Field label="Betreff" wide>
    <Input bind:value={subject} placeholder={defaults.subject} />
  </Field>
  <Field label="Text" wide>
    <Textarea bind:value={body} rows={9} placeholder={defaults.body} />
  </Field>
</FieldGrid>
<div class="mt-2.5">
  <Button type="button" variant="ghost" size="sm" disabled={!customized} onclick={restoreDefaults}>
    Standard wiederherstellen
  </Button>
</div>
