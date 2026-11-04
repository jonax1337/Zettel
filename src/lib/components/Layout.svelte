<script lang="ts">
  import { push, router } from "svelte-spa-router";
  import { onMount, type Snippet } from "svelte";
  import { getCurrentWindow } from "@tauri-apps/api/window";
  import { FlaskConical } from "$lib/brand-icons";
  import { Toaster, Titlebar, CommandPalette, ConfirmDialog } from "$lib/ui";
  import { isSandboxActive } from "$lib/db/client";
  import { loadSettings } from "$lib/db/queries";
  import { maybeRunAutoBackup } from "$lib/utils/auto-backup";
  import { isMac } from "$lib/utils/platform";
  import { leavePage, pendingNavigation, stayOnPage } from "$lib/utils/unsaved-guard.svelte";
  import OnboardingWizard from "./OnboardingWizard.svelte";
  import Sidebar from "./Sidebar.svelte";
  import { isOnboardingDismissed } from "./onboarding-dismissal";

  let { children }: { children?: Snippet } = $props();

  let sandbox = $state(false);
  let paletteOpen = $state(false);
  let onboardingOpen = $state(false);
  let windowTitle = $state("Zettel");

  // An empty company name is the most reliable sign of a fresh installation
  // (the default is an empty string, not NULL).
  async function openOnboardingOnFreshInstall() {
    try {
      if (await isOnboardingDismissed()) return;
      const settings = await loadSettings();
      if (settings.companyName.trim() === "") onboardingOpen = true;
    } catch (e) {
      console.error("Onboarding check failed", e);
    }
  }

  onMount(async () => {
    sandbox = await isSandboxActive();
    openOnboardingOnFreshInstall();
    // Sandbox data is disposable, so it is never backed up.
    if (!sandbox) {
      maybeRunAutoBackup().catch((e) => console.error("Auto-backup failed", e));
    }
  });

  onMount(() => {
    getCurrentWindow()
      .title()
      .then((title) => (windowTitle = title))
      .catch((e) => console.error("Reading the window title failed", e));
  });

  // The modifier makes Ctrl/Cmd+K unambiguous, so it opens the palette even while a field has focus.
  function onGlobalKey(e: KeyboardEvent) {
    const modifierPressed = isMac ? e.metaKey : e.ctrlKey;
    if (!modifierPressed || e.key.toLowerCase() !== "k") return;
    if (paletteOpen) return;
    e.preventDefault();
    paletteOpen = true;
  }
</script>

<svelte:window onkeydown={onGlobalKey} />

<div class="flex flex-col h-full bg-background text-foreground">
  <Titlebar title={windowTitle}>
    {#if sandbox}
      <button
        type="button"
        onclick={() => push("/settings/data")}
        class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider bg-warning/20 text-warning border border-warning/40 hover:bg-warning/30 transition-colors cursor-pointer"
        title="Sandbox aktiv – zu Einstellungen → Daten"
        style="-webkit-app-region: no-drag"
      >
        <FlaskConical class="size-3" />
        Sandbox
      </button>
    {/if}
  </Titlebar>

  <div class="flex flex-1 min-h-0">
    <Sidebar onOpenSearch={() => (paletteOpen = true)} />

    <main class="flex-1 overflow-auto">
      <div class="@container mx-auto max-w-6xl px-8 py-8">
        {#key router.location}
          <div class="animate-route">
            {@render children?.()}
          </div>
        {/key}
      </div>
    </main>
  </div>
</div>

<CommandPalette bind:open={paletteOpen} />

{#if onboardingOpen}
  <OnboardingWizard
    onDone={() => (onboardingOpen = false)}
    onDismiss={() => (onboardingOpen = false)}
  />
{/if}

<ConfirmDialog
  bind:open={
    () => pendingNavigation.target !== null,
    (isOpen) => {
      if (!isOpen && pendingNavigation.target !== null) stayOnPage();
    }
  }
  title="Ungespeicherte Änderungen"
  description="Wenn du diese Seite verlässt, gehen deine Änderungen verloren."
  confirmLabel="Verwerfen und verlassen"
  cancelLabel="Auf der Seite bleiben"
  destructive
  onConfirm={leavePage}
  onCancel={stayOnPage}
/>

<Toaster />
