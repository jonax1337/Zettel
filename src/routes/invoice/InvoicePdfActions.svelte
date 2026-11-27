<script lang="ts">
  import { Button, DropdownItem, DropdownMenu } from "$lib/ui";
  import { ChevronDown, FileDown, FileText, FolderOpen, ShieldCheck } from "$lib/brand-icons";

  type Props = {
    hasPdf: boolean;
    /** Any action on the page is running; PDF generation and status changes must not overlap. */
    busy: boolean;
    generating: boolean;
    revalidating?: boolean;
    /** Creates the first PDF; once there is one, regenerating lives in the more menu. */
    onGenerate: () => void;
    onOpen: () => void;
    onReveal: () => void;
    /** Documents without an e-invoice XML (offers) leave this out and get no "Validieren" entry. */
    onRevalidate?: () => void;
  };
  let { hasPdf, busy, generating, revalidating = false, onGenerate, onOpen, onReveal, onRevalidate }: Props = $props();
</script>

{#if hasPdf}
  {#snippet moreTrigger()}
    <ChevronDown class="size-4" />
  {/snippet}
  <div class="inline-flex">
    <Button variant="outline" onclick={onOpen} class="rounded-r-none">
      <FileText />
      PDF öffnen
    </Button>
    <DropdownMenu
      trigger={moreTrigger}
      triggerLabel="Weitere Dokument-Aktionen"
      triggerClass="inline-flex h-9 w-7 cursor-pointer items-center justify-center rounded-r-md border border-l-0 border-input text-foreground transition-colors hover:bg-surface-strong"
    >
      {#if onRevalidate}
        <DropdownItem onSelect={onRevalidate} disabled={busy}>
          <ShieldCheck /> {revalidating ? "Prüfe…" : "Validieren"}
        </DropdownItem>
      {/if}
      <DropdownItem onSelect={onReveal}>
        <FolderOpen /> Im Explorer zeigen
      </DropdownItem>
    </DropdownMenu>
  </div>
{:else}
  <Button variant="outline" disabled={busy} onclick={onGenerate}>
    <FileDown />
    {generating ? "Erzeuge…" : "PDF erzeugen"}
  </Button>
{/if}
