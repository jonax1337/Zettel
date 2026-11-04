import { COMPANY_SETTINGS_ROUTE } from "$lib/utils/company-completeness";

export type SetupStep = {
  id: "company" | "customer" | "invoice";
  label: string;
  href: string;
  done: boolean;
};

type SetupState = {
  /** Company data still missing, see missingCompanyData(). */
  missingCompany: string[];
  customerCount: number;
  hasInvoices: boolean;
};

export function buildSetupChecklist(state: SetupState): SetupStep[] {
  return [
    {
      id: "company",
      label: "Firmendaten eintragen",
      href: COMPANY_SETTINGS_ROUTE,
      done: state.missingCompany.length === 0,
    },
    {
      id: "customer",
      label: "Ersten Kunden anlegen",
      href: "/customers/new",
      done: state.customerCount > 0,
    },
    {
      id: "invoice",
      label: "Erste Rechnung schreiben",
      href: "/invoices/new",
      done: state.hasInvoices,
    },
  ];
}

export function isSetupComplete(steps: SetupStep[]): boolean {
  return steps.every((step) => step.done);
}
