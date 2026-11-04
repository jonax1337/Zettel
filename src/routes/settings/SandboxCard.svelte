<script lang="ts">
  import { onMount } from "svelte";
  import { invoke } from "@tauri-apps/api/core";
  import {
    Button,
    Card,
    CardHeader,
    CardTitle,
    CardDescription,
    CardContent,
    ConfirmDialog,
    toast,
  } from "$lib/ui";
  import { FlaskConical } from "$lib/brand-icons";

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
      const { relaunch } = await import("@tauri-apps/plugin-process");
      await relaunch();
    } catch (e) {
      toast.error("Sandbox konnte nicht umgeschaltet werden", String(e));
    } finally {
      busy = false;
    }
  }
</script>

<Card>
  <CardHeader>
    <CardTitle class="flex items-center gap-2">
      <FlaskConical class="size-5" />
      Sandbox
    </CardTitle>
    <CardDescription>
      Zum gefahrlosen Testen. Daten werden getrennt gespeichert, deine echte Buchhaltung bleibt unberührt. Die App startet beim Umschalten neu.
    </CardDescription>
  </CardHeader>
  <CardContent>
    <Button
      type="button"
      variant={sandbox ? "destructive" : "outline"}
      disabled={busy}
      onclick={requestToggle}
    >
      {sandbox ? "Sandbox verlassen" : "Sandbox aktivieren"}
    </Button>
  </CardContent>
</Card>

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
