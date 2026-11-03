# Gestaltungsregeln · Zettel Bürofreund

## Grundidee

Zettel ist der kleine Bürofreund für Selbstständige: zugänglich, hilfreich und ruhig. Das Beleg-Maskottchen macht trockenen Papierkram menschlicher. Der Produktname bleibt **Zettel**; **Bürofreund** bezeichnet die gestalterische Richtung und das Maskottchen.

**Leitsatz:** Papierkram, halb so wild.  
**Kurzbotschaft:** Lokal. Ohne Abo. Deine Daten.

## Logo und Wortmarke

Das primäre Logo besteht aus dem korallfarbenen Maskottchen und der dunklen Wortmarke. Seine Form basiert auf dem ausgewählten Konzeptbild. Die organische, leicht asymmetrische Kontur, die runden Augen und das kleine Lächeln bleiben erhalten.

Die Wortmarke hat eigene Buchstabenformen. Sie wird als Grafik verwendet und nicht mit einer Schrift neu gesetzt. Auch der Abstand zwischen den Buchstaben gehört zur Wortmarke.

- Auf hellen Flächen: `logos/horizontal-primary.svg`.
- Auf dunklen Flächen: `logos/horizontal-on-dark.svg`.
- Bei nur einer Druckfarbe: `mono-dark`, `mono-light` oder `coral`.
- Für quadratische Flächen: gestapeltes Logo oder einzelnes Maskottchen.
- Schutzraum: rundherum mindestens 20 % der sichtbaren Maskottchenbreite.
- Empfohlene Mindestbreite: horizontales Logo 160 px, Maskottchen 32 px. Für Favicons die dafür exportierten Dateien verwenden.
- Größen immer proportional ändern. Farben nur durch die vorgesehenen Varianten wechseln.

## Farben

| Farbe | HEX | Aufgabe |
| --- | --- | --- |
| Koralle | `#F06B53` | Maskottchen, Akzente, große Farbflächen |
| Rosé | `#FFE6E0` | Ruhige Flächen, Karten und Illustrationen |
| Rosine | `#30272C` | Wortmarke und Haupttext |
| Creme | `#FFF9F5` | Heller Grund |
| Dunkel | `#241F23` | Dunkler Grund |
| Tiefkoralle | `#B84332` | Kleine Akzente und Schaltflächen mit heller Schrift |
| Gedämpfte Rosine | `#7B646C` | Begleittext auf hellem Grund |
| Grün | `#337357` | Erfolg und Abschluss |

Für Text auf der hellen Koralle wird Rosine verwendet. Helle Beschriftungen erhalten Tiefkoralle oder Rosine als Hintergrund. Die konkreten Kontrastwerte stehen in `source/quality-report.json`.

Die Palette ist als CSS, JSON und GIMP-Palette unter `tokens/` enthalten. Die Grafiken sind in RGB/sRGB angelegt; Druckvorlagen vor einer kommerziellen Produktion an das Druckverfahren anpassen.

## Typografie

**Wortmarke:** individuelle, vektorisierte Buchstabenformen aus dem ausgewählten Konzept.  
**Überschriften:** Nunito, Gewicht 800–900.  
**Fließtext und Oberfläche:** Nunito Sans, Gewicht 400–600.  
**Bedienelemente und Labels:** Nunito Sans, Gewicht 700–800.

Die variable Schrift unterstützt feinere Abstufungen. Die mitgelieferten Schriftdateien bleiben unverändert. In Grafiken ist Text in Pfade umgewandelt; in der Galerie werden die lokalen Schriftdateien verwendet.

## Maskottchen

Die Hauptform ist nahezu quadratisch. Die linke Seite läuft leicht schräg, die rechte Seite bleibt ruhiger. Die untere Belegkante hat weiche Wellen. Das Gesicht sitzt im oberen mittleren Bereich.

- **smile:** Standard, Markenauftritt und neutrale Hinweise.
- **wink:** freundlicher Tipp oder Begrüßung.
- **happy:** erfolgreicher Abschluss.
- **focus:** Suche und aktive Arbeit.
- **sleepy:** ruhige Pause.
- **worried:** Fehlerhinweis, sparsam einsetzen.

Die Zusatzmimik baut auf derselben Körperkontur auf. Das Standardgesicht und die Wortmarke sind direkt aus der Referenz übernommen. Zusätzliche Gesichtsausdrücke und Illustrationen führen diese Richtung weiter.

## Formen und Oberflächen

Runde Ecken und klare Flächen bestimmen den Auftritt. Richtwerte: 12 px an Bedienelementen, 20 px an Karten, volle Rundung bei kleinen Statusflächen. Abstandsraster: 4, 8, 12, 16, 24, 32, 48, 64 und 96 px.

Illustrationen verwenden Koralle, Rosé und Rosine, mit Grün für Erfolge. Die Kernlogos bleiben flach. Schatten, Effekte und Muster gehören in Anwendungen, nicht in das Logo.

Die 82 App-Icons basieren auf einem 24-px-Raster, einheitlichen runden Linienenden und proportionalen Strichstärken. Sie decken die in der App importierten Symbole vollständig ab. Die passenden Svelte-Komponenten übernehmen die bisherigen Exportnamen und Eigenschaften. Die Softwareoberfläche kann durch Wechsel der Importquelle umgestellt werden. Zwölf zusätzliche allgemeine UI-Motive bleiben als ergänzende Assets enthalten.

## Sprache

Zettel spricht Menschen mit **du** an. Die Sprache ist direkt, hilfreich und freundlich. Rechnungen und Fehler werden klar benannt. Humor bleibt leicht und respektiert, dass es um Arbeit und Geld geht.

Beispiele:

- „Deine erste Rechnung wartet.“
- „Rechnung gespeichert.“
- „Hier ist noch Platz für deine nächste Rechnung.“
- „Das hat noch nicht geklappt. Versuch es erneut.“

## Repository und Social Media

Das README verwendet ein `picture`-Element mit hellem und dunklem PNG-Banner. Die Bilddateien liegen im Repository, damit das Banner ohne externen Bilddienst funktioniert.

- README: 1600 × 520 px, zusätzlich 3200 × 1040 px.
- GitHub Social Preview: 1280 × 640 px.
- Open Graph: 1200 × 630 px.
- Quadratischer Beitrag: 1080 × 1080 px.
- Avatar: 1024 × 1024 px.
- Profil-Cover: 1500 × 500 px.
- Desktop-Hintergrund: 3840 × 2160 px.

Die Social-Preview-Dateien sind vorbereitet. Die Repository-Einstellung auf GitHub wurde nicht verändert.
