<script lang="ts">
  type Props = {
    html: string | null;
    loading?: boolean;
    error?: string | null;
    /** Accessible name of the sheet. */
    title: string;
  };
  let { html, loading = false, error = null, title }: Props = $props();

  const PX_PER_MM = 96 / 25.4;
  const SHEET_WIDTH_PX = 210 * PX_PER_MM;
  const A4_HEIGHT_PX = 297 * PX_PER_MM;

  let frame: HTMLIFrameElement | undefined = $state();
  let containerWidth = $state(0);
  let contentHeight = $state(A4_HEIGHT_PX);

  const scale = $derived(containerWidth > 0 ? containerWidth / SHEET_WIDTH_PX : 1);

  // The body, not the root element: the root is never shorter than the frame, so a
  // shorter document would keep the height of a longer one shown before.
  function measureContent() {
    const body = frame?.contentDocument?.body;
    if (body) contentHeight = body.offsetHeight;
  }
</script>

{#if error}
  <p role="alert" class="text-sm text-destructive">{error}</p>
{:else if html}
  <div
    bind:clientWidth={containerWidth}
    class="w-full overflow-hidden rounded-[4px] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.12),0_8px_24px_rgba(0,0,0,0.08)]"
    style="height: {contentHeight * scale}px"
  >
    <iframe
      bind:this={frame}
      {title}
      srcdoc={html}
      sandbox="allow-same-origin"
      onload={measureContent}
      class="block border-0 origin-top-left"
      style="width: {SHEET_WIDTH_PX}px; height: {contentHeight}px; transform: scale({scale})"
    ></iframe>
  </div>
{:else if loading}
  <p role="status" class="text-sm text-muted-foreground">Lade…</p>
{/if}
