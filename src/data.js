const P = (bg, fg) => ({ bg, fg });
export const C = { gray: P('#373737', '#d3d3d1'), blue: P('#1f3a5a', '#86b6ec'), green: P('#24412e', '#7fc495'), yellow: P('#4a3b1c', '#e3b665'), red: P('#4d2626', '#ec8c8c'), purple: P('#3a2d52', '#b99be8') };
export const ST = { 'Ikke startet': C.gray, 'Pågår': C.blue, 'Ferdig': C.green };
export const ORDER = ['Ikke startet', 'Pågår', 'Ferdig'];
export const MODELS = ['llama3.1:8b', 'qwen2.5:14b', 'mistral:7b'];

const props = (emne, st, dato) => [{ k: 'Emne', v: emne, c: 'purple' }, { k: 'Status', v: st, c: st === 'Ferdig' ? 'green' : st === 'Pågår' ? 'blue' : 'gray' }, { k: 'Dato', v: dato, c: 'gray' }];

export const seedPages = () => ({
  oslomet: { icon: '🎓', title: 'OsloMet', props: [], blocks: [{ type: 'callout', icon: '📌', text: 'Høst 2026 · Elektronikk og IT, 2. semester' }, { type: 'h', text: 'Emner' }, { type: 'li', text: 'DATA1200 Digitalteknikk' }, { type: 'li', text: 'ELEK1100 Elektriske kretser' }, { type: 'li', text: 'MATA1100 Matematikk 2' }, { type: 'h', text: 'Denne uken' }, { type: 'todo', text: 'Levere Øving 7', done: false }, { type: 'todo', text: 'Lab 4: Thevenin-ekvivalent', done: true }] },
  oving7: { icon: '🧮', title: 'Øving 7 – Boolsk algebra og logiske kretser', props: props('DATA1200', 'Pågår', '29. okt. 2026'), blocks: [{ type: 'callout', icon: '⏰', text: 'Frist onsdag 29. oktober kl. 23:59 i Canvas.' }, { type: 'h', text: 'Oppgave 1' }, { type: 'p', text: 'Forenkle uttrykket med boolske lover og tegn kretsen med NAND-porter.' }, { type: 'math', text: "F = AB + A'B + AB'" }, { type: 'toggle', text: 'Løsning', body: "F = AB + A'B + AB' = B(A + A') + AB' = B + AB' = A + B" }, { type: 'h', text: 'Oppgave 2' }, { type: 'todo', text: 'Lag sannhetstabell for 3 variabler', done: true }, { type: 'todo', text: 'Finn kanonisk SOP-form', done: false }, { type: 'todo', text: 'Implementer med 2-input NAND', done: false }] },
  kretser: { icon: '⚡', title: 'Elektriske kretser', props: props('ELEK1100', 'Pågår', '28. okt. 2026'), blocks: [{ type: 'h', text: 'Kirchhoffs lover' }, { type: 'p', text: 'Summen av strømmer inn i en node er lik summen ut (KCL). Summen av spenninger rundt en lukket sløyfe er null (KVL).' }, { type: 'math', text: 'Σ Iᵢₙ = Σ Iᵤₜ        Σ V = 0' }, { type: 'h', text: 'Thevenin' }, { type: 'p', text: 'Ethvert lineært nettverk kan erstattes med én spenningskilde i serie med én motstand.' }] },
  karnaugh: { icon: '🗺️', title: 'Booleske forenklinger og Karnaugh-diagram', props: props('DATA1200', 'Ferdig', '22. okt. 2026'), blocks: [{ type: 'callout', icon: '💡', text: 'Grupper enere i rektangler med størrelse 1, 2, 4 eller 8. Større grupper gir enklere uttrykk.' }, { type: 'h', text: 'Regler' }, { type: 'li', text: 'Grupper kan gå rundt kantene' }, { type: 'li', text: 'Hver ener må være med i minst én gruppe' }, { type: 'li', text: "Don't care (X) kan brukes som 1 eller 0" }, { type: 'h', text: 'Eksempel' }, { type: 'math', text: 'F(A,B,C) = Σm(1,3,5,7) = C' }, { type: 'toggle', text: 'Hvorfor blir det bare C?', body: 'Alle fire mintermene har C = 1, mens A og B varierer. De fire cellene danner én gruppe, så A og B faller bort.' }, { type: 'todo', text: 'Øve på 4-variabel diagram', done: false }] },
  eksamen: { icon: 'db', title: 'Eksamensøving', db: true },
  minterm: { icon: '🧮', title: 'Booleske funksjoner, minterm og maksterm', props: props('DATA1200', 'Ferdig', '15. okt. 2026'), blocks: [{ type: 'p', text: 'En minterm er et produkt der alle variablene er med én gang. En maksterm er en sum der alle variablene er med.' }, { type: 'math', text: "m₃ = A'BC        M₃ = A + B' + C'" }, { type: 'h', text: 'Sammenheng' }, { type: 'p', text: 'SOP bruker mintermene der F = 1. POS bruker makstermene der F = 0.' }] },
  velkommen: { icon: '👋', title: 'Velkommen til Marg', props: [], blocks: [{ type: 'p', text: 'Alt du skriver lagres lokalt på enheten, og kan synkes til din egen server.' }, { type: 'todo', text: 'Trykk på «Spør AI» nederst', done: false }, { type: 'todo', text: 'Lag en ny side med blyanten', done: false }, { type: 'todo', text: 'Skriv «/» i en tom blokk for å velge blokktype', done: false }] },
  todo: { icon: '✅', title: 'Gjøremål', props: [], blocks: [{ type: 'todo', text: 'Levere Øving 7', done: false }, { type: 'todo', text: 'Kjøpe kalkulator til eksamen', done: false }, { type: 'todo', text: 'Booke grupperom fredag', done: true }, { type: 'todo', text: 'Backup av serveren', done: false }] },
  mote: { icon: 'doc', title: 'Møtenotater 27. okt.', props: [{ k: 'Type', v: 'AI-møtenotat', c: 'yellow' }], blocks: [{ type: 'callout', icon: '🎙️', text: 'Transkribert med whisper på serveren · 18 min' }, { type: 'h', text: 'Sammendrag' }, { type: 'p', text: 'Gruppen deler Øving 7: Kristo tar oppgave 1–2, Sara tar 3–4. Vi møtes torsdag for å gå gjennom.' }, { type: 'h', text: 'Gjøremål' }, { type: 'todo', text: 'Kristo: oppgave 1–2', done: false }, { type: 'todo', text: 'Sara: oppgave 3–4', done: false }] }
});

export const seedRows = () => [
  ['🧮', 'Boolsk algebra – eksamen 2024', 'DATA1200', 'Ferdig', '20. okt.'], ['🗺️', 'Karnaugh 4 variabler', 'DATA1200', 'Pågår', '28. okt.'],
  ['⚡', 'Thevenin og Norton', 'ELEK1100', 'Pågår', '30. okt.'], ['🔁', 'Vipper og tellere', 'DATA1200', 'Ikke startet', '4. nov.'],
  ['📈', 'Integrasjon ved delbrøk', 'MATA1100', 'Ikke startet', '6. nov.'], ['⚡', 'RC-kretser og tidskonstant', 'ELEK1100', 'Ikke startet', '11. nov.']
].map(([icon, n, emne, st, dato], i) => ({ id: i, icon, n, emne, st, dato }));

export const seedRecent = ['oslomet', 'oving7', 'kretser', 'karnaugh', 'eksamen', 'minterm'];
export const seedPrivate = ['velkommen', 'todo', 'mote'];

export const EVENTS = {
  26: [['10:15', 'Forelesning DATA1200', 'Auditorium P35', '#b99be8', 'karnaugh']],
  27: [['09:00', 'Lab ELEK1100', 'Rom PH 230', '#e3b665', 'kretser'], ['14:00', 'Gruppemøte Øving 7', 'Møtenotat tatt opp', '#7fc495', 'mote'], ['18:00', 'Repetere Karnaugh', 'Fra Eksamensøving', '#86b6ec', 'karnaugh']],
  28: [['12:15', 'Forelesning MATA1100', 'Auditorium P46', '#ec8c8c', 'oslomet']],
  29: [['23:59', 'Frist Øving 7', 'Canvas', '#ec8c8c', 'oving7']],
  30: [['10:00', 'Thevenin og Norton', 'Eksamensøving', '#e3b665', 'eksamen']]
};

export const INBOX = [
  { a: 'S', c: '#7a5cc7', who: 'Sara', t: 'kommenterte: «Sjekk oppgave 2b, tror fortegnet er feil»', page: 'Øving 7', when: '12 min', unread: true, id: 'oving7' },
  { a: '⚡', c: '#3a3a3a', who: 'Automatisering', t: 'flyttet «Karnaugh 4 variabler» til Pågår', page: 'Eksamensøving', when: '1 t', unread: true, id: 'eksamen' },
  { a: 'M', c: '#3a3a3a', who: 'Marg AI', t: 'lagde sammendrag av møtet ditt', page: 'Møtenotater 27. okt.', when: '3 t', unread: true, id: 'mote' },
  { a: '⏰', c: '#3a3a3a', who: 'Påminnelse', t: 'Frist Øving 7 om 2 dager', page: 'Øving 7', when: 'i går', unread: false, id: 'oving7' },
  { a: 'S', c: '#7a5cc7', who: 'Sara', t: 'nevnte deg i «Elektriske kretser»', page: 'Elektriske kretser', when: 'man.', unread: false, id: 'kretser' }
];

export const BLOCK_TYPES = [['p', 'Tekst', 'Aa'], ['h', 'Overskrift', 'H'], ['li', 'Punktliste', '•'], ['todo', 'Gjøremål', '☐'], ['toggle', 'Utvidbar liste', '▸'], ['callout', 'Callout', '💡'], ['math', 'Formel', '∑']];
