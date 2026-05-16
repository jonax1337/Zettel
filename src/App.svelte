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
  import RecurringList from "./routes/RecurringList.svelte";
  import RecurringEdit from "./routes/RecurringEdit.svelte";
  import Settings from "./routes/Settings.svelte";
  import Export from "./routes/Export.svelte";
  import NotFound from "./routes/NotFound.svelte";

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
