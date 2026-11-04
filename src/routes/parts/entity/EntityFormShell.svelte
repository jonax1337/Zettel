<script lang="ts">
  import type { Snippet } from "svelte";
  import { push } from "svelte-spa-router";
  import { Button, Card, CardContent } from "$lib/ui";
  import BackLink from "./BackLink.svelte";

  type Props = {
    /** List page the back link and "Abbrechen" return to. */
    backHref: string;
    backLabel: string;
    title: string;
    mode: "new" | "edit";
    loading: boolean;
    saving: boolean;
    error: string | null;
    onSubmit: () => void;
    children: Snippet;
  };
  let { backHref, backLabel, title, mode, loading, saving, error, onSubmit, children }: Props = $props();

  function handleSubmit(e: SubmitEvent) {
    e.preventDefault();
    onSubmit();
  }
</script>

<header class="mb-6">
  <BackLink href={backHref}>{backLabel}</BackLink>
  <h1 class="text-3xl font-semibold tracking-tight mt-2">{title}</h1>
</header>

{#if loading}
  <p class="text-sm text-muted-foreground">Lade…</p>
{:else}
  <form onsubmit={handleSubmit}>
    <Card>
      <CardContent class="space-y-6">
        {@render children()}
      </CardContent>
    </Card>

    <div class="flex items-center gap-3 mt-6">
      <Button type="submit" disabled={saving}>
        {saving ? "Speichere…" : mode === "new" ? "Anlegen" : "Speichern"}
      </Button>
      <Button type="button" onclick={() => push(backHref)} variant="ghost">Abbrechen</Button>
      {#if error}
        <span class="text-sm text-destructive">{error}</span>
      {/if}
    </div>
  </form>
{/if}
