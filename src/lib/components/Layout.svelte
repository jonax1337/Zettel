<script lang="ts">
  import { push, router } from "svelte-spa-router";
  import { onMount, type Snippet } from "svelte";
  import { getCurrentWindow } from "@tauri-apps/api/window";
  import { FlaskConical } from "$lib/brand-icons";
  import { Toaster, Titlebar, CommandPalette } from "$lib/ui";
  import { isSandboxActive } from "$lib/db/client";
  import { loadSettings } from "$lib/db/queries";
  import { maybeRunAutoBackup } from "$lib/utils/auto-backup";
  import { isMac } from "$lib/utils/platform";
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
    if (isOnboardingDismissed()) return;
    try {
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

  function isEditable(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false;
    if (target.dataset.commandPaletteInput !== undefined) return false;
    return ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) || target.isContentEditable;
  }

  function onGlobalKey(e: KeyboardEvent) {
    const modifierPressed = isMac ? e.metaKey : e.ctrlKey;
    if (!modifierPressed || e.key.toLowerCase() !== "k") return;
    if (paletteOpen || isEditable(e.target)) return;
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
        onclick={() => push("/settings")}
        class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider bg-warning/20 text-warning border border-warning/40 hover:bg-warning/30 transition-colors cursor-pointer"
        title="Sandbox aktiv – zu den Einstellungen"
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

<Toaster />
