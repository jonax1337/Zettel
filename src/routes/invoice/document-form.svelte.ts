import { listCustomers, loadSettings } from "$lib/db/queries";
import type { Customer, Settings } from "$lib/db/schema";

type Options = {
  customerId: () => string;
  onLoaded: (settings: Settings, customers: Customer[]) => void | Promise<void>;
  onError: (message: string) => void;
};

/** Loads settings and customers for a document form and derives the customer picker state. Call during component init. */
export function createDocumentFormData({ customerId, onLoaded, onError }: Options) {
  let customers = $state<Customer[]>([]);
  let settings = $state<Settings | null>(null);

  const customerItems = $derived(
    customers.map((c) => ({ value: String(c.id), label: `${c.customerNumber} · ${c.name}` })),
  );
  const selectedCustomer = $derived(
    customerId() ? (customers.find((c) => String(c.id) === customerId()) ?? null) : null,
  );

  $effect(() => {
    Promise.all([loadSettings(), listCustomers()])
      .then(async ([loadedSettings, loadedCustomers]) => {
        customers = loadedCustomers;
        settings = loadedSettings;
        await onLoaded(loadedSettings, loadedCustomers);
      })
      .catch((e) => onError(String(e)));
  });

  return {
    get settings() {
      return settings;
    },
    get customerItems() {
      return customerItems;
    },
    get selectedCustomer() {
      return selectedCustomer;
    },
  };
}
