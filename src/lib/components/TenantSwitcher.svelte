<script lang="ts">
  import { onMount } from "svelte";
  import { invoke } from "@tauri-apps/api/core";
  import { open, save } from "@tauri-apps/plugin-dialog";
  import {
    Button,
    Input,
    Label,
    Dialog,
    DropdownMenu,
    DropdownItem,
    DropdownSeparator,
    toast,
  } from "$lib/ui";
  import {
    ChevronsUpDown,
    Check,
    Plus,
    Trash2,
    Database,
    FolderOpen,
    FilePlus2,
  } from "@lucide/svelte";

  type TenantEntry = {
    id: string;
    label: string;
    path: string;
    current: boolean;
  };

  let tenants = $state<TenantEntry[]>([]);
  let manageOpen = $state(false);
  let busy = $state(false);

  let newLabel = $state("");
  let newPath = $state("");

  const current = $derived(tenants.find((t) => t.current) ?? null);

  function initials(label: string): string {
    const parts = label.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return "?";
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }

  async function loadTenants() {
    try {
      tenants = await invoke<TenantEntry[]>("list_tenants");
    } catch {
      tenants = [];
    }
  }

  onMount(loadTenants);

  async function switchTenant(id: string) {
    if (busy) return;
    const target = tenants.find((t) => t.id === id);
    if (!target || target.current) return;
    busy = true;
    try {
      await invoke("set_active_tenant", { id });
      const { relaunch } = await import("@tauri-apps/plugin-process");
      await relaunch();
    } catch (e) {
      toast.error("Wechsel fehlgeschlagen", String(e));
      busy = false;
    }
  }

  async function pickNew() {
    const p = await save({
      title: "Neue Datenbank anlegen",
      defaultPath: "zettel.db",
      filters: [{ name: "SQLite-Datenbank", extensions: ["db"] }],
    });
    if (p) newPath = p;
  }

  async function pickExisting() {
    const p = await open({
      multiple: false,
      directory: false,
      title: "Vorhandene Datenbank wählen",
      filters: [{ name: "SQLite-Datenbank", extensions: ["db", "sqlite"] }],
    });
    if (typeof p === "string") newPath = p;
  }

  async function addAndSwitch() {
    if (busy || !newLabel.trim() || !newPath) return;
    busy = true;
    try {
      const id = await invoke<string>("add_tenant", {
        label: newLabel.trim(),
        path: newPath,
      });
      await invoke("set_active_tenant", { id });
      const { relaunch } = await import("@tauri-apps/plugin-process");
      await relaunch();
    } catch (e) {
      toast.error("Tenant konnte nicht angelegt werden", String(e));
      busy = false;
    }
  }

  async function removeTenant(id: string) {
    try {
      await invoke("remove_tenant", { id });
      await loadTenants();
      toast.success("Tenant entfernt", "Die DB-Datei selbst bleibt erhalten.");
    } catch (e) {
      toast.error("Entfernen fehlgeschlagen", String(e));
    }
  }

  function openManage() {
    newLabel = "";
    newPath = "";
    manageOpen = true;
  }
</script>

<div class="p-2 border-t">
  <DropdownMenu align="start" side="top" class="w-56">
    {#snippet trigger()}
      <button
        type="button"
        class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-accent transition-colors"
        title="Tenant wechseln"
      >
        <span
          class="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary text-[11px] font-semibold"
        >
          {initials(current?.label ?? "Standard")}
        </span>
        <span class="min-w-0 flex-1">
          <span class="block truncate text-sm font-medium leading-tight">
            {current?.label ?? "Standard"}
          </span>
          <span class="block truncate text-[10px] text-muted-foreground leading-tight">
            {current && current.path ? current.path : "Lokale Datenbank"}
          </span>
        </span>
        <ChevronsUpDown class="size-4 shrink-0 text-muted-foreground" />
      </button>
    {/snippet}

    <div class="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
      Tenants
    </div>
    {#each tenants as t (t.id)}
      <DropdownItem onSelect={() => switchTenant(t.id)}>
        <span
          class="flex size-5 shrink-0 items-center justify-center rounded bg-primary/10 text-primary text-[9px] font-semibold"
        >
          {initials(t.label)}
        </span>
        <span class="truncate">{t.label}</span>
        {#if t.current}
          <Check class="ml-auto size-4 text-primary" />
        {/if}
      </DropdownItem>
    {/each}
    <DropdownSeparator />
    <DropdownItem onSelect={openManage}>
      <Plus class="size-4" />
      <span>Tenants verwalten…</span>
    </DropdownItem>
  </DropdownMenu>
</div>

<Dialog
  bind:open={manageOpen}
  title="Tenants"
  description="Mehrere getrennte Datenbanken — z. B. pro Mandant. Lege die DB-Datei in einem Cloud-Ordner (OneDrive o. ä.) ab, um sie geräteübergreifend zu nutzen. Wichtig: nicht gleichzeitig auf zwei Geräten öffnen."
>
  <div class="space-y-4">
    <div class="space-y-1">
      {#each tenants as t (t.id)}
        <div class="flex items-center gap-2 rounded-md border px-3 py-2">
          <span
            class="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary text-[11px] font-semibold"
          >
            {initials(t.label)}
          </span>
          <div class="min-w-0 flex-1">
            <div class="truncate text-sm font-medium">
              {t.label}
              {#if t.current}
                <span class="ml-1 text-[10px] font-normal text-primary">· aktiv</span>
              {/if}
            </div>
            <div class="truncate text-[10px] text-muted-foreground font-mono">
              {t.path || "Lokale Standard-Datenbank"}
            </div>
          </div>
          {#if !t.current}
            <Button variant="outline" size="sm" disabled={busy} onclick={() => switchTenant(t.id)}>
              Wechseln
            </Button>
          {/if}
          {#if t.id !== "default"}
            <button
              type="button"
              onclick={() => removeTenant(t.id)}
              class="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
              title="Tenant entfernen (Datei bleibt erhalten)"
              aria-label="Tenant entfernen"
            >
              <Trash2 class="size-4" />
            </button>
          {/if}
        </div>
      {/each}
    </div>

    <div class="space-y-3 rounded-md border border-dashed p-3">
      <div class="flex items-center gap-2 text-sm font-medium">
        <Database class="size-4" /> Neuen Tenant hinzufügen
      </div>
      <div class="space-y-1.5">
        <Label>Bezeichnung</Label>
        <Input bind:value={newLabel} placeholder="z. B. Firma A" />
      </div>
      <div class="space-y-1.5">
        <Label>Datenbank-Datei</Label>
        {#if newPath}
          <div class="truncate text-xs text-muted-foreground font-mono">{newPath}</div>
        {/if}
        <div class="flex gap-2">
          <Button variant="outline" size="sm" onclick={pickNew}>
            <FilePlus2 class="size-4" /> Neue DB anlegen…
          </Button>
          <Button variant="outline" size="sm" onclick={pickExisting}>
            <FolderOpen class="size-4" /> Vorhandene wählen…
          </Button>
        </div>
      </div>
    </div>
  </div>

  {#snippet footer()}
    <Button variant="ghost" onclick={() => (manageOpen = false)}>Schließen</Button>
    <Button disabled={busy || !newLabel.trim() || !newPath} onclick={addAndSwitch}>
      Hinzufügen & wechseln
    </Button>
  {/snippet}
</Dialog>
