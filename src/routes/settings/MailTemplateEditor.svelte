<script lang="ts">
  import { Button, Input, Label, Textarea } from "$lib/ui";
  import type { MailTemplate } from "$lib/mail/templates";

  type Props = {
    title: string;
    /** Built-in text, shown as placeholder while the field is empty. */
    defaults: MailTemplate;
    subject: string | null;
    body: string | null;
  };
  let { title, defaults, subject = $bindable(), body = $bindable() }: Props = $props();

  const customized = $derived(!!subject?.trim() || !!body?.trim());

  function restoreDefaults() {
    subject = null;
    body = null;
  }
</script>

<div class="flex flex-col gap-3">
  <div class="flex items-center justify-between gap-3">
    <h3 class="text-sm font-semibold">{title}</h3>
    <Button type="button" variant="ghost" size="sm" disabled={!customized} onclick={restoreDefaults}>
      Standard wiederherstellen
    </Button>
  </div>
  <div class="flex flex-col gap-1.5">
    <Label>Betreff</Label>
    <Input bind:value={subject} placeholder={defaults.subject} />
  </div>
  <div class="flex flex-col gap-1.5">
    <Label>Text</Label>
    <Textarea bind:value={body} rows={8} placeholder={defaults.body} />
  </div>
</div>
