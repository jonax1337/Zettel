<script lang="ts">
  import { Button, DropdownItem, DropdownMenu } from "$lib/ui";
  import type { ButtonVariant } from "$lib/ui/Button.svelte";
  import { ChevronDown, FileDown, FileText, FolderOpen, ShieldCheck } from "$lib/brand-icons";

  type Props = {
    hasPdf: boolean;
    generating: boolean;
    revalidating?: boolean;
    generateVariant?: ButtonVariant;
    onGenerate: () => void;
    onOpen: () => void;
    onReveal: () => void;
    /** Documents without an e-invoice XML (offers) leave this out and get no "Validieren" entry. */
    onRevalidate?: () => void;
  };
  let {
    hasPdf,
    generating,
    revalidating = false,
    generateVariant = "default",
    onGenerate,
    onOpen,
    onReveal,
    onRevalidate,
  }: Props = $props();
</script>

<Button variant={generateVariant} disabled={generating} onclick={onGenerate}>
  <FileDown />
  {generating ? "Erzeuge…" : hasPdf ? "PDF neu erzeugen" : "PDF erzeugen"}
</Button>

{#if hasPdf}
  {#snippet moreTrigger()}
    <button
      type="button"
      class="inline-flex items-center justify-center w-7 h-9 rounded-l-none rounded-r-md border border-l-0 border-input bg-background hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:hover:bg-input/50 transition-colors cursor-pointer shadow-xs"
      aria-label="Weitere Dokument-Aktionen"
    >
      <ChevronDown class="size-4" />
    </button>
  {/snippet}
  <div class="inline-flex">
    <Button variant="outline" onclick={onOpen} class="rounded-r-none">
      <FileText />
      Öffnen
    </Button>
    <DropdownMenu trigger={moreTrigger}>
      {#if onRevalidate}
        <DropdownItem onSelect={onRevalidate} disabled={revalidating}>
          <ShieldCheck /> {revalidating ? "Prüfe…" : "Validieren"}
        </DropdownItem>
      {/if}
      <DropdownItem onSelect={onReveal}>
        <FolderOpen /> Im Explorer zeigen
      </DropdownItem>
    </DropdownMenu>
  </div>
{/if}
