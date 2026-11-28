<script lang="ts">
  import { push } from "svelte-spa-router";
  import { ArrowRight, FlaskConical } from "$lib/brand-icons";
</script>

<button
  type="button"
  onclick={() => push("/settings/data")}
  class="group mb-5 flex w-full cursor-pointer items-center gap-3 rounded-xl bg-status-warn-bg px-4 py-3 text-left text-status-warn outline-offset-2 focus-visible:outline-2 focus-visible:outline-ring"
>
  <FlaskConical class="size-5 shrink-0" />
  <div class="flex-1">
    <h2 class="text-sm">Sandbox aktiv</h2>
    <p class="text-[13px]">Hier kannst du gefahrlos testen. Echte Daten sind nicht betroffen.</p>
  </div>
  <span class="inline-flex items-center gap-1 text-[13px] font-semibold">
    Einstellungen
    <ArrowRight class="size-3.5 transition-transform group-hover:translate-x-0.5" />
  </span>
</button>
