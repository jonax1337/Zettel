<script lang="ts">
  import { save } from "@tauri-apps/plugin-dialog";
  import { invoke } from "@tauri-apps/api/core";
  import { Download, FileSpreadsheet } from "@lucide/svelte";
  import {
    Button,
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    CardDescription,
    Input,
    Label,
    Select,
    toast,
  } from "$lib/ui";
  import { loadInvoicesForExport } from "$lib/db/invoices";
  import { loadExpensesForExport } from "$lib/db/expenses";
  import {
    ACCOUNT_MAPS,
    buildDatevCsv,
    defaultDatevFilename,
    type Skr,
  } from "$lib/export/datev";
  import { fromIsoDate, toIsoDate, nowUnix } from "$lib/utils/date";

  function startOfYearIso(): string {
    const d = new Date();
    return `${d.getFullYear()}-01-01`;
  }

  let dateFromIso = $state(startOfYearIso());
  let dateToIso = $state(toIsoDate(nowUnix()));
  let skr = $state<Skr>("SKR03");
  let beraternr = $state(1001);
  let mandantennr = $state(1);
  let bezeichnung = $state("Zettel-Export");
  let includeInvoices = $state(true);
  let includeExpenses = $state(true);
  let includeCancelled = $state(true);
  let busy = $state(false);

  const skrItems = [
    { value: "SKR03", label: "SKR03 (Standard)" },
    { value: "SKR04", label: "SKR04" },
  ];

  async function onExport() {
    if (!includeInvoices && !includeExpenses) {
      toast.error(
        "Nichts ausgewählt",
        'Mindestens „Rechnungen" oder „Eingangsrechnungen" aktivieren.',
      );
      return;
    }
    busy = true;
    try {
      const from = fromIsoDate(dateFromIso);
      const toEnd = fromIsoDate(dateToIso) + 86399; // ganzen Tag inkludieren
      const invoices = includeInvoices ? await loadInvoicesForExport(from, toEnd) : [];
      const expenses = includeExpenses
        ? await loadExpensesForExport(from, toEnd, { includeCancelled })
        : [];
      const total = invoices.length + expenses.length;
      if (total === 0) {
        toast.error(
          "Keine Belege im Zeitraum",
          "Rechnungen müssen 'Versandt' oder 'Bezahlt' sein. Eingangsrechnungen 'Offen' oder 'Bezahlt'.",
        );
        return;
      }
      const csv = buildDatevCsv(
        { invoices, expenses },
        {
          beraternr,
          mandantennr,
          wjBeginn: new Date(new Date().getFullYear(), 0, 1),
          dateFrom: new Date(from * 1000),
          dateTo: new Date(toEnd * 1000),
          sachkontenlaenge: 4,
          bezeichnung,
          accounts: ACCOUNT_MAPS[skr],
        },
      );
      const targetPath = await save({
        defaultPath: defaultDatevFilename(),
        filters: [{ name: "DATEV CSV", extensions: ["csv"] }],
      });
      if (!targetPath) return;
      await invoke<string>("save_text_file", { path: targetPath, content: csv });
      const parts: string[] = [];
      if (invoices.length) parts.push(`${invoices.length} Rechnung${invoices.length === 1 ? "" : "en"}`);
      if (expenses.length) parts.push(`${expenses.length} Eingangsrechnung${expenses.length === 1 ? "" : "en"}`);
      toast.success(`Export gespeichert (${parts.join(" + ")})`);
    } catch (e) {
      toast.error("Export fehlgeschlagen", String(e));
    } finally {
      busy = false;
    }
  }
</script>

<header class="mb-6">
  <h1 class="text-3xl font-semibold tracking-tight">Export</h1>
  <p class="text-sm text-muted-foreground mt-1">
    DATEV-konformer Buchungsstapel für deinen Steuerberater. Exportiert Rechnungen
    (Erlöse) und/oder Eingangsrechnungen (Aufwände) inklusive Stornos.
  </p>
</header>

<div class="space-y-6">
  <Card>
    <CardHeader>
      <CardTitle class="flex items-center gap-2">
        <FileSpreadsheet class="size-4" />
        DATEV-Buchungsstapel (CSV)
      </CardTitle>
      <CardDescription>
        Format 700, eine Buchungszeile pro USt-Rate. Soll = Sammel-Debitor,
        Haben = Erlöskonto nach Kontenrahmen. Kleinunternehmer- und
        Reverse-Charge-Rechnungen werden auf die jeweiligen Sonderkonten gebucht.
      </CardDescription>
    </CardHeader>
    <CardContent class="space-y-4">
      <div class="grid grid-cols-2 gap-4">
        <div class="flex flex-col gap-1.5">
          <Label>Zeitraum von</Label>
          <Input type="date" bind:value={dateFromIso} />
        </div>
        <div class="flex flex-col gap-1.5">
          <Label>Zeitraum bis</Label>
          <Input type="date" bind:value={dateToIso} />
        </div>
        <div class="flex flex-col gap-1.5">
          <Label>Kontenrahmen</Label>
          <Select bind:value={skr as unknown as string} items={skrItems} />
        </div>
        <div class="flex flex-col gap-1.5">
          <Label>Bezeichnung (max. 30)</Label>
          <Input bind:value={bezeichnung} maxlength={30} />
        </div>
        <div class="flex flex-col gap-1.5">
          <Label>Beraternr. (Platzhalter)</Label>
          <Input type="number" bind:value={beraternr} />
        </div>
        <div class="flex flex-col gap-1.5">
          <Label>Mandantennr. (Platzhalter)</Label>
          <Input type="number" bind:value={mandantennr} />
        </div>
      </div>

      <div class="grid grid-cols-1 gap-2 rounded-md border border-border bg-muted/20 p-3">
        <label class="flex items-center gap-2 text-sm cursor-pointer select-none">
          <input
            type="checkbox"
            bind:checked={includeInvoices}
            class="size-4 rounded border-input accent-primary"
          />
          Rechnungen (Erlöse — Status „Versandt" oder „Bezahlt")
        </label>
        <label class="flex items-center gap-2 text-sm cursor-pointer select-none">
          <input
            type="checkbox"
            bind:checked={includeExpenses}
            class="size-4 rounded border-input accent-primary"
          />
          Eingangsrechnungen (Aufwände — Status „Offen" oder „Bezahlt")
        </label>
        <label class="flex items-center gap-2 text-sm cursor-pointer select-none pl-6 text-muted-foreground">
          <input
            type="checkbox"
            bind:checked={includeCancelled}
            disabled={!includeExpenses}
            class="size-4 rounded border-input accent-primary"
          />
          Stornierte Eingangsrechnungen mit aufnehmen
        </label>
      </div>

      <div class="rounded-md border border-border bg-muted/30 p-3 text-xs text-muted-foreground space-y-1">
        <p>
          <strong>Kontenmapping ({skr}):</strong>
          Debitor {ACCOUNT_MAPS[skr].debitor} · Kreditor {ACCOUNT_MAPS[skr].kreditor} ·
          Erlöse 19 % {ACCOUNT_MAPS[skr].revenue19}, 7 % {ACCOUNT_MAPS[skr].revenue7} ·
          Aufwand 19 % {ACCOUNT_MAPS[skr].expense19}, 7 % {ACCOUNT_MAPS[skr].expense7} ·
          §13b Aufwand {ACCOUNT_MAPS[skr].expenseReverseCharge}.
        </p>
        <p>
          Stornorechnungen werden mit Soll/Haben-Drehung als Storno-Buchung exportiert.
          Berater- und Mandantennummer trägt dein Steuerberater beim Import um —
          die hier eingegebenen Werte sind nur Platzhalter im Header.
        </p>
      </div>

      <div class="flex items-center gap-3">
        <Button onclick={onExport} disabled={busy}>
          <Download class="size-4" />
          {busy ? "Exportiere…" : "DATEV-CSV speichern"}
        </Button>
      </div>
    </CardContent>
  </Card>
</div>
