<script lang="ts">
  import { Panel } from "$lib/ui";
  import type { Customer } from "$lib/db/schema";
  import { contactFacts } from "./contact-facts";

  let { customer }: { customer: Customer } = $props();

  const facts = $derived(contactFacts(customer));
</script>

<Panel title="Kontakt">
  {#if facts.length === 0}
    <p class="text-sm text-muted-foreground">Keine Kontaktdaten hinterlegt.</p>
  {:else}
    <dl class="grid gap-2.5 text-sm">
      {#each facts as fact (fact.label)}
        <div>
          <dt class="text-[13px] text-muted-foreground">{fact.label}</dt>
          <dd class="font-semibold [overflow-wrap:anywhere]">
            {#each fact.lines as line, index (index)}
              <span class="block">{line}</span>
            {/each}
          </dd>
        </div>
      {/each}
    </dl>
  {/if}
</Panel>
