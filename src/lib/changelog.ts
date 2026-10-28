// "What's new" on the account page: newest first.

export interface Release {
  date: string // ISO day
  it: string[]
  en: string[]
}

export const CHANGELOG: Release[] = [
  {
    date: '2026-10-28',
    it: [
      'Meta: i dati veri di tutti i tornei 2026 (Livelli 1 e 2, leghe S1 e S2, lega online), con filtri per stagione, tipo di torneo e lega',
      'Pagina del comandante: quota meta, winrate, giocatori, tornei vinti, andamento mese per mese e liste Moxfield',
      'Pagina torneo e tappa: classifica con mazzo e record di ogni giocatore e il meta del torneo',
      'Scheda giocatore: winrate e record con ogni comandante, e tutte le tappe di lega giocate',
      'Leghe: tappe con vincitore e mazzo, e il meta della lega',
      'Confronto giocatori con winrate e mazzi; record dei mazzi',
    ],
    en: [
      'Meta: real data from every 2026 tournament (Levels 1 and 2, S1 and S2 leagues, online league), filtered by season, tournament type and league',
      'Commander page: meta share, winrate, players, tournaments won, month by month trend and Moxfield lists',
      'Tournament and stage page: standings with every player\'s deck and record, and the tournament meta',
      'Player page: winrate and record with each commander, and every league stage played',
      'Leagues: stages with winner and deck, and the league meta',
      'Head to head with winrate and decks; deck records',
    ],
  },
  {
    date: '2026-10-27',
    it: [
      'Nuova icona e logo: l\'elmo di Castra',
      'Mazzi: curva di mana con permanenti e magie, carte e probabilità in curva toccando una barra, analisi dei colori',
      'Contapunti: annulla l\'ultimo tocco e cronologia della partita',
      'Partite: chi ha iniziato (on the play / on the draw) e giocatore avversario dal circuito',
      'Statistiche: filtri, andamento, winrate on the play e on the draw, matchup per mazzo, contro i giocatori',
      'Scheda giocatore: i tuoi precedenti contro di lui',
      'Mazzi: controllo della banlist Centurion e mano di prova',
      'Avviso quando c\'è una nuova versione e invito a installare l\'app',
      'Nuova area profilo: giocatore collegato, seguiti, preferenze, i tuoi dati e info',
      'Esporta le partite in CSV e fai un backup completo, con ripristino',
      'Circuito: classifica, eventi, leghe, record e testa a testa dal foglio ufficiale',
      'Collega il tuo giocatore: spunta "verificato" e avviso quando sali o scendi',
      'Invito al POTY: chi è dentro i 36 posti',
      'In classifica la tua riga resta sempre visibile',
    ],
    en: [
      'New icon and logo: the Castra helmet',
      'Decks: mana curve split into permanents and spells, cards and on-curve odds by tapping a bar, colour analysis',
      'Life counter: undo the last tap and game history',
      'Matches: who went first (on the play / on the draw) and opponent player from the circuit',
      'Stats: filters, trend, winrate on the play and on the draw, matchups by deck, against players',
      'Player page: your record against them',
      'Decks: Centurion banlist check and sample hand',
      'Notice when a new version is out and an invite to install the app',
      'New profile area: linked player, followed players, preferences, your data and info',
      'Export your matches as CSV and make a full backup, with restore',
      'Circuit: ranking, events, leagues, records and head to head from the official sheet',
      'Link your player: "verified" tick and a notice when you move up or down',
      'POTY invite: who is within the 36 spots',
      'Your own row always stays visible in the rankings',
    ],
  },
  {
    date: '2026-10-26',
    it: [
      'Partite al meglio di 3, game per game, e modifica con pressione lunga',
      'Nuova barra in basso con la partita al centro',
      'Il tasto indietro del telefono chiude l\'app dalle pagine principali',
      'Editor dei mazzi: viste lista, pile e griglia, edizioni e copertina',
      'Timer: minuti aggiuntivi durante la partita',
    ],
    en: [
      'Best-of-3 matches, game by game, and editing with a long press',
      'New bottom bar with the game in the middle',
      'The phone\'s back button closes the app from the main pages',
      'Deck editor: list, pile and grid views, printings and cover',
      'Timer: extra minutes during the game',
    ],
  },
]
