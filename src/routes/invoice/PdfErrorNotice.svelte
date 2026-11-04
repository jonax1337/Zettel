<script lang="ts">
  import NoticeCard from "./NoticeCard.svelte";

  let { message }: { message: string } = $props();
</script>

<NoticeCard tone="destructive" title="PDF-Generierung fehlgeschlagen">
  <div class="mt-1 font-mono text-xs text-muted-foreground whitespace-pre-wrap">{message}</div>
  <div class="mt-2 text-xs text-muted-foreground">
    Sidecar-Setup geprüft? Siehe sidecar/README.md (Python 3.12 + GTK + venv).
  </div>
</NoticeCard>
