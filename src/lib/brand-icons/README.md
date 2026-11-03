# Bürofreund Icons in Svelte

Dieses Verzeichnis enthält die 82 Icons, die die App am 03.11.2026 aus `@lucide/svelte` importiert. Die Formen wurden im Bürofreund-Stil neu gezeichnet.

Für den Austausch reicht es, die Importquelle einer verwendenden Datei zu ändern:

```svelte
<script lang="ts">
  import { FileText, Plus, Search } from "$lib/brand-icons";
</script>

<FileText class="size-5" />
<Plus size={20} strokeWidth={2} />
<Search size={24} color="currentColor" aria-label="Suchen" />
```

Die Exportnamen und bestehenden Aliase bleiben erhalten, zum Beispiel:

```ts
import { Calendar as CalendarIcon, Settings as SettingsIcon } from "$lib/brand-icons";
```

Unterstützt werden die vorhandenen SVG-Eigenschaften sowie `size`, `color`, `strokeWidth`, `absoluteStrokeWidth`, `class`, `style`, Ereignisse, ARIA-Attribute, `title` und Svelte-`children`. Die Icons erben standardmäßig die Textfarbe. Dekorative Icons sind für Screenreader ausgeblendet; mit Beschriftung werden sie als Grafik ausgegeben.

Die bestehende App verwendet weiter ihre bisherigen Imports. Dieses Paket bereitet die Umstellung vor; es ersetzt die Icons an den einzelnen Stellen nach Änderung der Importquelle.

Die Zuordnung zu den tatsächlich verwendenden Dateien steht im Design Kit unter `ui-icons/app-icon-inventory.json`. SVG- und PNG-Versionen liegen unter `ui-icons/app/`.
