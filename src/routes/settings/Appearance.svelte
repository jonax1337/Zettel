<script lang="ts">
  import SettingsShell from "./SettingsShell.svelte";
  import {
    Card,
    CardHeader,
    CardTitle,
    CardDescription,
    CardContent,
  } from "$lib/ui";
  import { Sun, Moon, Monitor } from "$lib/brand-icons";
  import { theme, type ThemeMode } from "$lib/theme.svelte";
  import { cn } from "$lib/utils";

  const themeModes: { value: ThemeMode; label: string; icon: typeof Sun }[] = [
    { value: "system", label: "System", icon: Monitor },
    { value: "light", label: "Hell", icon: Sun },
    { value: "dark", label: "Dunkel", icon: Moon },
  ];
</script>

<SettingsShell title="Darstellung" description="Theme der App-Oberfläche.">
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
              class={cn(
                "flex flex-col items-center justify-center gap-2 rounded-xl border bg-card p-4 transition-all hover:bg-muted/30",
                active
                  ? "border-primary ring-2 ring-ring/40 ring-offset-2 ring-offset-background"
                  : "border-border",
              )}
              aria-pressed={active}
            >
              <Icon class={cn("size-5", active ? "text-primary" : "text-muted-foreground")} />
              <span class="text-sm font-bold">{mode.label}</span>
            </button>
          {/each}
        </div>
      </CardContent>
    </Card>
  </div>
</SettingsShell>
