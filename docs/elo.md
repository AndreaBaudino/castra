# Elo dei giocatori

Un numero che dice quanto è forte un giocatore del circuito, indipendentemente da quanti tornei gioca (la classifica a
punti premia anche la presenza). Deciso con il proprietario a novembre 2026, prima di scrivere codice; i primi mockup,
con due idee a confronto, sono su [claude.ai](https://claude.ai/artifact/43dyDSrGXUom4xLkPcyxkH) (privati). I mockup
dell'Elo definitivo, approvati, sono su [claude.ai](https://claude.ai/artifact/MbebbJCKsDawjSAMYpTzAY) (privati).

## In breve: le impostazioni decise

| Cosa | Valore |
| --- | --- |
| Metodo | Glicko adattato (Elo + margine), un numero solo chiamato "Elo" |
| Partenza | 1º gennaio, tutti a 1000 ± 100; reset ogni anno |
| Chi arriva dopo gennaio | 25° percentile dell'Elo che si vede in quel momento, ± 100 |
| Margine | minimo ± 40; con le pause √(margine² + 5² × giorni), massimo ± 100 |
| Peso dei tornei | tappa e lega online ×1, livello 1 ×1,5, livello 2 ×2 |
| Fonti | foglio (piazzamento contro tutti gli iscritti) + match di Castra (`pm`), un torneo conta una volta |
| Top | solo nei livelli 1 e 2 |
| Bye e pareggio intenzionale | non contano; pareggio giocato = mezza vittoria |
| Aggiornamento | la notte dopo che il torneo è scritto nel foglio |
| Elo di lega | velocità 4, impara solo nei livelli, resta intero a gennaio; arriva a ogni giocatore al suo torneo successivo |
| Calo per le pause | 10 punti al mese dal 2º mese intero senza tornei, mai sotto 1000 (sotto 1000 nessun calo) |
| Provvisorio | margine dell'ultimo torneo sopra ± 80 |
| Inattivo | più di 3 mesi senza tornei: classifica a parte, torna al primo torneo |
| Rank | romani ogni 100 punti (Tirone sotto 800 … Optio da 1000 … Primipilo da 1200) con divisioni III-II-I di circa 33 punti; podio sempre per i primi 3 della classifica |
| Dove si vede | voce ELO nelle classifiche, scheda del giocatore, (i), testa a testa; pubblico |

## 1. Da dove vengono i dati

- **Fogli dei tornei**: per ogni iscrizione piazzamento, vittorie, sconfitte, pareggi e bye, ma non contro chi si è
  giocato.
- **Tornei giocati in Castra**: ogni match, con i due giocatori e il risultato. Il build del meta li legge da
  Firestore (`tournaments/{id}/matches`) dopo la pubblicazione sul foglio e li pubblica nel campo `pm` di
  `meta-<anno>.json`: `[torneo, iscrizione, iscrizione, game vinti dal primo, dal secondo, pareggiati, turno]`, con le
  iscrizioni del foglio (anche chi non ha il comandante). Il turno separa lo svizzero dalla top. Pubblici come la
  pagina dal vivo del torneo.
- Il foglio resta la base di tutto: i match sono un di più che rende l'Elo più preciso dove ci sono.
- Nel 2026 contano tutti e due; dal 2027, se tutti i tornei passano da Castra, resteranno solo i match. Le regole
  sotto valgono comunque per tutti e due: i tornei scritti solo nel foglio potrebbero esserci sempre, e un torneo deve
  pesare uguale da qualunque parte arrivi.
- Un torneo giocato in Castra e pubblicato sul foglio conta **una volta sola**, con i match di Castra.

## 2. Le regole

L'Elo si calcola con il metodo **Glicko** (adattato al circuito, sezione 6): ogni giocatore ha due numeri, l'**Elo**
e un **margine**, cioè quanto il sistema è sicuro di quell'Elo (1150 ± 60). Con il margine piccolo una partita sposta
poco, con il margine largo sposta molto. Nell'app si chiama comunque "Elo".

- **Chi arriva dopo gennaio** parte dal **25° percentile** dell'Elo di quel momento (l'Elo che ha un giocatore su
  quattro dal basso: nel 2026 da 938 a febbraio a 846 a novembre), sempre con ± 100. Partendo dalla base i nuovi
  andavano 11 punti percentuali sotto il previsto al primo torneo e regalavano punti agli abituali (sezione 6).
- **Elo di lega**: ogni lega ha anche un suo correttivo, che impara da solo nei livelli (dove le leghe si incontrano):
  dopo ogni livello, per ogni giocatore con una lega di casa (quella dove gioca più tappe), il correttivo della sua lega
  si sposta di 4 × Σ peso × (risultato − atteso). Se i giocatori di una lega rendono nei livelli meno di quanto dice il
  loro Elo, il correttivo scende. L'Elo che si vede è **un numero solo**: Elo del giocatore + correttivo della sua lega.
  Chi gioca solo livelli non ha correttivo.
- **Lo spostamento della lega arriva al torneo successivo**: ogni giocatore tiene il correttivo che la sua lega aveva al
  suo ultimo torneo, quindi il suo Elo si muove solo quando gioca e i punti già presi non cambiano. Al torneo dopo
  prende il correttivo di quel momento, mostrato a parte nella riga del torneo ("torneo +22,1 · lega −13,9"). Il torneo
  usa per tutti i risultati attesi il correttivo aggiornato, quindi le previsioni sono le stesse di un correttivo
  applicato subito a tutti; cambia solo il numero mostrato di chi non gioca, che in classifica resta a com'era al suo
  ultimo torneo (anche il 25° percentile dei nuovi si calcola su questo numero). Applicato subito, il correttivo
  spostava di notte l'Elo di chi non aveva giocato: sul 2026 di solito di 10 punti, una volta su dieci oltre 30
  (Savona −46 dopo il livello 2 di Albisola). Calmarlo costava precisione (68,0% invece di 69,3% tra leghe diverse),
  spostarlo solo al cambio di stagione ancora di più (66,7%). Così si correggono i gruppi
  chiusi (una lega con tante tappe tra gli stessi giocatori) senza decisioni a tavolino: provato sul 2026, prevede
  meglio di ogni correzione decisa con una misura a giugno (sezione 6). A fine 2026: Savona −83, Genova −34, Roma −19,
  Sanremo +78, Lega Online +60, Latina / Frosinone +55.
- **A gennaio l'Elo di lega resta intero** (ripartono i giocatori, non le leghe): con i giocatori a 1000 è l'unica
  memoria di quanto vale una lega. Sul 2026, con un finto capodanno il 1º giugno, tenerlo intero prevede meglio la s2
  (leghe diverse nei livelli 68,3%, log-loss 0,593; a metà 67,2% / 0,598; azzerato 65,4% / 0,607); il correttivo
  imparato solo sulla s1 e solo sulla s2 si somiglia (7 leghe su 9 con lo stesso segno, correlazione +0,52). Continua
  a imparare, quindi una lega che cambia si riallinea da sola. La prova vera a fine 2027.
- **Un anno alla volta**: il 1º gennaio tutti ripartono da **1000 ± 100** (1000 scelto perché sembra più "centrale":
  il numero di partenza è solo estetico, spostarlo sposta tutti allo stesso modo e non cambia la classifica). Ogni anno ha il suo Elo, come le
  classifiche. (Il Glicko classico parte da ± 350, ma con tutti che ripartono insieme le prime tappe spostano
  centinaia di punti e la classifica non si rimette più in ordine: sezione 6.)
- **Il margine scende giocando** (ogni partita lo restringe, prima in fretta poi sempre più piano, fino a un minimo di
  ± 40) e **risale con le pause**: prima di ogni torneo diventa √(margine² + 5² × giorni dall'ultimo torneo), al
  massimo ± 100. Tre mesi fermo: da ± 55 a ± 73.
- **Peso del torneo**: tappa di lega ×1 (anche la lega online), livello 1 ×1,5, livello 2 ×2. Una partita di un
  livello 2 conta come due partite di una tappa. Ogni partita giocata conta, nel foglio come in Castra: chi gioca più
  partite (la top) si muove di più, chi entra tardi o fa drop di meno.
- **Contro chi**: il risultato atteso viene dalla differenza di Elo, come negli scacchi:
  1 / (1 + 10^(−g × (Elo mio − Elo avversario) / 400)); con 100 punti di differenza il più forte vince 64 volte su
  100. g (tra 0 e 1) abbassa un po' il peso degli avversari dal margine largo, perché non si sa bene quanto valgono:
  g = 1 / √(1 + 3q² × margine dell'avversario² / π²), con q = ln 10 / 400.
- **Quanto si guadagna** in un torneo, con le partite pesate (sezioni 3 e 4), tutte con i numeri di inizio torneo:
  - informazione = Σ peso × q² × g² × atteso × (1 − atteso);
  - nuovo margine = 1 / √(1 / margine² + informazione), non sotto ± 40;
  - nuovo Elo = Elo + q × nuovo margine² × Σ peso × g × (risultato − atteso).

  Il risultato vale 1 la vittoria, ½ il pareggio, 0 la sconfitta (il 2-1 come il 2-0). Esempio, una partita di una
  tappa con 1100 ± 55 contro un avversario ± 60:

  | Avversario | Probabilità di vincere | Vittoria | Sconfitta |
  | --- | --- | --- | --- |
  | 900 | 76% | +4,1 | −12,7 |
  | 1100 | 50% | +8,4 | −8,4 |
  | 1300 | 24% | +12,7 | −4,1 |

  Con ± 90 (chi gioca poco o torna da una pausa) gli stessi risultati valgono circa due volte e mezza: +21,5 / −21,5
  alla pari. Battere uno forte rende, perdere con uno debole costa, come nell'Elo classico.
- **Chi gioca tanto si muove piano** perché il sistema lo conosce già, senza regole sul numero di tappe: nella stagione
  2 Crifo' (152 partite nell'anno, ± 53) si muove in media di 7,3 punti a tappa a Savona, Carzaniga (27 partite, ± 68)
  di 14,8 nella stessa lega. Chi gioca poco non viene toccato, e il passato non cambia mai.
- Per tutte le partite di un torneo valgono Elo e margine di **prima del torneo**: il torneo si calcola tutto insieme,
  poi si passa al successivo. L'Elo si aggiorna a torneo finito, quando è scritto nel foglio: lo calcola il build
  notturno del meta, quindi si vede la notte dopo la pubblicazione (un torneo di Castra non ancora pubblicato non
  conta).
- **I punti non passano di mano esattamente**: ognuno si muove con il suo margine, nel foglio come in Castra. Nel 2026
  la media finisce a 994 invece di 1000.
- **Ordine dei tornei**: per data; una tappa senza data viene subito dopo la tappa precedente della sua lega (come in
  `docs/liste-mazzi.md`), con 0 giorni di pausa.

### Cosa conta

- **Top**: solo nei livelli 1 e 2, come per i punti del circuito. Nelle tappe di lega l'Elo si ferma allo svizzero,
  anche se la top si gioca per i premi.
- **Bye**: non conta (non è una partita).
- **Pareggio intenzionale** (0-0, ID): non conta. Il **pareggio giocato** vale mezza vittoria: i punti 3-1-0 servono
  a scoraggiare i pareggi in torneo, non a misurare la forza; con un terzo, due giocatori dello stesso livello che
  pareggiano perderebbero Elo tutti e due.
- Le iscrizioni senza nome e i tornei senza risultati (V/S/P vuoti) restano fuori.

## 3. Tornei di Castra

Ogni match dello svizzero, e della top nei livelli 1 e 2, è una partita con il peso del torneo, contro l'avversario
vero. Ognuno dei due la usa con il suo margine.

## 4. Tornei dal foglio

Non sapendo gli avversari, ogni giocatore viene confrontato con **tutti gli altri iscritti** in base al piazzamento:
"vince" contro chi è arrivato sotto, "perde" contro chi è arrivato sopra, pareggia con chi ha lo stesso piazzamento.

- Ogni confronto pesa: peso del torneo × **media delle partite giocate dai due** (vittorie + sconfitte + pareggi, tolto
  il bye) ÷ (iscritti − 1). In tutto, per ogni giocatore, i confronti pesano circa quanto le sue partite, come in
  Castra; chi gioca la top pesa di più perché tutti i suoi confronti valgono di più.
- La media delle partite dei due (e non solo le proprie) tiene lo stesso peso al confronto visto da tutti e due i lati.

## 5. Dove si vede

- **Pubblico**: una classifica Elo per tutti e l'Elo nella scheda di ogni giocatore.
- In classifica si entra dalla **prima partecipazione**. Con il margine del suo ultimo torneo sopra **± 80** l'Elo è
  "provvisorio" (ha giocato poco): compare con l'etichetta e sta sotto gli altri.
- **Calo per le pause**: dal **secondo mese intero** (60 giorni) senza tornei si perdono **10 punti al mese** (2 mesi
  −10, 3 mesi −20, 4 mesi −30…), mai sotto **1000** (chi è già sotto non perde niente). Si vede subito nel numero e,
  al rientro, a parte nella riga del torneo ("torneo +12,0 · lega −5,0 · pausa −20,0"); continua anche da inattivo,
  fino a gennaio. Chi salta un mese non perde niente. 10 è circa mezzo torneo: un abituale si muove di 19 punti a
  torneo (mediana; uno su quattro oltre 31) e di 31 in un mese in cui gioca. È l'unica eccezione a "l'Elo cambia solo
  quando giochi", perché dipende solo da chi non gioca. Sul 2026 prevede un po' meglio di nessun calo (66,65% / 0,6063
  invece di 66,54% / 0,6075): chi rientra rende un po' meno del suo vecchio Elo. Dal secondo mese 15 al mese 0,6064,
  20 o 25 0,6065; dal primo mese 10 al mese 0,6061, ma toccava anche chi salta un mese solo. Al rientro il margine è
  comunque più largo (al massimo 2,7 volte un giocatore attivo dopo 9 mesi, a 3 mesi circa 1,6), quindi chi torna in
  forma recupera in fretta. Far crescere il margine più in fretta con le pause prevede peggio (velocità 8 al posto di
  5: 0,6090).
- **Inattivi**: chi non gioca un torneo da **più di 3 mesi** passa in una classifica a parte, sotto i provvisori, con
  l'Elo calato dalle pause; al primo torneo torna in classifica. Il provvisorio guarda il margine dell'ultimo torneo,
  non quello cresciuto con la pausa, così le due etichette non si sovrappongono. Al 12/11/2026: 141 in classifica, 59
  provvisori, 164 inattivi.
- **Classifiche**: una voce a sé, `CLASSIFICA · ELO · EVENTI · LEGHE · RECORD`, con i filtri di lega e dei seguiti.
  Ogni riga: posizione, nome, lega, partite, Elo e quanto è cambiato in 30 giorni; sotto i provvisori, con
  l'etichetta, e gli inattivi con la data dell'ultimo torneo e quanto hanno perso; in fondo la propria riga. Il link "Come funziona l'Elo" apre la (i).
- **Scheda del giocatore** (Circuito): Elo, cambio in 30 giorni, posizione, partite, margine, grafico dell'anno (un
  punto per torneo) e i tornei con lo spostamento e l'Elo dopo. Un torneo di Castra si apre sulle sue partite, con
  l'Elo dell'avversario e quanto ha reso ognuna. Lo spostamento della lega e il calo per la pausa, quando ci sono,
  stanno a parte nella riga del torneo: "torneo +22,1 · lega −13,9" (con una pausa lunga anche "pausa −20,0").
- **(i) Come funziona l'Elo**: partenza, contro chi, tornei e pesi, margine ("più giochi, più il tuo Elo diventa
  preciso; ogni mese senza tornei torna a muoversi un po' di più"; sopra ± 80 provvisorio; dal secondo mese senza tornei 10 punti al mese, mai sotto 1000; dopo 3 mesi tra gli inattivi), la lega (arriva al torneo
  successivo).
- **Testa a testa** (pulsante Confronta della scheda, `#meta/c~a~b`): "Se si incontrassero adesso", la probabilità di
  vincere un match e quanto guadagna o perde ognuno per una partita di una tappa; la riga Elo sopra quelle che ci sono
  già. Mai negli abbinamenti dei tornei.

### Rank

Un nome per fascia di Elo, ogni 100 punti: un rank sopra vince circa 2 match su 3 contro un rank sotto (100 punti =
64%). Soglie fisse, scelte sulla distribuzione del 2026, che da febbraio cambia poco (mediana della classifica tra 960
e 1010, un giocatore su dieci sopra 1140-1190, da circa 700 a 1400).

| Rank | Elo | III | II | I | Al 12/11/2026 |
| --- | --- | --- | --- | --- | --- |
| Podio | i primi 3 della classifica, qualunque Elo: 1º Imperatore, 2º Legato, 3º Tribuno | | | | 3 |
| Primipilo | 1200 e oltre (senza divisioni) | | | | 4 |
| Centurione | 1100–1199 | 1100–1132 | 1133–1166 | 1167–1199 | 18 |
| Optio | 1000–1099 (partenza) | 1000–1032 | 1033–1066 | 1067–1099 | 36 |
| Decano | 900–999 | 900–932 | 933–966 | 967–999 | 30 |
| Legionario | 800–899 | 800–832 | 833–866 | 867–899 | 32 |
| Tirone | sotto 800 | sotto 733 | 733–766 | 767–799 | 18 |

- Il rank viene dall'Elo che si vede, arrotondato all'intero, e si aggiorna con lui (la notte dopo il foglio).
- Le divisioni vanno come i numeri romani: III la più bassa, I la più alta, poi il rank sopra.
- Si parte da Optio III (1000); chi arriva dopo gennaio dal 25° percentile (oggi 846, Legionario II).
- **Provvisori**: nessun rank ("non classificato") finché il margine non scende sotto ± 80. A gennaio tutti partono a
  1000 ± 100, quindi il rank arriva dopo circa 2 tappe, come un piazzamento.
- **Inattivi**: tengono il rank, in grigio. Il calo per le pause può abbassarlo, ma si ferma a 1000: mai sotto Optio III.
- **Podio**: sempre i primi tre della classifica (non provvisori né inattivi), qualunque sia il loro Elo: oggi Romeo
  (1414) Imperatore, Crisci (1245) Legato, Crifo' (1234) Tribuno. Con una soglia il podio sarebbe rimasto mezzo vuoto
  per metà anno. Chi supera 1200 senza stare sul podio è Primipilo. A gennaio, finché tutti sono provvisori, il podio
  è vuoto.
- **Perché queste soglie**: prima erano 50 punti più in alto (Primipilo da 1250), ma con il podio sempre pieno il
  Primipilo fuori dal podio nel 2026 ci sarebbe stato solo a maggio e giugno (un giocatore). Da 1200, mese per mese:
  0, 1, 2, 6, 7, 4, 2, 3, 4, 4, 4. Sopra 1250 nel corso del 2026 sono arrivati 9 giocatori, a Centurione (vecchia
  soglia 1150) 38: i rank alti si raggiungono anche con pochi tornei, la fine dell'anno non cambia la distribuzione.

## 6. Prove sui dati

Sul meta 2026 (11/11/2026), con `scripts/elo/analisi.mjs` (da togliere quando il build del meta calcolerà l'Elo:
il comando è in cima al file); i grafici sono su
[claude.ai](https://claude.ai/artifact/KdR76t4M195gXTfX3aqWzS) (privati).

- **Previsione**: da marzo in poi, prima di ogni torneo e con i numeri di allora, chi tra due giocatori sarebbe
  arrivato sopra (12.506 coppie). Coppie azzeccate e log-loss (quanto il sistema era sicuro quando sbagliava, più
  bassa è meglio):

  | Sistema | Azzeccate | Log-loss |
  | --- | --- | --- |
  | Elo con valore fisso a partita (32 × peso ÷ turni) | 63,5% | 0,643 |
  | lo stesso, con le tappe oltre l'8ª pesate (8 ÷ n)² | 63,4% | 0,644 |
  | lo stesso, tre volte più veloce (il migliore degli Elo provati) | 63,9% | 0,628 |
  | Glicko classico (± 350) | 64,6% | 0,648 |
  | **Glicko adattato (± 100, pause 5)** | **64,3%** | **0,625** |

  Il vantaggio non dipende dalla velocità (un Elo più veloce migliora ma oltre ×3 peggiora di nuovo) né da una scelta
  fortunata: partenza ± 100 o ± 120 e pause da 3 a 8 danno tutte tra 0,624 e 0,627. Le impostazioni sono scelte sugli
  stessi dati, quindi il vantaggio vero potrebbe essere un po' più piccolo: da verificare sui match di Castra.
- **Classifica** (Glicko adattato, base 1000): 363 giocatori, da 723 a 1404, media 994. Romeo 1404 ± 61, Crifo' 1309
  ± 53, Chiarotto 1265, Crisci 1262, Sacco 1261, Russo 1256, Borfiga 1238. I livelli pesano più che con l'Elo a valore fisso
  (Crifo': +188 dalle leghe e +121 dai livelli, prima +180 e +50).
- **Foglio e Castra**: la tappa di Sanremo del 9/11, l'unica giocata in Castra, calcolata nei due modi partendo dagli
  stessi numeri, dà movimenti simili (dal foglio / dai match): Romeo +14,4 / +18,6, Baudino +26,2 / +20,0, Crisci
  +4,9 / +10,0, Borfiga −3,7 / −8,1, Marossa −31,0 / −22,3, Palumbo −16,9 / −21,8. Con i match conta chi si è
  incontrato davvero, dal foglio tutti gli iscritti. Da ricontrollare con le prossime tappe in Castra.

- **Revisione dell'11/11** (con lo script; i numeri sopra sono con la partenza dei nuovi dalla
  base, prima di decidere il 25° percentile). La previsione conta da qui solo le coppie con punti
  diversi (tra pari punti decidono gli spareggi): 65,6% sul 2026.
  - Pari punti trattati come pareggio invece dell'ordine degli spareggi: nessun miglioramento (65,7%, log-loss
    peggiore). Resta il piazzamento.
  - Pesi dei tornei: 1/1/1, 1/1,25/1,5 e 1/1,5/2 prevedono uguale (log-loss tra 0,6105 e 0,6113), 1/2/3 peggio. Restano
    1/1,5/2, scelta di principio che i dati non smentiscono.
  - Gennaio è il mese meno preciso (61%, gli altri tra 63 e 70%): tutti hanno ± 100, quindi sono provvisori.
  - **I nuovi partono troppo alti**: chi arriva dopo gennaio, al primo torneo, va 11 punti percentuali sotto il
    previsto (dal secondo è in linea) e regala punti ai giocatori abituali. Partendo dal 25° percentile dell'Elo del
    momento lo scarto scende a −4 e la previsione migliora (66,1%, log-loss 0,6088); da un numero fisso 100 sotto la
    base, quasi uguale (65,9%, −6). Deciso il 25° percentile: classifica Romeo 1386, Crifo' 1277, Crisci 1233.
  - **Gruppi chiusi**: nei livelli i giocatori di Savona rendono 7 punti percentuali meno del previsto dal loro Elo
    (circa 50 punti di troppo), quelli di Sanremo 7 e di Latina / Frosinone 9 di più. Il Glicko frena chi gioca tanto
    ma non corregge le differenze tra leghe.
  - **Correzioni dei gruppi chiusi**, provate come andrebbero davvero: misura a giugno sulla s1 (oltre la soglia solo
    Sanremo, +9,6), correzione da giugno, giudizio sui confronti tra leghe diverse nei livelli della s2 (1.295 coppie):
    nessuna 67,2% / 0,589; spostare l'Elo della lega 65,9% / 0,605 (Sanremo si era già riallineato da solo e finisce a
    +6,1); livelli più pesanti per la lega 67,3% / 0,589; tappe meno pesanti 66,9% / 0,589; **Elo di lega 69,3% /
    0,579**, e Savona in s2 da −10,6 a −5,7. Le correzioni decise con una misura arrivano in ritardo e correggono la
    lega sbagliata; l'Elo di lega impara da solo. Velocità 2, 4 e 8 battono tutte le altre correzioni, 4 la migliore.

## 7. In sospeso

- I mockup dei rank (nomi del podio da confermare).
- Niente altro sulle regole. Da fare: il calcolo nel build del meta e le schermate nell'app, poi togliere
  `scripts/elo/analisi.mjs`.
