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
  import Settings from "./routes/Settings.svelte";
  import Export from "./routes/Export.svelte";
  import NotFound from "./routes/NotFound.svelte";
  import { onMount } from "svelte";
  import { checkForUpdate, isTauri } from "$lib/updater";
  import { toast } from "$lib/ui";

  onMount(() => {
    if (!isTauri()) return;
    const timer = setTimeout(async () => {
      try {
        const result = await checkForUpdate();
        if (result.available) {
          toast.action(
            `Update v${result.version} verfügbar`,
            {
              label: "Installieren",
              onClick: () => result.install(),
            },
            { description: "Klick zum Herunterladen und Neustarten." },
          );
        }
      } catch {
        // Silent: offline, dev build without pubkey, etc.
      }
    }, 10_000);
    return () => clearTimeout(timer);
  });

  // svelte-spa-router's TS types are still Svelte 4-shaped; Svelte 5 Component<>
  // is structurally compatible at runtime, so we cast through unknown.
  const routes = {
    "/": Dashboard,
    "/customers": CustomersList,
    "/customers/new": wrap({
      component: CustomerEdit as unknown as never,
      props: { mode: "new" },
    }),
    "/customers/:id": wrap({
      component: CustomerEdit as unknown as never,
      props: { mode: "edit" },
    }),
    "/invoices": InvoicesList,
    "/invoices/new": wrap({
      component: InvoiceEdit as unknown as never,
      props: { mode: "new" },
    }),
    "/invoices/:id/edit": wrap({
      component: InvoiceEdit as unknown as never,
      props: { mode: "edit" },
    }),
    "/invoices/:id": InvoiceDetail,
    "/offers": OffersList,
    "/offers/new": wrap({
      component: OfferEdit as unknown as never,
      props: { mode: "new" },
    }),
    "/offers/:id/edit": wrap({
      component: OfferEdit as unknown as never,
      props: { mode: "edit" },
    }),
    "/offers/:id": OfferDetail,
    "/recurring": RecurringList,
    "/recurring/new": wrap({
      component: RecurringEdit as unknown as never,
      props: { mode: "new" },
    }),
    "/recurring/:id": wrap({
      component: RecurringEdit as unknown as never,
      props: { mode: "edit" },
    }),
    "/settings": Settings,
    "/export": Export,
    "*": NotFound,
  } as never;
</script>

<Layout>
  <Router {routes} />
</Layout>
