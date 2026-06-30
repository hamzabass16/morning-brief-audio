/**
 * MORNING BRIEF  ::  daily email + private audio podcast, one generation
 *
 * A Google Apps Script that, every morning on Google's servers, builds a
 * personal briefing (your calendar, unread newsletters, per-holding stock
 * news, football and tennis fixtures, arXiv papers, follow-up emails and
 * tasks, a daily reflection and language note), emails it, and publishes it
 * as a private podcast you can ask Siri to play.
 *
 * Design notes:
 *   - One Anthropic call per day writes and curates everything. No paid web
 *     search: free Google News RSS supplies the raw headlines. Roughly
 *     3 to 5 USD per month, and under the free 1,000,000-character TTS tier.
 *   - Audio is rendered with Google Cloud Text-to-Speech and hosted on a
 *     public GitHub repo (podcast apps need an un-authenticated MP3 URL).
 *   - Quotes, reflection lenses and featured habits rotate by day, and recent
 *     news titles are stored as a skip-list, to avoid repetition across days.
 *
 * See README for full setup. Fill in every PASTE_... value in CONFIG, set the
 * project time zone, enable the advanced "Tasks API" service (Services + >
 * Tasks API), run testRun and authorize, Deploy as a Web app (Execute as Me,
 * Access Anyone), subscribe to that URL in your podcast app, then run
 * createDailyTrigger.
 */

// ============================ CONFIG ============================
const CONFIG = {
  ANTHROPIC_API_KEY: 'PASTE_ANTHROPIC_KEY',
  GOOGLE_TTS_API_KEY: 'PASTE_GOOGLE_CLOUD_TTS_KEY',
  MODEL: 'claude-sonnet-4-6',

  SEND_HOUR: 7,
  TIME_ZONE: 'Europe/Athens',
  RECIPIENT: 'you@example.com',

  // Voice (Chirp 3: HD, British female, soothing; free up to 1M chars/month).
  // Alternatives: en-GB-Chirp3-HD-Kore, en-GB-Chirp3-HD-Leda. Plain fallback: en-GB-Neural2-C.
  TTS_LANG: 'en-GB',
  TTS_VOICE: 'en-GB-Chirp3-HD-Aoede',
  MAX_AUDIO_CHARS: 18000,           // safety cap so monthly TTS stays under 1M

  // Hosting / retention
  FOLDER_NAME: 'Morning Brief Audio',
  RETENTION_DAYS: 5,
  PODCAST_TITLE: 'Morning Brief',
  PODCAST_AUTHOR: 'Your Name',
  PODCAST_DESC: 'Daily personal briefing: habits, the day ahead, markets and holdings, geopolitics, entertainment, science, and a line from the manifesto.',
  PODCAST_IMAGE_URL: '',

  // Inputs
  NEWSLETTER_QUERY: 'is:unread newer_than:2d (from:bloomberg.com OR from:news.bloomberg.com OR from:ft.com OR from:reuters.com OR "Points of Return" OR "John Authers" OR "emerging markets" OR "morning brief" OR "markets today")',
  MAX_NEWSLETTERS: 5,
  NEWSLETTER_CHAR_CAP: 1500,

  HEADLINES_PER_TOPIC: 3,
  HEADLINE_MAX_AGE_DAYS: 3,

  MAX_TOKENS: 3200,

  // Sports fixtures (exact times)
  FOOTBALL_DATA_TOKEN: 'PASTE_FOOTBALL_DATA_ORG_TOKEN',   // free token at football-data.org
  LIVERPOOL_TEAM_ID: 64,                                   // Liverpool FC id on football-data.org
  FOOTBALL_WINDOW_DAYS: 1,                                  // today and tomorrow
  TENNIS_API_KEY: 'PASTE_API_TENNIS_KEY',                  // free tier key at api-tennis.com
  TENNIS_WINDOW_DAYS: 1,                                    // today and tomorrow
  TENNIS_PLAYERS: ['Djokovic', 'Sinner', 'Alcaraz'],

  // Languages you are learning; one is featured per day for a culture note and greeting.
  LANGUAGES: ['French', 'Spanish', 'Greek'],

  // Follow-ups
  EMAIL_FOLLOWUP_QUERY: 'in:inbox is:unread -category:promotions -category:social -category:updates newer_than:10d',
  MAX_FOLLOWUP_EMAILS: 7,
  TASK_LOOKAHEAD_DAYS: 3,

  // Audio hosting on GitHub (public repo; raw URLs that podcast apps accept)
  GITHUB_OWNER: 'PASTE_GITHUB_USERNAME',
  GITHUB_REPO: 'morning-brief-audio',
  GITHUB_BRANCH: 'main',
  GITHUB_DIR: 'audio',
  GITHUB_TOKEN: 'PASTE_GITHUB_TOKEN',     // fine-grained PAT, Contents: read+write on this repo
  AUDIO_SLUG: 'PASTE_RANDOM_SLUG',        // e.g. 16 random letters/numbers, makes file URLs unguessable
};

// Your 12 holdings. Each gets its own company-specific news pull.
const HOLDINGS = [
  { tier: 'Tier 1', name: 'Amazon', q: 'Amazon company stock' },
  { tier: 'Tier 1', name: 'Alphabet', q: 'Alphabet Google company stock' },
  { tier: 'Tier 1', name: 'Meta', q: 'Meta Platforms company stock' },
  { tier: 'Tier 2', name: 'Uber', q: 'Uber company stock' },
  { tier: 'Tier 2', name: 'S&P Global', q: '"S&P Global" company' },
  { tier: 'Tier 2', name: 'ASML', q: 'ASML company stock' },
  { tier: 'Tier 2', name: 'Mastercard', q: 'Mastercard company stock' },
  { tier: 'Tier 3', name: 'Booking Holdings', q: 'Booking Holdings company stock' },
  { tier: 'Tier 3', name: 'Shopify', q: 'Shopify company stock' },
  { tier: 'Tier 4', name: 'MercadoLibre', q: 'MercadoLibre company stock' },
  { tier: 'Tier 4', name: 'Novo Nordisk', q: 'Novo Nordisk company stock' },
  { tier: 'Tier 4', name: 'Birkenstock', q: 'Birkenstock company stock' },
];

// Other topic feeds. label is used to group raw material for the model.
const TOPICS = [
  { label: 'Markets macro', q: 'stock market today' },
  { label: 'Geopolitics: Lebanon and Middle East', q: 'Lebanon Middle East' },
  { label: 'Geopolitics: Europe and Greece', q: 'Greece Europe geopolitics' },
  { label: 'Movies in theaters', q: 'new movies in theaters this week' },
  { label: 'Science: AI', q: 'artificial intelligence research breakthrough' },
  { label: 'Science: Computer Science', q: 'computer science research breakthrough' },
  { label: 'Science: Biotech', q: 'biotechnology breakthrough' },
  { label: 'Science: Physics', q: 'physics discovery breakthrough' },
  { label: 'Science: Chemistry', q: 'chemistry breakthrough research' },
  { label: 'Science: Engineering', q: 'engineering innovation breakthrough' },
];

// arXiv categories for fresh academic papers (free RSS).
const ARXIV = [
  { label: 'AI and ML', cat: 'cs.LG' },
  { label: 'AI', cat: 'cs.AI' },
  { label: 'Computer Science', cat: 'cs.CL' },
  { label: 'Physics', cat: 'quant-ph' },
  { label: 'Chemistry', cat: 'physics.chem-ph' },
  { label: 'Biotech', cat: 'q-bio.BM' },
];

// Motivational lines, one is chosen each day (no repeat within a week if you
// keep at least 8). REPLACE THESE with your own quotes, manifesto lines, or values.
const QUOTES = [
  'Do the hard thing first; the rest of the day bends around it.',
  'You are competing with who you were yesterday, no one else.',
  'Discipline is choosing what you want most over what you want now.',
  'The standard you walk past is the standard you accept.',
  'Make the world a little better than you found it today.',
  'Action clears the fear that thinking only feeds.',
  'Small, repeated, honest effort compounds into a life.',
  'Be the person your future self will thank.',
];

// Reflection lenses. The model writes an original reflection on the day's lens.
// 10 distinct gives no theme repeat within ten days.
const MANIFESTO_ANGLES = [
  'the man in the mirror: ruthless self-honesty before anyone else',
  'be better than you were yesterday, one concrete increment',
  'choose what is right over what is merely practical',
  'humility before the ideal, not pride at having reached it',
  'light the forest: your example is the unit of change, not grand gestures',
  'suffering is the price of growth, pay it deliberately today',
  'the motto itself: no man is a man who does not make the world better',
  'face death squarely so the day is not wasted on the trivial',
  'the eternal communal self: act for who comes after you',
  'action over intention: the world is changed by what you do, not what you mean',
];

// General brain habits. 3 are featured each day, rotating, on top of the fixed
// wake-up reminders (morning light, cold finish to shower, no phone before shower).
const HABITS = [
  'water before caffeine, and delay caffeine sixty to ninety minutes',
  'a breath reset when tense: two inhales then a long exhale, a physiological sigh',
  'when mentally stuck, walk; do not push a blocked mind, move it',
  'protein first at breakfast to steady focus through the morning',
  'work in ninety minute blocks, then a real break away from screens',
  'a short zone two walk or cycle to raise blood flow and BDNF',
  'keep a consistent wake time, even after a poor night',
  'a few minutes of unhurried stillness or breathing before the day starts',
];
// ========================== END CONFIG ==========================


// ===================== MAIN DAILY FUNCTION ======================
function sendMorningBrief() {
  try {
    const today = new Date();
    const dateLong = Utilities.formatDate(today, CONFIG.TIME_ZONE, 'EEEE, d MMMM yyyy');
    const doy = dayOfYear_(today);

    const events = getTodayEvents_(today);
    const newsletters = getNewsletters_();
    const rss = gatherHeadlines_();                 // {material, titles}
    const sports = getSportsBlock_(today);          // structured football + tennis fixtures
    const papers = getArxiv_();                     // recent academic papers
    const followups = getFollowUps_(today);         // emails to answer + tasks due soon
    const state = getState_();

    const quote = pickRotating_(QUOTES, doy, state.quotes);
    const lens = MANIFESTO_ANGLES[doy % MANIFESTO_ANGLES.length];
    const lang = CONFIG.LANGUAGES[doy % CONFIG.LANGUAGES.length];
    const habitsToday = [0, 1, 2].map(function (i) { return HABITS[(doy * 3 + i) % HABITS.length]; });

    const material = rss.material + '\n\n' + sports
      + '\n\nACADEMIC PAPERS (arXiv, recent):\n' + papers
      + '\n\n' + followups;
    const userMsg = buildUserMessage_(dateLong, events, newsletters, material,
      state.recentTitles, quote, lens, habitsToday, lang);

    const script = callClaude_(userMsg);
    if (!script) throw new Error('Anthropic returned no text.');

    // 1) EMAIL
    GmailApp.sendEmail(CONFIG.RECIPIENT, 'Morning Brief, ' + dateLong, stripTags_(renderEmail_(script)), {
      htmlBody: renderEmail_(script), name: 'Morning Brief',
    });

    // 2) AUDIO + FEED (same text)
    const blob = synthesizeToBlob_(renderAudio_(script), today);
    const folder = getOrCreateFolder_();
    const fileName = 'brief-' + CONFIG.AUDIO_SLUG + '-' + Utilities.formatDate(today, CONFIG.TIME_ZONE, 'yyyy-MM-dd') + '.mp3';
    let ex = folder.getFilesByName(fileName); while (ex.hasNext()) ex.next().setTrashed(true);
    const file = folder.createFile(blob.setName(fileName));
    file.setDescription('Morning Brief, ' + dateLong + '\n' + makeSummary_(script));
    uploadToGitHub_(fileName, blob);
    pruneOldEpisodes_(folder);

    // 3) UPDATE STATE for non-repetition
    saveState_(quote, rss.titles, state);
    Logger.log('Done: emailed and published ' + fileName);
  } catch (err) {
    Logger.log('Run failed: ' + err);
    GmailApp.sendEmail(CONFIG.RECIPIENT, 'Morning Brief run failed', String(err) + '\n\nSee the Apps Script execution log.');
  }
}


// ========================== INPUTS ==============================
function getTodayEvents_(today) {
  const evs = CalendarApp.getDefaultCalendar().getEventsForDay(today);
  if (!evs.length) return 'No events scheduled today.';
  return evs.map(function (e) {
    if (e.isAllDayEvent()) return 'All day: ' + e.getTitle();
    const s = Utilities.formatDate(e.getStartTime(), CONFIG.TIME_ZONE, 'h:mm a');   // 12-hour
    const en = Utilities.formatDate(e.getEndTime(), CONFIG.TIME_ZONE, 'h:mm a');
    let line = s + ' to ' + en + '  ' + e.getTitle();
    const desc = (e.getDescription() || '').trim();
    if (desc) line += ' (notes: ' + desc.replace(/\s+/g, ' ').slice(0, 300) + ')';
    return line;
  }).join('\n');
}

function getNewsletters_() {
  let threads = [];
  try { threads = GmailApp.search(CONFIG.NEWSLETTER_QUERY, 0, CONFIG.MAX_NEWSLETTERS); }
  catch (err) { return 'Newsletter search failed: ' + err; }
  if (!threads.length) return 'No unread investment newsletters today.';
  return threads.map(function (t) {
    const m = t.getMessages()[t.getMessages().length - 1];
    const body = (m.getPlainBody() || '').replace(/\s+\n/g, '\n').trim().slice(0, CONFIG.NEWSLETTER_CHAR_CAP);
    return 'FROM ' + m.getFrom() + ' | ' + m.getSubject() + '\n' + body;
  }).join('\n\n-----\n\n');
}

// Free Google News RSS, fetched in parallel. Returns grouped material + flat titles.
function gatherHeadlines_() {
  const feeds = [];
  HOLDINGS.forEach(function (h) { feeds.push({ label: 'Holding ' + h.tier + ': ' + h.name, q: h.q }); });
  TOPICS.forEach(function (t) { feeds.push({ label: t.label, q: t.q }); });

  const reqs = feeds.map(function (f) {
    return {
      url: 'https://news.google.com/rss/search?q=' + encodeURIComponent(f.q) + '&hl=en-US&gl=US&ceid=US:en',
      muteHttpExceptions: true,
    };
  });

  let responses = [];
  try { responses = UrlFetchApp.fetchAll(reqs); } catch (err) { return { material: 'Headline fetch failed: ' + err, titles: [] }; }

  const blocks = [];
  const allTitles = [];
  responses.forEach(function (res, i) {
    const items = parseRssTitles_(res, CONFIG.HEADLINES_PER_TOPIC, CONFIG.HEADLINE_MAX_AGE_DAYS);
    if (!items.length) { blocks.push(feeds[i].label + ': (no fresh items)'); return; }
    items.forEach(function (t) { allTitles.push(t); });
    blocks.push(feeds[i].label + ':\n- ' + items.join('\n- '));
  });
  return { material: blocks.join('\n\n'), titles: allTitles };
}

function parseRssTitles_(res, max, maxAgeDays) {
  if (!res || res.getResponseCode() !== 200) return [];
  let items;
  try {
    const root = XmlService.parse(res.getContentText()).getRootElement();
    const channel = root.getChild('channel');
    items = channel ? channel.getChildren('item') : [];
  } catch (e) { return []; }
  const cutoff = Date.now() - maxAgeDays * 86400000;
  const out = [];
  for (let i = 0; i < items.length && out.length < max; i++) {
    const titleEl = items[i].getChild('title');
    const dateEl = items[i].getChild('pubDate');
    if (!titleEl) continue;
    if (dateEl) { const d = new Date(dateEl.getText()); if (!isNaN(d) && d.getTime() < cutoff) continue; }
    out.push(titleEl.getText().replace(/\s+/g, ' ').slice(0, 140));
  }
  return out;
}


// =================== SPORTS FIXTURES (exact times) ==============
function getSportsBlock_(today) {
  return 'FOOTBALL FIXTURES (today, grouped by competition, Athens times):\n' + getFootballFixtures_(today)
    + '\n\nTENNIS FIXTURES (Djokovic, Sinner, Alcaraz; today, grouped by tournament, Athens times):\n' + getTennisFixtures_(today);
}

function ymd_(d) { return Utilities.formatDate(d, 'GMT', 'yyyy-MM-dd'); }

// Keep today's matches, plus tomorrow's only if they start before 3 AM Athens.
function includeToday_(utcDate, today) {
  const d = new Date(utcDate);
  const dayStr = Utilities.formatDate(d, CONFIG.TIME_ZONE, 'yyyy-MM-dd');
  const todayStr = Utilities.formatDate(today, CONFIG.TIME_ZONE, 'yyyy-MM-dd');
  const tomorrowStr = Utilities.formatDate(new Date(today.getTime() + 86400000), CONFIG.TIME_ZONE, 'yyyy-MM-dd');
  if (dayStr === todayStr) return true;
  if (dayStr === tomorrowStr) return parseInt(Utilities.formatDate(d, CONFIG.TIME_ZONE, 'H'), 10) < 3;
  return false;
}

function getFootballFixtures_(today) {
  if (!CONFIG.FOOTBALL_DATA_TOKEN || CONFIG.FOOTBALL_DATA_TOKEN.indexOf('PASTE') === 0) return '(football token not set)';
  const from = ymd_(today);
  const to = ymd_(new Date(today.getTime() + 86400000));   // today + tomorrow, so overnight matches are caught
  const headers = { 'X-Auth-Token': CONFIG.FOOTBALL_DATA_TOKEN };
  const urls = [
    'https://api.football-data.org/v4/teams/' + CONFIG.LIVERPOOL_TEAM_ID + '/matches?dateFrom=' + from + '&dateTo=' + to,
    'https://api.football-data.org/v4/competitions/WC/matches?dateFrom=' + from + '&dateTo=' + to,
  ];
  const byComp = {}, seen = {};
  urls.forEach(function (url) {
    try {
      const res = UrlFetchApp.fetch(url, { headers: headers, muteHttpExceptions: true });
      if (res.getResponseCode() !== 200) return;
      (JSON.parse(res.getContentText()).matches || []).forEach(function (m) {
        if (!includeToday_(m.utcDate, today) || seen[m.id]) return;
        seen[m.id] = 1;
        const comp = (m.competition && m.competition.name) ? m.competition.name : 'Football';
        const time = Utilities.formatDate(new Date(m.utcDate), CONFIG.TIME_ZONE, 'h:mm a');
        (byComp[comp] = byComp[comp] || []).push('- ' + time + ': ' + m.homeTeam.name + ' vs ' + m.awayTeam.name);
      });
    } catch (e) {}
  });
  const comps = Object.keys(byComp);
  if (!comps.length) return 'No Liverpool or World Cup matches today';
  return comps.map(function (c) { return c + ':\n' + byComp[c].join('\n'); }).join('\n');
}

function getTennisFixtures_(today) {
  if (!CONFIG.TENNIS_API_KEY || CONFIG.TENNIS_API_KEY.indexOf('PASTE') === 0) return '(tennis key not set)';
  const from = ymd_(today);
  const to = ymd_(new Date(today.getTime() + 86400000));   // today + tomorrow, so overnight matches are caught
  const url = 'https://api.api-tennis.com/tennis/?method=get_fixtures&APIkey=' + encodeURIComponent(CONFIG.TENNIS_API_KEY)
    + '&date_start=' + from + '&date_stop=' + to
    + '&timezone=' + encodeURIComponent(CONFIG.TIME_ZONE);   // feed returns event_time already in Athens, DST-safe
  try {
    const res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    if (res.getResponseCode() !== 200) return '(unavailable)';
    const result = JSON.parse(res.getContentText()).result || [];
    const wanted = CONFIG.TENNIS_PLAYERS.map(function (p) { return p.toLowerCase(); });
    const todayStr = Utilities.formatDate(today, CONFIG.TIME_ZONE, 'yyyy-MM-dd');
    const tomorrowStr = Utilities.formatDate(new Date(today.getTime() + 86400000), CONFIG.TIME_ZONE, 'yyyy-MM-dd');
    const byTour = {}, seen = {};
    result.forEach(function (e) {
      const p1 = e.event_first_player || '', p2 = e.event_second_player || '';
      if (!wanted.some(function (w) { return (p1 + ' ' + p2).toLowerCase().indexOf(w) !== -1; })) return;
      if (e.event_date === tomorrowStr) {
        if (parseInt((e.event_time || '99').split(':')[0], 10) >= 3) return;   // tomorrow only if before 3 AM
      } else if (e.event_date !== todayStr) { return; }
      if (seen[e.event_key]) return; seen[e.event_key] = 1;
      const tour = e.tournament_name || 'Tennis';
      const round = e.tournament_round ? ' (' + e.tournament_round + ')' : '';
      (byTour[tour] = byTour[tour] || []).push('- ' + to12h_(e.event_time) + ': ' + p1 + ' vs ' + p2 + round);
    });
    const tours = Object.keys(byTour);
    if (!tours.length) return 'No Djokovic, Sinner or Alcaraz matches today';
    return tours.map(function (t) { return t + ':\n' + byTour[t].join('\n'); }).join('\n');
  } catch (e) { return '(error)'; }
}

// "21:00" (already Athens local) -> "9:00 PM".
function to12h_(hhmm) {
  if (!hhmm) return '';
  const parts = hhmm.split(':');
  let h = parseInt(parts[0], 10); const m = parts[1] || '00';
  const ap = h >= 12 ? 'PM' : 'AM';
  h = h % 12; if (h === 0) h = 12;
  return h + ':' + m + ' ' + ap;
}

// "2026-06-30" -> "Tue 30 Jun" (Athens).
function prettyDate_(ymdStr) {
  if (!ymdStr) return '';
  const p = ymdStr.split('-');
  const d = new Date(parseInt(p[0], 10), parseInt(p[1], 10) - 1, parseInt(p[2], 10), 12, 0, 0);
  return Utilities.formatDate(d, CONFIG.TIME_ZONE, 'EEE d MMM');
}


// =================== ACADEMIC PAPERS (arXiv) ====================
function getArxiv_() {
  const reqs = ARXIV.map(function (a) { return { url: 'https://export.arxiv.org/rss/' + a.cat, muteHttpExceptions: true }; });
  let responses = [];
  try { responses = UrlFetchApp.fetchAll(reqs); } catch (e) { return '(papers unavailable)'; }
  const blocks = [];
  responses.forEach(function (res, i) {
    const titles = parseArxivTitles_(res, 2);
    if (titles.length) blocks.push(ARXIV[i].label + ':\n- ' + titles.join('\n- '));
  });
  return blocks.length ? blocks.join('\n\n') : '(no fresh papers)';
}

function parseArxivTitles_(res, max) {
  if (!res || res.getResponseCode() !== 200) return [];
  try {
    const root = XmlService.parse(res.getContentText()).getRootElement();
    const channel = root.getChild('channel');
    let items, ns = null;
    if (channel && channel.getChildren('item').length) {
      items = channel.getChildren('item');                          // RSS 2.0
    } else {
      ns = XmlService.getNamespace('http://purl.org/rss/1.0/');
      items = root.getChildren('item', ns);                        // RSS 1.0 / RDF
    }
    const out = [];
    for (let i = 0; i < items.length && out.length < max; i++) {
      const titleEl = ns ? items[i].getChild('title', ns) : items[i].getChild('title');
      if (!titleEl) continue;
      out.push(titleEl.getText().replace(/\s*\(arXiv:[^)]*\)\s*/g, '').replace(/\s+/g, ' ').trim().slice(0, 160));
    }
    return out;
  } catch (e) { return []; }
}


// =================== FOLLOW-UPS (emails + tasks) ===============
function getFollowUps_(today) {
  return 'FOLLOW-UPS:\nEmails awaiting your reply:\n' + getReplyEmails_()
    + '\nTasks due soon:\n' + getTasksDueSoon_(today);
}

function getReplyEmails_() {
  let threads = [];
  try { threads = GmailApp.search(CONFIG.EMAIL_FOLLOWUP_QUERY, 0, CONFIG.MAX_FOLLOWUP_EMAILS); }
  catch (e) { return '(email check failed)'; }
  if (!threads.length) return 'none';
  return threads.map(function (t) {
    const m = t.getMessages()[t.getMessages().length - 1];
    return '- ' + m.getFrom().replace(/<[^>]*>/, '').trim() + ': ' + m.getSubject();
  }).join('\n');
}

function getTasksDueSoon_(today) {
  if (typeof Tasks === 'undefined') return '(Tasks API service not enabled)';
  try {
    const horizon = new Date(today.getTime() + CONFIG.TASK_LOOKAHEAD_DAYS * 86400000);
    const lists = Tasks.Tasklists.list().items || [];
    const out = [];
    lists.forEach(function (tl) {
      const tasks = (Tasks.Tasks.list(tl.id, { showCompleted: false, dueMax: horizon.toISOString() }).items) || [];
      tasks.forEach(function (tk) {
        if (tk.status === 'completed') return;
        const due = tk.due ? ' (due ' + Utilities.formatDate(new Date(tk.due), CONFIG.TIME_ZONE, 'EEE d MMM') + ')' : '';
        out.push('- ' + tk.title + due);
      });
    });
    return out.length ? out.join('\n') : 'none due in the next ' + CONFIG.TASK_LOOKAHEAD_DAYS + ' days';
  } catch (e) { return '(tasks unavailable)'; }
}


// ===================== NON-REPETITION STATE =====================
function getState_() {
  const raw = PropertiesService.getScriptProperties().getProperty('briefState');
  const s = raw ? JSON.parse(raw) : {};
  return { quotes: s.quotes || [], recentTitles: s.recentTitles || [] };
}

function saveState_(quote, titlesToday, state) {
  const quotes = [quote].concat(state.quotes).slice(0, 7);                 // last 7 days of quotes
  let titles = dedupe_(titlesToday.concat(state.recentTitles)).slice(0, 80);
  let payload = JSON.stringify({ quotes: quotes, recentTitles: titles });
  while (payload.length > 8500 && titles.length > 10) { titles = titles.slice(0, titles.length - 10); payload = JSON.stringify({ quotes: quotes, recentTitles: titles }); }
  PropertiesService.getScriptProperties().setProperty('briefState', payload);
}

function pickRotating_(arr, doy, recent) {
  const idx = doy % arr.length;
  for (let n = 0; n < arr.length; n++) {              // skip any used in the last 7 days
    const cand = arr[(idx + n) % arr.length];
    if (recent.indexOf(cand) === -1) return cand;
  }
  return arr[idx];
}

function dedupe_(a) { const seen = {}; return a.filter(function (x) { if (seen[x]) return false; seen[x] = 1; return true; }); }
function dayOfYear_(d) { return Math.floor((d - new Date(d.getFullYear(), 0, 0)) / 86400000); }


// ========================= ANTHROPIC ============================
function buildUserMessage_(dateLong, events, newsletters, material, skip, quote, lens, habits, lang) {
  return [
    'DATE: ' + dateLong + '. LOCATION: Athens (EEST).',
    '',
    'CALENDAR (narrate the day ahead, keep these 12-hour times exactly):',
    events,
    '',
    'MY INVESTMENT NEWSLETTERS (unread, use the substance for the macro markets read):',
    newsletters,
    '',
    'MATERIAL (headlines, fixtures, papers, follow-ups; your only source for news, do not invent beyond these):',
    material,
    '',
    'RECENTLY COVERED, DO NOT REPEAT THESE STORIES:',
    (skip.length ? '- ' + skip.slice(0, 60).join('\n- ') : '(none yet)'),
    '',
    'TODAY\'S REFLECTION LENS: ' + lens,
    'TODAY\'S FEATURED HABITS (weave these three in, on top of the fixed wake-up ones): ' + habits.join('; '),
    'TODAY\'S LANGUAGE for the culture note and the final greeting: ' + lang,
    'DAILY QUOTE (place verbatim in the Reflection section): ' + quote,
  ].join('\n');
}

const SYSTEM_PROMPT = [
  'You write the reader\'s daily briefing. It is emailed and also read aloud as a podcast by a warm British narrator, so write in flowing, natural prose that sounds good spoken: conversational and encouraging, never stiff or robotic, but still concise and substantive. EDIT THIS LINE to describe the reader, for example: an investor who follows markets, supports a football club, and is learning a language; this drives the personalization.',
  '',
  'FORMAT: start each section with a line "### " then the title. Write in short flowing paragraphs. For per-item lists (holdings, fixtures, follow-ups, releases) put each item on its own line starting with "- ". Do not repeat the section title inside the section text. No other markup.',
  '',
  'SECTIONS, in this order:',
  '### Good Morning  (keep this brief. A warm one-line greeting with the day and date. Then one short sentence for the wake-up routine, always naming the three fixed reminders: morning light, a cold last minute of his shower, and no phone until after the shower. Briefly fold in the three featured habits. One short line tying his hardest work to the earliest demanding calendar item. End with "Tonight\'s recap question:" and one reflective question. No padding.)',
  '### The Day Ahead  (narrate the calendar with the given 12-hour times and surface any prep.)',
  '### Follow-Ups  (from the FOLLOW-UPS material, two short lists: emails awaiting his reply, and tasks due soon. If either is "none", say so in a few words. Never invent any.)',
  '### Markets and Holdings  (a few sentences of macro from the newsletters and markets headlines, then one line per holding grouped by tier, each as "- Name: the single most material company-specific item, or quiet if nothing fresh".)',
  '### Geopolitics  (the few items that matter most for the Middle East and Lebanon, Europe and Greece, and markets.)',
  '### Entertainment  (three short groups. Movies: notable releases in theaters from the headlines. Football and Tennis: reproduce the FOOTBALL FIXTURES and TENNIS FIXTURES blocks as given, keeping the tournament grouping and the times, with no dates and without repeating a tournament name. These are today\'s matches only. If a block says none, say so in a few words. Never invent a fixture or a time.)',
  '### Innovation and Science  (two to three sentences only: the single most striking recent item across AI, Computer Science, Biotech, Physics, Chemistry or Engineering, plus one specific arXiv paper named by its finding. Not one per field.)',
  '### Reflection  (two to three sentences in the second person on today\'s reflection lens, grounded in his own guiding values and personal motto and tied to something concrete from today. Then the daily quote verbatim on its own line.)',
  '### Language and Culture  (two sentences only: one cultural fun fact about a place that speaks today\'s language, then one useful word or short phrase in that language with its English meaning. For Greek, add a Latin-letter pronunciation.)',
  '',
  'Then a final closing line, not a section header: a brief motivating send-off in the spirit of "good luck in today\'s adventure of greatness", followed by "Good morning" said in today\'s language (for Greek, include a Latin-letter pronunciation).',
  '',
  'RULES:',
  'Be concise and non-repetitive. Never state the same fact in two sections. Skip anything in the do-not-repeat list.',
  'Use only the provided material plus the calendar. Do not fabricate. If something is empty, say so briefly rather than inventing.',
  'Use company names rather than ticker letters. Read numbers as a person would speak them. Metric units.',
  'HARD RULE: never use em dashes or en dashes. Use commas, or the word "to" for ranges.',
  'Target 1,500 to 2,100 words total.',
].join('\n');

function callClaude_(userMessage) {
  const res = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
    method: 'post', contentType: 'application/json',
    headers: { 'x-api-key': CONFIG.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    payload: JSON.stringify({
      model: CONFIG.MODEL, max_tokens: CONFIG.MAX_TOKENS,
      system: SYSTEM_PROMPT, messages: [{ role: 'user', content: userMessage }],
    }),
    muteHttpExceptions: true,
  });
  if (res.getResponseCode() !== 200) { Logger.log('Anthropic error: ' + res.getContentText()); return ''; }
  const data = JSON.parse(res.getContentText());
  return (data.content || []).filter(function (b) { return b.type === 'text'; })
    .map(function (b) { return b.text; }).join(' ')
    .replace(/[\u2014\u2013]/g, ', ').trim();
}


// ====================== RENDERERS ===============================
function renderEmail_(text) {
  const lines = text.split('\n');
  let html = '', inList = false;
  function closeList() { if (inList) { html += '</ul>'; inList = false; } }
  lines.forEach(function (raw) {
    const line = raw.trim();
    if (!line) { closeList(); return; }
    if (line.indexOf('### ') === 0) {
      closeList();
      html += '<h3 style="font-size:14px;letter-spacing:.5px;color:#0b5;margin:18px 0 6px">' + esc_(line.slice(4)) + '</h3>';
    } else if (line.indexOf('- ') === 0) {
      if (!inList) { html += '<ul style="margin:0 0 8px;padding-left:18px">'; inList = true; }
      html += '<li style="margin:3px 0">' + boldLead_(esc_(line.slice(2))) + '</li>';
    } else {
      closeList();
      html += '<p style="margin:0 0 10px">' + boldLead_(esc_(line)) + '</p>';
    }
  });
  closeList();
  return '<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:640px;margin:0 auto;color:#1a1a1a;line-height:1.5;font-size:14px">' + html + '</div>';
}

// Bold the label before a leading colon (e.g., "Amazon:") for scannability.
function boldLead_(s) {
  const m = s.match(/^([^:]{1,28}):\s(.*)$/);
  return m ? '<b>' + m[1] + ':</b> ' + m[2] : s;
}

function renderAudio_(text) {
  let t = text
    .replace(/^###\s*.*$/gm, '')         // drop section titles in audio (email keeps them)
    .replace(/^-\s*/gm, '')              // drop bullet markers
    .replace(/\n{2,}/g, '. ')
    .replace(/\n/g, '. ')
    .replace(/\.\s*\.\s*/g, '. ')
    .replace(/\s+/g, ' ')
    .trim();
  if (t.length > CONFIG.MAX_AUDIO_CHARS) t = t.slice(0, CONFIG.MAX_AUDIO_CHARS);
  return t;
}

function stripTags_(html) { return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(); }
function makeSummary_(script) { return renderAudio_(script).slice(0, 350).trim() + '...'; }
function esc_(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }


// ====================== TEXT TO SPEECH ==========================
function synthesizeToBlob_(text, today) {
  const chunks = chunkText_(text, 3800);
  let bytes = [];
  chunks.forEach(function (c) { bytes = bytes.concat(synthesizeChunk_(c)); });
  return Utilities.newBlob(bytes, 'audio/mpeg', 'brief-' + Utilities.formatDate(today, CONFIG.TIME_ZONE, 'yyyy-MM-dd') + '.mp3');
}

function synthesizeChunk_(chunk) {
  const res = UrlFetchApp.fetch('https://texttospeech.googleapis.com/v1/text:synthesize?key=' + CONFIG.GOOGLE_TTS_API_KEY, {
    method: 'post', contentType: 'application/json',
    payload: JSON.stringify({
      input: { text: chunk },
      voice: { languageCode: CONFIG.TTS_LANG, name: CONFIG.TTS_VOICE },
      audioConfig: { audioEncoding: 'MP3' },
    }),
    muteHttpExceptions: true,
  });
  if (res.getResponseCode() !== 200) throw new Error('TTS error: ' + res.getContentText());
  return Utilities.base64Decode(JSON.parse(res.getContentText()).audioContent);
}

function chunkText_(text, maxChars) {
  const sentences = text.match(/[^.!?]+[.!?]*\s*/g) || [text];
  const chunks = []; let cur = '';
  sentences.forEach(function (s) { if ((cur + s).length > maxChars && cur) { chunks.push(cur.trim()); cur = ''; } cur += s; });
  if (cur.trim()) chunks.push(cur.trim());
  return chunks;
}


// ==================== HOSTING / RETENTION =======================
function getOrCreateFolder_() {
  const it = DriveApp.getFoldersByName(CONFIG.FOLDER_NAME);
  return it.hasNext() ? it.next() : DriveApp.createFolder(CONFIG.FOLDER_NAME);
}
function pruneOldEpisodes_(folder) {
  const cutoff = Date.now() - CONFIG.RETENTION_DAYS * 86400000;
  const files = folder.getFiles();
  while (files.hasNext()) {
    const f = files.next();
    if (f.getDateCreated().getTime() < cutoff) { deleteFromGitHub_(f.getName()); f.setTrashed(true); }
  }
}

// ---- GitHub audio hosting ----
function githubRawUrl_(fileName) {
  return 'https://raw.githubusercontent.com/' + CONFIG.GITHUB_OWNER + '/' + CONFIG.GITHUB_REPO
    + '/' + CONFIG.GITHUB_BRANCH + '/' + CONFIG.GITHUB_DIR + '/' + fileName;
}

function githubApi_(fileName) {
  return 'https://api.github.com/repos/' + CONFIG.GITHUB_OWNER + '/' + CONFIG.GITHUB_REPO
    + '/contents/' + CONFIG.GITHUB_DIR + '/' + fileName;
}

function githubHeaders_() {
  return { Authorization: 'Bearer ' + CONFIG.GITHUB_TOKEN, Accept: 'application/vnd.github+json' };
}

function uploadToGitHub_(fileName, blob) {
  const headers = githubHeaders_();
  let sha = null;
  const getRes = UrlFetchApp.fetch(githubApi_(fileName) + '?ref=' + CONFIG.GITHUB_BRANCH, { headers: headers, muteHttpExceptions: true });
  if (getRes.getResponseCode() === 200) sha = JSON.parse(getRes.getContentText()).sha;   // updating same-day rerun
  const payload = { message: 'Add ' + fileName, content: Utilities.base64Encode(blob.getBytes()), branch: CONFIG.GITHUB_BRANCH };
  if (sha) payload.sha = sha;
  const putRes = UrlFetchApp.fetch(githubApi_(fileName), {
    method: 'put', headers: headers, contentType: 'application/json',
    payload: JSON.stringify(payload), muteHttpExceptions: true,
  });
  if (putRes.getResponseCode() >= 300) throw new Error('GitHub upload failed: ' + putRes.getContentText());
}

function deleteFromGitHub_(fileName) {
  try {
    const headers = githubHeaders_();
    const getRes = UrlFetchApp.fetch(githubApi_(fileName) + '?ref=' + CONFIG.GITHUB_BRANCH, { headers: headers, muteHttpExceptions: true });
    if (getRes.getResponseCode() !== 200) return;
    const sha = JSON.parse(getRes.getContentText()).sha;
    UrlFetchApp.fetch(githubApi_(fileName), {
      method: 'delete', headers: headers, contentType: 'application/json',
      payload: JSON.stringify({ message: 'Prune ' + fileName, sha: sha, branch: CONFIG.GITHUB_BRANCH }),
      muteHttpExceptions: true,
    });
  } catch (e) {}
}


// ==================== PODCAST RSS (web app) =====================
function doGet() {
  return ContentService.createTextOutput(buildRssXml_(getOrCreateFolder_())).setMimeType(ContentService.MimeType.RSS);
}
function buildRssXml_(folder) {
  const items = []; const it = folder.getFiles();
  while (it.hasNext()) { const f = it.next(); if (f.getMimeType() === 'audio/mpeg') items.push(f); }
  items.sort(function (a, b) { return b.getDateCreated().getTime() - a.getDateCreated().getTime(); });

  const img = CONFIG.PODCAST_IMAGE_URL ? '<itunes:image href="' + esc_(CONFIG.PODCAST_IMAGE_URL) + '"/>' : '';
  const entries = items.map(function (f) {
    const d = (f.getDescription() || 'Morning Brief').split('\n');
    const url = githubRawUrl_(f.getName());
    const pub = Utilities.formatDate(f.getDateCreated(), 'GMT', "EEE, dd MMM yyyy HH:mm:ss 'GMT'");
    return '<item><title>' + esc_(d[0]) + '</title><description>' + esc_(d.slice(1).join(' ').trim()) + '</description>'
      + '<itunes:summary>' + esc_(d.slice(1).join(' ').trim()) + '</itunes:summary>'
      + '<enclosure url="' + url + '" length="' + f.getSize() + '" type="audio/mpeg"/>'
      + '<guid isPermaLink="false">' + f.getId() + '</guid><pubDate>' + pub + '</pubDate>'
      + '<itunes:explicit>false</itunes:explicit></item>';
  }).join('');

  return '<?xml version="1.0" encoding="UTF-8"?><rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd"><channel>'
    + '<title>' + esc_(CONFIG.PODCAST_TITLE) + '</title><link>https://drive.google.com</link><language>en</language>'
    + '<description>' + esc_(CONFIG.PODCAST_DESC) + '</description><itunes:author>' + esc_(CONFIG.PODCAST_AUTHOR) + '</itunes:author>'
    + '<itunes:explicit>false</itunes:explicit>' + img + entries + '</channel></rss>';
}


// ======================== UTILITIES =============================
function testRun() { sendMorningBrief(); }
function createDailyTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'sendMorningBrief') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('sendMorningBrief').timeBased().everyDays(1).atHour(CONFIG.SEND_HOUR).inTimezone(CONFIG.TIME_ZONE).create();
  Logger.log('Daily trigger set for ' + CONFIG.SEND_HOUR + ':00 ' + CONFIG.TIME_ZONE);
}
