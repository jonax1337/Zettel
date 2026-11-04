<script lang="ts">
  import Router from "svelte-spa-router";
  import { wrap } from "svelte-spa-router/wrap";
  import Layout from "$lib/components/Layout.svelte";
  import Dashboard from "./routes/Dashboard.svelte";
  import CustomersList from "./routes/CustomersList.svelte";
  import CustomerEdit from "./routes/CustomerEdit.svelte";
  import InvoicesList from "./routes/InvoicesList.svelte";
  import InvoiceEdit from "./routes/InvoiceEdit.svelte";
  import InvoiceDetail from "./routes/InvoiceDetail.svelte";
  import OffersList from "./routes/OffersList.svelte";
  import OfferEdit from "./routes/OfferEdit.svelte";
  import OfferDetail from "./routes/OfferDetail.svelte";
  import RecurringList from "./routes/RecurringList.svelte";
  import RecurringEdit from "./routes/RecurringEdit.svelte";
  import VendorsList from "./routes/VendorsList.svelte";
  import VendorEdit from "./routes/VendorEdit.svelte";
  import CatalogList from "./routes/CatalogList.svelte";
  import CatalogEdit from "./routes/CatalogEdit.svelte";
  import BankImport from "./routes/BankImport.svelte";
  import ExpensesList from "./routes/ExpensesList.svelte";
  import ExpenseEdit from "./routes/ExpenseEdit.svelte";
  import RemindersList from "./routes/RemindersList.svelte";
  import ReminderEdit from "./routes/ReminderEdit.svelte";
  import UstvaReport from "./routes/UstvaReport.svelte";
  import TaxReport from "./routes/TaxReport.svelte";
  import Validate from "./routes/Validate.svelte";
  import Settings from "./routes/Settings.svelte";
  import SettingsCompany from "./routes/settings/Company.svelte";
  import SettingsDocuments from "./routes/settings/Documents.svelte";
  import SettingsAppearance from "./routes/settings/Appearance.svelte";
  import SettingsData from "./routes/settings/Data.svelte";
  import SettingsAdvanced from "./routes/settings/Advanced.svelte";
  import Export from "./routes/Export.svelte";
  import NotFound from "./routes/NotFound.svelte";
  import { onMount } from "svelte";
  import { checkForUpdate, isTauri } from "$lib/updater";
  import { toast } from "$lib/ui";

  const UPDATE_CHECK_DELAY_MS = 10_000;

  async function offerUpdateIfAvailable() {
    try {
      const result = await checkForUpdate();
      if (!result.available) return;
      toast.action(
        `Update v${result.version} verfügbar`,
        { label: "Installieren", onClick: () => result.install() },
        { description: "Klick zum Herunterladen und Neustarten." },
      );
    } catch {
      // Silent: offline, dev build without pubkey, etc.
    }
  }

  onMount(() => {
    if (!isTauri()) return;
    const timer = setTimeout(offerUpdateIfAvailable, UPDATE_CHECK_DELAY_MS);
    return () => clearTimeout(timer);
  });

  // svelte-spa-router's TS types are still Svelte 4-shaped; Svelte 5 Component<>
  // is structurally compatible at runtime, so we cast through unknown.
  function editorRoute(component: unknown, mode: "new" | "edit") {
    return wrap({ component: component as never, props: { mode } });
  }

  const routes = {
    "/": Dashboard,
    "/customers": CustomersList,
    "/customers/new": editorRoute(CustomerEdit, "new"),
    "/customers/:id": editorRoute(CustomerEdit, "edit"),
    "/invoices": InvoicesList,
    "/invoices/new": editorRoute(InvoiceEdit, "new"),
    "/invoices/:id/edit": editorRoute(InvoiceEdit, "edit"),
    "/invoices/:id": InvoiceDetail,
    "/offers": OffersList,
    "/offers/new": editorRoute(OfferEdit, "new"),
    "/offers/:id/edit": editorRoute(OfferEdit, "edit"),
    "/offers/:id": OfferDetail,
    "/recurring": RecurringList,
    "/recurring/new": editorRoute(RecurringEdit, "new"),
    "/recurring/:id": editorRoute(RecurringEdit, "edit"),
    "/catalog": CatalogList,
    "/catalog/new": editorRoute(CatalogEdit, "new"),
    "/catalog/:id": editorRoute(CatalogEdit, "edit"),
    "/vendors": VendorsList,
    "/vendors/new": editorRoute(VendorEdit, "new"),
    "/vendors/:id": editorRoute(VendorEdit, "edit"),
    "/expenses": ExpensesList,
    "/expenses/new": editorRoute(ExpenseEdit, "new"),
    "/expenses/:id": editorRoute(ExpenseEdit, "edit"),
    "/reminders": RemindersList,
    "/reminders/new/:invoiceId/:level": editorRoute(ReminderEdit, "new"),
    "/reminders/new/:invoiceId": editorRoute(ReminderEdit, "new"),
    "/reminders/:id": editorRoute(ReminderEdit, "edit"),
    "/bank-import": BankImport,
    "/reports/ustva": UstvaReport,
    "/reports/taxes": TaxReport,
    "/validate": Validate,
    "/settings": Settings,
    "/settings/company": SettingsCompany,
    "/settings/documents": SettingsDocuments,
    "/settings/appearance": SettingsAppearance,
    "/settings/data": SettingsData,
    "/settings/advanced": SettingsAdvanced,
    "/export": Export,
    "*": NotFound,
  } as never;
</script>

<Layout>
  <Router {routes} />
</Layout>
