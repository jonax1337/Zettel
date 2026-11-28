<script lang="ts">
  import type { Snippet } from "svelte";
  import { PageHeader } from "$lib/ui";
  import { SETTINGS_PAGES, type SettingsPageHref } from "$lib/navigation";
  import { version as appVersion } from "../../../package.json";
  import SettingsNav from "./SettingsNav.svelte";

  interface Props {
    page: SettingsPageHref;
    description: string;
    /** Rendered below the page as the sticky bar, e.g. the save bar. */
    footer?: Snippet;
    children: Snippet;
  }

  const { page, description, footer, children }: Props = $props();

  const title = $derived(SETTINGS_PAGES.find((p) => p.href === page)?.label ?? "");
</script>

<PageHeader title="Einstellungen" subtitle="Zettel v{appVersion}, lokal auf diesem Rechner" />

<!-- Column widths and gap are mirrored in SettingsFormFooter, which aligns the save button with the page column. -->
<div class="grid items-start gap-x-10 gap-y-5 @3xl:grid-cols-[13rem_minmax(0,45rem)]">
  <SettingsNav active={page} />
  <div class="min-w-0">
    <h2 class="text-lg">{title}</h2>
    <p class="mt-1 mb-5 text-[13px] text-muted-foreground">{description}</p>
    {@render children()}
  </div>
</div>

{@render footer?.()}
