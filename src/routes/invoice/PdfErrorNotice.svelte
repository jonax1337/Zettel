<script lang="ts">
  import { Button } from "$lib/ui";
  import { COMPANY_INCOMPLETE_CODE } from "$lib/sidecar/company-guard";
  import { COMPANY_SETTINGS_ROUTE } from "$lib/utils/company-completeness";
  import NoticeCard from "./NoticeCard.svelte";

  let { message }: { message: string } = $props();

  const companyPrefix = `${COMPANY_INCOMPLETE_CODE}: `;
  const companyIncomplete = $derived(message.startsWith(companyPrefix));
</script>

{#if companyIncomplete}
  <NoticeCard tone="warning" title="Firmendaten unvollständig">
    <div class="mt-1 text-xs text-muted-foreground">{message.slice(companyPrefix.length)}</div>
    <Button href={COMPANY_SETTINGS_ROUTE} size="sm" variant="outline" class="mt-3">
      Firmendaten ergänzen
    </Button>
  </NoticeCard>
{:else}
  <NoticeCard tone="destructive" title="PDF-Generierung fehlgeschlagen">
    <div class="mt-1 font-mono text-xs text-muted-foreground whitespace-pre-wrap">{message}</div>
    <div class="mt-2 text-xs text-muted-foreground">
      Sidecar-Setup geprüft? Siehe sidecar/README.md (Python 3.12 + GTK + venv).
    </div>
  </NoticeCard>
{/if}
