<script lang="ts">
  import { ShieldCheck, ShieldAlert, Shield, ShieldX } from "@lucide/svelte";
  import { Badge } from "$lib/ui";

  type Props = {
    status: "valid" | "invalid" | "unavailable" | null | undefined;
    findingsCount?: number | null;
    validatedAt?: number | null;
    compact?: boolean;
  };

  let { status, findingsCount, validatedAt, compact = false }: Props = $props();

  const formatTime = (unix: number | null | undefined) => {
    if (!unix) return "";
    return new Date(unix * 1000).toLocaleString("de-DE", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };
</script>

{#if status === "valid"}
  <Badge variant="default" class="gap-1.5 bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/20 border-emerald-500/30">
    <ShieldCheck class="size-3.5" />
    {#if compact}KoSIT OK{:else}ZUGFeRD-konform (KoSIT){/if}
  </Badge>
{:else if status === "invalid"}
  <Badge variant="destructive" class="gap-1.5">
    <ShieldX class="size-3.5" />
    {#if compact}
      {findingsCount ?? "?"} Findings
    {:else}
      Validierung fehlgeschlagen{findingsCount ? ` (${findingsCount} Findings)` : ""}
    {/if}
  </Badge>
{:else if status === "unavailable"}
  <span title="Validator nicht installiert oder Java fehlt" class="inline-flex">
    <Badge variant="outline" class="gap-1.5 text-muted-foreground">
      <Shield class="size-3.5" />
      {#if compact}nicht validiert{:else}Nicht validiert (Validator offline){/if}
    </Badge>
  </span>
{:else}
  <Badge variant="outline" class="gap-1.5 text-muted-foreground">
    <ShieldAlert class="size-3.5" />
    {compact ? "—" : "Noch nicht validiert"}
  </Badge>
{/if}

{#if validatedAt && !compact}
  <span class="text-xs text-muted-foreground ml-1.5">
    · {formatTime(validatedAt)}
  </span>
{/if}
