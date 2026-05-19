<script lang="ts">
  import { Building2, FileText, Palette, Database, AlertTriangle } from "@lucide/svelte";
  import SettingsCategoryCard from "./settings/SettingsCategoryCard.svelte";

  const categories = [
    {
      href: "/settings/company",
      icon: Building2,
      title: "Unternehmen",
      description: "Stammdaten, die im Briefkopf jeder Rechnung erscheinen.",
      items: ["Firma", "Adresse", "Steuer", "Steuerprofil", "Bank", "Logo"],
    },
    {
      href: "/settings/documents",
      icon: FileText,
      title: "Dokumente",
      description: "Rechnungen, Angebote, Nummernkreise und E-Rechnung-Profil.",
      items: ["Rechnungen", "Angebote", "Nummernkreise", "ZUGFeRD-Profil"],
    },
    {
      href: "/settings/appearance",
      icon: Palette,
      title: "Darstellung",
      description: "Theme und Akzentfarbe der App-Oberfläche.",
      items: ["Theme", "Akzentfarbe"],
    },
    {
      href: "/settings/data",
      icon: Database,
      title: "Daten",
      description: "Backup, Wiederherstellung und Sandbox-Modus.",
      items: ["Backup", "Wiederherstellung", "Sandbox"],
    },
    {
      href: "/settings/advanced",
      icon: AlertTriangle,
      title: "Erweitert",
      description: "Gefahrenzone — Daten löschen und Counter zurücksetzen.",
      items: ["Daten löschen", "Tabellen leeren", "Counter-Reset"],
      tone: "danger" as const,
    },
  ];
</script>

<div class="container mx-auto max-w-5xl space-y-8 py-10">
  <div class="space-y-1">
    <h1 class="text-3xl font-semibold tracking-tight">Einstellungen</h1>
    <p class="text-sm text-muted-foreground">
      Wähle eine Kategorie um die zugehörigen Einstellungen zu bearbeiten.
    </p>
  </div>

  <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
    {#each categories as cat (cat.href)}
      <SettingsCategoryCard
        href={cat.href}
        icon={cat.icon}
        title={cat.title}
        description={cat.description}
        items={cat.items}
        tone={cat.tone}
      />
    {/each}
  </div>
</div>
