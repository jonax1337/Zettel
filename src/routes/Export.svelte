<script lang="ts">
  import { Download, FileSpreadsheet } from "$lib/brand-icons";
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
    Checkbox,
    DatePicker,
    PageHeader,
    toast,
  } from "$lib/ui";
  import { loadInvoicesForExport } from "$lib/db/invoices";
  import { loadExpensesForExport } from "$lib/db/expenses";
  import { listCategories as listCuratedCategories } from "$lib/db/expense-categories";
  import type { ExpenseCategory } from "$lib/db/schema";
  import {
    ACCOUNT_MAPS,
    buildDatevCsv,
    datevRangeError,
    defaultDatevFilename,
    type Skr,
  } from "$lib/export/datev";
  import { fromIsoDate, nowUnix, toIsoDate, toUnix } from "$lib/utils/date";
  import {
    describeExportCounts,
    endOfDayUnix,
    fiscalYearStart,
    resolveItemAccounts,
  } from "./parts/reports/datev-export";
  import {
    DATEV_LABEL_MAX_LENGTH,
    loadDatevExportSettings,
    saveDatevExportSettings,
  } from "./parts/reports/export-settings";
  import { saveTextFileWithDialog } from "./parts/reports/save-text-file";

  const DATEV_ACCOUNT_LENGTH = 4;
  const remembered = loadDatevExportSettings();

  let dateFromIso = $state(toIsoDate(toUnix(fiscalYearStart(nowUnix()))));
  let dateToIso = $state(toIsoDate(nowUnix()));
  let skr = $state<Skr>("SKR03");
  let beraternr = $state<number | null>(remembered.beraternr);
  let mandantennr = $state<number | null>(remembered.mandantennr);
  let bezeichnung = $state(remembered.bezeichnung);
  let includeInvoices = $state(true);
  let includeExpenses = $state(true);
  let includeCancelled = $state(true);
  let busy = $state(false);
  let preview = $state<{ invoices: number; expenses: number } | null>(null);

  const skrItems = [
    { value: "SKR03", label: "SKR03 (Standard)" },
    { value: "SKR04", label: "SKR04" },
  ];
  const accounts = $derived(ACCOUNT_MAPS[skr]);

  async function loadCategoriesById(): Promise<Map<number, ExpenseCategory>> {
    const categories = await listCuratedCategories({ includeArchived: true });
    return new Map(categories.map((c) => [c.id, c]));
  }

  async function loadDocuments(from: number, to: number) {
    const invoices = includeInvoices ? await loadInvoicesForExport(from, to) : [];
    if (!includeExpenses) return { invoices, expenses: [] };
    const [rawExpenses, categoriesById] = await Promise.all([
      loadExpensesForExport(from, to, { includeCancelled }),
      loadCategoriesById(),
    ]);
    const expenses = rawExpenses.map((expense) => ({
      ...expense,
      items: resolveItemAccounts(expense.items, categoriesById, skr),
    }));
    return { invoices, expenses };
  }

  $effect(() => {
    saveDatevExportSettings({ beraternr, mandantennr, bezeichnung });
  });

  // Every input the loader depends on is read here, because it reads some of them only after an await.
  $effect(() => {
    const [from, to] = [dateFromIso, dateToIso];
    void [includeInvoices, includeExpenses, includeCancelled, skr];
    if (!from || !to) {
      preview = null;
      return;
    }
    let stale = false;
    loadDocuments(fromIsoDate(from), endOfDayUnix(fromIsoDate(to)))
      .then((documents) => {
        if (!stale) preview = { invoices: documents.invoices.length, expenses: documents.expenses.length };
      })
      .catch(() => {
        if (!stale) preview = null;
      });
    return () => {
      stale = true;
    };
  });

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
      const to = endOfDayUnix(fromIsoDate(dateToIso));
      const rangeError = datevRangeError({
        wjBeginn: fiscalYearStart(from),
        dateFrom: new Date(from * 1000),
        dateTo: new Date(to * 1000),
      });
      if (rangeError) {
        toast.error("Zeitraum zu groß", rangeError);
        return;
      }
      const documents = await loadDocuments(from, to);
      if (documents.invoices.length + documents.expenses.length === 0) {
        toast.error(
          "Keine Belege im Zeitraum",
          "Rechnungen müssen 'Versandt' oder 'Bezahlt' sein. Eingangsrechnungen 'Offen' oder 'Bezahlt'.",
        );
        return;
      }
      const csv = buildDatevCsv(documents, {
        beraternr: beraternr ?? remembered.beraternr,
        mandantennr: mandantennr ?? remembered.mandantennr,
        wjBeginn: fiscalYearStart(from),
        dateFrom: new Date(from * 1000),
        dateTo: new Date(to * 1000),
        sachkontenlaenge: DATEV_ACCOUNT_LENGTH,
        bezeichnung,
        accounts,
      });
      const saved = await saveTextFileWithDialog({
        defaultPath: defaultDatevFilename(),
        filterName: "DATEV CSV",
        extension: "csv",
        content: csv,
      });
      if (saved) {
        toast.success(
          `Export gespeichert (${describeExportCounts(documents.invoices.length, documents.expenses.length)})`,
        );
      }
    } catch (e) {
      toast.error("Export fehlgeschlagen", String(e));
    } finally {
      busy = false;
    }
  }
</script>

<PageHeader
  title="Export"
  subtitle="DATEV-konformer Buchungsstapel für deinen Steuerberater. Exportiert Rechnungen (Erlöse) und/oder Eingangsrechnungen (Aufwände) inklusive Stornos."
/>

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
          <DatePicker bind:value={dateFromIso} />
        </div>
        <div class="flex flex-col gap-1.5">
          <Label>Zeitraum bis</Label>
          <DatePicker bind:value={dateToIso} />
        </div>
        <div class="flex flex-col gap-1.5">
          <Label>Kontenrahmen</Label>
          <Select bind:value={() => skr, (v) => (skr = v as Skr)} items={skrItems} />
        </div>
        <div class="flex flex-col gap-1.5">
          <Label>Bezeichnung (max. {DATEV_LABEL_MAX_LENGTH})</Label>
          <Input bind:value={bezeichnung} maxlength={DATEV_LABEL_MAX_LENGTH} />
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
          <Checkbox bind:checked={includeInvoices} />
          Rechnungen (Erlöse — Status „Versandt" oder „Bezahlt")
        </label>
        <label class="flex items-center gap-2 text-sm cursor-pointer select-none">
          <Checkbox bind:checked={includeExpenses} />
          Eingangsrechnungen (Aufwände — Status „Offen" oder „Bezahlt")
        </label>
        <label class="flex items-center gap-2 text-sm cursor-pointer select-none pl-6 text-muted-foreground">
          <Checkbox bind:checked={includeCancelled} disabled={!includeExpenses} />
          Stornierte Eingangsrechnungen mit aufnehmen
        </label>
      </div>

      {#if preview}
        <p class="text-sm" aria-live="polite">
          {#if preview.invoices + preview.expenses === 0}
            <span class="text-muted-foreground">Keine exportierbaren Belege im gewählten Zeitraum.</span>
          {:else}
            Im Zeitraum: <strong>{describeExportCounts(preview.invoices, preview.expenses)}</strong>
          {/if}
        </p>
      {/if}

      <div class="rounded-md border border-border bg-muted/30 p-3 text-xs text-muted-foreground space-y-1">
        <p>
          <strong>Kontenmapping ({skr}):</strong>
          Debitor {accounts.debitor} · Kreditor {accounts.kreditor} ·
          Erlöse 19 % {accounts.revenue19}, 7 % {accounts.revenue7} ·
          Aufwand 19 % {accounts.expense19}, 7 % {accounts.expense7} ·
          §13b Aufwand {accounts.expenseReverseCharge}.
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
