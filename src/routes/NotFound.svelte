<script lang="ts">
  import { link } from "svelte-spa-router";
  import { ArrowLeft, FileQuestion } from "@lucide/svelte";
</script>

<div class="flex flex-col items-center justify-center text-center py-24 px-6">
  <div class="size-12 rounded-full bg-muted/60 inline-flex items-center justify-center mb-4">
    <FileQuestion class="size-6 text-muted-foreground" />
  </div>
  <h1 class="text-3xl font-semibold tracking-tight mb-1">404</h1>
  <p class="text-sm text-muted-foreground mb-6">Diese Seite gibt es nicht.</p>
  <a
    href="/"
    use:link
    class="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors group"
  >
    <ArrowLeft class="size-4 transition-transform group-hover:-translate-x-0.5" />
    Zurück zum Dashboard
  </a>
</div>
