import {
  BarChart3,
  Clock,
  Download,
  FileInput,
  FileSpreadsheet,
  FileSignature,
  FileText,
  FileWarning,
  Landmark,
  LayoutDashboard,
  Package,
  Repeat,
  Settings as SettingsIcon,
  ShieldCheck,
  Truck,
  Users,
  Wallet,
} from "$lib/brand-icons";

export type NavItem = {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  /** Further path prefixes that mark this entry active, e.g. the sub-pages shown as its tabs. */
  match?: string[];
  /** Extra palette search terms, e.g. the entry's former names. */
  keywords?: string;
  /** Shows the number of overdue invoices next to the label in the sidebar. */
  showsOverdueCount?: boolean;
};
export type NavGroup = { label: string | null; items: NavItem[] };

/** The sidebar's main navigation. */
export const NAV_GROUPS: NavGroup[] = [
  {
    label: null,
    items: [{ href: "/", label: "Übersicht", icon: LayoutDashboard, keywords: "dashboard start" }],
  },
  {
    label: "Verkauf",
    items: [
      { href: "/offers", label: "Angebote", icon: FileSignature },
      {
        href: "/invoices",
        label: "Rechnungen",
        icon: FileText,
        match: ["/reminders", "/recurring"],
        showsOverdueCount: true,
      },
      { href: "/time", label: "Zeiten", icon: Clock, keywords: "zeiterfassung stunden" },
      { href: "/catalog", label: "Katalog", icon: Package },
    ],
  },
  {
    label: "Einkauf",
    items: [
      { href: "/expenses", label: "Ausgaben", icon: FileInput, keywords: "eingangsrechnungen belege" },
    ],
  },
  {
    label: "Kontakte",
    items: [
      { href: "/customers", label: "Kunden", icon: Users },
      { href: "/vendors", label: "Lieferanten", icon: Truck },
    ],
  },
  {
    label: "Finanzen",
    items: [
      {
        href: "/reports",
        label: "Auswertungen",
        icon: BarChart3,
        match: ["/export", "/validate"],
      },
      { href: "/bank-import", label: "Bank-Abgleich", icon: Landmark, keywords: "bank-import kontoauszug" },
    ],
  },
];

/** Settings sit in the sidebar footer, outside the groups. */
export const SETTINGS_NAV_ITEM: NavItem = {
  href: "/settings",
  label: "Einstellungen",
  icon: SettingsIcon,
};

export type ReportPage = { href: string; label: string; description: string; icon: NavItem["icon"]; keywords?: string };

/** The pages behind "Auswertungen": listed on the reports hub and reachable from the palette. */
export const REPORT_PAGES: ReportPage[] = [
  {
    href: "/reports/ustva",
    label: "UStVA",
    description: "Umsatzsteuer-Voranmeldung für einen Zeitraum vorbereiten.",
    icon: BarChart3,
  },
  {
    href: "/reports/euer",
    label: "Anlage EÜR",
    description: "Einnahmen und Ausgaben des Jahres für die Einnahmenüberschussrechnung.",
    icon: FileSpreadsheet,
  },
  {
    href: "/reports/taxes",
    label: "Steuer-Rücklage",
    description: "Wie viel du für Steuern zurücklegen solltest.",
    icon: Wallet,
  },
  {
    href: "/export",
    label: "DATEV-Export",
    description: "Buchungen als DATEV-Datei für deine Steuerberatung exportieren.",
    icon: Download,
  },
  {
    href: "/validate",
    label: "E-Rechnung prüfen",
    description: "XRechnung oder ZUGFeRD-Datei gegen den KoSIT-Validator prüfen.",
    icon: ShieldCheck,
    keywords: "validieren validator kosit",
  },
];

/** Pages that are tabs under "Rechnungen" and no longer have a sidebar entry of their own. */
const INVOICE_SUBPAGES: NavItem[] = [
  { href: "/reminders", label: "Mahnungen", icon: FileWarning },
  { href: "/recurring", label: "Wiederkehrende Rechnungen", icon: Repeat, keywords: "serien abo" },
];

/** Every page the command palette's "Gehe zu" reaches: the sidebar plus the pages behind its entries. */
export const PALETTE_DESTINATIONS: NavItem[] = [
  ...NAV_GROUPS.flatMap((group) => group.items),
  ...INVOICE_SUBPAGES,
  ...REPORT_PAGES,
  SETTINGS_NAV_ITEM,
];

function startsWithPath(location: string, prefix: string): boolean {
  return location === prefix || location.startsWith(prefix + "/");
}

export function isNavItemActive(item: NavItem, location: string): boolean {
  if (item.href === "/") return location === "/";
  return [item.href, ...(item.match ?? [])].some((prefix) => startsWithPath(location, prefix));
}

export type SettingsPage = {
  href: string;
  label: string;
  /** Business pages come first in the settings sub-navigation, app pages after a divider. */
  group: "business" | "app";
  /** Extra palette search terms: the settings found on the page and the page's former names. */
  keywords: string;
};

/** The pages of the settings area, in the order of its sub-navigation. */
export const SETTINGS_PAGES = [
  {
    href: "/settings/company",
    label: "Unternehmen",
    group: "business",
    keywords: "firma firmendaten adresse anschrift bank iban bic logo handelsregister briefkopf stammdaten",
  },
  {
    href: "/settings/tax",
    label: "Steuern",
    group: "business",
    keywords:
      "steuernummer ust-idnr umsatzsteuer kleinunternehmer kleinunternehmerregelung versteuerung rücklage vorauszahlung kirchensteuer anlage eür ausgabenkategorien",
  },
  {
    href: "/settings/documents",
    label: "Belege und Nummern",
    group: "business",
    keywords: "dokumente nummernkreis nummernkreise nummernformat zähler zahlungsfrist skonto gültigkeit angebote",
  },
  {
    href: "/settings/einvoice",
    label: "E-Rechnung und PDF",
    group: "business",
    keywords: "zugferd xrechnung factur-x pdf design engine typst weasyprint sprache dokumente",
  },
  {
    href: "/settings/mail",
    label: "E-Mail-Vorlagen",
    group: "business",
    keywords: "mail betreff text vorlage platzhalter",
  },
  { href: "/settings/appearance", label: "Darstellung", group: "app", keywords: "theme hell dunkel design" },
  {
    href: "/settings/data",
    label: "Daten und Backup",
    group: "app",
    keywords:
      "backup sicherung wiederherstellung restore auto-backup integrität gobd sandbox testmodus kommandozeile cli daten",
  },
  { href: "/settings/updates", label: "Updates", group: "app", keywords: "version aktualisierung beta vorabversion" },
  {
    href: "/settings/advanced",
    label: "Gefahrenbereich",
    group: "app",
    keywords: "erweitert löschen daten zurücksetzen zähler tabellen leeren",
  },
] as const satisfies readonly SettingsPage[];

export type SettingsPageHref = (typeof SETTINGS_PAGES)[number]["href"];

export const CREATE_ACTIONS = [
  { href: "/invoices/new", label: "Neue Rechnung", keywords: "rechnung erstellen anlegen" },
  { href: "/offers/new", label: "Neues Angebot", keywords: "angebot erstellen anlegen" },
  { href: "/time?new=1", label: "Zeit erfassen", keywords: "zeiterfassung stunden zeit buchen projekt" },
  { href: "/customers/new", label: "Neuer Kunde", keywords: "kunde anlegen erstellen" },
  { href: "/expenses/new", label: "Neue Ausgabe", keywords: "eingangsrechnung beleg ausgabe erfassen" },
  { href: "/vendors/new", label: "Neuer Lieferant", keywords: "lieferant anlegen erstellen" },
] as const;
