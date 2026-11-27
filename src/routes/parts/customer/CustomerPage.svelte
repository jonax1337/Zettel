<!-- The body of the customer route. The route keys it by customer ID, so opening another customer starts from a clean page. -->
<script lang="ts">
  import { push } from "svelte-spa-router";
  import { periodForYear } from "$lib/dashboard/period";
  import { loadCustomerOverview, type CustomerOverview } from "$lib/db/customer-overview";
  import { listInvoices } from "$lib/db/invoices";
  import { expireDueOffers, listOffers } from "$lib/db/offers";
  import { deleteCustomer, getCustomer } from "$lib/db/queries";
  import type { Customer } from "$lib/db/schema";
  import { nowUnix } from "$lib/utils/date";
  import { errorMessage } from "$lib/utils/error-message";
  import { FilePlus2, Pencil, Plus, Trash2 } from "$lib/brand-icons";
  import {
    Button,
    ConfirmDialog,
    DropdownItem,
    DropdownMenu,
    DropdownSeparator,
    MoreActionsTrigger,
    PageHeader,
    toast,
  } from "$lib/ui";
  import { createOfferListFetcher } from "../../offer/list-fetch";
  import BackLink from "../entity/BackLink.svelte";
  import { createDeleteFlow } from "../entity/delete-flow.svelte";
  import { fetchEditTarget } from "../entity/edit-target";
  import { createQueryState } from "../entity/query-state.svelte";
  import ContactPanel from "./ContactPanel.svelte";
  import { customerDocuments, type CustomerDocument } from "./customer-documents";
  import CustomerDocuments from "./CustomerDocuments.svelte";
  import CustomerStats from "./CustomerStats.svelte";
  import NotePanel from "./NotePanel.svelte";
  import SeriesPanel from "./SeriesPanel.svelte";

  type Props = { rawId?: string };
  let { rawId }: Props = $props();

  type CustomerPage = { customer: Customer; overview: CustomerOverview; documents: CustomerDocument[] };

  const year = new Date().getFullYear();

  const fetchOffers = createOfferListFetcher({
    expire: expireDueOffers,
    list: listOffers,
    onExpireError: (e) => toast.error("Abgelaufene Angebote konnten nicht aktualisiert werden", errorMessage(e)),
  });

  const page = createQueryState<CustomerPage | { error: string } | null>(null, async () => {
    const target = await fetchEditTarget(rawId, getCustomer, "Kunde nicht gefunden.");
    if ("error" in target) return target;
    const [overview, invoices, offers] = await Promise.all([
      loadCustomerOverview(target.id, periodForYear(year)),
      listInvoices({ customerId: target.id }),
      fetchOffers({ customerId: target.id }),
    ]);
    return { customer: target.value, overview, documents: customerDocuments(invoices, offers, nowUnix()) };
  });

  $effect(() => {
    page.reload();
  });

  const deletion = createDeleteFlow<Customer>({
    remove: (c) => deleteCustomer(c.id),
    entityLabel: "Kunde",
    describe: (c) => c.name,
    reload: async () => push("/customers"),
  });

  const newInvoiceRoute = (customerId: number) => `/invoices/new?customerId=${customerId}`;
  const newOfferRoute = (customerId: number) => `/offers/new?customerId=${customerId}`;

  function subtitleOf(customer: Customer): string {
    return `Kunde ${customer.customerNumber}${customer.city ? `, ${customer.city}` : ""}`;
  }
</script>

{#if page.error}
  <p role="alert" class="text-sm text-destructive">Kunde konnte nicht geladen werden: {page.error}</p>
{:else if page.loading && !page.data}
  <p role="status" class="text-sm text-muted-foreground">Lade…</p>
{:else if page.data && "error" in page.data}
  <BackLink href="/customers">Kunden</BackLink>
  <p role="alert" class="mt-2 text-sm text-destructive">{page.data.error}</p>
{:else if page.data}
  {@const { customer, overview, documents } = page.data}
  <PageHeader
    title={customer.name}
    subtitle={subtitleOf(customer)}
    back={{ href: "/customers", label: "Kunden" }}
  >
    {#snippet actions()}
      <Button variant="outline" href={`/customers/${customer.id}/edit`}>
        <Pencil />
        Bearbeiten
      </Button>
      <Button href={newInvoiceRoute(customer.id)}>
        <Plus />
        Neue Rechnung
      </Button>
      <DropdownMenu triggerLabel="Weitere Aktionen">
        {#snippet trigger()}
          <MoreActionsTrigger />
        {/snippet}
        <DropdownItem onSelect={() => push(newOfferRoute(customer.id))}>
          <FilePlus2 />
          Neues Angebot
        </DropdownItem>
        <DropdownSeparator />
        <DropdownItem destructive onSelect={() => deletion.ask(customer)}>
          <Trash2 />
          Löschen
        </DropdownItem>
      </DropdownMenu>
    {/snippet}
  </PageHeader>

  <CustomerStats {overview} {year} />

  <div class="grid items-start gap-7 min-[1321px]:grid-cols-[minmax(0,1fr)_320px]">
    <div class="min-w-0">
      <CustomerDocuments {documents} onCreateInvoice={() => push(newInvoiceRoute(customer.id))} />
    </div>
    <aside aria-label="Kundendaten" class="grid grid-cols-2 items-start gap-3.5 min-[1321px]:grid-cols-1">
      <ContactPanel {customer} />
      {#if overview.series.length > 0}
        <SeriesPanel series={overview.series} />
      {/if}
      {#if customer.notes || customer.followUpDate}
        <NotePanel {customer} />
      {/if}
    </aside>
  </div>

  <ConfirmDialog
    bind:open={deletion.open}
    title="Kunde löschen?"
    description={deletion.target ? `"${deletion.target.name}" wird unwiderruflich entfernt.` : ""}
    confirmLabel="Löschen"
    destructive
    onConfirm={deletion.confirm}
  />
{/if}
