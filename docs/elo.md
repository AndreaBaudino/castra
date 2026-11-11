# Elo dei giocatori

Un numero che dice quanto è forte un giocatore del circuito, indipendentemente da quanti tornei gioca (la classifica a
punti premia anche la presenza). Deciso con il proprietario a novembre 2026, prima di scrivere codice; i primi mockup,
con due idee a confronto, sono su [claude.ai](https://claude.ai/artifact/43dyDSrGXUom4xLkPcyxkH) (privati). I mockup
dell'Elo definitivo si fanno dopo queste regole.

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
e un **margine**, cioè quanto il sistema è sicuro di quell'Elo (1650 ± 60). Con il margine piccolo una partita sposta
poco, con il margine largo sposta molto. Nell'app si chiama comunque "Elo".

- **Un anno alla volta**: il 1º gennaio tutti ripartono da **1500 ± 100**. Ogni anno ha il suo Elo, come le
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
  tappa con 1600 ± 55 contro un avversario ± 60:

  | Avversario | Probabilità di vincere | Vittoria | Sconfitta |
  | --- | --- | --- | --- |
  | 1400 | 76% | +4,1 | −12,7 |
  | 1600 | 50% | +8,4 | −8,4 |
  | 1800 | 24% | +12,7 | −4,1 |

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
  la media finisce a 1494 invece di 1500.
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
- In classifica si entra dalla **prima partecipazione**. Con il margine sopra **± 80** l'Elo è "provvisorio": compare
  con l'etichetta e sta sotto gli altri (chi ha meno di 10 partite ha in media ± 85; a fine 2026 sarebbero 144
  giocatori su 363).
- Nella scheda del giocatore anche il margine, spiegato nella (i): "più giochi, più il tuo Elo è preciso e si muove
  piano; dopo una pausa torna a muoversi di più".
- Le schermate si decidono con i mockup, dopo queste regole.

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
- **Classifica** (Glicko adattato): 363 giocatori, da 1223 a 1904, media 1494. Romeo 1904 ± 61, Crifo' 1809 ± 53,
  Chiarotto 1765, Crisci 1762, Sacco 1761, Russo 1756, Borfiga 1738. I livelli pesano più che con l'Elo a valore fisso
  (Crifo': +188 dalle leghe e +121 dai livelli, prima +180 e +50).
- **Foglio e Castra**: la tappa di Sanremo del 9/11, l'unica giocata in Castra, calcolata nei due modi partendo dagli
  stessi numeri, dà movimenti simili (dal foglio / dai match): Romeo +14,4 / +18,6, Baudino +26,2 / +20,0, Crisci
  +4,9 / +10,0, Borfiga −3,7 / −8,1, Marossa −31,0 / −22,3, Palumbo −16,9 / −21,8. Con i match conta chi si è
  incontrato davvero, dal foglio tutti gli iscritti. Da ricontrollare con le prossime tappe in Castra.

## 7. In sospeso

- Ricentrare la media a 1500 a fine calcolo (oggi 1494)?
- Mockup di classifica, scheda del giocatore e confronto tra due giocatori.
