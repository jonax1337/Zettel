<script lang="ts">
  import { link } from "svelte-spa-router";
  import { AlertTriangle, ArrowRight } from "$lib/brand-icons";
  import { COMPANY_SETTINGS_ROUTE } from "$lib/utils/company-completeness";

  type Props = { missing: string[] };
  let { missing }: Props = $props();
</script>

<div class="mb-6 rounded-lg border border-warning/40 bg-warning/10 p-4 flex items-center gap-3">
  <AlertTriangle class="size-5 text-warning shrink-0" />
  <div class="flex-1">
    <h2 class="text-sm font-semibold text-warning">Stammdaten unvollständig</h2>
    <p class="text-xs text-warning/80">
      Rechnungen, Angebote und Mahnungen lassen sich erst erzeugen, wenn diese Angaben ergänzt sind:
      {missing.join(", ")}.
    </p>
  </div>
  <a
    href={COMPANY_SETTINGS_ROUTE}
    use:link
    class="group inline-flex items-center gap-1 text-xs font-medium text-warning hover:underline"
  >
    Firmendaten ergänzen
    <ArrowRight class="size-3.5 transition-transform group-hover:translate-x-0.5" />
  </a>
</div>
