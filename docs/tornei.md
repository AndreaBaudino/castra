# Tornei in Castra

Progetto della gestione dei tornei dentro l'app, in stile Companion: iscrizioni, abbinamenti svizzeri, risultati,
classifica, top cut e pubblicazione sui fogli del circuito. Deciso con il proprietario a novembre 2026, prima di
scrivere codice. I mockup delle schermate sono su
[claude.ai](https://claude.ai/artifact/6weDciVLa5heu19GK6V8qT) (privati: vanno condivisi dal proprietario).

## 1. Cosa copre

- **Livello 1, livello 2 e tappe di lega.** Non esistono altri tipi di torneo. La lega online resta fuori.
- Il POTY probabilmente rientra tra i tornei di livello; se serve diventa un tipo in più nell'elenco dei fogli.
- Ogni torneo in app corrisponde a un foglio che esiste già: la scheda della tappa (`1`, `2`, …) nel foglio
  stagionale della lega, oppure il foglio del livello 1 o 2 registrato dagli admin in `sources`.

## 2. Ruoli

- **Admin**: promuove a TO utenti scelti e assegna a ciascuno una o più **leghe**, per nome come nel foglio del
  circuito (Savona, Genova, Latina / Frosinone…). La lega fa da **zona**. L'assegnazione per nome vale anche per le
  stagioni successive; se una lega cambia nome va aggiornata (l'area admin segnala le zone che non corrispondono più
  a nessuna lega).
- **TO**:
  - **tappe di lega**: le crea solo nelle leghe assegnate a lui, in qualunque foglio stagionale di quelle leghe;
  - **livelli 1 e 2**: non li crea. Li registra un admin in `sources`, senza risultati, con una **zona** facoltativa
    e/o dei **TO assegnati a mano**. Il TO li sceglie dall'elenco di quelli della sua zona o assegnati a lui e ancora
    da giocare. Un torneo registrato diventa "preso" appena un TO lo avvia.
  - **Co-gestione**: tutti i TO della zona, o assegnati a quel torneo, possono gestirlo, non solo chi l'ha creato
    (se si scarica un telefono si continua da un altro).
  - **Verifica dei giocatori**: un TO può **dare** la spunta di verificato, mai toglierla, e solo a un giocatore
    iscritto a un suo torneo. Resta scritto chi l'ha data e in quale torneo (`verifiedBy`, `verifiedIn`) e l'area
    admin lo mostra. Togliere la spunta e revocare un collegamento restano compiti degli admin.
- **Giocatore**: agisce nell'app (iscrizione con il link, risultati, drop, decklist) solo se il suo account è
  collegato a un giocatore del circuito **e** il collegamento è verificato.
- **Ospite**: giocatore iscritto a mano dal TO, senza account o con un collegamento non verificato. Il TO segna i
  suoi risultati e il suo comandante.
- **Spettatore**: chiunque, anche senza accesso, vede abbinamenti e classifica in diretta.

## 3. Iscrizioni

- **Dal TO**: sceglie tra tutti i giocatori conosciuti (classifica del circuito, giocatori del meta di ogni anno,
  scheda `Classifica` della lega) oppure crea un giocatore nuovo, con un avviso se il nome somiglia a uno esistente
  (`playerKey`).
- **Con link o codice**: quando apre le iscrizioni il torneo riceve un codice di 6 caratteri senza caratteri ambigui
  (es. `K7P3QX`) e il link `…/castra/#join~K7P3QX`. Il TO lo condivide o lo mostra in sala e può rigenerarlo (il
  vecchio smette di funzionare).

  | Chi apre il link | Cosa succede |
  |---|---|
  | Non ha fatto l'accesso | Prima l'accesso, poi torna al torneo |
  | Nessun giocatore collegato | Bloccato: "Collega prima il tuo giocatore", poi torna al torneo con il codice ricordato |
  | Collegato, non verificato | "Richiedi l'iscrizione": entra tra gli iscritti **in attesa** |
  | Collegato e verificato | "Iscriviti": iscritto subito, senza conferma |

- **Richieste in attesa**: nella dashboard del TO, sezione "Da confermare", con nome del giocatore, nome e foto
  dell'account Google (mai l'email), **Conferma** (iscrive e verifica il collegamento in una sola scrittura) o
  **Rifiuta**. Gli iscritti in attesa non vengono abbinati; il turno 1 non parte finché ci sono richieste da
  gestire, salvo che il TO lo forzi lasciandole fuori.
- Lo stesso giocatore non può essere iscritto due volte: l'iscritto ha come id il proprio `playerKey`. Se il TO lo
  aveva già aggiunto a mano, l'iscrizione dal link si aggancia a quella.
- Il giocatore può annullare l'iscrizione da solo finché le iscrizioni sono aperte.
- **Le iscrizioni si chiudono all'avvio del turno 1**, e con loro il codice.
- **Ritardatari**: il TO può aggiungere un giocatore tra un turno e l'altro. Ogni turno saltato è una **sconfitta
  0-2 a tutti gli effetti**: conta in classifica, va nella colonna S del foglio e quindi nel meta. Non ha avversario,
  quindi non entra negli spareggi di nessuno.

## 4. Comandante e decklist

- **Il comandante è obbligatorio.** All'iscrizione si sceglie un **mazzo di Castra** e il comandante viene preso da
  lì, oppure "Nessuno" e lo si sceglie a mano con la ricerca Scryfall. Senza comandante il pulsante Iscriviti resta
  disattivato. Per gli ospiti lo inserisce il TO.
- Associare un mazzo di Castra serve anche per le statistiche: a fine torneo i match finiscono tra le partite
  personali di quel mazzo (`kind: 'tournament'`, con `opponentPlayer`).
- **La decklist è facoltativa**: per ora è un **link Moxfield**. Moxfield blocca la lettura delle liste da altre app
  (risponde 403), quindi dal link non si ricava il comandante. Il TO vede quanti l'hanno caricata (es. "Decklist
  8/11"), senza blocchi. Si può aggiungere fino alla pubblicazione sul foglio.
- Durante il torneo la lista la vedono solo il giocatore e i TO; **a torneo concluso diventa pubblica** (le regole
  Firestore la aprono da sole quando il torneo risulta concluso) e il link va nella colonna "Link lista" del foglio,
  quindi compare anche nel meta.
- Dopo l'avvio del turno 1 comandante e mazzo sono bloccati: solo il TO può cambiarli.

## 5. Regole di gioco

- Bo3, turni da 50 minuti, punti 3/1/0.
- Primo turno casuale, poi svizzero per punti senza rivincite. Dentro lo stesso gruppo di punti l'abbinamento è
  casuale (come il programma ufficiale Wizards, non "1° contro 2°"); tra tutti gli abbinamenti senza rivincite si
  sceglie quello più vicino in punti (somma dei quadrati delle differenze: meglio due giocatori che scendono di un
  gruppo che uno che scende di due). Una rivincita solo se nessun abbinamento la evita, e allora il minor numero.
- Spareggi MTR: **OMW%**, poi **GW%**, poi **OGW%**; ogni percentuale vale almeno **0,33** (come scritto nell'MTR,
  non 1/3), anche quella dei game. A parità perfetta decide il nome del giocatore (`playerKey`), così ogni telefono
  mostra la stessa classifica.
- **Turni svizzeri**: l'app propone il numero in base agli iscritti, come nei fogli 2026 (quanti ne servono perché
  resti un solo imbattuto: 9-16 giocatori → 4, 17-32 → 5, 33-64 → 6); il TO può cambiarlo e anche
  chiudere lo svizzero prima.
- **Bye**: al giocatore più in basso in classifica che non l'ha ancora avuto. Vale 3 punti, conta come 2-0, è escluso
  dagli spareggi degli avversari e va nella colonna BYE del foglio.
- **Pareggio intenzionale**: si segna 0-0 ed è un pareggio normale (1 punto a testa, nessun game nel GW%).
- **Drop**: lo fa il giocatore dall'app o il TO. Il giocatore esce dagli abbinamenti successivi e resta in classifica
  con i punti fatti; se il drop arriva a turno in corso, il match di quel turno vale com'è segnato.
- **Top cut**: la decide il TO (nessuna, 2, 4, 8); per le tappe di lega parte da "nessuna" (in 137 tappe del 2026 non
  se n'è mai giocata una). Seeding dallo svizzero (1º contro 8º…). Un match di top cut deve avere un vincitore.
- **Top cut nel foglio** (in attesa di conferma del comitato): i match della top **si contano** nelle V/S/P e
  **l'ordine finale è quello della top** (1º il vincitore, 2º il finalista, poi semifinalisti e quarti, ognuno
  ordinato secondo lo svizzero). È quello che fanno i fogli 2026 dove la top è stata giocata e contata (MR Magic
  Savona di gennaio, Savona di marzo, Genova L2, High Tide Genova, Albisola L2, MagicHammer di settembre e ottobre).
  Da chiedere al comitato: Cogoleto (34 giocatori), Damnation Lucca (23) e Paupergeddon (22), dove non c'è traccia di
  match in più.

## 6. Svolgimento

- **Avvio del turno**: con un solo tocco gli abbinamenti compaiono a tutti e il timer parte nello stesso istante. Il
  torneo salva solo l'ora di fine del turno, presa dall'orologio di Firebase e non dai telefoni, quindi tutti vedono
  lo stesso conto alla rovescia. Il TO può aggiungere minuti a un singolo tavolo (deck check, giudice), e lo vedono
  anche i due giocatori. A fine tempo l'app mostra "Tempo!": i turni extra si giocano come da regolamento, senza che
  l'app li conti.
- **Risultato**: lo segna uno dei due giocatori (game vinti, persi, pareggiati, o un risultato veloce compreso
  "0-0 ID"), l'altro lo conferma con un tocco. Se non si mettono d'accordo, o se manca la conferma a fine turno,
  decide il TO.
- **Correzioni**: il TO può correggere un risultato anche di un turno passato; la classifica si ricalcola, gli
  abbinamenti già fatti restano.
- **Rifare gli abbinamenti**: solo a turno in corso. Il TO prima corregge l'errore (giocatore dimenticato, drop non
  segnato, risultato sbagliato del turno prima), poi tocca "Rifai abbinamenti": l'app avvisa se dei risultati sono
  già stati segnati e andranno persi, rifà gli abbinamenti e fa ripartire il timer da 50 minuti.
- **Torneo annullato**: finché non è pubblicato sul foglio, il TO o un admin può cancellarlo e il torneo registrato
  torna disponibile.
- Abbinamenti e classifica si calcolano sul telefono del TO (non c'è un server). "Apri partita" porta nel life
  counter con avversario e timer già allineati al turno.
- Riaprendo l'app si ritrova la situazione attuale (tutto è su Firestore); se il telefono perde la rete si
  riallinea appena torna.
- **Notifiche push**: quelle che esistono partono da un workflow di GitHub due volte al giorno, quindi non servono
  per i turni. Durante il torneo l'app si aggiorna in diretta quando è aperta.
- Più avanti, forse: uno schermo da proiettare in sala con abbinamenti, timer e classifica.

## 7. Dove sta nell'app

- **Home, riga del codice**: sempre visibile, sottile, con il campo per il codice e "Entra". Sotto, solo se ci sono
  tornei in corso, il link "N tornei in corso · segui dal vivo".
- **Home, card "Tornei"**: nascosta di base. Si apre quando si inserisce un codice (mostra il torneo con "Iscriviti"
  e "Vedi gli iscritti", e una ✕ per richiuderla), quando si è iscritti a un torneo non ancora iniziato e quando si
  sta giocando: allora diventa "Il mio torneo" con turno, tavolo, avversario e comandante, timer, "Segna risultato",
  "Apri partita" e il link ad abbinamenti e classifica.
- **Home, card "Area TO"**: solo per i TO, con le loro leghe nell'intestazione. Mostra il prossimo torneo da gestire
  o da avviare, "+ Nuova tappa" e "Tutti i tornei ›" (l'Area TO completa). Durante un torneo del TO diventa grande:
  turno, timer, risultati confermati / in attesa / mancanti, "Gestisci il turno".
- Va in cima la card del torneo in corso, poi "Nuova partita" e il resto della Home.
- **Tornei in corso**: tutti quelli del circuito, con tipo, luogo, turno, giocatori e tempo rimasto, e in fondo
  "Conclusi oggi" con il vincitore e il suo comandante. Con un solo torneo in corso il link apre direttamente quello.
- **Pagina del torneo da spettatore**: barra con turno e timer, "Cerca un giocatore" (tavolo, punti, avversario),
  schede Abbinamenti e Classifica. Il giocatore iscritto ha in più "I miei match", il proprio tavolo evidenziato e il
  drop.
- **Area TO**: tornei in corso, "+ Tappa N" per ogni lega assegnata, livelli da avviare, tornei da pubblicare sul
  foglio. Le pagine di gestione: iscrizioni (codice, richieste da confermare, iscritti con stato della lista, turni e
  top cut, "Avvia il turno 1"), turno in corso (timer, stato di ogni tavolo, "Rifai abbinamenti", "Abbina il turno
  successivo"), chiusura (classifica finale con spareggi, "Pubblica sul foglio", "Copia le righe").

## 8. Pubblicazione sul foglio

- I fogli delle leghe sono tutti Google Sheets; dei livelli 2026, 26 sono Google Sheets e 8 (gennaio–marzo) file
  .xlsx caricati su Drive. **Per i tornei nuovi l'admin registra solo Google Sheets**; con un .xlsx resta il
  copia-incolla.
- Le schede di una tappa e la `Classifica` di un livello hanno le stesse colonne: A posizione, **B Nome giocatore**,
  **C Comandante**, D punti (formula), **E V**, **F S**, **G P**, **H BYE**, **I Link lista**. L'app scrive solo le
  colonne in grassetto e la data, con le righe nell'ordine della classifica finale. Punti, punti classifica, report e
  statistiche restano formule del foglio.
- Leghe: il nome in colonna B si sceglie da un menu che legge la scheda `Classifica`, quindi i giocatori nuovi vanno
  aggiunti prima lì. I comandanti nuovi vanno scritti nella scheda `Comandanti` (partner con " / " in ordine
  alfabetico, carte bifronte con " // ", come i nomi di Scryfall nell'app).
- **Come**: il TO tocca "Pubblica sul foglio" e l'app manda allo script Apps Script solo il proprio token di accesso
  e l'id del torneo. Lo script verifica il token con Google, controlla su Firestore che quell'account sia un TO del
  torneo e che il torneo sia concluso, legge i dati **da Firestore** (non dal telefono), aggiunge giocatori e
  comandanti nuovi alle loro schede e scrive. Si ferma se la scheda ha già dei dati.
- **Script**: va pubblicato da `centuriondati@gmail.com`, proprietario di tutti i fogli, con il permesso di modifica
  dei fogli; poi si aggiornano i secret `META_SCRIPT_URL` e `META_SCRIPT_KEY` e si elimina il vecchio script. Uno
  solo per lettura e scrittura.
- Di riserva, "Copia le righe": il TO le incolla nella scheda.
- Il meta notturno legge il foglio come oggi: nessun doppio conteggio e nessuna modifica a `build-meta.mjs`.

## 9. Dati su Firestore

Già in uso (fasi 1 e 2b-1):

```
organizers/{uid}                 player, name, leagues: [nomi delle leghe], at, by    (scrivono solo gli admin)
sources/{drive}                  + zone?: nome della lega, tos?: [uid]                (tornei di livello)
tournaments/{tid}                tid = drive (livelli) o drive~tappa (leghe): un torneo per foglio e tappa
                                 drive, kind, name, stage?, date, status (open | swiss | cut | done), rounds, cut,
                                 round (turno in corso, svizzero e top cut di seguito), started (orologio del server),
                                 at, by
  /players/{playerKey}           name, commander (null finché non c'è), joined? (ritardatario), drop? (ultimo turno)
  /matches/r{turno}t{tavolo}     round, table (0 = bye), p1, p2 (null = bye), score [V, S, P] | null, extra (minuti)
```

Le scrivono i TO che gestiscono quel foglio (stessa regola di `canRun`) e gli admin; tutti le leggono, anche senza
accesso. Da aggiungere nelle fasi successive:

```
joinCodes/{codice}               tid      (get con il codice, mai list)
claims/{playerKey}               + verifiedBy, verifiedIn                               (verifica data da un TO)
tournaments/{tid}                + iscrizioni aperte, pubblicato sul foglio
  /players/{playerKey}           + uid, status (iscritto | in attesa), deckId, added (TO | link)
  /players/{playerKey}/private/deck  link Moxfield (pubblico a torneo concluso)
  /matches/…                     + reportedBy, confirmed
```

Ogni regola nuova ha il suo caso in `scripts/test-rules.mjs`, e `src/lib/tournaments.emulator.test.ts` fa girare un
torneo intero con le funzioni dell'app contro le stesse regole; `rules.yml` le prova e le pubblica dopo i test.

## 10. Fasi

1. **Ruoli e assegnazioni** (fatta): scheda TO nell'area admin (solo giocatori collegati e verificati, con le loro
   leghe), zona e TO assegnati nel modulo dei livelli 1 e 2, `src/lib/organizers.ts` (`canRun`: quali fogli gestisce
   un TO), regole Firestore con i test.
2. **Torneo gestito dal TO**, in tre passi: **2a** il motore `src/lib/swiss.ts` con i test (fatto); **2b** la
   gestione del TO: dati, regole e funzioni in `src/lib/tournaments.ts` (2b-1, fatto), le schermate in
   `src/views/Organizer.tsx` con la card in Home e le pagine `#to` e `#to/<torneo>` (2b-2, fatto); **2c** le pagine da spettatore. In tutto: card "Area TO" in Home, creazione della tappa o avvio del livello, iscrizioni a mano,
   svizzero, risultati, drop, ritardatari, classifica con spareggi, top cut, pagine da spettatore, "Copia le righe".
3. **Giocatori nell'app**: link e codice, richieste da confermare con verifica, card in Home, timer, risultati con
   conferma, comandante e decklist.
4. **Pubblicazione**: script Apps Script che scrive nel foglio, decklist pubbliche, partite personali compilate da
   sole.

## 11. In sospeso

- Comitato: top cut nelle V/S/P e i tre fogli strani (Cogoleto, Damnation Lucca, Paupergeddon).
- Proprietario: script Apps Script sull'account `centuriondati` e secret aggiornati (serve dalla fase 4).
- POTY: se è un torneo a sé, un tipo in più.
