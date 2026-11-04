<script lang="ts">
  import { onMount } from "svelte";
  import { invoke } from "@tauri-apps/api/core";
  import { open, save } from "@tauri-apps/plugin-dialog";
  import { execute, isSandboxActive } from "$lib/db/client";
  import { loadSettings } from "$lib/db/queries";
  import { relaunchApp } from "$lib/utils/relaunch";
  import { version as appVersion } from "../../../package.json";
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
    Upload,
  } from "$lib/brand-icons";

  const DEFAULT_TENANT_ID = "default";

  type TenantEntry = {
    id: string;
    label: string;
    path: string;
    current: boolean;
  };

  let tenants = $state<TenantEntry[]>([]);
  let companyName = $state("");
  let manageOpen = $state(false);
  let busy = $state(false);
  // The open DB is the sandbox DB, so moving or switching would mix sandbox
  // data into a real tenant.
  let sandbox = $state(false);
  const actionsLocked = $derived(busy || sandbox);

  let newLabel = $state("");
  let newPath = $state("");

  const current = $derived(tenants.find((t) => t.current) ?? null);

  function slugify(s: string): string {
    const map: Record<string, string> = { ä: "ae", ö: "oe", ü: "ue", ß: "ss" };
    const base = s
      .trim()
      .toLowerCase()
      .replace(/[äöüß]/g, (m) => map[m] ?? m)
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    return base || "zettel";
  }

  async function loadTenants() {
    try {
      tenants = await invoke<TenantEntry[]>("list_tenants");
    } catch (e) {
      tenants = [];
      toast.error("Tenants konnten nicht geladen werden", String(e));
    }
  }

  onMount(async () => {
    sandbox = await isSandboxActive();
    await loadTenants();
    try {
      companyName = (await loadSettings()).companyName ?? "";
    } catch (e) {
      console.error("Loading the company name failed", e);
    }
  });

  // The default tenant has no label of its own; the company name stands in for it.
  function tenantDisplayName(t: TenantEntry): string {
    return t.id === DEFAULT_TENANT_ID ? companyName || t.label : t.label;
  }

  async function changeTenantAndRelaunch(failureTitle: string, change: () => Promise<unknown>) {
    busy = true;
    try {
      await change();
      await relaunchApp();
    } catch (e) {
      toast.error(failureTitle, String(e));
      busy = false;
    }
  }

  async function switchTenant(id: string) {
    if (actionsLocked) return;
    const target = tenants.find((t) => t.id === id);
    if (!target || target.current) return;
    await changeTenantAndRelaunch("Wechsel fehlgeschlagen", () =>
      invoke("set_active_tenant", { id }),
    );
  }

  async function pickNew() {
    const p = await save({
      title: "Neue Datenbank anlegen",
      defaultPath: `${slugify(newLabel || companyName)}.db`,
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
    if (actionsLocked || !newLabel.trim() || !newPath) return;
    await changeTenantAndRelaunch("Tenant konnte nicht angelegt werden", async () => {
      const id = await invoke<string>("add_tenant", {
        label: newLabel.trim(),
        path: newPath,
      });
      await invoke("set_active_tenant", { id });
    });
  }

  // Move the *active* DB to a new location (e.g. a cloud folder). Uses
  // VACUUM INTO for a consistent copy of the open DB; the old local file
  // stays behind as a backup.
  async function moveToCloud(t: TenantEntry) {
    if (actionsLocked || !t.current) return;
    const label = tenantDisplayName(t);
    const dest = await save({
      title: "Datenbank verschieben",
      defaultPath: `${slugify(label)}.db`,
      filters: [{ name: "SQLite-Datenbank", extensions: ["db"] }],
    });
    if (!dest) return;
    await changeTenantAndRelaunch("Verschieben fehlgeschlagen", async () => {
      await execute("VACUUM INTO ?", [dest]);
      await invoke("relocate_active_tenant", { path: dest, label });
    });
  }

  async function removeTenant(id: string) {
    if (actionsLocked) return;
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

<div class="p-2">
  <DropdownMenu align="start" side="top" class="w-56" triggerClass="w-full min-w-0">
    {#snippet trigger()}
      <button
        type="button"
        class="flex w-full items-center gap-2 rounded-lg border px-2.5 py-2 text-left hover:bg-accent transition-colors"
        title={current?.path || "Lokale Datenbank"}
      >
        <span class="min-w-0 flex-1 truncate text-sm font-medium">
          {current?.label ?? "Standard"}
        </span>
        <ChevronsUpDown class="size-4 shrink-0 text-muted-foreground" />
      </button>
    {/snippet}

    <div class="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
      Tenants
    </div>
    {#each tenants as t (t.id)}
      <DropdownItem onSelect={() => switchTenant(t.id)} disabled={sandbox && !t.current}>
        <span class="min-w-0 flex-1 truncate">{t.label}</span>
        {#if t.current}
          <Check class="ml-auto size-4 shrink-0 text-primary" />
        {/if}
      </DropdownItem>
    {/each}
    <DropdownItem onSelect={openManage}>
      <Plus class="size-4" />
      <span>Tenants verwalten…</span>
    </DropdownItem>

    <DropdownSeparator />
    <div class="px-2 py-1 text-[10px] text-muted-foreground">v{appVersion} · MIT</div>
  </DropdownMenu>
</div>

<Dialog
  bind:open={manageOpen}
  title="Tenants"
  description="Mehrere getrennte Datenbanken — z. B. pro Mandant. Lege die DB-Datei in einem Cloud-Ordner (OneDrive o. ä.) ab, um sie geräteübergreifend zu nutzen. Wichtig: nicht gleichzeitig auf zwei Geräten öffnen."
>
  <div class="min-w-0 space-y-4">
    {#if sandbox}
      <p class="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning">
        Die Sandbox ist aktiv. Tenants lassen sich erst wieder wechseln, verschieben, anlegen oder
        entfernen, wenn du die Sandbox verlassen hast (Einstellungen → Daten).
      </p>
    {/if}
    <div class="space-y-1">
      {#each tenants as t (t.id)}
        <div class="flex items-center gap-2 rounded-md border px-3 py-2">
          <div class="min-w-0 flex-1">
            <div class="truncate text-sm font-medium">
              {t.label}
              {#if t.current}
                <span class="ml-1 text-[10px] font-normal text-primary">· aktiv</span>
              {/if}
            </div>
            <div
              class="truncate text-[10px] text-muted-foreground font-mono"
              title={t.path || "Lokale Standard-Datenbank"}
            >
              {t.path || "Lokale Standard-Datenbank"}
            </div>
          </div>
          {#if t.current}
            <Button variant="outline" size="sm" disabled={actionsLocked} onclick={() => moveToCloud(t)} title="Datenbank an einen neuen Ort verschieben (z. B. OneDrive)">
              <Upload class="size-4" /> Verschieben…
            </Button>
          {:else}
            <Button variant="outline" size="sm" disabled={actionsLocked} onclick={() => switchTenant(t.id)}>
              Wechseln
            </Button>
          {/if}
          {#if t.id !== DEFAULT_TENANT_ID}
            <button
              type="button"
              onclick={() => removeTenant(t.id)}
              disabled={actionsLocked}
              class="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors disabled:pointer-events-none disabled:opacity-50"
              title="Tenant entfernen (Datei bleibt erhalten)"
              aria-label="Tenant entfernen"
            >
              <Trash2 class="size-4" />
            </button>
          {/if}
        </div>
      {/each}
    </div>

    <p class="text-[11px] text-muted-foreground">
      Beim Verschieben bleibt die bisherige lokale Datei als Sicherung erhalten.
    </p>

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
          <div class="truncate text-xs text-muted-foreground font-mono" title={newPath}>{newPath}</div>
        {/if}
        <div class="flex gap-2">
          <Button variant="outline" size="sm" onclick={pickNew}>
            <FilePlus2 class="size-4" /> Neue DB anlegen…
          </Button>
          <Button variant="outline" size="sm" onclick={pickExisting}>
            <FolderOpen class="size-4" /> Vorhandene wählen…
          </Button>
        </div>
        <p class="text-[11px] text-muted-foreground">
          Der Dateiname wird aus der Bezeichnung vorgeschlagen.
        </p>
      </div>
    </div>
  </div>

  {#snippet footer()}
    <Button variant="ghost" onclick={() => (manageOpen = false)}>Schließen</Button>
    <Button disabled={actionsLocked || !newLabel.trim() || !newPath} onclick={addAndSwitch}>
      Hinzufügen & wechseln
    </Button>
  {/snippet}
</Dialog>
