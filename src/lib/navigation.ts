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

export type NavItem = { href: string; label: string; icon: typeof LayoutDashboard };
export type NavGroup = { label: string | null; items: NavItem[] };

/** Single source for the sidebar and the command palette's "Gehe zu" entries. */
export const NAV_GROUPS: NavGroup[] = [
  {
    label: null,
    items: [{ href: "/", label: "Dashboard", icon: LayoutDashboard }],
  },
  {
    label: "Stammdaten",
    items: [
      { href: "/customers", label: "Kunden", icon: Users },
      { href: "/vendors", label: "Lieferanten", icon: Truck },
      { href: "/catalog", label: "Katalog", icon: Package },
    ],
  },
  {
    label: "Ausgangsbelege",
    items: [
      { href: "/offers", label: "Angebote", icon: FileSignature },
      { href: "/invoices", label: "Rechnungen", icon: FileText },
      { href: "/reminders", label: "Mahnungen", icon: FileWarning },
      { href: "/recurring", label: "Wiederkehrende Rechnungen", icon: Repeat },
      { href: "/time", label: "Zeiterfassung", icon: Clock },
      { href: "/bank-import", label: "Bank-Import", icon: Landmark },
    ],
  },
  {
    label: "Eingangsbelege",
    items: [{ href: "/expenses", label: "Eingangsrechnungen", icon: FileInput }],
  },
  {
    label: "Auswertung",
    items: [
      { href: "/reports/ustva", label: "UStVA", icon: BarChart3 },
      { href: "/reports/euer", label: "Anlage EÜR", icon: FileSpreadsheet },
      { href: "/reports/taxes", label: "Steuer-Rücklage", icon: Wallet },
      { href: "/export", label: "DATEV-Export", icon: Download },
      { href: "/validate", label: "E-Rechnung validieren", icon: ShieldCheck },
    ],
  },
  {
    label: "System",
    items: [{ href: "/settings", label: "Einstellungen", icon: SettingsIcon }],
  },
];

export const SETTINGS_PAGES = [
  { href: "/settings/company", label: "Unternehmen" },
  { href: "/settings/documents", label: "Dokumente" },
  { href: "/settings/appearance", label: "Darstellung" },
  { href: "/settings/data", label: "Daten" },
  { href: "/settings/advanced", label: "Erweitert" },
] as const;

export const CREATE_ACTIONS = [
  { href: "/invoices/new", label: "Neue Rechnung", keywords: "rechnung erstellen anlegen" },
  { href: "/offers/new", label: "Neues Angebot", keywords: "angebot erstellen anlegen" },
  { href: "/time?new=1", label: "Zeit erfassen", keywords: "zeiterfassung stunden zeit buchen projekt" },
  { href: "/customers/new", label: "Neuer Kunde", keywords: "kunde anlegen erstellen" },
  { href: "/expenses/new", label: "Neue Ausgabe", keywords: "eingangsrechnung beleg ausgabe erfassen" },
  { href: "/vendors/new", label: "Neuer Lieferant", keywords: "lieferant anlegen erstellen" },
] as const;
