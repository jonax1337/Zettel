import { sql } from "drizzle-orm";
import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const settings = sqliteTable("settings", {
  id: integer("id").primaryKey(), // singleton, always 1
  companyName: text("company_name").notNull().default(""),
  ownerName: text("owner_name").notNull().default(""),
  street: text("street").notNull().default(""),
  postalCode: text("postal_code").notNull().default(""),
  city: text("city").notNull().default(""),
  country: text("country").notNull().default("DE"),
  taxNumber: text("tax_number").notNull().default(""),
  vatId: text("vat_id"),
  email: text("email").notNull().default(""),
  phone: text("phone"),
  website: text("website"),
  bankName: text("bank_name").notNull().default(""),
  bankIban: text("bank_iban").notNull().default(""),
  bankBic: text("bank_bic").notNull().default(""),
  isKleinunternehmer: integer("is_kleinunternehmer", { mode: "boolean" })
    .notNull()
    .default(true),
  kleinunternehmerNote: text("kleinunternehmer_note")
    .notNull()
    .default(
      "Gemäß § 19 UStG enthält die Rechnung keinen Umsatzsteuerausweis.",
    ),
  invoiceNumberFormat: text("invoice_number_format")
    .notNull()
    .default("RE-{YYYY}-{NNNN}"),
  invoiceNumberCounter: integer("invoice_number_counter").notNull().default(0),
  offerNumberFormat: text("offer_number_format")
    .notNull()
    .default("AN-{YYYY}-{NNNN}"),
  offerNumberCounter: integer("offer_number_counter").notNull().default(0),
  defaultOfferValidityDays: integer("default_offer_validity_days")
    .notNull()
    .default(30),
  defaultPaymentTermsDays: integer("default_payment_terms_days")
    .notNull()
    .default(14),
  logoPath: text("logo_path"),
  zugferdProfile: text("zugferd_profile", {
    enum: ["basic", "en16931", "extended"],
  })
    .notNull()
    .default("en16931"),
  createdAt: integer("created_at")
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer("updated_at")
    .notNull()
    .default(sql`(unixepoch())`),
});

export const customers = sqliteTable("customers", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  customerNumber: text("customer_number").notNull().unique(),
  name: text("name").notNull(),
  contactPerson: text("contact_person"),
  street: text("street").notNull().default(""),
  postalCode: text("postal_code").notNull().default(""),
  city: text("city").notNull().default(""),
  country: text("country").notNull().default("DE"),
  email: text("email"),
  phone: text("phone"),
  vatId: text("vat_id"),
  notes: text("notes"),
  createdAt: integer("created_at")
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer("updated_at")
    .notNull()
    .default(sql`(unixepoch())`),
});

export const invoices = sqliteTable("invoices", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  number: text("number").notNull().unique(),
  customerId: integer("customer_id").notNull(),
  customerSnapshot: text("customer_snapshot").notNull().default("{}"),
  issueDate: integer("issue_date").notNull(),
  deliveryDate: integer("delivery_date"),
  dueDate: integer("due_date").notNull(),
  status: text("status", {
    enum: ["draft", "sent", "paid", "cancelled"],
  })
    .notNull()
    .default("draft"),
  subtotal: integer("subtotal").notNull().default(0),
  vatAmount: integer("vat_amount").notNull().default(0),
  total: integer("total").notNull().default(0),
  isKleinunternehmer: integer("is_kleinunternehmer", { mode: "boolean" })
    .notNull()
    .default(false),
  isReverseCharge: integer("is_reverse_charge", { mode: "boolean" })
    .notNull()
    .default(false),
  reverseChargeType: text("reverse_charge_type", {
    enum: ["none", "intra_eu", "third_country"],
  })
    .notNull()
    .default("none"),
  notes: text("notes"),
  paymentTerms: text("payment_terms"),
  pdfPath: text("pdf_path"),
  isCreditNote: integer("is_credit_note", { mode: "boolean" })
    .notNull()
    .default(false),
  correctsInvoiceId: integer("corrects_invoice_id"),
  createdAt: integer("created_at")
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer("updated_at")
    .notNull()
    .default(sql`(unixepoch())`),
  sentAt: integer("sent_at"),
  paidAt: integer("paid_at"),
});

export const invoiceItems = sqliteTable("invoice_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  invoiceId: integer("invoice_id").notNull(),
  position: integer("position").notNull(),
  description: text("description").notNull().default(""),
  quantity: real("quantity").notNull().default(1),
  unit: text("unit").notNull().default("Stk"),
  unitPrice: integer("unit_price").notNull().default(0),
  vatRate: integer("vat_rate").notNull().default(0),
  lineTotal: integer("line_total").notNull().default(0),
});

export const recurringInvoices = sqliteTable("recurring_invoices", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  customerId: integer("customer_id").notNull(),
  interval: text("interval", { enum: ["monthly", "quarterly", "yearly"] }).notNull(),
  startDate: integer("start_date").notNull(),
  nextDueDate: integer("next_due_date").notNull(),
  lastGeneratedAt: integer("last_generated_at"),
  paymentTermsDays: integer("payment_terms_days").notNull().default(14),
  isReverseCharge: integer("is_reverse_charge", { mode: "boolean" }).notNull().default(false),
  notes: text("notes"),
  paymentTerms: text("payment_terms"),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at").notNull().default(sql`(unixepoch())`),
  updatedAt: integer("updated_at").notNull().default(sql`(unixepoch())`),
});

export const recurringInvoiceItems = sqliteTable("recurring_invoice_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  recurringId: integer("recurring_id").notNull(),
  position: integer("position").notNull(),
  description: text("description").notNull().default(""),
  quantity: real("quantity").notNull().default(1),
  unit: text("unit").notNull().default("Stk"),
  unitPrice: integer("unit_price").notNull().default(0),
  vatRate: integer("vat_rate").notNull().default(0),
});

export type Settings = typeof settings.$inferSelect;
export type SettingsInsert = typeof settings.$inferInsert;
export type Customer = typeof customers.$inferSelect;
export type CustomerInsert = typeof customers.$inferInsert;
export type Invoice = typeof invoices.$inferSelect;
export type InvoiceInsert = typeof invoices.$inferInsert;
export type InvoiceItem = typeof invoiceItems.$inferSelect;
export type InvoiceItemInsert = typeof invoiceItems.$inferInsert;
export type InvoiceStatus = Invoice["status"];
export type RecurringInvoice = typeof recurringInvoices.$inferSelect;
export type RecurringInvoiceItem = typeof recurringInvoiceItems.$inferSelect;
export type RecurringInterval = RecurringInvoice["interval"];

export const offers = sqliteTable("offers", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  number: text("number").notNull().unique(),
  customerId: integer("customer_id").notNull(),
  customerSnapshot: text("customer_snapshot").notNull().default("{}"),
  issueDate: integer("issue_date").notNull(),
  validUntil: integer("valid_until").notNull(),
  status: text("status", {
    enum: ["draft", "sent", "accepted", "rejected", "expired"],
  })
    .notNull()
    .default("draft"),
  subtotal: integer("subtotal").notNull().default(0),
  vatAmount: integer("vat_amount").notNull().default(0),
  total: integer("total").notNull().default(0),
  isKleinunternehmer: integer("is_kleinunternehmer", { mode: "boolean" })
    .notNull()
    .default(false),
  isReverseCharge: integer("is_reverse_charge", { mode: "boolean" })
    .notNull()
    .default(false),
  notes: text("notes"),
  introText: text("intro_text"),
  pdfPath: text("pdf_path"),
  convertedInvoiceId: integer("converted_invoice_id"),
  createdAt: integer("created_at").notNull().default(sql`(unixepoch())`),
  updatedAt: integer("updated_at").notNull().default(sql`(unixepoch())`),
  sentAt: integer("sent_at"),
  acceptedAt: integer("accepted_at"),
  rejectedAt: integer("rejected_at"),
});

export const offerItems = sqliteTable("offer_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  offerId: integer("offer_id").notNull(),
  position: integer("position").notNull(),
  description: text("description").notNull().default(""),
  quantity: real("quantity").notNull().default(1),
  unit: text("unit").notNull().default("Stk"),
  unitPrice: integer("unit_price").notNull().default(0),
  vatRate: integer("vat_rate").notNull().default(0),
  lineTotal: integer("line_total").notNull().default(0),
});

export type Offer = typeof offers.$inferSelect;
export type OfferItem = typeof offerItems.$inferSelect;
export type OfferStatus = Offer["status"];

export type CustomerSnapshot = {
  customerNumber: string;
  name: string;
  contactPerson: string | null;
  street: string;
  postalCode: string;
  city: string;
  country: string;
  email: string | null;
  vatId: string | null;
};
