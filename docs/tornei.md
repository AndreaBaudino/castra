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
  vecchio smette di funzionare). Il codice non è un segreto (sta nel torneo, che tutti leggono): serve a trovare il
  torneo. A proteggere le iscrizioni sono il collegamento al giocatore e la conferma del TO per chi non è verificato.

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
  personali di quel mazzo (`kind: 'tournament'`, con `opponentPlayer`): le registra l'app del giocatore quando vede
  il torneo concluso (nei due giorni in cui la Home lo mostra), con id fissi (`torneo~r<turno>`), così non si
  duplicano tra telefoni o visite. Senza un mazzo di Castra il nome del mazzo è il comandante.
- **La decklist è facoltativa**: per ora è un **link Moxfield**. Moxfield blocca la lettura delle liste da altre app
  (risponde 403), quindi dal link non si ricava il comandante. Il TO vede quanti l'hanno caricata ("Moxfield 8/11")
  e, per ogni iscritto, l'icona della lista (verde o rossa) e quella del mazzo se ha collegato un mazzo di Castra
  ("Castra 8/11"), senza blocchi. Si può aggiungere fino alla pubblicazione sul foglio.
- **Il comandante è segreto fino al turno 1**: a iscrizioni aperte l'app lo mostra solo al giocatore che l'ha
  inserito; il TO vede solo se c'è o manca (anche nel registro). Durante il torneo lo vedono i TO e, al tavolo e nei
  propri turni, gli avversari; chi segue il torneo vede classifica e abbinamenti senza comandanti. A torneo concluso
  è pubblico. Fino al turno 1 è nascosto anche nei dati: sta nel documento privato del giocatore
  (`private/deck`, che leggono solo lui e i TO), e in quello pubblico c'è solo `secret: true`. La transazione che avvia
  il turno 1 lo copia nel documento pubblico; le regole rifiutano un comandante in chiaro prima di allora. Dal turno 1
  lo nasconde solo l'app: chi segue il torneo non lo vede, ma i dati lo contengono.
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
- Abbinamenti e classifica si calcolano sul telefono del TO (non c'è un server).
- **"Apri partita"** (card del torneo in Home): il life counter si collega al match del turno. Il timer è quello del
  turno (50 minuti più quelli aggiunti dal TO al tavolo) e non si ferma; a fine game "Prossima partita del match"
  tiene il conto dei game. "Segna risultato" apre il risultato del torneo già compilato e l'avversario lo conferma come
  sempre. Il life counter non registra la partita tra quelle del giocatore: ci arriva una volta sola, a torneo
  concluso, con le altre del torneo. Senza profilo verificato i risultati li segna il TO; dal menu si esce dal match.
- Riaprendo l'app si ritrova la situazione attuale (tutto è su Firestore); se il telefono perde la rete si
  riallinea appena torna.
- **Notifiche push**: abbinamenti del turno a ogni giocatore (al primo turno di top cut con "sei nella top 8"),
  risultato da confermare all'avversario, iscrizione confermata, posto finale alla chiusura (la classifica la manda
  il telefono del TO, lo script controlla che gestisca il torneo) e, al TO che l'ha aperto, le richieste di
  iscrizione; subito, da un
  Apps Script a parte (`scripts/notify/apps-script`, README "Notifiche dei tornei"), che l'app chiama dopo l'avvio
  del turno e dopo il risultato segnato e che legge da Firestore cosa mandare. Le altre notifiche partono dal workflow
  di GitHub due volte al giorno. Durante il torneo l'app si aggiorna in diretta quando è aperta, e il telefono di un
  giocatore legge solo i suoi match (meno letture di Firestore).
- Sul computer (da 1024 px) gestione del torneo, pagina dal vivo, Area TO e Tornei in corso sono su due colonne; la
  pagina dal vivo affianca abbinamenti e classifica con il tempo più grande, già adatta a un monitor in sala.
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
- **Come** (`doPost` in `scripts/meta/apps-script/Code.gs`): il TO tocca "Pubblica sul foglio" e l'app manda allo
  script l'id del torneo, le righe della classifica finale (calcolate sul telefono con `swiss.ts`, decklist comprese)
  e il token del suo accesso Firebase. Lo script legge il torneo da Firestore **con quel token**, controlla che sia
  concluso e non ancora nel foglio, poi fa una scrittura che non cambia niente (`filed: false`): le regole la lasciano
  passare solo a chi gestisce il torneo, quindi a decidere chi può pubblicare sono le stesse regole dell'app. Il foglio
  e la scheda vengono dal torneo su Firestore, mai dal telefono. Le righe arrivano dal telefono, ma un TO può già
  cambiare i risultati su Firestore (e di solito anche il foglio): lo script le controlla (numeri, lunghezze, link
  Moxfield) e scrive i testi sempre come testo, mai come formule.
- Prima di scrivere lo script controlla tutto: trova la tabella cercando "Nome giocatore" e "Comandante" (la data è
  la cella sotto "Data"), si ferma se c'è già un nome, un risultato o un BYE spuntato, o se mancano righe. Nelle leghe
  i giocatori nuovi vanno nelle righe libere della tabella della `Classifica` (quelle con le formule già pronte); i
  comandanti nuovi nelle righe libere in cima ai `Comandanti`, sopra la formula del database (di solito ne restano
  poche: quelli che non ci stanno li elenca al TO da aggiungere a mano). Nomi e comandanti già presenti, confrontati
  come `playerKey`, prendono la grafia del foglio. Alla fine segna il torneo come nel foglio (`filed: true`) e salva
  cosa ha scritto (`published`: scheda, prima riga, quante righe, giocatori e comandanti aggiunti). Uno alla volta
  (`LockService`), perché due TO non trovino entrambi la scheda vuota.
- **"Togli dal foglio"** (stesso script, `action: 'clear'`): con `published` svuota le righe e la data scritte (le
  formule restano, i BYE tornano non spuntati), toglie dalla `Classifica` e dai `Comandanti` i nomi aggiunti allora
  se nessun'altra scheda di tappa li usa, cancella `published` e rimette il torneo tra quelli da pubblicare. Si ferma
  se la tabella della scheda non comincia più dalla riga di allora. "Annulla il torneo" non tocca il foglio: se il
  torneo è pubblicato, l'app lo ricorda prima di annullare.
- **Script**: pubblicato da `centuriondati@gmail.com`, proprietario dei fogli e con il permesso di modificarli; lo
  stesso deployment legge i fogli per il meta (con la chiave) e li scrive. L'URL `/exec` va in `PUBLISH_URL`
  (`src/config.ts`): finché è vuoto il pulsante non c'è e resta il copia-incolla.
- **Fogli nuovi dei livelli 1** (stesso script, `action: 'create'`): dall'area admin (Tornei → Aggiungi torneo, link
  vuoto, "Crea il foglio dal modello") lo script legge `admins/{uid}` con il token di chi chiede (le regole lasciano
  leggere a ognuno solo la propria voce: trovata vuol dire admin), copia il modello `Blank LVL 1` (`TEMPLATE_L1`) nel
  Drive di centuriondati come "LVL 1 - nome", scrive il nome in B2 e la data in C3 della `Classifica` e risponde con
  l'id; l'app lo aggiunge all'elenco come un torneo inserito a mano. I livelli 2 hanno punti diversi: per ora solo a
  mano.
- **Eliminare un foglio di livello 1** (`action: 'trash'`, "Elimina il foglio" aprendo il livello nell'area admin): lo
  script controlla che chi chiede sia admin, che non sia il modello, che il foglio sia nell'elenco come livello 1, che
  non ci sia un torneo in app su quel foglio (`tournaments/{drive}`), che il file sia di centuriondati e che la
  `Classifica` non abbia risultati; poi lo sposta nel cestino (30 giorni per recuperarlo) e l'app lo toglie
  dall'elenco. Serve il permesso `drive` completo, limitato all'account dello script.
- Di riserva, "Copia le righe": il TO le incolla nella scheda.
- Il meta notturno legge il foglio come oggi, senza doppi conteggi. In più `build-meta.mjs` legge i match dei
  tornei in app chiusi e pubblicati (o segnati come riportati) e li aggiunge al meta come abbinamenti tra comandanti,
  con i comandanti delle righe del foglio (`scripts/meta/pairings.mjs`): la pagina di ogni comandante mostra i suoi
  match contro gli altri comandanti. Bye, match senza risultato e mirror restano fuori. Se Firestore non risponde
  restano gli abbinamenti già pubblicati.

## 9. Dati su Firestore

Già in uso (fasi 1 e 2):

```
organizers/{uid}                 player, name, leagues: [nomi delle leghe], at, by    (scrivono solo gli admin)
sources/{drive}                  + zone?: nome della lega, tos?: [uid]                (tornei di livello)
tournaments/{tid}                tid = drive (livelli) o drive~tappa (leghe): un torneo per foglio e tappa
                                 drive, kind, name, stage?, date, status (open | swiss | cut | done), rounds, cut,
                                 round (turno in corso, svizzero e top cut di seguito), started (orologio del server),
                                 filed (risultati riportati nel foglio: finché è false il torneo resta nell'Area TO),
                                 at, by
  /players/{playerKey}           name, commander (null finché non c'è), joined? (ritardatario), drop? (ultimo turno)
  /matches/r{turno}t{tavolo}     round, table (0 = bye), p1, p2 (null = bye), score [V, S, P] | null, extra (minuti)
```

Le scrivono i TO che gestiscono quel foglio (stessa regola di `canRun`) e gli admin; tutti le leggono, anche senza
accesso. Aggiunti nella fase 3:

```
claims/{playerKey}               + verifiedBy, verifiedIn      (la verifica data da un TO, confermando l'iscrizione)
tournaments/{tid}                + code (6 caratteri, null dal turno 1: iscrizioni chiuse), published (cosa lo script
                                   ha scritto nel foglio: tab, first, rows, players, commanders)
  /players/{playerKey}           + uid (l'account che si è iscritto), pending (in attesa del TO), deck (mazzo in
                                   Castra), list (ha dato la decklist)
  /players/{playerKey}/private/deck  link: la decklist Moxfield; commander: il comandante finché è segreto (li leggono
                                   il giocatore e i TO, tutti a torneo concluso)
  /players/{playerKey}           + secret (comandante dato, nel documento privato fino al turno 1)
  /matches/…                     + reportedBy (chi ha segnato il risultato), confirmed (l'avversario l'ha confermato);
                                   senza reportedBy il risultato è del TO
```

Il giocatore scrive solo la propria iscrizione (il `playerKey` del suo collegamento), il proprio drop e i risultati del
proprio tavolo nel turno in corso; per drop e risultati serve il collegamento verificato.

Registro del torneo (dopo la fase 4):

```
tournaments/{tid}/log/{auto}     at (ora del server), by (account), kind (cosa è successo), round?, table?, player?,
                                 from?, to?          (lo leggono solo i TO; nessuno lo modifica o lo cancella)
                                 + infraction?, text?, uid? per le penalità (warning, gameLoss, matchLoss, dq), le
                                 note e i deck check: le scrivono i TO; con uid (l'account del giocatore) le legge
                                 anche lui
  /players/{playerKey}           + invalid (il mazzo di Castra non passava il controllo all'iscrizione)
```

Ogni funzione di `tournaments.ts` che cambia il torneo scrive la sua riga nella stessa operazione, quindi o vanno a buon
fine entrambe o nessuna. Il giocatore scrive solo le righe delle proprie azioni (iscrizione, risultato, conferma, drop).
È l'app a scrivere il registro: le regole ne garantiscono autore e ora, non che ogni modifica ne abbia una (basta per
errori e telefoni diversi; se servisse, le regole potrebbero imporlo sulle correzioni dei risultati). Annullando il
torneo il registro resta, con chi l'ha annullato; un torneo ripartito sullo stesso foglio mostra solo le righe sue.

Ogni regola nuova ha il suo caso in `scripts/test-rules.mjs`, e `src/lib/tournaments.emulator.test.ts` fa girare un
torneo intero con le funzioni dell'app contro le stesse regole; `rules.yml` le prova e le pubblica dopo i test.

## 10. Fasi

1. **Ruoli e assegnazioni** (fatta): scheda TO nell'area admin (solo giocatori collegati e verificati, con le loro
   leghe), zona e TO assegnati nel modulo dei livelli 1 e 2, `src/lib/organizers.ts` (`canRun`: quali fogli gestisce
   un TO), regole Firestore con i test.
2. **Torneo gestito dal TO**, in tre passi: **2a** il motore `src/lib/swiss.ts` con i test (fatto); **2b** la
   gestione del TO: dati, regole e funzioni in `src/lib/tournaments.ts` (2b-1, fatto), le schermate in
   `src/views/Organizer.tsx` con la card in Home e le pagine `#to` e `#to/<torneo>` (2b-2, fatto); **2c** le
   pagine da spettatore in `src/views/Live.tsx`: link in Home, `#live` e `#live/<torneo>` (fatto). In tutto: card "Area TO" in Home, creazione della tappa o avvio del livello, iscrizioni a mano,
   svizzero, risultati, drop, ritardatari, classifica con spareggi, top cut, pagine da spettatore, "Copia le righe".
3. **Giocatori nell'app** (fatta): link e codice, richieste da confermare con verifica, riga del codice e card del
   torneo in Home (`src/views/MyTournament.tsx`), timer, risultati segnati e confermati dai giocatori, drop,
   comandante dal mazzo di Castra e decklist Moxfield privata.
4. **Pubblicazione** (fatta): script Apps Script che scrive nel foglio ("Pubblica sul foglio", con i test in
   `src/lib/appsScript.test.ts`), decklist pubbliche nella classifica finale e, dalla colonna I, nel meta; partite
   personali registrate da sole; "I miei match" e tavolo evidenziato nella pagina da spettatore; "Apri partita" nel
   life counter (vedi sopra).

## 11. In sospeso

- Comitato: top cut nelle V/S/P e i tre fogli strani (Cogoleto, Damnation Lucca, Paupergeddon).
- Proprietario: nuova versione dello script con il permesso di modifica dei fogli, e il suo URL in `PUBLISH_URL`.
- POTY: se è un torneo a sé, un tipo in più.
