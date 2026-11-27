<script lang="ts">
  import { errorMessage } from "$lib/utils/error-message";
  import { Download } from "$lib/brand-icons";
  import { Button, Input, Label, Select, Checkbox, DatePicker, toast } from "$lib/ui";
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
  import ReportsShell from "./parts/reports/ReportsShell.svelte";
  import { rememberDatevExport } from "./parts/reports/last-export";
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
        'Mindestens „Rechnungen" oder „Ausgaben" aktivieren.',
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
          "Rechnungen müssen 'Versendet', 'Teilbezahlt' oder 'Bezahlt' sein. Ausgaben 'Offen' oder 'Bezahlt'.",
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
        await rememberDatevExport(nowUnix());
        toast.success(
          `Export gespeichert (${describeExportCounts(documents.invoices.length, documents.expenses.length)})`,
        );
      }
    } catch (e) {
      toast.error("Export fehlgeschlagen", errorMessage(e));
    } finally {
      busy = false;
    }
  }
</script>

<ReportsShell active="/export">
  <div class="max-w-[720px]">
    <p class="mb-5 text-muted-foreground">
      DATEV-konformer Buchungsstapel für deine Steuerberatung, im Format 700 mit einer Buchungszeile pro Umsatzsteuersatz.
      Exportiert werden Rechnungen (Erlöse) und Ausgaben (Aufwände), jeweils mit Stornos.
    </p>

    <div class="grid grid-cols-2 items-start gap-x-4 gap-y-3.5">
      <div class="flex flex-col gap-1.5">
        <Label class="text-[13px] font-bold">Zeitraum von</Label>
        <DatePicker bind:value={dateFromIso} />
      </div>
      <div class="flex flex-col gap-1.5">
        <Label class="text-[13px] font-bold">Zeitraum bis</Label>
        <DatePicker bind:value={dateToIso} />
      </div>
      <div class="flex flex-col gap-1.5">
        <Label class="text-[13px] font-bold">Kontenrahmen</Label>
        <Select bind:value={() => skr, (v) => (skr = v as Skr)} items={skrItems} />
      </div>
      <div class="flex flex-col gap-1.5">
        <Label class="text-[13px] font-bold">Bezeichnung (max. {DATEV_LABEL_MAX_LENGTH} Zeichen)</Label>
        <Input bind:value={bezeichnung} maxlength={DATEV_LABEL_MAX_LENGTH} />
      </div>
      <div class="flex flex-col gap-1.5">
        <Label class="text-[13px] font-bold">Beraternummer</Label>
        <Input type="number" bind:value={beraternr} />
        <small class="text-[12.5px] text-muted-foreground">Nur ein Platzhalter im Kopf der Datei.</small>
      </div>
      <div class="flex flex-col gap-1.5">
        <Label class="text-[13px] font-bold">Mandantennummer</Label>
        <Input type="number" bind:value={mandantennr} />
        <small class="text-[12.5px] text-muted-foreground">Ebenfalls ein Platzhalter.</small>
      </div>

      <div class="col-span-2 grid gap-2.5">
        <label class="flex cursor-pointer items-center gap-2.5 font-semibold select-none">
          <Checkbox bind:checked={includeInvoices} />
          <span>
            Rechnungen als Erlöse
            <span class="font-normal text-muted-foreground">(Status „Versendet“, „Teilbezahlt“ oder „Bezahlt“)</span>
          </span>
        </label>
        <label class="flex cursor-pointer items-center gap-2.5 font-semibold select-none">
          <Checkbox bind:checked={includeExpenses} />
          <span>
            Ausgaben als Aufwand
            <span class="font-normal text-muted-foreground">(Status „Offen“ oder „Bezahlt“)</span>
          </span>
        </label>
        <label
          class="flex cursor-pointer items-center gap-2.5 pl-6.5 font-semibold select-none {includeExpenses
            ? ''
            : 'text-muted-foreground'}"
        >
          <Checkbox bind:checked={includeCancelled} disabled={!includeExpenses} />
          Stornierte Ausgaben mit aufnehmen
        </label>
      </div>
    </div>

    <div class="mt-6 flex flex-wrap items-center gap-4 border-t pt-4">
      <Button onclick={onExport} disabled={busy}>
        <Download />
        {busy ? "Exportiere…" : "Exportieren"}
      </Button>
      {#if preview}
        <p class="text-[13px] text-muted-foreground" aria-live="polite">
          {#if preview.invoices + preview.expenses === 0}
            Keine exportierbaren Belege im gewählten Zeitraum.
          {:else}
            Im Zeitraum: <strong class="text-foreground">{describeExportCounts(preview.invoices, preview.expenses)}</strong>
          {/if}
        </p>
      {/if}
    </div>

    <div class="mt-5 max-w-[78ch] space-y-1.5 text-[13px] text-muted-foreground">
      <p>
        Soll ist der Sammel-Debitor, Haben das Erlöskonto nach Kontenrahmen. Kleinunternehmer- und
        Reverse-Charge-Rechnungen werden auf die jeweiligen Sonderkonten gebucht. Stornorechnungen gehen mit gedrehtem
        Soll und Haben als Storno-Buchung in die Datei.
      </p>
      <p>
        Kontenmapping {skr}: Debitor {accounts.debitor}, Kreditor {accounts.kreditor}, Erlöse 19 % {accounts.revenue19}
        und 7 % {accounts.revenue7}, Aufwand 19 % {accounts.expense19} und 7 % {accounts.expense7}, § 13b-Aufwand
        {accounts.expenseReverseCharge}.
      </p>
      <p>Berater- und Mandantennummer trägt deine Steuerberatung beim Import um.</p>
    </div>
  </div>
</ReportsShell>