<script lang="ts">
  import { Panel } from "$lib/ui";
  import type { Fact } from "../../invoice/detail/document-facts";
  import FactRow from "./FactRow.svelte";

  /** Facts the sheet does not show; without any, the panel stays away. */
  let { facts }: { facts: Fact[] } = $props();
</script>

{#if facts.length > 0}
  <Panel title="Eckdaten">
    <dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
      {#each facts as fact (fact.label)}
        <FactRow label={fact.label}><span class={fact.mono ? "font-mono" : ""}>{fact.value}</span></FactRow>
      {/each}
    </dl>
  </Panel>
{/if}
