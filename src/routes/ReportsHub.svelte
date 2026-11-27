<script lang="ts">
  import { link } from "svelte-spa-router";
  import { ArrowRight } from "$lib/brand-icons";
  import { PageHeader } from "$lib/ui";
  import { REPORT_PAGES } from "$lib/navigation";
</script>

<PageHeader title="Auswertungen" subtitle="Steuer, Export und Prüfung an einem Ort." />

<ul class="border-t border-input">
  {#each REPORT_PAGES as page (page.href)}
    <li class="border-b">
      <a
        href={page.href}
        use:link
        class="group flex min-h-[60px] items-center gap-3.5 px-1 py-2.5 transition-colors hover:bg-surface"
      >
        <page.icon class="size-5 shrink-0 text-muted-foreground" />
        <span class="min-w-0 flex-1">
          <span class="block font-bold">{page.label}</span>
          <span class="block text-[13px] text-muted-foreground">{page.description}</span>
        </span>
        <ArrowRight class="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
      </a>
    </li>
  {/each}
</ul>
