<script lang="ts">
  import { push } from "svelte-spa-router";
  import { Card, CardContent, Button, toast } from "$lib/ui";
  import {
    Building2,
    FileText,
    Palette,
    Database,
    AlertTriangle,
    ArrowRight,
    RefreshCw,
  } from "@lucide/svelte";
  import { version as appVersion } from "../../package.json";
  import { checkForUpdate } from "$lib/updater";

  type CategoryTone = "default" | "danger";

  type Category = {
    href: string;
    icon: typeof Building2;
    title: string;
    description: string;
    items: string[];
    tone?: CategoryTone;
  };

  const categories: Category[] = [
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
      items: ["Rechnungen", "Angebote", "Nummernkreise", "ZUGFeRD-Profil", "PDF-Design"],
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
      tone: "danger",
    },
  ];

  let updateChecking = $state(false);

  async function onCheckUpdate() {
    updateChecking = true;
    try {
      const result = await checkForUpdate();
      if (result.available) {
        toast.action(
          `Update v${result.version} verfügbar`,
          {
            label: "Installieren",
            onClick: () => result.install(),
          },
          { description: "Klick zum Herunterladen und Neustarten." },
        );
      } else {
        toast.success("Bereits aktuell.", `Installierte Version: v${appVersion}`);
      }
    } catch (e) {
      toast.error("Update-Prüfung fehlgeschlagen", String(e));
    } finally {
      updateChecking = false;
    }
  }
</script>

<header class="mb-6 flex items-end justify-between gap-4">
  <div>
    <h1 class="text-3xl font-semibold tracking-tight">Einstellungen</h1>
    <p class="text-sm text-muted-foreground mt-1">
      {categories.length} Kategorien
    </p>
  </div>
  <div class="flex items-center gap-3 text-sm">
    <span class="text-muted-foreground">
      Version <code class="text-foreground">v{appVersion}</code>
    </span>
    <Button
      type="button"
      variant="outline"
      size="sm"
      onclick={onCheckUpdate}
      disabled={updateChecking}
    >
      <RefreshCw class={"size-3.5 " + (updateChecking ? "animate-spin" : "")} />
      {updateChecking ? "Prüfe…" : "Nach Updates suchen"}
    </Button>
  </div>
</header>

<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 stagger">
  {#each categories as cat (cat.href)}
    {@const isDanger = cat.tone === "danger"}
    {@const Icon = cat.icon}
    <Card
      class={[
        "group cursor-pointer hover:-translate-y-0.5 hover:shadow-md transition-all duration-200 gap-3 py-5",
        isDanger
          ? "border-destructive/40 hover:bg-destructive/5"
          : "hover:bg-muted/30",
      ].join(" ")}
      role="button"
      tabindex={0}
      onclick={() => push(cat.href)}
      onkeydown={(e: KeyboardEvent) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          push(cat.href);
        }
      }}
    >
      <CardContent class="flex flex-col gap-3">
        <div class="flex items-start justify-between gap-3">
          <div
            class={[
              "flex size-10 items-center justify-center rounded-lg",
              isDanger ? "bg-destructive/10 text-destructive" : "bg-muted text-foreground",
            ].join(" ")}
          >
            <Icon class="size-5" />
          </div>
          <ArrowRight class="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
        </div>
        <div class="space-y-1">
          <div class={["font-semibold leading-none", isDanger ? "text-destructive" : ""].join(" ")}>
            {cat.title}
          </div>
          <p class="text-sm text-muted-foreground">{cat.description}</p>
        </div>
        <ul class="flex flex-wrap gap-1.5 pt-1">
          {#each cat.items as item (item)}
            <li class="rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">
              {item}
            </li>
          {/each}
        </ul>
      </CardContent>
    </Card>
  {/each}
</div>
