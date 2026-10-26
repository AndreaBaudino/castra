# Castra

PWA (installabile da telefono) per Centurion Commander: dashboard, meta, life counter 1v1, mazzi.

## Sviluppo

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # output in dist/
```

Per pubblicare in una sotto-cartella (es. GitHub Pages): `BASE=/centurion-companion/ npm run build`.

## Dati del meta (Google Sheets)

1. Condividi il foglio come "Chiunque abbia il link può visualizzare".
2. In `src/config.ts` imposta `META_SHEET_ID` (ed eventualmente `META_SHEET_TAB`).
3. Colonne riconosciute (IT o EN, ordine libero): Mazzo/Comandante, Partite, Vittorie,
   Sconfitte, Pareggi, Colori (es. `WUB`), Meta %.
4. Opzionale: `META_SUMMARY_TAB` con un sommario editoriale (un paragrafo per riga).

Finché `META_SHEET_ID` è vuoto l'app mostra dati DEMO. I dati scaricati restano in cache per l'uso offline.

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
