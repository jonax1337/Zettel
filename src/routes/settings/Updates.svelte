<script lang="ts">
  import { errorMessage } from "$lib/utils/error-message";
  import SettingsShell from "./SettingsShell.svelte";
  import { Button, toast, PERSISTENT_TOAST, CheckField } from "$lib/ui";
  import { RefreshCw } from "$lib/brand-icons";
  import { version as appVersion } from "../../../package.json";
  import { checkForUpdate, getUpdateChannel, setUpdateChannel } from "$lib/updater";
  import { cn } from "$lib/utils";

  let updateChecking = $state(false);
  let betaUpdates = $state(getUpdateChannel() === "beta");
  // The last check in this session: undefined = not checked yet, null = up to date, otherwise the version found.
  let latestVersion = $state<string | null | undefined>(undefined);

  const status = $derived(
    latestVersion === undefined
      ? "noch nicht geprüft"
      : latestVersion === null
        ? "aktuell"
        : `v${latestVersion} verfügbar`,
  );

  function onBetaUpdatesChange(enabled: boolean) {
    try {
      setUpdateChannel(enabled ? "beta" : "stable");
    } catch (e) {
      betaUpdates = !enabled;
      toast.error("Einstellung nicht gespeichert", errorMessage(e));
      return;
    }
    if (enabled) void onCheckUpdate();
  }

  async function onCheckUpdate() {
    updateChecking = true;
    try {
      const result = await checkForUpdate();
      if (result.available) {
        latestVersion = result.version;
        toast.action(
          `Update v${result.version} verfügbar`,
          {
            label: "Installieren",
            onClick: () => result.install(),
          },
          { description: "Klick zum Herunterladen und Neustarten.", duration: PERSISTENT_TOAST },
        );
      } else {
        latestVersion = null;
        toast.success("Bereits aktuell.", `Installierte Version: v${appVersion}`);
      }
    } catch (e) {
      toast.error("Update-Prüfung fehlgeschlagen", errorMessage(e));
    } finally {
      updateChecking = false;
    }
  }
</script>

<SettingsShell
  page="/settings/updates"
  description="Zettel prüft beim Start, ob es eine neue Version gibt."
>
  <dl class="mb-5 grid max-w-sm grid-cols-[auto_1fr] gap-x-[18px] gap-y-1.5">
    <dt class="text-muted-foreground">Installiert</dt>
    <dd class="m-0 text-right font-semibold tabular-nums">v{appVersion}</dd>
    <dt class="text-muted-foreground">Stand</dt>
    <dd class="m-0 text-right font-semibold">{status}</dd>
  </dl>

  <Button type="button" variant="outline" onclick={onCheckUpdate} disabled={updateChecking}>
    <RefreshCw class={cn("size-4", updateChecking && "animate-spin")} />
    {updateChecking ? "Prüfe…" : "Nach Updates suchen"}
  </Button>

  <div class="mt-6 border-t pt-5">
    <CheckField
      bind:checked={betaUpdates}
      onCheckedChange={onBetaUpdatesChange}
      disabled={updateChecking}
      label="Beta-Updates erhalten"
      hint="Release Candidates vor dem offiziellen Release erhalten. Beim Abschalten bleibt die installierte Version, bis eine neuere stabile Version erscheint."
    />
  </div>
</SettingsShell>
