<script lang="ts">
  import { Button } from "$lib/ui";

  type Props = { saving: boolean; error: string | null };
  let { saving, error }: Props = $props();
</script>

<div class="flex items-center gap-3">
  <Button type="submit" disabled={saving}>
    {saving ? "Speichere…" : "Speichern"}
  </Button>
  {#if error}
    <span class="text-sm text-destructive">{error}</span>
  {/if}
</div>
