<script lang="ts">
  import { open } from "@tauri-apps/plugin-dialog";
  import { Button, Input, Label, toast } from "$lib/ui";
  import { Image, X } from "$lib/brand-icons";

  type Props = { path: string | null };
  let { path = $bindable() }: Props = $props();

  async function pickLogo() {
    try {
      const picked = await open({
        multiple: false,
        filters: [{ name: "Bilder", extensions: ["png", "jpg", "jpeg", "svg"] }],
      });
      if (typeof picked === "string") path = picked;
    } catch (e) {
      toast.error("Logo konnte nicht gewählt werden", String(e));
    }
  }
</script>

<div class="flex flex-col gap-1.5">
  <Label>Logo-Datei</Label>
  <div class="flex items-center gap-2">
    <Input bind:value={path} placeholder="Kein Logo ausgewählt" class="flex-1" />
    <Button type="button" variant="outline" onclick={pickLogo}>
      <Image />
      Wählen…
    </Button>
    {#if path}
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onclick={() => (path = null)}
        aria-label="Logo entfernen"
      >
        <X />
      </Button>
    {/if}
  </div>
</div>
