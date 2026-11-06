import { containsPattern, execute, insert, select, toSqlBool } from "./client";
import { assertCustomerDeletable, assertVendorDeletable } from "./references";
import type { Customer, Settings, Vendor } from "./schema";

// --- Settings (singleton row id=1) ---

type SettingsRow = {
  id: number;
  company_name: string;
  owner_name: string;
  street: string;
  postal_code: string;
  city: string;
  country: string;
  tax_number: string;
  vat_id: string | null;
  email: string;
  phone: string | null;
  website: string | null;
  bank_name: string;
  bank_iban: string;
  bank_bic: string;
  is_kleinunternehmer: number;
  kleinunternehmer_note: string;
  invoice_number_format: string;
  invoice_number_counter: number;
  offer_number_format: string | null;
  offer_number_counter: number | null;
  default_offer_validity_days: number | null;
  default_payment_terms_days: number;
  logo_path: string | null;
  zugferd_profile: string;
  pdf_theme: string;
  vendor_number_format: string | null;
  vendor_number_counter: number | null;
  expense_number_format: string | null;
  expense_number_counter: number | null;
  reminder_number_format: string | null;
  reminder_number_counter: number | null;
  reminder_days_l1: number | null;
  reminder_days_l2: number | null;
  reminder_days_l3: number | null;
  reminder_fee_l1_cents: number | null;
  reminder_fee_l2_cents: number | null;
  reminder_fee_l3_cents: number | null;
  reminder_text_l1: string | null;
  reminder_text_l2: string | null;
  reminder_text_l3: string | null;
  legal_form: string | null;
  trade_tax_rate: number | null;
  church_tax_rate: number | null;
  tax_filing_status: string | null;
  est_prepayment_q1_cent: number | null;
  est_prepayment_q2_cent: number | null;
  est_prepayment_q3_cent: number | null;
  est_prepayment_q4_cent: number | null;
  use_pauschal_tax_reserve: number | null;
  pauschal_tax_percent: number | null;
  other_income_annual_cent: number | null;
  default_skonto_active: number | null;
  default_skonto_percent: number | null;
  default_skonto_days: number | null;
  auto_backup_interval_days: number | null;
  last_auto_backup_at: number | null;
  default_pdf_language: string | null;
  vat_accounting: string | null;
  tax_reserve_expenses_gross: number | null;
  mail_invoice_subject: string | null;
  mail_invoice_body: string | null;
  mail_offer_subject: string | null;
  mail_offer_body: string | null;
  mail_reminder_subject: string | null;
  mail_reminder_body: string | null;
  created_at: number;
  updated_at: number;
};

/** Fallbacks for unset values; mirrors the column defaults in the migrations. */
export const SETTINGS_DEFAULTS = {
  country: "DE",
  invoiceNumberFormat: "RE-{YYYY}-{NNNN}",
  offerNumberFormat: "AN-{YYYY}-{NNNN}",
  defaultOfferValidityDays: 30,
  defaultPaymentTermsDays: 14,
  zugferdProfile: "en16931",
  pdfTheme: "classic",
  vendorNumberFormat: "L-{NNNN}",
  expenseNumberFormat: "EX-{YYYY}-{NNNN}",
  reminderNumberFormat: "MA-{YYYY}-{NNNN}",
  reminderDays: 14,
  reminderFeeL1Cents: 0,
  reminderFeeL2Cents: 500,
  reminderFeeL3Cents: 1000,
  legalForm: "freelancer",
  tradeTaxRate: 4.0,
  churchTaxRate: 0.0,
  taxFilingStatus: "single",
  pauschalTaxPercent: 30.0,
  defaultSkontoPercent: 2.0,
  defaultSkontoDays: 7,
  defaultPdfLanguage: "de",
  vatAccounting: "accrual",
} as const;

function mapSettings(r: SettingsRow): Settings {
  const d = SETTINGS_DEFAULTS;
  return {
    id: r.id,
    companyName: r.company_name,
    ownerName: r.owner_name,
    street: r.street,
    postalCode: r.postal_code,
    city: r.city,
    country: r.country,
    taxNumber: r.tax_number,
    vatId: r.vat_id,
    email: r.email,
    phone: r.phone,
    website: r.website,
    bankName: r.bank_name,
    bankIban: r.bank_iban,
    bankBic: r.bank_bic,
    isKleinunternehmer: r.is_kleinunternehmer === 1,
    kleinunternehmerNote: r.kleinunternehmer_note,
    invoiceNumberFormat: r.invoice_number_format,
    invoiceNumberCounter: r.invoice_number_counter,
    offerNumberFormat: r.offer_number_format ?? d.offerNumberFormat,
    offerNumberCounter: r.offer_number_counter ?? 0,
    defaultOfferValidityDays: r.default_offer_validity_days ?? d.defaultOfferValidityDays,
    defaultPaymentTermsDays: r.default_payment_terms_days,
    logoPath: r.logo_path,
    zugferdProfile: (r.zugferd_profile ?? d.zugferdProfile) as Settings["zugferdProfile"],
    pdfTheme: (r.pdf_theme ?? d.pdfTheme) as Settings["pdfTheme"],
    vendorNumberFormat: r.vendor_number_format ?? d.vendorNumberFormat,
    vendorNumberCounter: r.vendor_number_counter ?? 0,
    expenseNumberFormat: r.expense_number_format ?? d.expenseNumberFormat,
    expenseNumberCounter: r.expense_number_counter ?? 0,
    reminderNumberFormat: r.reminder_number_format ?? d.reminderNumberFormat,
    reminderNumberCounter: r.reminder_number_counter ?? 0,
    reminderDaysL1: r.reminder_days_l1 ?? d.reminderDays,
    reminderDaysL2: r.reminder_days_l2 ?? d.reminderDays,
    reminderDaysL3: r.reminder_days_l3 ?? d.reminderDays,
    reminderFeeL1Cents: r.reminder_fee_l1_cents ?? d.reminderFeeL1Cents,
    reminderFeeL2Cents: r.reminder_fee_l2_cents ?? d.reminderFeeL2Cents,
    reminderFeeL3Cents: r.reminder_fee_l3_cents ?? d.reminderFeeL3Cents,
    reminderTextL1: r.reminder_text_l1 ?? "",
    reminderTextL2: r.reminder_text_l2 ?? "",
    reminderTextL3: r.reminder_text_l3 ?? "",
    legalForm: (r.legal_form ?? d.legalForm) as Settings["legalForm"],
    tradeTaxRate: r.trade_tax_rate ?? d.tradeTaxRate,
    churchTaxRate: r.church_tax_rate ?? d.churchTaxRate,
    taxFilingStatus: (r.tax_filing_status ?? d.taxFilingStatus) as Settings["taxFilingStatus"],
    estPrepaymentQ1Cent: r.est_prepayment_q1_cent ?? 0,
    estPrepaymentQ2Cent: r.est_prepayment_q2_cent ?? 0,
    estPrepaymentQ3Cent: r.est_prepayment_q3_cent ?? 0,
    estPrepaymentQ4Cent: r.est_prepayment_q4_cent ?? 0,
    usePauschalTaxReserve: r.use_pauschal_tax_reserve === 1,
    pauschalTaxPercent: r.pauschal_tax_percent ?? d.pauschalTaxPercent,
    otherIncomeAnnualCent: r.other_income_annual_cent ?? 0,
    defaultSkontoActive: r.default_skonto_active === 1,
    defaultSkontoPercent: r.default_skonto_percent ?? d.defaultSkontoPercent,
    defaultSkontoDays: r.default_skonto_days ?? d.defaultSkontoDays,
    autoBackupIntervalDays: r.auto_backup_interval_days ?? 0,
    lastAutoBackupAt: r.last_auto_backup_at,
    defaultPdfLanguage: (r.default_pdf_language ?? d.defaultPdfLanguage) as Settings["defaultPdfLanguage"],
    vatAccounting: (r.vat_accounting ?? d.vatAccounting) as Settings["vatAccounting"],
    taxReserveExpensesGross: r.tax_reserve_expenses_gross === 1,
    mailInvoiceSubject: r.mail_invoice_subject,
    mailInvoiceBody: r.mail_invoice_body,
    mailOfferSubject: r.mail_offer_subject,
    mailOfferBody: r.mail_offer_body,
    mailReminderSubject: r.mail_reminder_subject,
    mailReminderBody: r.mail_reminder_body,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export async function loadSettings(): Promise<Settings> {
  const rows = await select<SettingsRow>(
    "SELECT * FROM settings WHERE id = 1",
  );
  if (rows.length === 0) {
    await execute("INSERT INTO settings (id) VALUES (1)");
    return loadSettings();
  }
  return mapSettings(rows[0]);
}

/** A blank mail template means "use the built-in default" and is stored as NULL. */
function blankToNull(text: string | null | undefined): string | null {
  return text?.trim() ? text : null;
}

/** Column/value pairs kept side by side so a new setting cannot shift the bindings. */
function settingsColumnValues(s: Partial<Settings>): Array<[column: string, value: unknown]> {
  const d = SETTINGS_DEFAULTS;
  return [
    ["company_name", s.companyName ?? ""],
    ["owner_name", s.ownerName ?? ""],
    ["street", s.street ?? ""],
    ["postal_code", s.postalCode ?? ""],
    ["city", s.city ?? ""],
    ["country", s.country ?? d.country],
    ["tax_number", s.taxNumber ?? ""],
    ["vat_id", s.vatId ?? null],
    ["email", s.email ?? ""],
    ["phone", s.phone ?? null],
    ["website", s.website ?? null],
    ["bank_name", s.bankName ?? ""],
    ["bank_iban", s.bankIban ?? ""],
    ["bank_bic", s.bankBic ?? ""],
    ["is_kleinunternehmer", toSqlBool(s.isKleinunternehmer)],
    ["kleinunternehmer_note", s.kleinunternehmerNote ?? ""],
    ["invoice_number_format", s.invoiceNumberFormat ?? d.invoiceNumberFormat],
    ["offer_number_format", s.offerNumberFormat ?? d.offerNumberFormat],
    ["default_offer_validity_days", s.defaultOfferValidityDays ?? d.defaultOfferValidityDays],
    ["default_payment_terms_days", s.defaultPaymentTermsDays ?? d.defaultPaymentTermsDays],
    ["logo_path", s.logoPath ?? null],
    ["zugferd_profile", s.zugferdProfile ?? d.zugferdProfile],
    ["pdf_theme", s.pdfTheme ?? d.pdfTheme],
    ["vendor_number_format", s.vendorNumberFormat ?? d.vendorNumberFormat],
    ["expense_number_format", s.expenseNumberFormat ?? d.expenseNumberFormat],
    ["reminder_number_format", s.reminderNumberFormat ?? d.reminderNumberFormat],
    ["reminder_days_l1", s.reminderDaysL1 ?? d.reminderDays],
    ["reminder_days_l2", s.reminderDaysL2 ?? d.reminderDays],
    ["reminder_days_l3", s.reminderDaysL3 ?? d.reminderDays],
    ["reminder_fee_l1_cents", s.reminderFeeL1Cents ?? d.reminderFeeL1Cents],
    ["reminder_fee_l2_cents", s.reminderFeeL2Cents ?? d.reminderFeeL2Cents],
    ["reminder_fee_l3_cents", s.reminderFeeL3Cents ?? d.reminderFeeL3Cents],
    ["reminder_text_l1", s.reminderTextL1 ?? ""],
    ["reminder_text_l2", s.reminderTextL2 ?? ""],
    ["reminder_text_l3", s.reminderTextL3 ?? ""],
    ["legal_form", s.legalForm ?? d.legalForm],
    ["trade_tax_rate", s.tradeTaxRate ?? d.tradeTaxRate],
    ["church_tax_rate", s.churchTaxRate ?? d.churchTaxRate],
    ["tax_filing_status", s.taxFilingStatus ?? d.taxFilingStatus],
    ["est_prepayment_q1_cent", s.estPrepaymentQ1Cent ?? 0],
    ["est_prepayment_q2_cent", s.estPrepaymentQ2Cent ?? 0],
    ["est_prepayment_q3_cent", s.estPrepaymentQ3Cent ?? 0],
    ["est_prepayment_q4_cent", s.estPrepaymentQ4Cent ?? 0],
    ["use_pauschal_tax_reserve", toSqlBool(s.usePauschalTaxReserve)],
    ["pauschal_tax_percent", s.pauschalTaxPercent ?? d.pauschalTaxPercent],
    ["other_income_annual_cent", s.otherIncomeAnnualCent ?? 0],
    ["default_skonto_active", toSqlBool(s.defaultSkontoActive)],
    ["default_skonto_percent", s.defaultSkontoPercent ?? d.defaultSkontoPercent],
    ["default_skonto_days", s.defaultSkontoDays ?? d.defaultSkontoDays],
    ["auto_backup_interval_days", s.autoBackupIntervalDays ?? 0],
    ["default_pdf_language", s.defaultPdfLanguage ?? d.defaultPdfLanguage],
    ["vat_accounting", s.vatAccounting ?? d.vatAccounting],
    ["tax_reserve_expenses_gross", toSqlBool(s.taxReserveExpensesGross)],
    ["mail_invoice_subject", blankToNull(s.mailInvoiceSubject)],
    ["mail_invoice_body", blankToNull(s.mailInvoiceBody)],
    ["mail_offer_subject", blankToNull(s.mailOfferSubject)],
    ["mail_offer_body", blankToNull(s.mailOfferBody)],
    ["mail_reminder_subject", blankToNull(s.mailReminderSubject)],
    ["mail_reminder_body", blankToNull(s.mailReminderBody)],
  ];
}

/**
 * Saves the editable settings. Number counters and the auto-backup stamp are
 * left out on purpose: they change in the background (issuing a document,
 * auto-backup), and a form loaded earlier would write stale values back.
 * They have their own targeted updates below.
 */
export async function saveSettings(s: Partial<Settings>): Promise<void> {
  await updateSettingsColumns(settingsColumnValues(s));
}

async function updateSettingsColumns(
  columnValues: Array<[column: string, value: unknown]>,
): Promise<void> {
  if (columnValues.length === 0) return;
  const assignments = columnValues.map(([column]) => `${column} = ?`).join(", ");
  await execute(
    `UPDATE settings SET ${assignments}, updated_at = unixepoch() WHERE id = 1`,
    columnValues.map(([, value]) => value),
  );
}

const NUMBER_COUNTER_COLUMNS = {
  invoiceNumberCounter: "invoice_number_counter",
  offerNumberCounter: "offer_number_counter",
  vendorNumberCounter: "vendor_number_counter",
  expenseNumberCounter: "expense_number_counter",
  reminderNumberCounter: "reminder_number_counter",
} as const;

export type NumberCounters = Pick<Settings, keyof typeof NUMBER_COUNTER_COLUMNS>;

/** The counters in `after` that differ from `before`. */
export function changedNumberCounters(
  before: NumberCounters,
  after: NumberCounters,
): Partial<NumberCounters> {
  const keys = Object.keys(NUMBER_COUNTER_COLUMNS) as Array<keyof NumberCounters>;
  return Object.fromEntries(
    keys.filter((key) => before[key] !== after[key]).map((key) => [key, after[key]]),
  );
}

/** Writes only the given counters, for an explicit edit in the settings. */
export async function saveNumberCounters(counters: Partial<NumberCounters>): Promise<void> {
  const keys = Object.keys(counters) as Array<keyof NumberCounters>;
  await updateSettingsColumns(
    keys.map((key) => [NUMBER_COUNTER_COLUMNS[key], counters[key] ?? 0]),
  );
}

export async function saveLastAutoBackupAt(unixSeconds: number): Promise<void> {
  await execute("UPDATE settings SET last_auto_backup_at = ? WHERE id = 1", [unixSeconds]);
}

export async function saveAutoBackupInterval(days: number): Promise<void> {
  await updateSettingsColumns([["auto_backup_interval_days", days]]);
}

// --- Numbering shared by customers and vendors ---

/** Next `<prefix>NNNN`, derived from the highest numeric suffix already stored. */
async function nextPrefixedNumber(
  table: "customers" | "vendors",
  column: "customer_number" | "vendor_number",
  prefix: string,
): Promise<string> {
  const rows = await select<Record<string, string>>(
    `SELECT ${column} FROM ${table} WHERE ${column} LIKE ?`,
    [`${prefix}%`],
  );
  let max = 0;
  for (const row of rows) {
    const n = Number.parseInt(row[column].slice(prefix.length), 10);
    if (!Number.isNaN(n) && n > max) max = n;
  }
  return `${prefix}${String(max + 1).padStart(4, "0")}`;
}

// --- Customers ---

type CustomerRow = {
  id: number;
  customer_number: string;
  name: string;
  contact_person: string | null;
  street: string;
  postal_code: string;
  city: string;
  country: string;
  email: string | null;
  phone: string | null;
  vat_id: string | null;
  leitweg_id: string | null;
  receives_xrechnung: number;
  notes: string | null;
  follow_up_date: number | null;
  created_at: number;
  updated_at: number;
};

function mapCustomer(r: CustomerRow): Customer {
  return {
    id: r.id,
    customerNumber: r.customer_number,
    name: r.name,
    contactPerson: r.contact_person,
    street: r.street,
    postalCode: r.postal_code,
    city: r.city,
    country: r.country,
    email: r.email,
    phone: r.phone,
    vatId: r.vat_id,
    leitwegId: r.leitweg_id,
    receivesXrechnung: r.receives_xrechnung === 1,
    notes: r.notes,
    followUpDate: r.follow_up_date,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export async function listCustomers(search = ""): Promise<Customer[]> {
  const pattern = containsPattern(search);
  const rows =
    pattern === null
      ? await select<CustomerRow>(
          "SELECT * FROM customers ORDER BY name COLLATE NOCASE ASC",
        )
      : await select<CustomerRow>(
          `SELECT * FROM customers
           WHERE name LIKE ?1 OR customer_number LIKE ?1 OR city LIKE ?1 OR email LIKE ?1
           ORDER BY name COLLATE NOCASE ASC`,
          [pattern],
        );
  return rows.map(mapCustomer);
}

export async function getCustomer(id: number): Promise<Customer | null> {
  const rows = await select<CustomerRow>(
    "SELECT * FROM customers WHERE id = ?",
    [id],
  );
  return rows.length ? mapCustomer(rows[0]) : null;
}

export type CustomerInput = Omit<
  Customer,
  "id" | "customerNumber" | "createdAt" | "updatedAt" | "followUpDate" | "leitwegId" | "receivesXrechnung"
> & {
  customerNumber?: string;
  followUpDate?: number | null;
  leitwegId?: string | null;
  receivesXrechnung?: boolean;
};

export async function createCustomer(input: CustomerInput): Promise<number> {
  const number =
    input.customerNumber ?? (await nextPrefixedNumber("customers", "customer_number", "K-"));
  return insert(
    `INSERT INTO customers
      (customer_number, name, contact_person, street, postal_code, city, country, email, phone, vat_id, notes,
       follow_up_date, leitweg_id, receives_xrechnung)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      number,
      input.name,
      input.contactPerson ?? null,
      input.street,
      input.postalCode,
      input.city,
      input.country,
      input.email ?? null,
      input.phone ?? null,
      input.vatId ?? null,
      input.notes ?? null,
      input.followUpDate ?? null,
      input.leitwegId ?? null,
      input.receivesXrechnung ? 1 : 0,
    ],
  );
}

export async function updateCustomer(
  id: number,
  input: CustomerInput,
): Promise<void> {
  await execute(
    `UPDATE customers SET
      name = ?, contact_person = ?, street = ?, postal_code = ?, city = ?,
      country = ?, email = ?, phone = ?, vat_id = ?, notes = ?,
      follow_up_date = ?, leitweg_id = ?, receives_xrechnung = ?,
      updated_at = unixepoch()
     WHERE id = ?`,
    [
      input.name,
      input.contactPerson ?? null,
      input.street,
      input.postalCode,
      input.city,
      input.country,
      input.email ?? null,
      input.phone ?? null,
      input.vatId ?? null,
      input.notes ?? null,
      input.followUpDate ?? null,
      input.leitwegId ?? null,
      input.receivesXrechnung ? 1 : 0,
      id,
    ],
  );
}

export async function deleteCustomer(id: number): Promise<void> {
  await assertCustomerDeletable(id);
  await execute("DELETE FROM customers WHERE id = ?", [id]);
}

// --- Vendors (Lieferanten) ---

type VendorRow = {
  id: number;
  vendor_number: string;
  name: string;
  contact_person: string | null;
  street: string;
  postal_code: string;
  city: string;
  country: string;
  email: string | null;
  phone: string | null;
  vat_id: string | null;
  bank_name: string | null;
  bank_iban: string | null;
  bank_bic: string | null;
  default_category: string | null;
  notes: string | null;
  created_at: number;
  updated_at: number;
};

function mapVendor(r: VendorRow): Vendor {
  return {
    id: r.id,
    vendorNumber: r.vendor_number,
    name: r.name,
    contactPerson: r.contact_person,
    street: r.street,
    postalCode: r.postal_code,
    city: r.city,
    country: r.country,
    email: r.email,
    phone: r.phone,
    vatId: r.vat_id,
    bankName: r.bank_name,
    bankIban: r.bank_iban,
    bankBic: r.bank_bic,
    defaultCategory: r.default_category,
    notes: r.notes,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export async function listVendors(search = ""): Promise<Vendor[]> {
  const pattern = containsPattern(search);
  const rows =
    pattern === null
      ? await select<VendorRow>(
          "SELECT * FROM vendors ORDER BY name COLLATE NOCASE ASC",
        )
      : await select<VendorRow>(
          `SELECT * FROM vendors
           WHERE name LIKE ?1 OR vendor_number LIKE ?1 OR city LIKE ?1 OR email LIKE ?1
           ORDER BY name COLLATE NOCASE ASC`,
          [pattern],
        );
  return rows.map(mapVendor);
}

export async function getVendor(id: number): Promise<Vendor | null> {
  const rows = await select<VendorRow>("SELECT * FROM vendors WHERE id = ?", [id]);
  return rows.length ? mapVendor(rows[0]) : null;
}

export type VendorInput = Omit<
  Vendor,
  "id" | "vendorNumber" | "createdAt" | "updatedAt"
> & { vendorNumber?: string };

export async function createVendor(input: VendorInput): Promise<number> {
  const number =
    input.vendorNumber ?? (await nextPrefixedNumber("vendors", "vendor_number", "L-"));
  return insert(
    `INSERT INTO vendors
      (vendor_number, name, contact_person, street, postal_code, city, country,
       email, phone, vat_id, bank_name, bank_iban, bank_bic, default_category, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      number,
      input.name,
      input.contactPerson ?? null,
      input.street,
      input.postalCode,
      input.city,
      input.country,
      input.email ?? null,
      input.phone ?? null,
      input.vatId ?? null,
      input.bankName ?? null,
      input.bankIban ?? null,
      input.bankBic ?? null,
      input.defaultCategory ?? null,
      input.notes ?? null,
    ],
  );
}

export async function updateVendor(id: number, input: VendorInput): Promise<void> {
  await execute(
    `UPDATE vendors SET
      name = ?, contact_person = ?, street = ?, postal_code = ?, city = ?,
      country = ?, email = ?, phone = ?, vat_id = ?,
      bank_name = ?, bank_iban = ?, bank_bic = ?,
      default_category = ?, notes = ?, updated_at = unixepoch()
     WHERE id = ?`,
    [
      input.name,
      input.contactPerson ?? null,
      input.street,
      input.postalCode,
      input.city,
      input.country,
      input.email ?? null,
      input.phone ?? null,
      input.vatId ?? null,
      input.bankName ?? null,
      input.bankIban ?? null,
      input.bankBic ?? null,
      input.defaultCategory ?? null,
      input.notes ?? null,
      id,
    ],
  );
}

export async function deleteVendor(id: number): Promise<void> {
  await assertVendorDeletable(id);
  await execute("DELETE FROM vendors WHERE id = ?", [id]);
}
