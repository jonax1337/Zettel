<script lang="ts">
  import type { Snippet } from "svelte";
  import { PageHeader, Tabs } from "$lib/ui";
  import { REPORT_TABS } from "./report-tabs";

  type Props = {
    /** The `href` of the tab of the current page. */
    active: string;
    children: Snippet;
  };

  let { active, children }: Props = $props();
</script>

<PageHeader title="Auswertungen" />
<Tabs items={REPORT_TABS} {active} ariaLabel="Auswertungen" />

{@render children()}
