# Castra

PWA (installabile da telefono) per Centurion Commander: dashboard, meta, life counter 1v1, mazzi.

## Sviluppo

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # output in dist/
```

Per pubblicare in una sotto-cartella (es. GitHub Pages): `BASE=/centurion-companion/ npm run build`.

## Dati del meta (tornei 2026)

Il meta si calcola dai fogli dei tornei (Livelli 1 e 2, leghe S1/S2, lega online), elencati in
`scripts/meta/sources.json`. I fogli sono privati: lo script legge copie locali e scrive `public/meta-2026.json`,
che viene pubblicato con l'app.

1. Scarica ogni foglio come .xlsx in `.meta-cache/<id del file>.xlsx` (l'id è quello nel link del foglio).
2. `npm run meta`: legge i fogli, riconosce i comandanti su Scryfall e stampa quello che va controllato
   (vittorie e sconfitte che non tornano, giocatori senza comandante, nomi non riconosciuti).
3. Nomi scritti male: si correggono in `scripts/meta/aliases.json` (comandanti → nome Scryfall, giocatori → nome
   come nel foglio del circuito).

Per aggiungere un torneo basta aggiungere una riga a `sources.json`. I bye spuntati nella colonna BYE non contano
nel winrate; quelli non spuntati restano vittorie finché qualcuno non li spunta.

### Aggiornamento automatico (ogni notte)

`.github/workflows/meta.yml` gira ogni notte a mezzanotte (ora italiana) e si può lanciare a mano da
Actions → Update meta → Run workflow. Scarica i fogli, rifà il meta e, se qualcosa è cambiato, lo scrive sul ramo
`meta-data`, che contiene solo `meta-2026.json` (un unico commit, sostituito ogni volta). L'app legge i dati da lì:
`main` non viene toccato e l'app non viene ripubblicata. Se quel file non si raggiunge, l'app usa la copia in
`public/`. Se un foglio non si scarica non pubblica niente (e GitHub manda una mail di errore).

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

Lo script risponde solo a chi ha la chiave e solo per i file elencati in `sources.json` sul ramo main. Se modifichi
`Code.gs`, va pubblicata una nuova versione dello stesso deployment (Gestisci deployment → modifica → Nuova versione),
così l'URL resta lo stesso.

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
   *Rules* incolla il contenuto di `firestore.rules` e pubblica.
5. **Project settings → Your apps → Web (</>)**: registra l'app e copia l'oggetto `firebaseConfig`
   in `FIREBASE_CONFIG` dentro `src/config.ts`. Questi valori sono pubblici per design: la sicurezza
   è garantita dalle regole del punto 4.
