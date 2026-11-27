<script lang="ts">
  import { onMount } from "svelte";
  import { invoke } from "@tauri-apps/api/core";
  import { Button, ConfirmDialog, toast } from "$lib/ui";
  import FormSection from "./FormSection.svelte";
  import { relaunchApp } from "$lib/utils/relaunch";

  let sandbox = $state(false);
  let busy = $state(false);
  let confirmOpen = $state(false);
  let pendingSandbox = $state(false);

  onMount(async () => {
    try {
      sandbox = await invoke<boolean>("is_sandbox");
    } catch (e) {
      toast.error("Sandbox-Status konnte nicht gelesen werden", String(e));
    }
  });

  function requestToggle() {
    pendingSandbox = !sandbox;
    confirmOpen = true;
  }

  async function applyToggle() {
    busy = true;
    try {
      await invoke("set_sandbox", { enabled: pendingSandbox });
      await relaunchApp();
    } catch (e) {
      toast.error("Sandbox konnte nicht umgeschaltet werden", String(e));
    } finally {
      busy = false;
    }
  }
</script>

<FormSection
  title="Sandbox"
  description="Zum gefahrlosen Testen. Daten werden getrennt gespeichert, deine echte Buchhaltung bleibt unberührt. Die App startet beim Umschalten neu."
>
  <Button
    type="button"
    variant={sandbox ? "destructive" : "outline"}
    class={sandbox ? "border-destructive/50" : ""}
    disabled={busy}
    onclick={requestToggle}
  >
    {sandbox ? "Sandbox verlassen" : "Sandbox aktivieren"}
  </Button>
</FormSection>

<ConfirmDialog
  bind:open={confirmOpen}
  title={pendingSandbox ? "Sandbox aktivieren?" : "Sandbox verlassen?"}
  description={pendingSandbox
    ? "Die App startet neu. Du wechselst in einen Testbereich – deine echten Daten bleiben unverändert."
    : "Die App startet neu und zeigt wieder deine echte Buchhaltung. Test-Daten bleiben gespeichert."}
  confirmLabel="Neu starten"
  cancelLabel="Abbrechen"
  onConfirm={applyToggle}
/>
