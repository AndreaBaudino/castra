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
   ManaBox o altro. Oggi 635 iscrizioni in più (620 senza link, 14 Moxfield vuoti o rotti, 1 ManaBox).
   - Più liste valide dello stesso giocatore per quel comandante (oggi 75 iscrizioni, 20 coppie giocatore +
     comandante): vale la **più recente**, cioè quella con l'iscrizione collegata più recente.
   - "Più recente" segue la data del torneo. Tra tappe della stessa lega conta il **numero della tappa**: una tappa
     senza data (oggi `s1-sanremo-3` e `s2-orbassano-4`) viene subito dopo la tappa precedente della sua lega.
3. **Nessuna lista**: stesso link ma comandante diverso (es. Waltz con Atraxa a Cogoleto il 30/01, Bresciani con
   Oloro ad Albisola il 20/09), oppure nessuna lista valida di quel giocatore per quel comandante. L'iscrizione resta
   nel meta con il comandante del foglio e i suoi risultati, senza carte.

Copertura del 2026 al 5/11: **1282 iscrizioni su 2243 (57%)**, **5265 partite su 9099 (58%)**; 961 iscrizioni senza
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

## 5. Limiti noti

- Le liste sono quelle del 5/11/2026, non del giorno del torneo: chi ha cambiato carte sullo stesso link dopo il
  torneo vale con la versione di quel giorno.
- L'estensione presume che il giocatore abbia portato lo stesso mazzo.
- Il campione pesa di più su chi pubblica le liste e su alcuni negozi (Savona, Cogoleto).
- Il collegamento usa id del torneo e nome del giocatore (dopo le correzioni dei nomi). Se un foglio cambia data o un
  nome viene corretto, il collegamento resta orfano: il build lo deve segnalare nello stato dell'area admin.

## 6. Validazione

- Test automatici sui casi reali: Waltz con Atraxa e Bresciani con Oloro senza lista; la Tivit di Arzenton con 4
  iscrizioni; la Phelia di Misuri che conta 10; con più liste vince la più recente, e tra tappe conta il numero;
  un'iscrizione del 2027 non prende liste del 2026; la percentuale generale ignora i mazzi che non possono giocare la
  carta.
- Il build stampa i totali (dirette, estese, senza lista, orfani): al primo giro devono tornare con quelli qui sopra
  (647, 635, 1282, 961), a parità di fogli.
- Area admin: copertura e collegamenti orfani nello stato dell'ultimo aggiornamento.
