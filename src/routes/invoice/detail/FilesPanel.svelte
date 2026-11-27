<script lang="ts">
  import type { Snippet } from "svelte";
  import PdfLocation from "../../parts/entity/PdfLocation.svelte";
  import PdfVersionList from "../PdfVersionList.svelte";
  import { Loader2 } from "$lib/brand-icons";
  import type { PdfVersion } from "$lib/sidecar/invoice";
  import DetailPanel from "./DetailPanel.svelte";

  type Props = {
    pdfPath: string | null;
    versions: PdfVersion[];
    /** A PDF is being created; with an older one on show, nothing else tells that. */
    generating?: boolean;
    /** Validation state, exports and the like below the PDF. */
    children?: Snippet;
  };
  let { pdfPath, versions, generating = false, children }: Props = $props();
</script>

<DetailPanel title="Dateien">
  {#if generating}
    <p role="status" class="flex items-center gap-2 text-sm font-bold">
      <Loader2 class="size-4 animate-spin" />
      PDF wird erzeugt …
    </p>
  {/if}
  {#if pdfPath && versions.length > 0}
    <PdfVersionList {versions} />
  {:else if pdfPath}
    <PdfLocation path={pdfPath} class="mb-0" />
  {:else}
    <p class="text-sm text-muted-foreground">Noch keine PDF erzeugt.</p>
  {/if}
  {@render children?.()}
</DetailPanel>
