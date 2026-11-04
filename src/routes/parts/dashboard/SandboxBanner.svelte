<script lang="ts">
  import { push } from "svelte-spa-router";
  import { ArrowRight, FlaskConical } from "$lib/brand-icons";
</script>

<button
  type="button"
  onclick={() => push("/settings")}
  class="group mb-6 w-full rounded-lg border border-warning/40 bg-warning/10 hover:bg-warning/15 hover:-translate-y-0.5 hover:shadow-md transition-all duration-200 p-4 flex items-center gap-3 text-left cursor-pointer"
>
  <FlaskConical class="size-5 text-warning shrink-0" />
  <div class="flex-1">
    <h2 class="text-sm font-semibold text-warning">Sandbox aktiv</h2>
    <p class="text-xs text-warning/80">Hier kannst du gefahrlos testen. Echte Daten sind nicht betroffen.</p>
  </div>
  <span class="inline-flex items-center gap-1 text-xs text-warning/70">
    Einstellungen
    <ArrowRight class="size-3.5 transition-transform group-hover:translate-x-0.5" />
  </span>
</button>
