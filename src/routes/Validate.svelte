<script lang="ts">
  import { onMount } from "svelte";
  import { open } from "@tauri-apps/plugin-dialog";
  import {
    Button,
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    CardDescription,
    Badge,
    toast,
  } from "$lib/ui";
  import {
    getValidatorStatus,
    validatePdf,
    validateXml,
    type ValidationReport,
    type ValidatorStatus,
  } from "$lib/validator";
  import {
    ShieldCheck,
    ShieldAlert,
    FileSearch,
    Upload,
    AlertCircle,
  } from "$lib/brand-icons";

  let status = $state<ValidatorStatus | null>(null);
  let report = $state<ValidationReport | null>(null);
  let loading = $state(false);
  let activeFile = $state<string | null>(null);

  const canValidate = $derived(!!status?.installed && !!status?.hasJava);

  onMount(async () => {
    try {
      status = await getValidatorStatus();
    } catch (e) {
      toast.error("Status konnte nicht geladen werden", String(e));
    }
  });

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
      toast.error("Datei-Dialog fehlgeschlagen", String(e));
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
      toast.error("Validierung fehlgeschlagen", String(e));
    } finally {
      loading = false;
    }
  }
</script>

<div class="flex flex-col gap-6">
  <div>
    <h1 class="text-2xl font-semibold tracking-tight">E-Rechnung validieren</h1>
    <p class="text-sm text-muted-foreground mt-1">
      Lokale Validierung gegen die offiziellen KoSIT/XRechnung-Schematron-Regeln.
      Kein Upload — alles bleibt auf diesem Rechner.
    </p>
  </div>

  {#if status && !canValidate}
    <Card class="border-warning/40 bg-warning/5">
      <CardHeader>
        <CardTitle class="flex items-center gap-2 text-base">
          <AlertCircle class="size-4 text-warning" />
          Validator nicht einsatzbereit
        </CardTitle>
        <CardDescription>
          {#if !status.installed && !status.hasJava}
            Validator-Dateien und Java-Runtime fehlen. Dev-Setup:
            <code class="text-xs">tools/download-validator.sh</code> +
            <code class="text-xs">tools/build-jre.sh</code>.
          {:else if !status.installed}
            KoSIT-Dateien fehlen unter <code class="text-xs">{status.validatorDir}</code>.
            Setup: <code class="text-xs">tools/download-validator.sh</code>.
          {:else}
            Java-Runtime nicht gefunden. Sollte mit dem Installer ausgeliefert
            werden — ggf. Installer neu ausführen.
          {/if}
        </CardDescription>
      </CardHeader>
    </Card>
  {/if}

  <Card>
    <CardHeader>
      <CardTitle class="text-base">Datei prüfen</CardTitle>
      <CardDescription>
        PDF mit eingebettetem ZUGFeRD/Factur-X-XML oder reine XRechnung-XML.
      </CardDescription>
    </CardHeader>
    <CardContent class="flex flex-col gap-3">
      <Button onclick={pickAndValidate} disabled={!canValidate || loading} class="self-start">
        <Upload class="size-4" />
        Datei auswählen
      </Button>
      {#if !canValidate && status}
        <p class="text-xs text-muted-foreground">
          Erst Validator-Setup abschließen, dann kann hier validiert werden.
        </p>
      {/if}
    </CardContent>
  </Card>

  {#if loading}
    <Card>
      <CardContent class="flex items-center gap-3 py-6">
        <FileSearch class="size-5 animate-pulse text-muted-foreground" />
        <span class="text-sm text-muted-foreground">
          Validiere {activeFile}…
        </span>
      </CardContent>
    </Card>
  {/if}

  {#if report}
    <Card>
      <CardHeader class="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle class="flex items-center gap-2 text-base">
            {#if report.valid}
              <ShieldCheck class="size-5 text-success" />
              Validierung bestanden
            {:else}
              <ShieldAlert class="size-5 text-destructive" />
              Validierung fehlgeschlagen
            {/if}
          </CardTitle>
          <CardDescription class="mt-1">
            {report.scenario ?? "Kein Szenario erkannt"} ·
            <span class="font-mono text-xs">{activeFile}</span>
          </CardDescription>
        </div>
        <Badge variant={report.valid ? "default" : "destructive"}>
          {report.valid ? "ACCEPTABLE" : "REJECTED"}
        </Badge>
      </CardHeader>
      {#if report.findings.length > 0}
        <CardContent>
          <div class="text-xs uppercase font-semibold text-muted-foreground tracking-wider mb-2">
            {report.findings.length} Findings
          </div>
          <ul class="flex flex-col gap-2">
            <!-- The same rule can fire at several locations, so code and message are no unique key. -->
            {#each report.findings as finding, idx (idx)}
              <li class="rounded-md border border-border bg-card/50 p-3 text-sm">
                <div class="flex items-start gap-2">
                  <ShieldAlert class="size-4 mt-0.5 shrink-0 text-destructive" />
                  <div class="flex-1 min-w-0">
                    <div class="font-medium">
                      {#if finding.code}
                        <span class="font-mono text-xs text-muted-foreground mr-2">{finding.code}</span>
                      {/if}
                      {finding.message}
                    </div>
                    {#if finding.location}
                      <div class="text-xs text-muted-foreground font-mono mt-1 truncate">
                        {finding.location}
                      </div>
                    {/if}
                  </div>
                </div>
              </li>
            {/each}
          </ul>
        </CardContent>
      {/if}
    </Card>
  {/if}
</div>
