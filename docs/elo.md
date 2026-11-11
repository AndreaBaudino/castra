# Elo dei giocatori

Un numero che dice quanto è forte un giocatore del circuito, indipendentemente da quanti tornei gioca (la classifica a
punti premia anche la presenza). Deciso con il proprietario a novembre 2026, prima di scrivere codice; i primi mockup,
con due idee a confronto, sono su [claude.ai](https://claude.ai/artifact/43dyDSrGXUom4xLkPcyxkH) (privati). I mockup
dell'Elo definitivo si fanno dopo queste regole.

## 1. Da dove vengono i dati

- **Fogli dei tornei**: per ogni iscrizione piazzamento, vittorie, sconfitte, pareggi e bye, ma non contro chi si è
  giocato.
- **Tornei giocati in Castra**: ogni match, con i due giocatori e il risultato (`tournaments/{id}/matches`, già letti
  dal build del meta per i matchup tra comandanti).
- Nel 2026 contano tutti e due; dal 2027, se tutti i tornei passano da Castra, resteranno solo i match. Le regole
  sotto valgono comunque per tutti e due: i tornei scritti solo nel foglio potrebbero esserci sempre, e un torneo deve
  pesare uguale da qualunque parte arrivi.
- Un torneo giocato in Castra e pubblicato sul foglio conta **una volta sola**, con i match di Castra.

## 2. Le regole

- **Un anno alla volta**: il 1º gennaio tutti ripartono da **1500**. Ogni anno ha il suo Elo, come le classifiche.
- **Peso del torneo**: tappa di lega ×1 (anche la lega online), livello 1 ×1,5, livello 2 ×2.
- **Valore di una partita**: 32 × peso ÷ turni dello svizzero di quel torneo (una tappa da 4 turni: 8; un livello 1
  da 5 turni: 9,6; un livello 2 da 6 turni: 10,7). Ogni partita giocata vale uguale, nel foglio e in Castra: chi gioca
  più partite (la top) può muoversi di più, chi entra tardi o fa drop di meno.
- **Quanto si guadagna**: valore × (risultato − risultato atteso). Il risultato vale 1 la vittoria, ½ il pareggio, 0
  la sconfitta (il 2-1 come il 2-0). Il risultato atteso viene dalla differenza di Elo, come negli scacchi:
  1 / (1 + 10^((Elo avversario − Elo mio) / 400)); con 100 punti di differenza il più forte vince 64 volte su 100.
  Quindi conta contro chi: in una tappa (8 a partita), con 1600 contro 1400 si vince +1,9 e si perde −6,1; contro
  1800 si vince +6,1 e si perde −1,9; alla pari ±4. Dal foglio vale lo stesso, ma rispetto a tutti gli iscritti.
- Per tutte le partite di un torneo vale l'Elo che i giocatori avevano **prima del torneo**: il torneo si calcola
  tutto insieme, poi si passa al successivo. L'Elo si aggiorna a torneo finito, quando è scritto nel foglio: lo
  calcola il build notturno del meta, quindi si vede la notte dopo la pubblicazione (un torneo di Castra non ancora
  pubblicato non conta).
- **I punti passano di mano**: quello che uno guadagna, gli avversari lo perdono, nel foglio come in Castra. La media
  di tutti resta 1500.
- **Ordine dei tornei**: per data; una tappa senza data viene subito dopo la tappa precedente della sua lega (come in
  `docs/liste-mazzi.md`).

### Cosa conta

- **Top**: solo nei livelli 1 e 2, come per i punti del circuito. Nelle tappe di lega l'Elo si ferma allo svizzero,
  anche se la top si gioca per i premi.
- **Bye**: non conta (non è una partita).
- **Pareggio intenzionale** (0-0, ID): non conta. Il **pareggio giocato** vale mezza vittoria: i punti 3-1-0 servono
  a scoraggiare i pareggi in torneo, non a misurare la forza; con un terzo, due giocatori dello stesso livello che
  pareggiano perderebbero Elo tutti e due.
- Le iscrizioni senza nome e i tornei senza risultati (V/S/P vuoti) restano fuori.

## 3. Tornei di Castra

Ogni match dello svizzero, e della top nei livelli 1 e 2, sposta l'Elo dei due giocatori: valore × (risultato −
atteso) a chi l'ha giocato, lo stesso con il segno opposto all'avversario. I turni dello svizzero sono quelli del
torneo (`rounds`).

## 4. Tornei dal foglio

Non sapendo gli avversari, ogni giocatore viene confrontato con **tutti gli altri iscritti** in base al piazzamento:
"vince" contro chi è arrivato sotto, "perde" contro chi è arrivato sopra, pareggia con chi ha lo stesso piazzamento.

- In ogni confronto tra due giocatori, il valore della partita si moltiplica per la **media delle partite giocate dai
  due** (vittorie + sconfitte + pareggi, tolto il bye) e si divide per gli iscritti meno uno. Quello che uno guadagna,
  l'altro lo perde.
- Così il movimento di un giocatore in un torneo è circa valore × sue partite × (risultato − atteso), come in Castra,
  e chi gioca la top si muove di più perché tutti i suoi confronti valgono di più.
- **Turni dello svizzero**: il foglio non li scrive. Sono il numero di partite più frequente tra gli iscritti (bye
  compreso): chi non ha fatto drop e non è entrato in top li ha giocati tutti. Nel 2026 torna in tutti i livelli,
  anche nei 3 dove il TO ha fatto un numero di turni diverso da quello che danno gli iscritti; nei livelli con la top
  gli 8 della top hanno le partite in più.
- Perché la media: se ognuno si muovesse solo con le sue partite, chi entra in top (8 partite, e di solito guadagna)
  guadagnerebbe più di quanto perde chi sta sotto (5 partite), e ogni livello con la top creerebbe punti dal nulla
  (+913 nel 2026, la media a 1502). Con la media il totale resta zero, come in Castra.

## 5. Dove si vede

- **Pubblico**: una classifica Elo per tutti e l'Elo nella scheda di ogni giocatore.
- In classifica si entra dalla **prima partecipazione**. Sotto le **10 partite** l'Elo è "provvisorio": compare con
  l'etichetta e sta sotto gli altri, perché a inizio anno (e dal 2027, con i soli match) chi vince il primo torneo
  salirebbe in cima dopo una sera.
- Le schermate si decidono con i mockup, dopo queste regole.

## 6. Prove sui dati

Sul meta 2026 (11/11/2026), calcolato a parte prima di scrivere codice:

- 363 giocatori, media 1500 esatta, da 1355 a 1730. In cima Crifo' 1730 (152 partite), Romeo 1694, Borfiga 1633,
  Chiarotto 1632, Degli Agostini 1624. 157 giocatori sotto le 10 partite; il migliore di loro ha 1531.
- La tappa di Sanremo del 9/11, l'unica giocata in Castra, calcolata nei due modi partendo dallo stesso Elo, dà
  movimenti simili (dal foglio / dai match): Romeo +8,9 / +10,6, Baudino +9,9 / +7,4, Crisci +4,8 / +7,1, Borfiga
  −0,9 / −3,4, Palumbo −9,1 / −10,3. Le differenze sono quelle attese: con i match conta chi si è incontrato davvero
  (Borfiga ha perso contro avversari più deboli), dal foglio tutti gli iscritti. Da ricontrollare con le prossime
  tappe in Castra.

## 7. In sospeso

- Mockup di classifica, scheda del giocatore e confronto tra due giocatori.
