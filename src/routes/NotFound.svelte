<script lang="ts">
  import { FileQuestion } from "$lib/brand-icons";
  import BackLink from "./parts/entity/BackLink.svelte";
</script>

<div class="flex flex-col items-center justify-center text-center py-24 px-6">
  <div class="size-12 rounded-full bg-muted/60 inline-flex items-center justify-center mb-4">
    <FileQuestion class="size-6 text-muted-foreground" />
  </div>
  <h1 class="text-3xl font-semibold tracking-tight mb-1">404</h1>
  <p class="text-sm text-muted-foreground mb-6">Diese Seite gibt es nicht.</p>
  <BackLink href="/">Zurück zum Dashboard</BackLink>
</div>
