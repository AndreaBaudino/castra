# Liste dei mazzi del circuito

Regole per usare le liste Moxfield dei fogli dei tornei nelle statistiche delle carte (quante volte una carta è
giocata, da quale comandante, in quali tornei). Decise con il proprietario a novembre 2026, prima di scrivere codice:
sono statistiche delicate, ogni regola qui sotto va rispettata e provata dai test.

## 1. L'archivio delle liste

- File: `scripts/meta/decklists.json`. Liste lette **una sola volta** da Moxfield il 5/11/2026 (estrazione fatta dal
  proprietario): non si rileggono e non si rigenerano, nessuna chiamata a Moxfield da parte dell'app o dei workflow.
- 304 liste di 119 comandanti. Per ognuna: link, comandante (nome come nel meta, partner come `A / B`), carte
  (`"1 Nome"`) e iscrizioni collegate, come `[id del torneo, giocatore]` (l'id del meta, es.
  `l1-2026-01-25-mr-magic-savona`, non la posizione nell'elenco, che può cambiare).
- Un'estrazione futura può solo **aggiungere** liste per iscrizioni che non ne hanno una: non sostituisce mai quelle
  già presenti. Se lo stesso link ricompare, la lista archiviata non cambia.

## 2. Quando una lista è valida

- Il comandante su Moxfield coincide con quello del foglio in **almeno una** iscrizione con quel link (per le partner
  entrambi; per le carte a due facce conta la faccia frontale).
- Le carte contano **solo per quel comandante**: mai per un altro comandante iscritto con lo stesso link.
- Rimaste fuori dall'archivio: 1 lista con il comandante cambiato (oggi Soul of Windgrace, iscritta come Hearthhull),
  26 link vuoti (lista cancellata o privata), 13 liste che non compaiono nei fogli 2026, i link scritti male
  (troncato, `PORCHERECCIO.DECK`).

## 3. Quale lista va a ogni iscrizione

Si applica nell'ordine, solo alle iscrizioni del **2026** (anche ai tornei 2026 che si giocheranno dopo il 5/11).
Dal 2027 nessuna iscrizione prende una lista di questo archivio.

1. **Collegamento diretto**: l'iscrizione è tra quelle della lista nell'archivio (link e comandante tornano). Oggi
   647 iscrizioni.
2. **Estensione**: l'iscrizione non ha una lista diretta, ma lo stesso giocatore ha una lista valida per lo **stesso
   comandante** → prende quella. Vale per le iscrizioni senza link, con un link Moxfield vuoto o rotto, con un link
   ManaBox o altro. Oggi 637 iscrizioni in più. Il giocatore è lo stesso a meno di maiuscole e accenti, come nel
   resto dell'app (`playerKey`): "Daniele degli Agostini" e "Daniele Degli Agostini" sono una persona sola.
   - Più liste valide dello stesso giocatore per quel comandante (oggi 75 iscrizioni, 20 coppie giocatore +
     comandante): vale la **più recente**, cioè quella con l'iscrizione collegata più recente.
   - "Più recente" segue la data del torneo. Tra tappe della stessa lega conta il **numero della tappa**: una tappa
     senza data (oggi `s1-sanremo-3` e `s2-orbassano-4`) viene subito dopo la tappa precedente della sua lega.
3. **Nessuna lista**: nessuna lista valida di quel giocatore per quel comandante (es. Bresciani con Oloro ad
   Albisola il 20/09, iscritto con il link della Tivit di Arzenton). L'iscrizione resta nel meta con il comandante del
   foglio e i suoi risultati, senza carte.

Un link di un altro comandante non toglie l'estensione: Waltz con Atraxa a Cogoleto il 30/01 (`s1-genova-3`) è
iscritto con il link della sua Jeska/Yoshimaru, ma ha anche una lista Atraxa valida e prende quella. La lista Jeska
non conta mai per Atraxa.

Copertura del 2026 al 5/11: **1284 iscrizioni su 2243 (57%)**, **5276 partite su 9099 (58%)**; 959 iscrizioni senza
lista.

## 4. Come si conta

- **Per iscrizione**: la stessa lista portata in due tornei conta 2 (anche quando in uno dei due arriva
  dall'estensione).
- Una carta conta per presenza, non per copie: le basic multiple valgono 1.
- **Percentuale per comandante** = iscrizioni di quel comandante con una lista che contiene la carta ÷ iscrizioni di
  quel comandante con una lista.
- **Percentuale generale** (tutti i comandanti) = iscrizioni con una lista che contiene la carta ÷ iscrizioni con una
  lista il cui comandante **può giocarla** (l'identità di colore del comandante comprende quella della carta). Le
  carte incolori valgono per tutti. I colori delle carte vengono da MTGJSON, come le errata.
- Accanto alla percentuale: **in quante liste diverse** compare la carta, per vedere quando il dato viene da un solo
  giocatore molto presente.
- Sempre visibile: su quante iscrizioni si basa il dato (es. "su 19 iscrizioni Phelia con lista, di 25").
- Filtri (stagione, tipo di torneo, lega, torneo, giocatore): entrano le iscrizioni che cadono nel filtro.

## 5. Dove stanno i dati

- `scripts/meta/decklists.mjs` (`assignLists`) applica le regole del punto 3; `scripts/meta/decklists.test.mjs` le
  prova sui casi qui sotto.
- Il build del meta (`scripts/build-meta.mjs`) aggiunge a ogni iscrizione del 2026 con una lista due campi in fondo:
  `[…, indice della lista nell'archivio, 1 se presa per estensione]`. Le versioni vecchie dell'app li ignorano.
- `public/decklists.json`, pubblicato con l'app e letto solo dalle pagine delle carte e dei comandanti: le carte con
  la loro identità di colore e il tipo (dalla faccia frontale: non terra, terra, terra staple, carta modale; da
  Scryfall, una volta sola, salvati in `scripts/meta/cards.json`) e, per ogni lista dell'archivio nello stesso ordine,
  il comandante, le sue carte, quante terre e quante carte modali ha (contando le copie) e le carte con più di una
  copia. Fisso come l'archivio.
- La pagina: Circuito → **Carte** (`src/views/MetaCards.tsx`, conti in `src/lib/decklists.ts`).
  Stessi filtri del Meta, più colori della carta (`colorMatch`): un colore mostra solo le carte di quel
  colore; più colori, le carte di ognuno e le multicolore fatte solo di quei colori (bianco e blu: bianche, blu e
  bianco-blu, non bianco-blu-nero); il tasto multicolore (disco dorato, come in Arena) tiene solo le multicolore tra
  queste, e con un colore solo tutte le multicolore con quel colore, da solo tutte le multicolore; l'incolore, da
  solo, le carte incolori, "Senza terre" (scelta di partenza) e "Min. mazzi" (20: nasconde le carte che meno di 20 mazzi possono
  giocare; con un filtro attivo, se nessuna carta ci arriva, si vedono tutte con un avviso). Toccando una carta si apre la sua scheda (`#meta/x~<carta>`), accanto alla lista sul computer.
- Nella scheda di ogni carta (dalla scheda Carte o dalla ricerca carte), la sezione
  **Nel circuito** (`CircuitUse`, conti in `cardUse`): con i filtri del Circuito, scritti sotto il titolo, la
  percentuale, le presenze e le liste; "Chi la gioca" (i comandanti, 5 e poi tutti) e "Potrebbero giocarla, ma no"
  (fino a 3 comandanti con quei colori e più presenze che non la giocano mai). Sotto le cifre, con gli stessi filtri e
  sempre sui mazzi che possono giocarla: nei top 8 di Livello 1 e 2, fuori dai top 8, tra i vincitori delle tappe di
  lega (le righe senza presenze non compaiono), e Stagione 1 contro Stagione 2 (solo senza il filtro della stagione).
- Nella pagina di ogni comandante, la sezione **Le carte più giocate** (nel codice "lista tipica") (`TypicalList`, conti in
  `typicalList`), con i filtri della pagina e i conti per presenza del punto 4, su quelle del comandante con una lista:
  - in alto le presenze con una lista (su quelle del comandante), le liste diverse e le **terre in media**, con la più
    bassa e la più alta: terre + carte modali, e quante sono le une e le altre;
  - **Must have**: le carte (non terre, più le terre particolari, vedi sotto) in almeno il 95% delle presenze. **Quasi sempre**: tra l'80% e il 95%.
    **Tech choices**: al massimo il 20%, in almeno 2 liste diverse; se sono meno di 5, la soglia sale al 30%.
    Ordinate dalla percentuale più alta, a parità per nome; 5 per gruppo e poi tutte;
  - **Terre particolari**: le terre in almeno 2 liste diverse, tolte le staples del formato (base, fetch, cioè
    "sacrifica: cerca nel grimorio", e le terre che producono da 2 a 4 colori: dual, shock, triome…) e quelle giocate
    da almeno la metà delle presenze degli altri comandanti che possono giocarle (accanto, la loro percentuale "nel
    resto del circuito"), e solo sotto il 70% delle presenze del comandante: una terra che c'è in quasi tutte le liste
    non è particolare, e dall'80% in su va tra le must have o le quasi sempre, con le soglie delle carte;
  - **carte modali**: le carte modali a due facce con una terra sul retro (Sink into Stupor // Soporific Springs; non
    quelle che si trasformano, come Legion's Landing, che non si giocano come terra). Contano nelle terre in media e
    restano nei gruppi delle carte, con il nome intero;
  - toccando una carta (o una terra) si apre la sua scheda, con "Nel circuito";
  - con una sola lista diversa (anche portata da più giocatori con lo stesso link): senza filtri, al posto dei dati un
    avviso con chi l'ha portata e in quante presenze; con un filtro (una lega piccola, un tipo di torneo…) si vedono
    le terre in media e, al posto dei gruppi (sarebbe tutto "must have"), l'elenco delle carte della lista senza
    percentuali, con un avviso che dice di chi è e che non è "cosa si gioca di solito". Senza liste la
    sezione non compare.
- Nella scheda di ogni giocatore, **Le sue carte** (`PlayerCards`, conti in `playerCards`),
  su tutto l'anno e solo per chi ha almeno 2 liste diverse: presenze con una lista, liste e comandanti, e **Le sue
  preferite**, cioè le carte (non terre) in almeno 2 sue liste e in almeno il 60% delle sue presenze che possono
  giocarle, giocate almeno 30 punti percentuali più che dagli altri giocatori (sulle loro presenze che possono
  giocarle). Prima la differenza più grande; toccando una carta si apre la sua scheda.
- Nella pagina di un proprio mazzo, **Contro il meta** (`DeckVsMeta`, conti in
  `deckVsMeta`): se il comandante (trovato come per il winrate del meta) ha almeno 2 liste nel circuito, su tutto
  l'anno e senza filtri: quante must have e quasi sempre ha il mazzo, le sue terre (con le carte modali) contro la media
  del circuito, "Come mai non le giochi?" (le must have e quasi sempre che mancano) e "Le tue pet card" (le carte non
  terre in al massimo il 5% delle presenze del comandante, o in nessuna). Le carte si riconoscono dalla faccia
  frontale; il collegamento apre le carte più giocate del comandante, ogni carta la sua scheda.
- Nella pagina del comandante, nelle **Liste Moxfield**, **Duplica mazzo**
  (`DuplicateDeck`, mazzo da `deckOfList`): solo accanto ai link che sono la lista dell'archivio di quell'iscrizione
  (collegamento diretto, non un'estensione). Crea un mazzo in Mazzi con le carte e le copie salvate il 5/11 (non
  rilegge Moxfield; i dati delle carte da Scryfall, come per un import) e il nome "Comandante di Giocatore". Le liste
  dell'archivio non sono sempre di 99 carte (41 su 304, da 92 a 106): il mazzo è com'era su Moxfield.
- Lo stato dell'aggiornamento (area admin → Tornei) riporta dirette, estese, senza lista e collegamenti orfani; gli
  orfani sono anche negli avvisi, uno per uno.

## 6. Limiti noti

- Le liste sono quelle del 5/11/2026, non del giorno del torneo: chi ha cambiato carte sullo stesso link dopo il
  torneo vale con la versione di quel giorno.
- L'estensione presume che il giocatore abbia portato lo stesso mazzo.
- Il campione pesa di più su chi pubblica le liste e su alcuni negozi (Savona, Cogoleto).
- Il collegamento usa id del torneo e nome del giocatore (dopo le correzioni dei nomi). Se un foglio cambia data o un
  nome viene corretto, il collegamento resta orfano: il build lo deve segnalare nello stato dell'area admin.

## 7. Validazione

- Test automatici (`scripts/meta/decklists.test.mjs`) sui casi reali, ridotti: un link di un altro comandante senza
  una lista propria non dà carte (Bresciani); i collegamenti diretti; l'estensione con la lista più recente, anche con
  un link rotto e per un torneo dopo il 5/11, e tra tappe conta il numero; un'iscrizione del 2027 non prende liste
  del 2026; una lista portata due volte conta due. `src/lib/decklists.test.ts`: la percentuale conta per presenza e
  solo i mazzi che possono giocare la carta, i filtri, nessun dato per un altro anno; le carte più giocate del comandante (gruppi, soglia
  delle tech al 30%, terre particolari, media delle terre con le carte modali, una lista sola).
- Controllati sul meta pubblicato il 5/11: Bresciani con Oloro senza lista (2 iscrizioni); Waltz con Atraxa, 12
  iscrizioni, tutte con la sua lista Atraxa (3 dirette, 9 estese); la Tivit di Arzenton, 4 dirette e 2 estese; la
  Phelia di Misuri, 10 dirette e 5 estese.
- Il build stampa i totali (dirette, estese, senza lista, orfani): al primo giro devono tornare con quelli qui sopra
  (647, 637, 1284, 959), a parità di fogli.
- Area admin: copertura e collegamenti orfani nello stato dell'ultimo aggiornamento.

## 8. Le liste di Castra (decise e scritte il 6/11/2026)

Le liste dei tornei giocati in app con un mazzo di Castra. Mockup sul canvas di progetto, riga "Liste di Castra: la
foto al turno 1".

### Iscrizione
- Una sola decklist per iscrizione. Con un mazzo di Castra la decklist è il mazzo: il campo del link Moxfield non
  c'è, e un link già dato si toglie salvando. Senza mazzo, il link Moxfield come oggi. Anche su un telefono dove il
  mazzo dell'iscrizione non c'è, il campo del link resta nascosto: per dare un link si sceglie "nessun mazzo".
- **Priorità**: se ci sono sia la foto sia un link Moxfield (dati vecchi), vale la foto, nel report (`loadList`), nella
  pagina della lista e nel meta (il build mette il link della foto nell'iscrizione, qualunque link abbia il foglio).
- Con un mazzo scelto il comandante viene dal mazzo e non si cambia a mano: per cambiarlo si sceglie un altro mazzo.
- Nessun avviso sulla lista pubblica: chi usa un mazzo di Castra sa che la lista finisce nel report.

### La foto
- È una copia della lista, separata dal mazzo: le carte (comandante e 99, con copie ed edizione) com'erano
  all'inizio del turno 1. Dopo, il giocatore può cambiare o cancellare il mazzo: la foto resta com'è.
- La scrive l'app del giocatore, che è l'unica a leggere il mazzo: all'iscrizione (`savePhoto` in
  `src/lib/tournaments.ts`) e, finché le iscrizioni sono aperte, ogni volta che la card del torneo in Home trova il
  mazzo cambiato (`at` della foto diverso da `updatedAt` del mazzo). L'avvio del turno 1 la blocca (regole di
  Firestore): vale l'ultima versione arrivata prima. Chi cambia il mazzo e non riapre la Home prima del turno 1 resta
  con la foto precedente.
- Chi entra a turni iniziati lo aggiunge il TO, che non legge i mazzi degli altri: niente foto, solo il link Moxfield
  come oggi. (Previsto all'inizio: la foto all'iscrizione tardiva; non si può, perché da soli ci si iscrive solo a
  iscrizioni aperte.)
- Dopo il turno 1 nessuno la cambia, neanche il TO: se un deck check trova un'altra lista, il TO lo scrive nelle
  note.
- Unica eccezione: a torneo finito, un admin può rimettere una foto andata persa (per esempio sostituita da un link
  Moxfield) dalla scheda del giocatore nella pagina del torneo, "Rimetti la lista di Castra", incollando la lista
  com'era al turno 1 (`replacePhoto`, scritto nel registro). Per il foglio: "Togli dal foglio" e poi
  "Pubblica sul foglio" (che rilegge le liste al momento), oppure il link copiato, da incollare a mano.
  Il build della notte rilegge le foto anche dei tornei già archiviati, ma aggiunge solo quelle che mancano.
- Sta nel documento privato dell'iscrizione (`players/{giocatore}/private/deck`), come il link Moxfield, nei campi
  `cards` (la lista come `exportDecklist`, senza sideboard, con le edizioni), `name`, `at` e `invalid` (il controllo
  dell'app): fino alla fine del torneo la vedono il giocatore e i TO (anche per un deck check), poi tutti. Un link
  Moxfield salvato al posto del mazzo la toglie, solo prima del turno 1. Provato in `scripts/test-rules.mjs`.
- I tornei in app già finiti prima di questa novità non hanno foto e non se ne ricostruiscono (al 6/11 non ce ne
  sono).

### Dove si vede
- La pagina della lista (`#live/<torneo>@<giocatore>`, `TournamentPhoto` in `src/views/DeckDetail.tsx`) è la pagina
  di un mazzo in sola lettura (come un mazzo condiviso): giocatore, comandante, torneo e risultato, "Duplica mazzo",
  le viste Lista, Pile e Griglia del deckbuilder, toccando una carta la sua scheda. Prima della fine del torneo, a chi
  non può vederla, "La lista si vede alla fine del torneo".
- I link a una pagina dell'app (`isAppLink`) si aprono nell'app, impilati (`App.tsx`); quelli a Moxfield in un'altra
  scheda.
- Nel report (colonna della decklist del foglio) c'è il link a quella pagina al posto del link Moxfield.
  "Pubblica sul foglio" lo scrive tramite lo script dei fogli, che accetta solo il link Moxfield o quello della foto
  di un giocatore dello stesso torneo, sull'indirizzo dell'app (`APP` in `scripts/meta/apps-script/Code.gs`, da
  cambiare se l'app cambia indirizzo; l'app lo costruisce dalla base, `photoLink`).
- Nell'elenco degli iscritti del TO l'icona della decklist è quella del mazzo; dal turno 1 il TO apre la lista.
- Nella classifica finale "Lista" apre la pagina nell'app; con Moxfield si apre Moxfield come oggi.
- Nella pagina del comandante "Liste Moxfield" diventa "Liste": quelle di Castra hanno l'etichetta "Castra", si
  aprono nell'app e hanno sempre "Duplica mazzo".

### Nel mazzo
- Le partite di un torneo in app entrano nelle statistiche del giocatore (`personalMatches`) con la posizione finale
  e, se la decklist era la foto del mazzo, la chiave del giocatore per aprirla.
- Nella pagina del mazzo, **Tornei** (`deckTournaments` in `src/lib/matches.ts`): i tornei in app giocati con quel
  mazzo, ricavati da quelle partite, con data, posizione, partite, record e "Lista" (la foto di quel giorno). Gli
  stessi tornei compaiono tra le **Modifiche**, al loro giorno: si vede con quale versione del mazzo si è giocato.
- Nella pagina della propria lista, se il mazzo c'è ancora, **Rispetto al tuo mazzo di oggi**: le carte entrate e
  uscite da allora, o "Il tuo mazzo è ancora questa lista", e "Apri il mazzo".
- Solo i tornei giocati in app, e solo da quando le partite entrano nelle statistiche (la card del torneo in Home a
  torneo finito).

### Nelle statistiche
- Il build della notte legge le foto da Firestore (senza credenziali, pubbliche a torneo finito) per i tornei finiti
  e pubblicati sul foglio e non ancora nell'archivio, e le aggiunge a un secondo archivio,
  `decklists-castra.json` sul ramo `meta-data` (in `.meta-cache/` durante il build), che cresce soltanto: una foto
  entrata non cambia più (`givePhotos` in `scripts/meta/decklists.mjs`). Per ogni foto: torneo e giocatore, anno,
  comandante (quello dell'iscrizione nel meta), nome del mazzo, `at`, `invalid` e le 99 carte (`photoCards`: senza
  comandante né edizioni). L'archivio Moxfield (punto 1) non si tocca; `decklists.json` li unisce, Moxfield prima e
  Castra in fondo, con `years` (gli anni con liste). Il workflow lo pubblica sul ramo `meta-data`, da dove l'app lo
  legge (`useDecklists`), con la copia inclusa nell'app come riserva; un'iscrizione con una lista che il file non ha
  ancora non conta.
- Il collegamento viene da Firestore (torneo e giocatore), non dal link scritto nel foglio.
- Prima delle regole del punto 3: **0. Lista di Castra**: un'iscrizione con la foto prende quella, prima del
  collegamento diretto e dell'estensione. Vale per ogni anno, non solo per il 2026.
- La foto vale solo per il suo torneo: non si estende ad altre iscrizioni dello stesso giocatore.
- Un mazzo che non passava il controllo dell'app all'iscrizione (`invalid`) resta nel report ma non conta nelle
  statistiche delle carte.
- Si conta come al punto 4. Lo stato dell'aggiornamento (area admin → Tornei) conta anche le presenze con la foto.
