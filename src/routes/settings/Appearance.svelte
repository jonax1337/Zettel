<script lang="ts">
  import SettingsShell from "./SettingsShell.svelte";
  import {
    Card,
    CardHeader,
    CardTitle,
    CardDescription,
    CardContent,
  } from "$lib/ui";
  import { Sun, Moon, Monitor, MonitorCog, Check } from "@lucide/svelte";
  import { theme, type ThemeMode } from "$lib/theme.svelte";
  import { accent, ACCENT_PRESETS, type AccentKey } from "$lib/accent.svelte";

  const themeModes: { value: ThemeMode; label: string; icon: typeof Sun }[] = [
    { value: "system", label: "System", icon: Monitor },
    { value: "light", label: "Hell", icon: Sun },
    { value: "dark", label: "Dunkel", icon: Moon },
  ];

  const accentKeys: AccentKey[] = [
    "system",
    "slate",
    "indigo",
    "violet",
    "rose",
    "emerald",
    "amber",
    "sky",
  ];

  const accentLabel = (k: AccentKey) =>
    k === "system" ? "System" : ACCENT_PRESETS[k].label;
</script>

<SettingsShell
  title="Darstellung"
  description="Theme und Akzentfarbe der App-Oberfläche."
>
  <div class="space-y-6">
    <Card>
      <CardHeader>
        <CardTitle>Theme</CardTitle>
        <CardDescription>
          Hell, dunkel oder Automatik nach Systemvorgabe.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div class="grid grid-cols-3 gap-3">
          {#each themeModes as mode (mode.value)}
            {@const active = theme.mode === mode.value}
            {@const Icon = mode.icon}
            <button
              type="button"
              onclick={() => theme.set(mode.value)}
              class={[
                "flex flex-col items-center justify-center gap-2 rounded-lg border bg-card p-4 transition-all hover:bg-muted/30",
                active
                  ? "border-foreground/40 ring-2 ring-ring/40 ring-offset-2 ring-offset-background"
                  : "border-border",
              ].join(" ")}
              aria-pressed={active}
            >
              <Icon class="size-5 text-muted-foreground" />
              <span class="text-sm font-medium">{mode.label}</span>
            </button>
          {/each}
        </div>
      </CardContent>
    </Card>

    <Card>
      <CardHeader>
        <CardTitle>Akzentfarbe</CardTitle>
        <CardDescription>
          Akzentfarbe der Oberfläche. Beeinflusst nur die App — Rechnungs-PDFs bleiben unverändert.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div class="flex flex-wrap items-center gap-2">
          {#each accentKeys as k (k)}
            {@const active = accent.key === k}
            {@const swatch = k === "system" ? null : ACCENT_PRESETS[k].swatch}
            <button
              type="button"
              onclick={() => accent.set(k, theme.resolved)}
              title={accentLabel(k)}
              class={[
                "group relative grid size-10 place-items-center rounded-full border transition-all duration-150 active:scale-90",
                active
                  ? "border-foreground/60 ring-2 ring-ring/40 ring-offset-2 ring-offset-background"
                  : "border-border hover:border-foreground/40",
              ].join(" ")}
              style={swatch ? `background-color: ${swatch};` : undefined}
              aria-label={accentLabel(k)}
              aria-pressed={active}
            >
              {#if k === "system"}
                <MonitorCog class="size-4 text-muted-foreground" />
              {:else if active}
                <Check class="size-4 text-white drop-shadow-sm" />
              {/if}
            </button>
          {/each}
        </div>
        <p class="text-xs text-muted-foreground mt-3">
          „System" übernimmt deine Windows-Akzentfarbe. Auf macOS/Linux fällt das auf das Standard-Preset zurück, bis Plattform-APIs ergänzt sind.
        </p>
      </CardContent>
    </Card>
  </div>
</SettingsShell>
