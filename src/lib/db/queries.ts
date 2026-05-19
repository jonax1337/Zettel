import { execute, select } from "./client";
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
  created_at: number;
  updated_at: number;
};

function mapSettings(r: SettingsRow): Settings {
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
    offerNumberFormat: r.offer_number_format ?? "AN-{YYYY}-{NNNN}",
    offerNumberCounter: r.offer_number_counter ?? 0,
    defaultOfferValidityDays: r.default_offer_validity_days ?? 30,
    defaultPaymentTermsDays: r.default_payment_terms_days,
    logoPath: r.logo_path,
    zugferdProfile: (r.zugferd_profile ?? "en16931") as Settings["zugferdProfile"],
    pdfTheme: (r.pdf_theme ?? "classic") as Settings["pdfTheme"],
    vendorNumberFormat: r.vendor_number_format ?? "L-{NNNN}",
    vendorNumberCounter: r.vendor_number_counter ?? 0,
    expenseNumberFormat: r.expense_number_format ?? "EX-{YYYY}-{NNNN}",
    expenseNumberCounter: r.expense_number_counter ?? 0,
    reminderNumberFormat: r.reminder_number_format ?? "MA-{YYYY}-{NNNN}",
    reminderNumberCounter: r.reminder_number_counter ?? 0,
    reminderDaysL1: r.reminder_days_l1 ?? 14,
    reminderDaysL2: r.reminder_days_l2 ?? 14,
    reminderDaysL3: r.reminder_days_l3 ?? 14,
    reminderFeeL1Cents: r.reminder_fee_l1_cents ?? 0,
    reminderFeeL2Cents: r.reminder_fee_l2_cents ?? 500,
    reminderFeeL3Cents: r.reminder_fee_l3_cents ?? 1000,
    reminderTextL1: r.reminder_text_l1 ?? "",
    reminderTextL2: r.reminder_text_l2 ?? "",
    reminderTextL3: r.reminder_text_l3 ?? "",
    legalForm: (r.legal_form ?? "freelancer") as Settings["legalForm"],
    tradeTaxRate: r.trade_tax_rate ?? 4.0,
    churchTaxRate: r.church_tax_rate ?? 0.0,
    taxFilingStatus: (r.tax_filing_status ?? "single") as Settings["taxFilingStatus"],
    estPrepaymentQ1Cent: r.est_prepayment_q1_cent ?? 0,
    estPrepaymentQ2Cent: r.est_prepayment_q2_cent ?? 0,
    estPrepaymentQ3Cent: r.est_prepayment_q3_cent ?? 0,
    estPrepaymentQ4Cent: r.est_prepayment_q4_cent ?? 0,
    usePauschalTaxReserve: (r.use_pauschal_tax_reserve ?? 0) === 1,
    pauschalTaxPercent: r.pauschal_tax_percent ?? 30.0,
    otherIncomeAnnualCent: r.other_income_annual_cent ?? 0,
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

export async function saveSettings(s: Partial<Settings>): Promise<void> {
  await execute(
    `UPDATE settings SET
      company_name = ?,
      owner_name = ?,
      street = ?,
      postal_code = ?,
      city = ?,
      country = ?,
      tax_number = ?,
      vat_id = ?,
      email = ?,
      phone = ?,
      website = ?,
      bank_name = ?,
      bank_iban = ?,
      bank_bic = ?,
      is_kleinunternehmer = ?,
      kleinunternehmer_note = ?,
      invoice_number_format = ?,
      invoice_number_counter = ?,
      offer_number_format = ?,
      offer_number_counter = ?,
      default_offer_validity_days = ?,
      default_payment_terms_days = ?,
      logo_path = ?,
      zugferd_profile = ?,
      pdf_theme = ?,
      vendor_number_format = ?,
      vendor_number_counter = ?,
      expense_number_format = ?,
      expense_number_counter = ?,
      reminder_number_format = ?,
      reminder_number_counter = ?,
      reminder_days_l1 = ?,
      reminder_days_l2 = ?,
      reminder_days_l3 = ?,
      reminder_fee_l1_cents = ?,
      reminder_fee_l2_cents = ?,
      reminder_fee_l3_cents = ?,
      reminder_text_l1 = ?,
      reminder_text_l2 = ?,
      reminder_text_l3 = ?,
      legal_form = ?,
      trade_tax_rate = ?,
      church_tax_rate = ?,
      tax_filing_status = ?,
      est_prepayment_q1_cent = ?,
      est_prepayment_q2_cent = ?,
      est_prepayment_q3_cent = ?,
      est_prepayment_q4_cent = ?,
      use_pauschal_tax_reserve = ?,
      pauschal_tax_percent = ?,
      other_income_annual_cent = ?,
      updated_at = unixepoch()
    WHERE id = 1`,
    [
      s.companyName ?? "",
      s.ownerName ?? "",
      s.street ?? "",
      s.postalCode ?? "",
      s.city ?? "",
      s.country ?? "DE",
      s.taxNumber ?? "",
      s.vatId ?? null,
      s.email ?? "",
      s.phone ?? null,
      s.website ?? null,
      s.bankName ?? "",
      s.bankIban ?? "",
      s.bankBic ?? "",
      s.isKleinunternehmer ? 1 : 0,
      s.kleinunternehmerNote ?? "",
      s.invoiceNumberFormat ?? "RE-{YYYY}-{NNNN}",
      s.invoiceNumberCounter ?? 0,
      s.offerNumberFormat ?? "AN-{YYYY}-{NNNN}",
      s.offerNumberCounter ?? 0,
      s.defaultOfferValidityDays ?? 30,
      s.defaultPaymentTermsDays ?? 14,
      s.logoPath ?? null,
      s.zugferdProfile ?? "en16931",
      s.pdfTheme ?? "classic",
      s.vendorNumberFormat ?? "L-{NNNN}",
      s.vendorNumberCounter ?? 0,
      s.expenseNumberFormat ?? "EX-{YYYY}-{NNNN}",
      s.expenseNumberCounter ?? 0,
      s.reminderNumberFormat ?? "MA-{YYYY}-{NNNN}",
      s.reminderNumberCounter ?? 0,
      s.reminderDaysL1 ?? 14,
      s.reminderDaysL2 ?? 14,
      s.reminderDaysL3 ?? 14,
      s.reminderFeeL1Cents ?? 0,
      s.reminderFeeL2Cents ?? 500,
      s.reminderFeeL3Cents ?? 1000,
      s.reminderTextL1 ?? "",
      s.reminderTextL2 ?? "",
      s.reminderTextL3 ?? "",
      s.legalForm ?? "freelancer",
      s.tradeTaxRate ?? 4.0,
      s.churchTaxRate ?? 0.0,
      s.taxFilingStatus ?? "single",
      s.estPrepaymentQ1Cent ?? 0,
      s.estPrepaymentQ2Cent ?? 0,
      s.estPrepaymentQ3Cent ?? 0,
      s.estPrepaymentQ4Cent ?? 0,
      s.usePauschalTaxReserve ? 1 : 0,
      s.pauschalTaxPercent ?? 30.0,
      s.otherIncomeAnnualCent ?? 0,
    ],
  );
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
    notes: r.notes,
    followUpDate: r.follow_up_date,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export async function listCustomers(search = ""): Promise<Customer[]> {
  if (search.trim() === "") {
    const rows = await select<CustomerRow>(
      "SELECT * FROM customers ORDER BY name COLLATE NOCASE ASC",
    );
    return rows.map(mapCustomer);
  }
  const q = `%${search.trim()}%`;
  const rows = await select<CustomerRow>(
    `SELECT * FROM customers
     WHERE name LIKE ?1 OR customer_number LIKE ?1 OR city LIKE ?1 OR email LIKE ?1
     ORDER BY name COLLATE NOCASE ASC`,
    [q],
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

async function nextCustomerNumber(): Promise<string> {
  // Format: K-0001, K-0002 ... derived from MAX existing numeric suffix.
  const rows = await select<{ customer_number: string }>(
    "SELECT customer_number FROM customers WHERE customer_number LIKE 'K-%'",
  );
  let max = 0;
  for (const r of rows) {
    const n = Number.parseInt(r.customer_number.slice(2), 10);
    if (!Number.isNaN(n) && n > max) max = n;
  }
  return `K-${String(max + 1).padStart(4, "0")}`;
}

export type CustomerInput = Omit<
  Customer,
  "id" | "customerNumber" | "createdAt" | "updatedAt" | "followUpDate"
> & {
  customerNumber?: string;
  followUpDate?: number | null;
};

export async function createCustomer(input: CustomerInput): Promise<number> {
  const number = input.customerNumber ?? (await nextCustomerNumber());
  const res = await execute(
    `INSERT INTO customers
      (customer_number, name, contact_person, street, postal_code, city, country, email, phone, vat_id, notes,
       follow_up_date)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
    ],
  );
  return Number(res.lastInsertId ?? 0);
}

export async function updateCustomer(
  id: number,
  input: CustomerInput,
): Promise<void> {
  await execute(
    `UPDATE customers SET
      name = ?, contact_person = ?, street = ?, postal_code = ?, city = ?,
      country = ?, email = ?, phone = ?, vat_id = ?, notes = ?,
      follow_up_date = ?,
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
      id,
    ],
  );
}

export async function deleteCustomer(id: number): Promise<void> {
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
  if (search.trim() === "") {
    const rows = await select<VendorRow>(
      "SELECT * FROM vendors ORDER BY name COLLATE NOCASE ASC",
    );
    return rows.map(mapVendor);
  }
  const q = `%${search.trim()}%`;
  const rows = await select<VendorRow>(
    `SELECT * FROM vendors
     WHERE name LIKE ?1 OR vendor_number LIKE ?1 OR city LIKE ?1 OR email LIKE ?1
     ORDER BY name COLLATE NOCASE ASC`,
    [q],
  );
  return rows.map(mapVendor);
}

export async function getVendor(id: number): Promise<Vendor | null> {
  const rows = await select<VendorRow>("SELECT * FROM vendors WHERE id = ?", [id]);
  return rows.length ? mapVendor(rows[0]) : null;
}

async function nextVendorNumber(): Promise<string> {
  const rows = await select<{ vendor_number: string }>(
    "SELECT vendor_number FROM vendors WHERE vendor_number LIKE 'L-%'",
  );
  let max = 0;
  for (const r of rows) {
    const n = Number.parseInt(r.vendor_number.slice(2), 10);
    if (!Number.isNaN(n) && n > max) max = n;
  }
  return `L-${String(max + 1).padStart(4, "0")}`;
}

export type VendorInput = Omit<
  Vendor,
  "id" | "vendorNumber" | "createdAt" | "updatedAt"
> & { vendorNumber?: string };

export async function createVendor(input: VendorInput): Promise<number> {
  const number = input.vendorNumber ?? (await nextVendorNumber());
  const res = await execute(
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
  return Number(res.lastInsertId ?? 0);
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
  await execute("DELETE FROM vendors WHERE id = ?", [id]);
}
