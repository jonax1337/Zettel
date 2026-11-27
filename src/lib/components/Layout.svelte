<script lang="ts">
  import { errorMessage } from "$lib/utils/error-message";
  import { push, router } from "svelte-spa-router";
  import { onMount, type Snippet } from "svelte";
  import { getCurrentWindow } from "@tauri-apps/api/window";
  import { FlaskConical } from "$lib/brand-icons";
  import { Toaster, Titlebar, CommandPalette, ConfirmDialog, toast } from "$lib/ui";
  import { isSandboxActive } from "$lib/db/client";
  import { loadSettings } from "$lib/db/queries";
  import { sealPendingInvoices } from "$lib/db/seals";
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
  let mainEl = $state<HTMLElement | null>(null);

  // Each page starts at the top; the scroll container outlives the route.
  $effect(() => {
    void router.location;
    mainEl?.scrollTo({ top: 0 });
  });

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

  async function sealUnsealedInvoices() {
    try {
      const sealed = await sealPendingInvoices();
      if (sealed > 0) {
        toast.show(
          sealed === 1
            ? "1 ausgestellte Rechnung wurde nachträglich versiegelt."
            : `${sealed} ausgestellte Rechnungen wurden nachträglich versiegelt.`,
        );
      }
    } catch (e) {
      console.error("Sealing issued invoices failed", e);
      toast.error("Rechnungen konnten nicht versiegelt werden", errorMessage(e));
    }
  }

  onMount(async () => {
    sandbox = await isSandboxActive();
    openOnboardingOnFreshInstall();
    sealUnsealedInvoices();
    // Sandbox data is disposable, so it is never backed up.
    if (!sandbox) {
      maybeRunAutoBackup()
        .then((outcome) => {
          if (outcome.status === "failed") {
            toast.error("Auto-Backup fehlgeschlagen", outcome.message);
          }
        })
        .catch((e) => console.error("Auto-backup failed", e));
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
        class="inline-flex h-5 items-center gap-1.5 rounded-full bg-[rgb(230_181_102/16%)] px-2 text-[11px] font-bold text-[#e6b566] transition-colors hover:bg-[rgb(230_181_102/26%)] cursor-pointer"
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

    <main bind:this={mainEl} class="min-w-0 flex-1 overflow-auto [scrollbar-gutter:stable]">
      <div class="@container mx-auto max-w-[1360px] px-7 pt-7 pb-24 min-[1181px]:px-10">
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
