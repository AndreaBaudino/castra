# Castra

PWA (installabile da telefono) per Centurion Commander: dashboard, meta, life counter 1v1, mazzi.

## Sviluppo

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # output in dist/
```

Per pubblicare in una sotto-cartella (es. GitHub Pages): `BASE=/centurion-companion/ npm run build`.

## Dati del meta (tornei di ogni anno)

Il meta si calcola dai fogli dei tornei (Livelli 1 e 2, leghe S1/S2, lega online). L'elenco dei fogli si gestisce
dall'app (Profilo → Area admin → Tornei) ed è salvato su Firestore (`sources/{id del file}`); finché quella raccolta è
vuota vale `scripts/meta/sources.json`, che l'area admin importa con un tocco. I fogli sono privati: lo script legge copie locali e scrive `public/meta.json`, con i
dati di ogni anno, che viene pubblicato con l'app. Dai tornei gestiti in app, chiusi e pubblicati sul foglio (o
segnati come riportati), legge anche i match su Firestore: chi ha giocato contro chi, con i comandanti presi dalle
righe del foglio. Finiscono nel meta come abbinamenti tra comandanti, mostrati nella pagina di ogni comandante
("Contro gli altri comandanti"); i fogli da soli non dicono chi ha giocato contro chi.

1. Scarica ogni foglio come .xlsx in `.meta-cache/<id del file>.xlsx` (l'id è quello nel link del foglio).
2. `npm run meta`: legge i fogli, riconosce i comandanti su Scryfall e stampa quello che va controllato
   (vittorie e sconfitte che non tornano, giocatori senza comandante, nomi non riconosciuti).
3. Nomi scritti male: si correggono dall'app, Area admin → Nomi (comandanti → nome Scryfall, giocatori → nome come
   nella classifica del circuito). L'ultimo aggiornamento elenca i nomi che non ha riconosciuto, con "Correggi" e,
   per i giocatori giusti ma fuori classifica, ✓. Le correzioni sono su Firestore (`aliases/{id}`) e si applicano
   leggendo i fogli, che non vengono mai modificati: se un nome viene sistemato nel foglio, la sua correzione smette
   di servire e l'area admin la segna come "non più usata". Valgono ovunque, oppure solo in un anno o in un foglio
   (per i giocatori, quando quel nome altrove potrebbe essere di un altro); si applicano una volta sola, senza
   catene. Finché la raccolta è vuota vale `scripts/meta/aliases.json`, che l'area admin importa con un tocco.

Le liste dei mazzi (le carte) sono in `scripts/meta/decklists.json`, un archivio fisso: lette una volta da Moxfield
il 5/11/2026 e mai più aggiornate. Ogni lista ha il comandante che aveva su Moxfield e le iscrizioni dei fogli
(torneo e giocatore) con quel link e quel comandante: le carte contano una volta sola, solo per quel comandante.
Le iscrizioni con lo stesso link ma un altro comandante, e quelle dei tornei successivi, non sono collegate. Il file
non si rigenera: un'estrazione nuova può solo aggiungere liste per iscrizioni che non ne hanno una.

Per aggiungere un torneo: Area admin → Tornei → Aggiungi torneo, con il link al foglio (Google Sheets o Excel su Drive,
leggibile dall'account Google dell'Apps Script qui sotto). Per un livello 1 nuovo si può lasciare vuoto il link e
toccare **Crea il foglio dal modello**: lo script copia il modello del livello 1 (`TEMPLATE_L1` in `Code.gs`, di
`centuriondati@gmail.com`) nel Drive di quell'account, scrive nome e data e il torneo entra nell'elenco. Aprendo un
livello 1, **Elimina il foglio** lo sposta nel cestino di quel Drive (recuperabile per 30 giorni) e lo toglie
dall'elenco, ma solo se il foglio è di centuriondati, non ha risultati e il torneo non è stato aperto in app. Entra nel meta al primo aggiornamento notturno. I bye spuntati nella colonna BYE non contano
nel winrate; quelli non spuntati restano vittorie finché qualcuno non li spunta.

### Un anno nuovo

Ogni torneo va nell'anno della sua data (eventi); le leghe, che non hanno una data sola, hanno un anno scelto nel
modulo (`"year"`). Per il 2027 basta quindi aggiungere i nuovi tornei, lasciando quelli del 2026 dove sono: l'app
mostra l'anno più recente e, quando ci sono più anni, un selettore per tornare agli altri; l'area admin mostra
l'elenco un anno alla volta.

Il foglio delle classifiche del circuito di ogni anno si imposta da Area admin → Tornei, sotto l'anno: link al foglio,
numeri (gid) delle quattro schede e posti POTY, con "Prova a leggerlo" prima di salvare. Una copia del foglio
dell'anno prima tiene gli stessi numeri delle schede, quindi di solito basta il link nuovo. È salvato su Firestore
(`circuits/{anno}`); quello del 2026 in `src/config.ts` è la copia inclusa nell'app. Nella scheda Circuito l'anno si
sceglie con lo stesso selettore del meta; Home, Profilo e avvisi di classifica usano sempre l'anno più recente.

### Aggiornamento automatico (ogni notte)

`.github/workflows/meta.yml` gira ogni notte a mezzanotte (ora italiana) e si può lanciare a mano da
Actions → Update meta → Run workflow. Legge l'elenco dei fogli da Firestore, li scarica, rifà il meta e lo scrive sul
ramo `meta-data`: `meta.json` (più un `meta-<anno>.json` per anno, per le versioni dell'app precedenti),
`status.json` (com'è andato l'aggiornamento, mostrato nell'area admin) e `sources.json` (l'elenco usato), in un unico
commit sostituito ogni volta. L'app legge i dati da lì: `main` non viene toccato e l'app non viene ripubblicata. Se
quel file non si raggiunge, l'app usa la copia in `public/`. Se un foglio non si scarica il meta resta quello di
prima: cambia solo `status.json`, con i fogli non scaricati (e GitHub manda una mail di errore).

I fogli si leggono con il tuo account Google tramite un piccolo Apps Script (`scripts/meta/apps-script`).
Setup (una tantum):

1. [script.google.com](https://script.google.com) → Nuovo progetto. Incolla `Code.gs`; in Impostazioni progetto
   spunta "Mostra il file manifest appsscript.json" e incolla anche quello.
2. Impostazioni progetto → Proprietà script → aggiungi `KEY` con una chiave lunga e casuale (es. da un generatore di
   password, 40+ caratteri).
3. Nell'editor seleziona la funzione `check` ed eseguila: autorizza l'accesso a Drive e controlla che ogni foglio sia
   leggibile (lo vedi nel log).
4. Esegui il deployment → Nuovo deployment → tipo "App web", esegui come "Me", accesso "Chiunque". Copia l'URL che
   finisce con `/exec`.
5. Su GitHub: Settings → Secrets and variables → Actions → aggiungi `META_SCRIPT_URL` (l'URL) e `META_SCRIPT_KEY`
   (la stessa chiave del punto 2).

Lo script risponde solo a chi ha la chiave e solo per i file nell'elenco dei tornei (Firestore, più `sources.json`
sul ramo main). Se modifichi
`Code.gs`, va pubblicata una nuova versione dello stesso deployment (Gestisci deployment → modifica → Nuova versione),
così l'URL resta lo stesso.

Lo stesso script **scrive nei fogli** i tornei gestiti in app ("Pubblica sul foglio" nell'Area TO, `doPost`): per
questo l'account che lo pubblica deve poter modificare i fogli, e `appsscript.json` chiede anche il permesso
`spreadsheets`, e `drive` (non più solo lettura) per cestinare i fogli dei livelli creati per sbaglio (dopo averlo
aggiornato si rilancia `check` dall'editor per autorizzarlo). Non serve la chiave: lo script usa
l'accesso Firebase del TO e le regole di Firestore per sapere se può pubblicare quel torneo. L'URL `/exec` va anche
in `PUBLISH_URL` (`src/config.ts`); finché è vuoto, nell'Area TO resta solo il copia-incolla. Con lo stesso URL lo
script crea i fogli dei livelli 1 dal modello e li cestina (`action: 'create'` e `'trash'`, solo per gli admin: lo
controlla leggendo `admins/{uid}` con l'accesso di chi chiede).

### Banlist

Si aggiorna dall'app: Profilo → Area admin → Banlist → **Controlla il sito di Centurion** legge la
[pagina del formato](https://www.centurioncommander.eu/it/ban-list-it/) tramite l'API di WordPress del sito (la pagina
stessa non si lascia leggere da un altro sito), controlla ogni carta su Scryfall, prende la data dell'ultimo annuncio e
mostra cosa cambia rispetto alla banlist in uso; **Pubblica** la salva su Firestore (`config/banlist`), da dove ogni app
la legge all'avvio (`src/lib/banlistSync.ts`, `src/lib/banlist.ts`). Se la pagina non si legge o sembra cambiata (un
titolo sparito, molte meno carte, un nome sconosciuto) non c'è niente da pubblicare. Le liste in `src/lib/banlist.ts`
sono la copia inclusa nell'app, usata finché non ha letto quella pubblicata; le carte ante, fisiche e di sottogioco
sono regole del formato e restano lì.

## Mazzi

Import da testo (Moxfield → Export → Copy as plain text, o formato MTGO/Arena).
I dati e le immagini delle carte arrivano da Scryfall; i mazzi sono salvati sul dispositivo (localStorage).

## Login e sincronizzazione (Firebase)

Login con Google o email/password; se loggato, mazzi, partite e grafica personale vengono salvati
in Firestore (`users/{uid}`), così sono uguali su tutti i dispositivi. Senza login l'app funziona solo in locale.

Setup (una tantum, piano gratuito "Spark"):

1. https://console.firebase.google.com → **Aggiungi progetto** (Google Analytics non serve).
2. **Build → Authentication → Get started**, poi in *Sign-in method* abilita **Google** e **Email/Password**.
3. *Authentication → Settings → Authorized domains*: aggiungi `andreabaudino.github.io`.
4. **Build → Firestore Database → Create database** (location `eur3` o `europe-west`), poi nella scheda
   *Rules* incolla il contenuto di `firestore.rules` e pubblica (solo la prima volta: dopo ci pensa GitHub, vedi
   sotto).
5. **Project settings → Your apps → Web (</>)**: registra l'app e copia l'oggetto `firebaseConfig`
   in `FIREBASE_CONFIG` dentro `src/config.ts`. Questi valori sono pubblici per design: la sicurezza
   è garantita dalle regole del punto 4.

### Regole di Firestore

A ogni push su `main` che cambia `firestore.rules`, il workflow **Firestore rules** (`.github/workflows/rules.yml`)
prova le regole sull'emulatore e, se i test passano, le pubblica su Firebase: non serve più incollarle in console.
Per pubblicare usa un account di servizio, da creare una volta sola:

1. https://console.cloud.google.com/iam-admin/serviceaccounts?project=castra-a69ab → **Crea account di servizio**,
   nome per esempio `github-rules`.
2. Ruoli: **Amministratore regole Firebase** (Firebase Rules Admin), **Amministratore indici Cloud Datastore**
   (Cloud Datastore Index Admin) e **Visualizzatore Firebase** (Firebase Viewer). Se il job dice che manca un
   permesso, aggiungi il ruolo che lo contiene.
3. Sull'account creato: **Chiavi → Aggiungi chiave → Crea nuova chiave → JSON**: si scarica un file.
4. Su GitHub, **Settings → Secrets and variables → Actions → New repository secret**: nome
   `FIREBASE_SERVICE_ACCOUNT`, valore tutto il contenuto del file JSON. Poi cancella il file dal computer.
5. Da **Actions → Firestore rules → Run workflow** (su `main`) puoi pubblicare subito le regole attuali.

Senza il secret il job di pubblicazione fallisce con un messaggio che lo dice, e le regole restano quelle di prima.

### Notifiche

Chi ha un account può accendere nelle Preferenze le notifiche sul telefono: classifica del circuito (la sera, se è
cambiata la sua posizione o quella di chi segue), banlist (la mattina dopo un aggiornamento) e, per gli admin, area
admin (segnalazioni e nuovi collegamenti, mattina e sera). Gli interruttori valgono per l'account; il permesso del
telefono va dato su ogni dispositivo, che salva il suo token in `users/{uid}/devices`.

Le manda il workflow **Push notifications** (`.github/workflows/notify.yml`, script `scripts/notify.mjs`) alle 9:07 e
alle 19:37 (ora italiana d'inverno, un'ora dopo con l'ora legale). Ogni giro confronta con quello che ha visto il
giro prima (`notify/state` su Firestore): il primo giro registra solo lo stato e non manda niente. Setup una tantum:

1. All'account di servizio delle regole (`github-rules`, vedi sopra) aggiungi i ruoli **Utente Cloud Datastore**
   (Cloud Datastore User) e **Amministratore API Firebase Cloud Messaging** (Firebase Cloud Messaging API Admin).
2. In Firebase, **Project settings → Cloud Messaging**: "Firebase Cloud Messaging API (V1)" deve risultare abilitata.
3. Prova da **Actions → Push notifications → Run workflow** con "Solo prova" spuntato: il log elenca le notifiche
   che manderebbe, senza mandarle.

GitHub sospende i workflow programmati dopo 60 giorni senza commit nel repository: in quel caso si riattivano da
Actions con un clic.

### Notifiche dei tornei

Durante un torneo gestito in app le notifiche partono subito, non dal workflow: a ogni turno ogni giocatore riceve
tavolo e avversario (o il bye; al primo turno di top cut anche "sei nella top 8"), quando uno dei due segna il
risultato l'altro riceve quello da confermare, chi era in attesa sa quando il TO conferma l'iscrizione e alla chiusura
ognuno riceve il proprio posto in classifica. I TO della tappa (chi ha aperto il torneo, quelli della lega o
della zona e quelli assegnati a mano) ricevono ogni iscrizione fatta dall'app, con le richieste da confermare in
evidenza (anche loro devono avere "Tornei" acceso). Le manda
un secondo Apps Script (`scripts/notify/apps-script`), separato da quello dei fogli e senza accesso a Drive: l'app lo
chiama dopo l'avvio di un turno e dopo un risultato segnato, e lui legge da Firestore cosa mandare e a chi (solo agli
account con "Tornei" acceso nelle Preferenze, che l'app propone di accendere all'iscrizione). Ogni notifica parte una
volta sola, anche se lo script viene chiamato più volte. Finché `NOTIFY_URL` in `src/config.ts` è vuoto non parte
niente e l'interruttore non compare. Setup una tantum:

1. **Account di servizio** (solo lettura del database e invio delle notifiche):
   https://console.cloud.google.com/iam-admin/serviceaccounts?project=castra-a69ab → **Crea account di servizio**,
   nome `castra-notify`, ruoli **Visualizzatore Cloud Datastore** (Cloud Datastore Viewer) e **Amministratore API
   Firebase Cloud Messaging** (Firebase Cloud Messaging API Admin). Poi **Chiavi → Aggiungi chiave → Crea nuova
   chiave → JSON**: si scarica un file.
2. **Script**, con l'account `andreabaudino98@gmail.com`: https://script.google.com → **Nuovo progetto**, chiamalo
   "Castra Notifiche". In **Impostazioni progetto** spunta "Mostra il file manifest appsscript.json". Nell'editor
   incolla `scripts/notify/apps-script/Code.gs` in `Codice.gs` e `scripts/notify/apps-script/appsscript.json` in
   `appsscript.json`.
3. **Chiave**: in **Impostazioni progetto → Proprietà script** aggiungi `SERVICE_ACCOUNT` con valore tutto il
   contenuto del file JSON del punto 1. Poi cancella il file dal computer.
4. **Pubblica**: **Esegui il deployment → Nuovo deployment** → tipo "App web", esegui come "Me", accesso "Chiunque".
   Autorizza (chiede solo di collegarsi a servizi esterni), copia l'URL che finisce con `/exec` e mettilo in
   `NOTIFY_URL` in `src/config.ts`.

Per controllare il setup senza un torneo: nell'editor dello script scegli la funzione `checkSetup` e premi **Esegui**;
il log dice se la chiave funziona, se Firestore risponde e se l'account di servizio può mandare notifiche.

Per aggiornare lo script dopo una modifica: incolla il codice nuovo, poi **Gestisci deployment → modifica → Nuova
versione**, così l'URL resta lo stesso.

### Admin

Gli account admin vedono **Area admin** nel Profilo: l'elenco dei giocatori del circuito collegati a un account, con
la possibilità di revocare un collegamento (il giocatore torna libero e quell'account non può più collegarlo, chiunque
altro sì; la revoca si può annullare) e di azzerare la carta di sfondo e il mazzo preferito scelti per la sua pagina.
Nella scheda **Segnalazioni** arrivano i messaggi mandati dagli utenti (Profilo → "Segnala un problema o un'idea" e la
bandierina sulle pagine del circuito): si rispondono via email, se l'utente l'ha permesso, e si segnano come fatte.
Accanto ad **Area admin** nel Profilo compare quante cose ci sono da vedere: le segnalazioni aperte e i giocatori
collegati (non ancora verificati) dall'ultima volta che hai aperto la scheda Giocatori su quel dispositivo, dove
restano con l'etichetta "Nuovo" finché sei lì.

Nella scheda **TO** gli admin scelgono gli organizzatori dei tornei: "Aggiungi TO" elenca i giocatori collegati e
verificati, e il ruolo va all'account collegato a quel giocatore. Per ogni TO si spuntano le sue leghe (le "zone"):
creerà le tappe di quelle leghe, in ogni stagione, e gestirà i livelli 1 e 2 che hanno una di quelle leghe come
zona. Nel modulo di un livello 1 o 2 (scheda Tornei) si sceglie la zona e si possono assegnare TO a mano, anche di
altre zone. Sotto le leghe il modulo del TO elenca cosa gestisce da quest'anno. Se il collegamento del TO viene
revocato o perde la verifica, nella scheda compare "collegamento non più verificato". Il progetto completo dei tornei è
in [`docs/tornei.md`](docs/tornei.md).

I TO trovano in Home la card **Area TO**: da lì aprono le iscrizioni di una nuova tappa delle loro leghe (il numero
proposto è il successivo a quelli nel meta e a quelli già giocati in app) o di un livello 1 o 2 da avviare, iscrivono i
giocatori e gestiscono il torneo turno per turno. A torneo chiuso, "Copia nomi" e "Copia risultati" preparano le righe
per la scheda della tappa (o la "Classifica" di un livello): i nomi vanno incollati nella colonna B, i risultati nella
colonna E, perché la colonna D dei punti è una formula. La data va scritta a mano. Poi "Fatto: è nel foglio": finché non lo si
segna, il torneo resta nell'Area TO anche nei giorni dopo. Chiunque segue i tornei in corso da "Tornei in corso" in Home
(anche senza accesso) o dal link della pagina del torneo.

Ogni torneo nasce con un **codice di 6 caratteri** (e il link `…/#join~CODICE`), che il TO condivide o mostra in sala
e può rigenerare. Chi ha collegato il proprio giocatore si iscrive dalla riga "Torneo" in Home: se il collegamento è
verificato entra subito, altrimenti finisce tra le richieste "Da confermare" del TO, che con "Conferma" lo iscrive e
verifica il collegamento (l'area admin mostra quale TO l'ha verificato). All'avvio del turno 1 il codice smette di
funzionare e le richieste non confermate vengono rifiutate. Durante il torneo i giocatori verificati segnano i propri
risultati, che l'avversario conferma (finché manca la conferma il TO li vede con "?"), e possono fare drop.

A torneo chiuso, **"Pubblica sul foglio"** scrive la classifica finale nella scheda della tappa (o nella `Classifica`
del livello): nomi, comandanti, vittorie, sconfitte, pareggi, BYE, decklist e data, aggiungendo i giocatori nuovi alla
`Classifica` della lega e i comandanti nuovi alle righe libere dei `Comandanti`. Se la scheda ha già dei risultati non
scrive niente. **"Togli dal foglio"** fa il contrario: svuota le righe e la data scritte dall'app (le formule restano) e
toglie i giocatori e i comandanti aggiunti allora, se nessun'altra tappa li usa; poi il torneo si può ripubblicare.
"Annulla il torneo" invece non tocca il foglio. Le decklist diventano pubbliche nella classifica finale, e i giocatori con l'account trovano i match del
torneo tra le proprie partite.

Per rendere admin un account: **Firestore Database → Data → Start collection** `admins`, con ID documento l'UID
dell'account (lo trovi in *Authentication → Users*) e nessun campo. Per toglierlo, elimina il documento. L'app non può
scrivere in `admins`: lo decidono solo le regole di `firestore.rules`.
