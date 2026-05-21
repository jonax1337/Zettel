<script lang="ts">
  import { link, router } from "svelte-spa-router";
  import {
    LayoutDashboard,
    Users,
    Truck,
    FileText,
    FileSignature,
    FileInput,
    FileWarning,
    Repeat,
    Download,
    BarChart3,
    Package,
    Settings as SettingsIcon,
    Monitor,
    Sun,
    Moon,
  } from "@lucide/svelte";
  import { Toaster, DropdownMenu, DropdownItem, Titlebar, CommandPalette } from "$lib/ui";
  import { Search } from "@lucide/svelte";
  import { theme, type ThemeMode } from "$lib/theme.svelte";
  import { cn } from "$lib/utils";
  import { getCurrentWindow } from "@tauri-apps/api/window";
  import { onMount } from "svelte";
  import { version as appVersion } from "../../../package.json";
  import { isSandboxActive } from "$lib/db/client";
  import { loadSettings } from "$lib/db/queries";
  import { FlaskConical } from "@lucide/svelte";
  import { push } from "svelte-spa-router";
  import OnboardingWizard from "./OnboardingWizard.svelte";

  let sandbox = $state(false);
  let paletteOpen = $state(false);
  let onboardingOpen = $state(false);

  const ONBOARDING_DISMISSED_KEY = "zettel.onboarding.dismissed";

  async function checkOnboarding() {
    try {
      const dismissed =
        typeof localStorage !== "undefined" &&
        localStorage.getItem(ONBOARDING_DISMISSED_KEY) === "1";
      if (dismissed) return;
      const s = await loadSettings();
      // Trigger nur bei "frischer" Installation — leerer Firmenname ist das
      // verlässlichste Signal (Standard ist leer-String, kein NULL).
      if (s.companyName.trim() === "") {
        onboardingOpen = true;
      }
    } catch {
      /* ignore — sandbox/dev mode etc. */
    }
  }

  onMount(async () => {
    sandbox = await isSandboxActive();
    checkOnboarding();
  });

  function isEditable(el: EventTarget | null): boolean {
    if (!(el instanceof HTMLElement)) return false;
    if (el.dataset.commandPaletteInput !== undefined) return false;
    const tag = el.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
    if (el.isContentEditable) return true;
    return false;
  }

  function onGlobalKey(e: KeyboardEvent) {
    const isMac =
      typeof navigator !== "undefined" && /Mac|iPhone|iPad/i.test(navigator.platform);
    const mod = isMac ? e.metaKey : e.ctrlKey;
    if (mod && (e.key === "k" || e.key === "K")) {
      if (paletteOpen) return;
      if (isEditable(e.target)) return;
      e.preventDefault();
      paletteOpen = true;
    }
  }

  let { children } = $props();

  let windowTitle = $state("Zettel");

  onMount(() => {
    getCurrentWindow()
      .title()
      .then((t) => (windowTitle = t));
  });

  const navGroups: Array<{
    label: string | null;
    items: Array<{ href: string; label: string; icon: typeof LayoutDashboard }>;
  }> = [
    {
      label: null,
      items: [{ href: "/", label: "Dashboard", icon: LayoutDashboard }],
    },
    {
      label: "Stammdaten",
      items: [
        { href: "/customers", label: "Kunden", icon: Users },
        { href: "/vendors", label: "Lieferanten", icon: Truck },
        { href: "/catalog", label: "Katalog", icon: Package },
      ],
    },
    {
      label: "Ausgangsbelege",
      items: [
        { href: "/offers", label: "Angebote", icon: FileSignature },
        { href: "/invoices", label: "Rechnungen", icon: FileText },
        { href: "/reminders", label: "Mahnungen", icon: FileWarning },
        { href: "/recurring", label: "Vorlagen", icon: Repeat },
      ],
    },
    {
      label: "Eingangsbelege",
      items: [{ href: "/expenses", label: "Eingangsrechnungen", icon: FileInput }],
    },
    {
      label: "Auswertung",
      items: [
        { href: "/reports/ustva", label: "UStVA", icon: BarChart3 },
        { href: "/export", label: "DATEV-Export", icon: Download },
      ],
    },
    {
      label: "System",
      items: [{ href: "/settings", label: "Einstellungen", icon: SettingsIcon }],
    },
  ];

  function isActive(href: string) {
    const loc = router.location;
    if (href === "/") return loc === "/";
    return loc === href || loc.startsWith(href + "/");
  }

  const ThemeIcon = $derived(
    theme.mode === "system" ? Monitor : theme.mode === "light" ? Sun : Moon,
  );
  const themeLabel: Record<ThemeMode, string> = {
    system: "System",
    light: "Hell",
    dark: "Dunkel",
  };
</script>

<svelte:window onkeydown={onGlobalKey} />

<div class="flex flex-col h-full bg-background text-foreground">
  <Titlebar title={windowTitle}>
    {#snippet actions()}
      <button
        type="button"
        onclick={() => (paletteOpen = true)}
        aria-label="Globale Suche (Strg+K)"
        title="Globale Suche (Strg+K)"
        class="inline-flex items-center gap-1.5 h-7 px-2 rounded-md text-xs text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
      >
        <Search class="size-3.5" />
        <kbd class="hidden md:inline text-[10px] font-medium opacity-70">Strg K</kbd>
      </button>
    {/snippet}
    {#if sandbox}
      <button
        type="button"
        onclick={() => push("/settings")}
        class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider bg-amber-500/20 text-amber-900 dark:text-amber-200 border border-amber-500/40 hover:bg-amber-500/30 transition-colors cursor-pointer"
        title="Sandbox aktiv – zu den Einstellungen"
        style="-webkit-app-region: no-drag"
      >
        <FlaskConical class="size-3" />
        Sandbox
      </button>
    {/if}
  </Titlebar>

  <div class="flex flex-1 min-h-0">
    <aside class="w-60 shrink-0 border-r bg-card/50 flex flex-col">
        <nav class="flex-1 p-2 flex flex-col gap-4 pt-4 overflow-y-auto">
          {#each navGroups as group, gi (gi)}
            <div class="flex flex-col gap-0.5">
              {#if group.label}
                <div class="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                  {group.label}
                </div>
              {/if}
              {#each group.items as item (item.href)}
                {@const active = isActive(item.href)}
                <a
                  href={item.href}
                  use:link
                  class={cn(
                    "group relative flex items-center gap-2.5 rounded-md px-3 h-9 text-sm font-medium transition-all duration-200",
                    "before:absolute before:left-0 before:top-1/2 before:-translate-y-1/2 before:w-[3px] before:rounded-r-full before:bg-primary before:transition-all before:duration-300",
                    active
                      ? "bg-accent text-accent-foreground before:h-5 before:opacity-100"
                      : "text-muted-foreground hover:bg-accent/60 hover:text-foreground before:h-0 before:opacity-0",
                  )}
                >
                  <item.icon class={cn("size-4 shrink-0 transition-transform duration-200", active && "scale-110")} />
                  <span>{item.label}</span>
                </a>
              {/each}
            </div>
          {/each}
        </nav>

        <div class="p-2 border-t flex items-center justify-between">
          <span class="px-2 text-[10px] text-muted-foreground">
            v{appVersion} · MIT
          </span>
          <DropdownMenu align="end" side="top">
            {#snippet trigger()}
              <button
                type="button"
                class="inline-flex items-center justify-center size-8 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                aria-label="Theme: {themeLabel[theme.mode]}"
              >
                <ThemeIcon class="size-4" />
              </button>
            {/snippet}
            <DropdownItem onSelect={() => theme.set("system")}>
              <Monitor class="size-4" />
              <span>System</span>
              {#if theme.mode === "system"}
                <span class="ml-auto text-xs text-muted-foreground">✓</span>
              {/if}
            </DropdownItem>
            <DropdownItem onSelect={() => theme.set("light")}>
              <Sun class="size-4" />
              <span>Hell</span>
              {#if theme.mode === "light"}
                <span class="ml-auto text-xs text-muted-foreground">✓</span>
              {/if}
            </DropdownItem>
            <DropdownItem onSelect={() => theme.set("dark")}>
              <Moon class="size-4" />
              <span>Dunkel</span>
              {#if theme.mode === "dark"}
                <span class="ml-auto text-xs text-muted-foreground">✓</span>
              {/if}
            </DropdownItem>
          </DropdownMenu>
        </div>
      </aside>

    <main class="flex-1 overflow-auto">
      <div class="mx-auto max-w-6xl px-8 py-8">
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
