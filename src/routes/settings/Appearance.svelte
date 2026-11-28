<script lang="ts">
  import SettingsShell from "./SettingsShell.svelte";
  import { Sun, Moon, Monitor } from "$lib/brand-icons";
  import { theme, type ThemeMode } from "$lib/theme.svelte";
  import { cn } from "$lib/utils";

  const themeModes: { value: ThemeMode; label: string; icon: typeof Sun }[] = [
    { value: "system", label: "Wie das System", icon: Monitor },
    { value: "light", label: "Hell", icon: Sun },
    { value: "dark", label: "Dunkel", icon: Moon },
  ];
</script>

<SettingsShell page="/settings/appearance" description="So sieht Zettel auf diesem Rechner aus. Die Auswahl gilt sofort.">
  <div role="group" aria-label="Theme" class="grid grid-cols-3 gap-2.5">
    {#each themeModes as mode (mode.value)}
      {@const active = theme.mode === mode.value}
      {@const Icon = mode.icon}
      <button
        type="button"
        onclick={() => theme.set(mode.value)}
        aria-pressed={active}
        class={cn(
          "grid h-[72px] place-items-center content-center gap-1.5 rounded-xl border font-bold transition-colors hover:bg-surface",
          active ? "border-foreground shadow-[inset_0_0_0_1px_var(--color-foreground)]" : "border-input",
        )}
      >
        <Icon class="size-5" />
        {mode.label}
      </button>
    {/each}
  </div>
</SettingsShell>
