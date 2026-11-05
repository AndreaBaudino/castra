---
version: 1
name: Castra · Forge
description: Il tema di Castra. Si basa su Forge (fondo grafite, bordi sottili, un solo accento ember) e tiene i componenti, le immagini e i dati dell'app.
themes: [dark, light] # "Auto" segue il telefono
colors:
  dark:
    bg: "#0B0B0C"          # Ink, --bg
    surface: "#131315"     # Graphite, --surface
    surface-2: "#1B1B1E"   # Slate, --surface-2
    line: "#26262A"        # Filament, --line
    line-strong: "#2F2F34" # --line-strong
    text: "#F2F2F3"        # Bone, --text
    muted: "#8B8B92"       # Ash, --muted
    accent: "#F65A1A"      # Ember, --red (fondi) e --gold (testi, schede attive)
    accent-hover: "#FF7A38" # Spark, --red-strong
    on-accent: "#0B0B0C"   # testo sopra l'ember, --on-accent
    good: "#4FB477"        # --good
    mid: "#D9A441"         # --mid
    bad: "#E2403A"         # --bad
    stale: "#E3B341"       # --stale
  light:
    bg: "#F4F4F1"
    surface: "#FFFFFF"
    surface-2: "#EEEEEA"
    line: "#E2E2DD"
    line-strong: "#D3D3CD"
    text: "#17171A"
    muted: "#67676E"
    accent: "#F65A1A"      # i fondi pieni restano ember (--red)
    accent-text: "#C2410C" # testi e link ember sul chiaro (--gold)
    on-accent: "#0B0B0C"
    good: "#1F8A4C"
    mid: "#8A6100"
    bad: "#C62E28"
    stale: "#A87B00"
  brand:
    crest: "#EF4136"       # la cresta dell'elmo, --crest
typography:
  display: { fontFamily: "Space Grotesk", weight: "600-700", letterSpacing: "-0.02em", var: "--font-display" }
  body: { fontFamily: "Inter", weight: "400-600", var: "font-family del :root" }
  mono: { fontFamily: "JetBrains Mono", weight: "500-600", var: "--font-mono" }
  files: "src/assets/fonts/*.woff2 (sottoinsieme latino, licenza OFL in src/assets/fonts/OFL.txt)"
rounded:
  none: "0px"      # tabelle, divisori
  tag: "2px"       # tag di stato, badge
  base: "4px"      # card, pulsanti, campi, selettori: --radius
  sheet: "8px"     # fogli e dialoghi
  full: "999px / 50%" # solo interruttori, pallini, simboli di mana, avatar, tasto Partita
components:
  button-primary: { background: "--red", text: "--on-accent", font: "mono, maiuscolo", height: "44px", class: ".btn.primary" }
  button-tonal: { background: "--red al 12%", border: "--red al 45%", text: "--gold", class: ".btn.tonal" }
  button-secondary: { background: "transparent", border: "--line", text: "--text", class: ".btn" }
  selector: { border: "1px --line", selected: "--line-strong + --text", class: ".seg, .chip" }
  tab-active: { text: "--text", line: "2px --gold" }
  toggle: { off: "--surface-2 + pallino --muted", on: "--gold + pallino --on-accent", class: ".switch" }
  card: { background: "--surface", border: "1px --line", radius: "--radius" }
  game-button: { shape: "tondo", background: "--red", class: ".tabbar .fab" }
---

## In breve

Castra usa Forge come stile, ma **i componenti restano quelli dell'app**: stessa posizione, stesso ordine, stessi testi.
Cambiano colori, caratteri, angoli e bordi. Fondo grafite, bordi sottili da 1px al posto di ombre e sfumature, e un
solo accento **ember** per l'azione principale, la scheda attiva e il focus.

Tutte le regole stanno nelle variabili di `src/index.css` (`:root`, poi il tema chiaro sia in
`@media (prefers-color-scheme: light)` sia in `:root[data-theme='light']`): nei componenti si usano le variabili, mai
colori fissi. Questo file e `index.css` vanno tenuti allineati.

## Colori

| Ruolo | Scuro | Chiaro | Variabile | Uso |
| --- | --- | --- | --- | --- |
| Fondo | `#0B0B0C` | `#F4F4F1` | `--bg` | fondo delle pagine |
| Superficie | `#131315` | `#FFFFFF` | `--surface` | card, pannelli, barra in basso |
| Superficie incassata | `#1B1B1E` | `#EEEEEA` | `--surface-2` | campi, riquadri dentro le card |
| Bordo | `#26262A` | `#E2E2DD` | `--line` | bordi e righe da 1px |
| Bordo forte | `#2F2F34` | `#D3D3CD` | `--line-strong` | scelta attiva nei selettori, hover |
| Testo | `#F2F2F3` | `#17171A` | `--text` | testo principale |
| Testo secondario | `#8B8B92` | `#67676E` | `--muted` | etichette, note, barre dei dati |
| Ember (fondi) | `#F65A1A` | `#F65A1A` | `--red` | pulsante principale, tasto Partita, Nuova partita |
| Ember (testi) | `#F65A1A` | `#C2410C` | `--gold` | link, scheda attiva, focus, tonali |
| Testo sull'ember | `#0B0B0C` | `#0B0B0C` | `--on-accent` | testo e icone sopra i fondi ember |

L'ember del chiaro è più scuro nei testi perché `#F65A1A` su bianco non si legge abbastanza. Colore principale e di
risalto si possono cambiare dalla Grafica: `applyTheme` (`src/lib/theme.ts`) sovrascrive `--red` e `--gold` solo se
diversi dal predefinito. Il testo sopra l'ember (`--on-accent`) segue il colore principale: resta scuro sui colori
chiari e diventa bianco su quelli scuri, scegliendo quello con più contrasto (`inkOn`). I temi salvati prima di Forge (rosso `#b8322a`, oro `#d4a64a`) contano come predefiniti
(`currentTheme`).

## Colori di stato

| Stato | Scuro | Chiaro | Variabile | Quando |
| --- | --- | --- | --- | --- |
| Buono | `#4FB477` | `#1F8A4C` | `--good` | winrate da 55% in su, vittorie, "legale", dati aggiornati |
| Medio | `#D9A441` | `#8A6100` | `--mid` | winrate tra 45% e 55%, pareggi |
| Cattivo | `#E2403A` | `#C62E28` | `--bad` | winrate fino al 45%, sconfitte, carte bandite, errori |
| Non aggiornato | `#E3B341` | `#A87B00` | `--stale` | pallino dei dati vecchi, salvataggio in corso |

Le soglie dei winrate sono in `wrClass` (`src/components/ui.tsx`). I **pallini di stato** (`.live-dot`) sono tondi:
verde che pulsa = dati aggiornati o tornei in corso; giallo fisso = dati non aggiornati; rosso fisso = nessun dato o
nessun torneo. La riga "Tornei in corso" in Home c'è sempre, con il pallino verde o rosso.

## Colori che sono dati (eccezioni)

Forge vuole un solo colore saturo. Restano però, perché sono informazioni e non decorazione:
- i colori del mana (`--W`, `--U`, `--B`, `--R`, `--G`, `--C`), per le barre: i simboli veri e propri sono le SVG di Scryfall;
- i colori della torta del meta (`--pie-1`…`--pie-8`, scelti per restare distinguibili anche ai daltonici) e le due
  serie del confronto (`--cmp-a`, `--cmp-b`);
- i colori dei giocatori nel life counter (`--p0`, `--p1`), scelti nella Grafica: pannelli pieni, senza sfumature (se non
  c'è l'illustrazione di una carta, vedi sotto);
- la cresta rossa dell'elmo (`--crest`).

Le barre che misurano un dato (quota del meta) sono grigie (`--muted`), non ember.

## Caratteri

- **Space Grotesk** (`--font-display`): titoli delle pagine, nome "Castra", numeri grandi (vite, riepiloghi, `.stat-num`).
  Prende il posto di Georgia.
- **Inter** (font del `:root`): testi, nomi, campi.
- **JetBrains Mono** (`--font-mono`): testo dei pulsanti e dei selettori (maiuscolo), tag, timer, codici, punteggi.

I caratteri sono **dentro l'app** (`src/assets/fonts`, solo il sottoinsieme latino, circa 100 KB in tutto) e il service
worker li salva (`globPatterns` in `vite.config.ts`): senza rete, per esempio al life counter durante un torneo, l'app
resta uguale. Non caricarli da Google Fonts. Caratteri fuori dal sottoinsieme latino (✓, simboli) ricadono su quelli
di sistema.

## Angoli e forme

Angoli da **4px** (`--radius`) per card, pulsanti, campi e selettori; **2px** per i tag; **8px** per i fogli che salgono
dal basso. Il **tondo** resta solo a interruttori, pallini di stato, simboli di mana, avatar e al **tasto Partita** al
centro della barra in basso. Le forme delle carte (immagini di Magic) mantengono i loro angoli.

Niente ombre o sfumature per dare profondità: bordi da 1px e il cambio tra fondo, superficie e superficie incassata.
L'ombra resta solo sotto menu e fogli.

## Componenti

Si tengono i componenti esistenti e si cambia solo lo stile.

**Pulsanti**, tre livelli:
1. **Pieno ember** (`.btn.primary`): solo l'azione principale di una schermata o di un foglio (Nuova partita, tasto
   Partita, Salva risultato, Iscriviti nel foglio, Avvia il turno, Accedi).
2. **Tonale** (`.btn.tonal`): le azioni nell'intestazione di una pagina o di una card (Aggiungi partita, Nuovo mazzo,
   Segna risultato, Conferma, Iscriviti nella card del torneo).
3. **Secondario** (`.btn`, `.btn.ghost`): tutto il resto (Entra, Trova il mio nome, Correggi, Drop).

Una schermata ha al massimo un elemento pieno ember per gruppo.

**Selettori** (`.seg`, `.chip`): un gruppo con bordo sottile; la scelta attiva su `--line-strong` con testo `--text`.
I colori dei comandanti (`Pips`, 4 px più grandi della misura chiesta) e del filtro del meta (`.color-pick`) sono i simboli di mana di Magic (le SVG di Scryfall, come nella ricerca carte); nel filtro sono spenti al 45%, accesi pieni con un anello ember.

**Schede e barra in basso**: la voce attiva ha il testo `--text` e una riga ember da 2px. Il tasto Partita è tondo, ember,
sporgente.

**Card**: superficie, bordo da 1px, angoli da 4px. Titolo in Inter 600; i titoli di sezione in Space Grotesk.

**Interruttori**: spenti grigi; accesi ember con il pallino scuro.

**Intestazione**: niente occhiello sopra i titoli. Lo slogan ("Every legion needs a camp") e la stagione vanno sotto il
titolo, in `--muted`.

## Immagini delle carte

- Nella lista dei mazzi l'immagine del comandante sta a sinistra e **sfuma verso destra** (`.deck-art`, maschera
  lineare); nome e dati sono a destra con un alone del colore della card.
- In Home le tessere (Top del meta, I miei mazzi) hanno l'immagine piena con una sfumatura verso il basso.
- Nel mazzo aperto l'immagine in alto sfuma nel fondo della pagina. Sopra il nome c'è l'autore (`.deck-author`): avatar
  tondo da 24 px (foto del giocatore verificato o iniziale su `--gold`), nome e, per il proprietario, l'etichetta con la
  visibilità (`.tag`).
- Nel life counter l'illustrazione scelta per un giocatore (`.player-art`) parte dal lato verso la barra centrale e sfuma
  nel colore del giocatore prima dei contatori, che restano sul colore pieno. Le vite hanno un'ombra leggera per leggersi
  sull'immagine (l'unica eccezione alla regola "niente ombre"). Sul bordo verso la barra, i pulsanti "Sfondo" e X
  (`.art-btns`) sono neri semitrasparenti con bordo bianco al 28% e testo bianco, per leggersi su immagine e colore.

## Telefono e computer

L'app nasce per il telefono. Sopra i 1024px (`useWide`, `@media (min-width: 1024px)`) c'è il menu laterale con logo,
Nuova partita piena, voci con la voce attiva su fondo `--surface-2`, e il profilo in fondo; le pagine si dispongono a
più colonne. Stesse regole di colori, angoli e caratteri.

## Tema chiaro

Stessi componenti e stesse regole: fondo quasi bianco, card bianche, bordi grigio chiaro, testo quasi nero. I fondi
ember restano `#F65A1A` con testo scuro; testi e link ember usano `#C2410C`. Il life counter e il suo menu restano
scuri in entrambi i temi.

## App installata

- `theme_color` e `background_color` del manifest (`vite.config.ts`) e `<meta name="theme-color">` (`index.html`):
  `#0B0B0C`.
- Icone (`public/icon*.png`, `public/icon.svg`, `apple-touch-icon.png`) e immagini di avvio (`public/splash/`) su fondo
  `#0B0B0C`, con l'elmo uguale.
- `public/og.png` (anteprima dei link): stessa impaginazione di sempre, "CENTURION COMMANDER" sopra in oro, "Castra" in
  Space Grotesk, il motto in corsivo sotto; fondo `#0B0B0C`.
- `public/privacy.html` usa le stesse variabili di colore.

## Da fare e da evitare

**Sì**
- Usare le variabili di `index.css`; un colore nuovo diventa una variabile, in scuro e in chiaro.
- Un solo ember pieno per gruppo; le altre azioni tonali o secondarie.
- Mono solo per dati veri e per i pulsanti: numeri, timer, codici, punteggi, intestazioni delle tabelle.
- Bordi da 1px per separare; più rilievo cambiando fondo, non con le ombre.
- Controllare entrambi i temi e la vista da computer.

**No**
- Un secondo colore saturo oltre all'ember (tranne i colori che sono dati, sopra).
- Angoli oltre gli 8px; pillole per pulsanti o tag.
- Mono per frasi o paragrafi.
- Occhielli in maiuscoletto sopra i titoli, numerazioni decorative, metadati di riempimento.
- Bordi spessi per dare enfasi: si usa l'ember.
- Caratteri caricati da internet.
