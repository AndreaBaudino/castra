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
  il comandante, le sue carte, quante terre e quante carte modali ha (contando le copie). Fisso come l'archivio.
- La pagina: Circuito → **Carte** (`src/views/MetaCards.tsx`, conti in `src/lib/decklists.ts`), per ora solo per gli
  admin. Stessi filtri del Meta, più colori della carta (il bianco: le carte con il bianco; incolore: le carte
  incolori), "Senza terre" (scelta di partenza) e "Min. mazzi" (20: nasconde le carte che meno di 20 mazzi possono
  giocare). Toccando una carta si apre la sua scheda (`#meta/x~<carta>`), accanto alla lista sul computer.
- Nella scheda di ogni carta (dalla scheda Carte o dalla ricerca carte), per ora solo per gli admin, la sezione
  **Nel circuito** (`CircuitUse`, conti in `cardUse`): con i filtri del Circuito, scritti sotto il titolo, la
  percentuale, le presenze e le liste; "Chi la gioca" (i comandanti, 5 e poi tutti) e "Potrebbero giocarla, ma no"
  (fino a 3 comandanti con quei colori e più presenze che non la giocano mai).
- Nella pagina di ogni comandante, per ora solo per gli admin, la **lista tipica** (`TypicalList`, conti in
  `typicalList`), con i filtri della pagina e i conti per presenza del punto 4, su quelle del comandante con una lista:
  - in alto le presenze con una lista (su quelle del comandante), le liste diverse e le **terre in media**, con la più
    bassa e la più alta: terre + carte modali, e quante sono le une e le altre;
  - **Must have**: le carte (non terre) in almeno il 95% delle presenze. **Quasi sempre**: tra l'80% e il 95%.
    **Tech choices**: al massimo il 20%, in almeno 2 liste diverse; se sono meno di 5, la soglia sale al 30%.
    Ordinate dalla percentuale più alta, a parità per nome; 5 per gruppo e poi tutte;
  - **Terre particolari**: le terre in almeno 2 liste diverse, tolte le staples del formato (base, fetch, cioè
    "sacrifica: cerca nel grimorio", e le terre che producono da 2 a 4 colori: dual, shock, triome…) e quelle giocate
    da almeno la metà delle presenze degli altri comandanti che possono giocarle (accanto, la loro percentuale "nel
    resto del circuito");
  - **carte modali**: le carte modali a due facce con una terra sul retro (Sink into Stupor // Soporific Springs; non
    quelle che si trasformano, come Legion's Landing, che non si giocano come terra). Contano nelle terre in media e
    restano nei gruppi delle carte, con il nome intero;
  - con una sola lista, al posto dei gruppi, un avviso con chi l'ha portata e in quante presenze; senza liste la
    sezione non compare.
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
  solo i mazzi che possono giocare la carta, i filtri, nessun dato per un altro anno; la lista tipica (gruppi, soglia
  delle tech al 30%, terre particolari, media delle terre con le carte modali, una lista sola).
- Controllati sul meta pubblicato il 5/11: Bresciani con Oloro senza lista (2 iscrizioni); Waltz con Atraxa, 12
  iscrizioni, tutte con la sua lista Atraxa (3 dirette, 9 estese); la Tivit di Arzenton, 4 dirette e 2 estese; la
  Phelia di Misuri, 10 dirette e 5 estese.
- Il build stampa i totali (dirette, estese, senza lista, orfani): al primo giro devono tornare con quelli qui sopra
  (647, 637, 1284, 959), a parità di fogli.
- Area admin: copertura e collegamenti orfani nello stato dell'ultimo aggiornamento.
