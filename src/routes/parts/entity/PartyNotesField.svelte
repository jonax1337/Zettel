<script lang="ts">
  import { Label, Textarea } from "$lib/ui";

  let { value = $bindable() }: { value: string | null } = $props();
</script>

<div class="flex flex-col gap-1.5">
  <Label>Notizen (intern)</Label>
  <Textarea rows={3} bind:value />
  <p class="text-xs text-muted-foreground">Nur intern sichtbar, erscheint nicht auf Rechnungen.</p>
</div>
