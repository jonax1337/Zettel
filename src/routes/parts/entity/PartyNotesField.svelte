<script lang="ts">
  import { Field, Textarea } from "$lib/ui";

  let { value = $bindable(), wide = false }: { value: string | null; wide?: boolean } = $props();
</script>

<Field label="Notizen (intern)" {wide} hint="Nur intern sichtbar, erscheint nicht auf Rechnungen.">
  <Textarea rows={3} bind:value />
</Field>
