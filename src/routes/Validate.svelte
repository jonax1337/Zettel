<script lang="ts">
  import { errorMessage } from "$lib/utils/error-message";
  import { onMount } from "svelte";
  import { open } from "@tauri-apps/plugin-dialog";
  import { Button, toast } from "$lib/ui";
  import { cn } from "$lib/utils";
  import {
    getValidatorStatus,
    validatePdf,
    validateXml,
    type ValidationReport,
    type ValidatorStatus,
  } from "$lib/validator";
  import { FileSearch, FileUp } from "$lib/brand-icons";
  import Notice from "./parts/reports/Notice.svelte";
  import ReportsShell from "./parts/reports/ReportsShell.svelte";
  import ValidationResult from "./parts/reports/ValidationResult.svelte";
  import { listenForFileDrop } from "./parts/entity/file-drop";
  import { firstValidatableFile, VALIDATOR_UNAVAILABLE_MESSAGE } from "./parts/reports/validate-files";

  let status = $state<ValidatorStatus | null>(null);
  let report = $state<ValidationReport | null>(null);
  let loading = $state(false);
  let activeFile = $state<string | null>(null);
  let dropHover = $state(false);

  const canValidate = $derived(!!status?.installed && !!status?.hasJava);

  onMount(() => {
    loadStatus();

    return listenForFileDrop({ onHover: (over) => (dropHover = over), onDrop: handleDrop });
  });

  async function loadStatus() {
    try {
      status = await getValidatorStatus();
    } catch (e) {
      toast.error("Status konnte nicht geladen werden", errorMessage(e));
    }
  }

  function handleDrop(paths: string[]) {
    const file = firstValidatableFile(paths);
    if (!file) {
      if (paths.length > 0) toast.warning("Nur PDF- oder XML-Dateien können geprüft werden.");
      return;
    }
    if (!canValidate || loading) {
      toast.warning("Die Prüfung ist gerade nicht verfügbar.");
      return;
    }
    runValidate(file);
  }

  async function pickFile(): Promise<string | null> {
    const selected = await open({
      multiple: false,
      directory: false,
      filters: [
        { name: "E-Rechnung", extensions: ["pdf", "xml"] },
        { name: "PDF", extensions: ["pdf"] },
        { name: "XML", extensions: ["xml"] },
      ],
    });
    return typeof selected === "string" ? selected : null;
  }

  async function pickAndValidate() {
    try {
      const path = await pickFile();
      if (path) await runValidate(path);
    } catch (e) {
      toast.error("Datei-Dialog fehlgeschlagen", errorMessage(e));
    }
  }

  async function runValidate(path: string) {
    loading = true;
    report = null;
    activeFile = path;
    try {
      report = path.toLowerCase().endsWith(".xml")
        ? await validateXml(path)
        : await validatePdf(path);
    } catch (e) {
      toast.error("Validierung fehlgeschlagen", errorMessage(e));
    } finally {
      loading = false;
    }
  }
</script>

<ReportsShell active="/validate">
  <div class="max-w-[860px]">
    {#if status && !canValidate}
      <Notice tone="warn">
        <b class="font-bold">Validator nicht einsatzbereit.</b>
        {VALIDATOR_UNAVAILABLE_MESSAGE}
      </Notice>
    {/if}

    <div
      class={cn(
        "flex items-center gap-3.5 rounded-xl border-[1.5px] border-dashed px-4.5 py-4 text-muted-foreground transition-colors",
        dropHover ? "border-primary bg-surface" : "border-line-strong",
      )}
    >
      <FileUp class="size-6 shrink-0" />
      <div class="min-w-0 flex-1">
        <b class="text-foreground">PDF oder XML hierher ziehen.</b>
        Die Prüfung läuft lokal gegen die offiziellen KoSIT- und XRechnung-Regeln, nichts verlässt deinen Rechner.
      </div>
      <Button onclick={pickAndValidate} disabled={!canValidate || loading}>Datei prüfen</Button>
    </div>
    <p class="mt-2 text-[13px] text-muted-foreground">
      PDF mit eingebettetem ZUGFeRD- oder Factur-X-XML oder reine XRechnung-XML.
      {#if status && !canValidate}
        Solange die Prüfung nicht verfügbar ist, kann hier nichts geprüft werden.
      {/if}
    </p>

    {#if loading}
      <div class="mt-8 flex items-center gap-3 text-sm text-muted-foreground">
        <FileSearch class="size-5 shrink-0 animate-pulse" />
        <span class="min-w-0 break-all">Prüfe {activeFile}…</span>
      </div>
    {/if}

    {#if report && activeFile}
      <ValidationResult {report} filePath={activeFile} />
    {/if}
  </div>
</ReportsShell>