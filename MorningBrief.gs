/**
 * MORNING BRIEF v5.0  ::  EMAIL + PRIVATE AUDIO PODCAST (one generation)
 *
 * Public template. Fill in every PASTE_... value in CONFIG, and replace the
 * QUOTES, MANIFESTO_ANGLES and persona line with your own. See README.md.
 *
 * Two entry points, one shared guard:
 *   - doPost       : Whoop webhook (sleep.updated / recovery.updated) fires the
 *                    brief as soon as recovery is scored. Primary trigger.
 *   - hourly trigger : createDailyTrigger() installs hourlySafetyNet, which fires
 *                      once your LOCAL time passes SEND_HOUR, wherever you are.
 * Both call sendMorningBrief(), which generates at most once per calendar day.
 *
 * LENGTH TARGET: about 600 words, which is roughly 4 minutes of narration.
 * Input volume is trimmed to match, so the model is not handed more than it can
 * use. If you ever want a longer brief again, raise TARGET_WORDS, MAX_TOKENS,
 * MAX_AUDIO_CHARS and the HEADLINES / NEWSLETTER caps together.
 */

// ============================ CONFIG ============================
const CONFIG = {
  ANTHROPIC_API_KEY: 'PASTE_ANTHROPIC_API_KEY',
  GOOGLE_TTS_API_KEY: 'PASTE_GOOGLE_CLOUD_TTS_KEY',
  MODEL: 'claude-sonnet-4-6',

  SEND_HOUR: 10,
  SEND_MINUTE: 30,
  TIME_ZONE: Session.getScriptTimeZone(),  // placeholder only, replaced each run by your calendar-derived location
  RECIPIENT: 'you@example.com',
  SKIP_WEEKENDS: true,               // locale-proof: uses day numbers, not day names

  // LOCATION (derived from your calendar, nothing hardcoded)
  TRAVEL_LOOKBACK_DAYS: 60,          // how far back to look for your most recent trip
  LOCATION_VOTES: 5,                 // if no trip is found, majority city of this many recent located events
  MIN_CITY_POPULATION: 5000,         // stops words like "gym" in "Go to gym" becoming a city

  WHOOP_CLIENT_ID: 'PASTE_WHOOP_CLIENT_ID',
  WHOOP_CLIENT_SECRET: 'PASTE_WHOOP_CLIENT_SECRET',
  WHOOP_REDIRECT_URI: 'PASTE_YOUR_DEPLOYED_EXEC_URL',
  WHOOP_API_BASE: 'https://api.prod.whoop.com/developer',

  TTS_LANG: 'en-GB',
  TTS_VOICE: 'en-GB-Chirp3-HD-Aoede',

  // LENGTH CONTROLS (all three move together)
  TARGET_WORDS: 600,                 // about 4 minutes of speech at roughly 150 wpm
  MAX_TOKENS: 1400,                  // enough for ~600 words plus headers, no more
  MAX_AUDIO_CHARS: 4500,             // hard stop on the narration, about 4.5 minutes

  FOLDER_NAME: 'Morning Brief Audio',
  RETENTION_DAYS: 5,
  PODCAST_TITLE: 'Morning Brief',
  PODCAST_AUTHOR: 'Your Name',
  PODCAST_DESC: 'A four minute daily briefing: habits, the day ahead, weather, markets, geopolitics, entertainment, science, and a line from the manifesto.',
  PODCAST_IMAGE_URL: '',

  NEWSLETTER_QUERY: 'is:unread newer_than:2d (from:news.bloomberg.com OR from:news-alerts.ft.com OR from:reuters.com OR from:stockmktnewz@mail.beehiiv.com OR from:rallies.ai OR from:termsheet@mail.fortune.com OR from:crew@morningbrew.com OR from:sobhiye.news OR from:arkinvest.com OR from:snowball-analytics.com OR from:startupclub.slidebean.com OR from:mail.wirely.so OR from:donotreply@interactivebrokers.com)',
  MAX_NEWSLETTERS: 5,                // trimmed from 8
  NEWSLETTER_CHAR_CAP: 1000,         // trimmed from 1500

  HEADLINES_PER_TOPIC: 2,            // trimmed from 3
  HEADLINE_MAX_AGE_DAYS: 3,

  FOOTBALL_DATA_TOKEN: 'PASTE_FOOTBALL_DATA_TOKEN',
  LIVERPOOL_TEAM_ID: 64,                                   // your club's id on football-data.org (64 = Liverpool)
  TENNIS_PLAYERS: ['djokovic', 'sinner', 'alcaraz', 'ruud', 'paul', 'draper', 'dimitrov'],

  LANGUAGES: ['French', 'Spanish', 'Greek'],

  EMAIL_FOLLOWUP_QUERY: 'in:inbox is:unread -category:promotions -category:social -category:updates newer_than:10d',
  MAX_FOLLOWUP_EMAILS: 5,            // trimmed from 7
  TASK_LOOKAHEAD_DAYS: 3,

  GITHUB_OWNER: 'PASTE_GITHUB_USERNAME',
  GITHUB_REPO: 'your-audio-repo',
  GITHUB_BRANCH: 'main',
  GITHUB_DIR: 'audio',
  GITHUB_TOKEN: 'PASTE_GITHUB_FINE_GRAINED_TOKEN',
};

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

const ARXIV = [
  { label: 'AI and ML', cat: 'cs.LG' },
  { label: 'AI', cat: 'cs.AI' },
  { label: 'Computer Science', cat: 'cs.CL' },
  { label: 'Physics', cat: 'quant-ph' },
  { label: 'Chemistry', cat: 'physics.chem-ph' },
  { label: 'Biotech', cat: 'q-bio.BM' },
];

// WMO weather interpretation codes used by Open-Meteo, in plain spoken words.
const WMO_CODES = {
  0: 'clear', 1: 'mainly clear', 2: 'partly cloudy', 3: 'overcast',
  45: 'foggy', 48: 'freezing fog',
  51: 'light drizzle', 53: 'drizzle', 55: 'heavy drizzle',
  56: 'freezing drizzle', 57: 'freezing drizzle',
  61: 'light rain', 63: 'rain', 65: 'heavy rain',
  66: 'freezing rain', 67: 'freezing rain',
  71: 'light snow', 73: 'snow', 75: 'heavy snow', 77: 'snow grains',
  80: 'light showers', 81: 'showers', 82: 'heavy showers',
  85: 'snow showers', 86: 'heavy snow showers',
  95: 'thunderstorms', 96: 'thunderstorms with hail', 99: 'thunderstorms with hail',
};

// Daily quotes, one per day, no repeat within a week if you keep at least 8.
// REPLACE these with your own quotes, principles, or manifesto lines.
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

// Reflection themes, one per day. The model writes a short original reflection
// on the day's theme. REPLACE these with the ideas you want to be reminded of.
const MANIFESTO_ANGLES = [
  'honesty with yourself before anyone else',
  'be one concrete increment better than yesterday',
  'choose what is right over what is merely convenient',
  'humility before the ideal, not pride at having reached it',
  'your example is the unit of change, not grand gestures',
  'discomfort is the price of growth, pay it deliberately today',
  'mortality makes each choice count',
  'action over intention: the world changes by what you do',
];

const CULTURE_NOTES = {
  French: [
    { fact: 'The concept of "flâneur", a deliberate, observant stroller through city streets, became a recognized literary and philosophical stance in 19th-century Paris.', phrase: 'L\'esprit de l\'escalier', meaning: 'thinking of the perfect reply only after the conversation has ended' },
    { fact: 'France produces over 1,200 documented distinct varieties of cheese across eight official regional categories.', phrase: 'Faire d\'une pierre deux coups', meaning: 'to accomplish two objectives with a single action' },
    { fact: 'Under French copyright law, author moral rights are perpetual, inalienable, and cannot be waived or transferred.', phrase: 'Reculer pour mieux sauter', meaning: 'to step back deliberately in order to take a bigger leap forward' },
    { fact: 'The French rail network pioneered the TGV in 1981, designed around dedicated high-speed lines that link city centers directly.', phrase: 'Coûte que coûte', meaning: 'whatever the cost or no matter what it takes' },
    { fact: 'The Louvre’s Cour Napoléon is designed so that the underground museum beneath the glass pyramid receives ambient natural light while preserving subterranean temperature control.', phrase: 'Avoir le compas dans l\'œil', meaning: 'to have an exceptionally sharp, precise visual eye for distance or measure' }
  ],
  Spanish: [
    { fact: 'The phrase "sobremesa" denotes the prolonged cultural tradition of continuing conversation around the dining table long after food is finished.', phrase: 'A quien madruga, Dios le ayuda', meaning: 'the early riser is rewarded by opportunity' },
    { fact: 'Spain maintains the second most mountainous landscape in Europe by mean altitude after Switzerland.', phrase: 'Paso a paso, se llega lejos', meaning: 'step by step, one reaches great distances' },
    { fact: 'The Camino de Santiago network across northern Spain has functioned as an active cultural corridor and pilgrimage path for over a millennium.', phrase: 'El hábito no hace al monje', meaning: 'external appearances do not define true substance or character' },
    { fact: 'Madrid is host to the oldest continuously operating dining institution in the world, Sobrino de Botín, operating since 1725.', phrase: 'Obras son amores, y no buenas razones', meaning: 'genuine commitment is proven by concrete acts, not pleasant intentions' },
    { fact: 'Castilian Spanish uniquely retains the inverted punctuation marks to clarify tone and prosody before a clause begins.', phrase: 'Sin prisa, pero sin pausa', meaning: 'unhurried, but relentless without stopping' }
  ],
  Greek: [
    { fact: 'Ancient Athens developed ostracism as an institutional tool: voting once a year to exile any single citizen judged too powerful for the democracy.', phrase: 'Philotimo', meaning: 'the internal duty to act honorably and generously toward family and community' },
    { fact: 'Mount Olympus drops directly into the Thermaic Gulf, rising from sea level to 2,917 meters across a distance of under twenty kilometers.', phrase: 'Meraki', meaning: 'pouring total passion, devotion, and a part of oneself into an output' },
    { fact: 'Greece comprises approximately 6,000 islands and islets scattered across the Aegean and Ionian seas, of which barely 220 are inhabited.', phrase: 'Pan metron ariston', meaning: 'excellence lies in deliberate measure and proportion' },
    { fact: 'The olive tree on the Athenian Acropolis has served as a continuous civic symbol since the city’s classical antiquity foundation myth.', phrase: 'Kathe empodio gia kalo', meaning: 'every obstacle encountered exists for an ultimate benefit' },
    { fact: 'The Greek language possesses a documented uninterrupted written tradition spanning over 34 centuries.', phrase: 'Gnothi seauton', meaning: 'know thyself and recognize your exact capabilities and limits' }
  ]
};

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

// ===================== MAIN DAILY FUNCTION ======================
function sendMorningBrief() {
  const props = PropertiesService.getScriptProperties();
  let claimed = false;
  let delivered = false;

  try {
    const today = new Date();

    // 1. Resolve location and time zone FIRST, so every formatter below
    //    (calendar, weather, football, Whoop, filenames) uses the correct city.
    const currentLocation = detectCurrentLocation_(today);
    CONFIG.TIME_ZONE = currentLocation.tz;

    const dateLong = Utilities.formatDate(today, CONFIG.TIME_ZONE, 'EEEE, d MMMM yyyy');
    const doy = dayOfYear_(today);

    // 2. Weekend guard by day NUMBER, so it cannot silently fail on a non-English locale.
    if (CONFIG.SKIP_WEEKENDS && isWeekend_(today)) {
      Logger.log('Skipping ' + dateLong + ' (weekend).');
      return;
    }

    // 3. Shared once-per-day claim, so the webhook and the time trigger
    //    can never both generate a brief on the same day.
    //    The script lock makes the check-and-set atomic, so two webhooks
    //    arriving in the same second cannot both pass.
    const todayKey = Utilities.formatDate(today, CONFIG.TIME_ZONE, 'yyyy-MM-dd');
    const lock = LockService.getScriptLock();
    if (!lock.tryLock(30000)) {
      Logger.log('Another run holds the lock, exiting.');
      return;
    }
    try {
      if (props.getProperty('lastRunDate') === todayKey) {
        Logger.log('Already generated today: ' + todayKey);
        return;
      }
      props.setProperty('lastRunDate', todayKey);
    } finally {
      lock.releaseLock();
    }
    claimed = true;

    const events = getTodayEvents_(today);
    const weather = getWeather_(currentLocation);
    const yesterdayContext = getYesterdayContext_(today);
    const newsletters = getNewsletters_();
    const rss = gatherHeadlines_();
    const sports = getSportsBlock_(today);
    const papers = getArxiv_();
    const followups = getFollowUps_(today);
    const whoop = getWhoopBlock_(today);
    const state = getState_();

    const quote = pickRotating_(QUOTES, doy, state.quotes);
    const lens = MANIFESTO_ANGLES[doy % MANIFESTO_ANGLES.length];
    const lang = CONFIG.LANGUAGES[doy % CONFIG.LANGUAGES.length];
    const habitsToday = [0, 1, 2].map(function (i) { return HABITS[(doy * 3 + i) % HABITS.length]; });

    const langKey = (lang && CULTURE_NOTES[lang]) ? lang : 'Greek';
    const langItems = CULTURE_NOTES[langKey] || [];
    const cultureItem = langItems.length
      ? langItems[Math.abs(doy) % langItems.length]
      : { fact: 'Greek culture places deep emphasis on philotimo and civic balance.', phrase: 'Pan metron ariston', meaning: 'all things in good measure' };

    const material = rss.material + '\n\n' + sports
      + '\n\nACADEMIC PAPERS (arXiv, recent):\n' + papers
      + '\n\n' + followups
      + '\n\n' + whoop
      + '\n\n' + yesterdayContext;

    const userMsg = buildUserMessage_(dateLong, currentLocation, events, weather, newsletters, material,
      state.recentTitles, quote, lens, habitsToday, lang, cultureItem);

    const script = callClaude_(userMsg);
    if (!script) throw new Error('Anthropic returned no text.');

    // EMAIL
    const html = renderEmail_(script);
    GmailApp.sendEmail(CONFIG.RECIPIENT, 'Morning Brief, ' + dateLong, stripTags_(html), {
      htmlBody: html, name: 'Morning Brief',
    });
    delivered = true;                   // from here on, never release the day's claim

    // AUDIO + PODCAST FEED
    const blob = synthesizeToBlob_(renderAudio_(script), today);
    const folder = getOrCreateFolder_();
    const fileName = 'brief-' + Utilities.formatDate(today, CONFIG.TIME_ZONE, 'yyyy-MM-dd') + '.mp3';
    let ex = folder.getFilesByName(fileName); while (ex.hasNext()) ex.next().setTrashed(true);
    const file = folder.createFile(blob.setName(fileName));
    file.setDescription('Morning Brief, ' + dateLong + '\n' + makeSummary_(script));
    uploadToGitHub_(fileName, blob);
    pruneOldEpisodes_(folder);

    saveState_(quote, rss.titles, state);
    Logger.log('Done: emailed and published ' + fileName + ' (' + wordCount_(script) + ' words)');
  } catch (err) {
    // Only release the claim if nothing reached you yet, so a retry cannot
    // send a second copy after an audio or GitHub failure.
    if (claimed && !delivered) props.deleteProperty('lastRunDate');
    Logger.log('Run failed: ' + err);
    GmailApp.sendEmail(CONFIG.RECIPIENT, 'Morning Brief run failed', String(err) + '\n\nSee the Apps Script execution log.');
  }
}

// Day-number weekend check. Locale-proof, unlike matching the text "Sat" or "Sun".
function isWeekend_(today) {
  const local = Utilities.formatDate(today, CONFIG.TIME_ZONE, 'yyyy/MM/dd');
  const dow = new Date(local).getDay();     // 0 = Sunday, 6 = Saturday
  return dow === 0 || dow === 6;
}

function wordCount_(s) { return (s.replace(/\s+/g, ' ').trim().split(' ') || []).length; }

// ========================== INPUTS ==============================
function getTodayEvents_(today) {
  const evs = CalendarApp.getDefaultCalendar().getEventsForDay(today);
  if (!evs.length) return 'No events scheduled today.';
  return evs.map(function (e) {
    if (e.isAllDayEvent()) return 'All day: ' + e.getTitle();
    const s = Utilities.formatDate(e.getStartTime(), CONFIG.TIME_ZONE, 'h:mm a');
    const en = Utilities.formatDate(e.getEndTime(), CONFIG.TIME_ZONE, 'h:mm a');
    let line = s + ' to ' + en + '  ' + e.getTitle();
    const desc = (e.getDescription() || '').trim();
    if (desc) line += ' (notes: ' + desc.replace(/\s+/g, ' ').slice(0, 200) + ')';
    return line;
  }).join('\n');
}

// Open-Meteo: free, no API key, no signup. Returns one short line.
function getWeather_(location) {
  if (location.lat === null || location.lat === undefined) return 'WEATHER: (unavailable, no city found on calendar yet)';
  const url = 'https://api.open-meteo.com/v1/forecast'
    + '?latitude=' + location.lat + '&longitude=' + location.lon
    + '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max'
    + '&timezone=' + encodeURIComponent(location.tz)
    + '&forecast_days=1';
  try {
    const res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    if (res.getResponseCode() !== 200) return 'WEATHER: (unavailable)';
    const d = JSON.parse(res.getContentText()).daily;
    if (!d || !d.temperature_2m_max) return 'WEATHER: (unavailable)';

    const desc = WMO_CODES[d.weather_code[0]] || 'mixed conditions';
    const hi = Math.round(d.temperature_2m_max[0]);
    const lo = Math.round(d.temperature_2m_min[0]);
    const rain = d.precipitation_probability_max ? d.precipitation_probability_max[0] : null;
    const rainBit = (rain !== null && rain >= 25) ? ', ' + rain + '% chance of rain' : '';
    return 'WEATHER (' + location.name + ', today): ' + desc + ', high ' + hi + 'C, low ' + lo + 'C' + rainBit;
  } catch (e) {
    return 'WEATHER: (unavailable)';
  }
}

// ===================== LOCATION (from your calendar) =====================
// No city, coordinate, or time zone is hardcoded. Everything comes from your
// Google Calendar and Open-Meteo's free geocoder (no key, no signup):
//   1. Your most recent trip that has started wins, read from an arrow in the
//      location or title ("Athens → Beirut") or "to X" in a travel title.
//   2. If no trip resolves, the city most of your recent events are located in.
//   3. If the calendar has nothing usable, the last city found.
//   4. On the very first run with an empty calendar, the calendar's own time zone.
function detectCurrentLocation_(today) {
  const props = PropertiesService.getScriptProperties();
  try {
    const lookback = new Date(today.getTime() - CONFIG.TRAVEL_LOOKBACK_DAYS * 86400000);
    const evs = CalendarApp.getDefaultCalendar().getEvents(lookback, today)
      .filter(function (e) { return e.getStartTime().getTime() <= today.getTime(); })        // already started
      .sort(function (a, b) { return b.getStartTime().getTime() - a.getStartTime().getTime(); }); // newest first

    // 1. Most recent trip. If its destination cannot be resolved (for example it
    //    names a country), only events AFTER that trip are allowed to vote below.
    let tripIndex = evs.length;
    for (let i = 0; i < evs.length; i++) {
      const dest = travelDestination_(evs[i].getTitle(), evs[i].getLocation());
      if (!dest) continue;
      const place = geocodeCity_(dest);
      if (place) return remember_(place);
      tripIndex = i;
      break;
    }

    // 2. Majority city among your most recent located events.
    const votes = {};
    let counted = 0;
    for (let i = 0; i < tripIndex && counted < CONFIG.LOCATION_VOTES; i++) {
      const place = cityFromLocation_(evs[i].getLocation());
      if (!place) continue;
      votes[place.name] = votes[place.name] || { place: place, n: 0 };
      votes[place.name].n++;
      counted++;
    }
    const top = Object.keys(votes).map(function (k) { return votes[k]; })
      .sort(function (a, b) { return b.n - a.n; })[0];
    if (top) return remember_(top.place);
  } catch (e) {
    Logger.log('Location lookup failed: ' + e);
  }

  // 3. Nothing usable on the calendar: stay in the last city found.
  const last = props.getProperty('lastLocation');
  if (last) return JSON.parse(last);

  // 4. Very first run with an empty calendar: the calendar's own time zone.
  return { name: 'your calendar time zone', tz: CalendarApp.getDefaultCalendar().getTimeZone(), lat: null, lon: null };
}

function remember_(place) {
  PropertiesService.getScriptProperties().setProperty('lastLocation', JSON.stringify(place));
  return place;
}

// Finds the destination of a travel event, or returns null if it is not travel.
//   Location "Athens → Beirut"          -> "Beirut"
//   Title    "Flight to Dubai (EK 956)"  -> "Dubai"
//   Title    "Beirut to Dubai"           -> "Dubai"   (origin is itself a city)
//   Title    "Go to gym"                 -> null
function travelDestination_(title, location) {
  const arrowed = [location, title].filter(function (s) { return s && /→|->|➡/.test(s); })[0];
  if (arrowed) return cleanPlace_(arrowed.split(/→|->|➡/).pop());

  const t = String(title || '');
  const isTrip = /✈|🛫|🛬|\b(flight|fly|flying|ferry|train|bus|travel|trip|leave|leaving|depart|return)\b/i.test(t);
  const m = t.match(/^(.*?)\bto\s+(.+)$/i);
  if (!m) return null;
  if (isTrip || geocodeCity_(cleanPlace_(m[1]))) return cleanPlace_(m[2]);
  return null;
}

// Strips emoji, bracketed notes, and anything after a comma, dash, or bar.
function cleanPlace_(s) {
  return String(s || '')
    .replace(/[\u{1F300}-\u{1FAFF}\u2600-\u27BF\uFE0F]/gu, '')
    .replace(/\(.*?\)/g, '')
    .split(/[,|(—–]| - /)[0]
    .trim();
}

// Pulls a city out of an event's location, e.g. "Head Office, Beirut" -> Beirut,
// "Mövenpick Beirut" -> Beirut, "Kifisia 145 61, Greece" -> Kifisia (Greece only).
function cityFromLocation_(loc) {
  if (!loc || /https?:|zoom|meet\.google|teams\.microsoft|online|virtual/i.test(loc)) return null;
  const parts = String(loc).split(',')
    .map(function (p) { return p.replace(/[0-9]+/g, ' ').replace(/\s+/g, ' ').trim(); })
    .filter(Boolean);
  if (!parts.length) return null;

  // A country at the end of the address narrows every other lookup to that country.
  const cc = countryCodeOf_(parts[parts.length - 1]);

  for (let i = parts.length - 1; i >= 0; i--) {
    const w = parts[i].split(' ');
    const tries = [parts[i], w[0], w[w.length - 1], w.slice(0, 2).join(' '), w.slice(-2).join(' ')]
      .filter(function (x, k, arr) { return x && arr.indexOf(x) === k; });
    for (let j = 0; j < tries.length; j++) {
      const place = geocodeCity_(tries[j], cc);
      if (place) return place;
    }
  }
  return null;
}

function normalize_(s) {
  return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

// Raw Open-Meteo geocoder lookup, cached per name so each name is fetched once.
function geoLookup_(name) {
  const props = PropertiesService.getScriptProperties();
  const key = 'geo2:' + normalize_(name).slice(0, 60);
  const cached = props.getProperty(key);
  if (cached) return JSON.parse(cached);
  try {
    const url = 'https://geocoding-api.open-meteo.com/v1/search?count=10&language=en&format=json&name=' + encodeURIComponent(name);
    const res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    if (res.getResponseCode() !== 200) return [];                  // transient failure, not cached
    const results = (JSON.parse(res.getContentText()).results || []).map(function (r) {
      return { name: r.name, code: r.feature_code || '', pop: r.population || 0, tz: r.timezone,
               lat: r.latitude, lon: r.longitude, country: r.country || '', cc: r.country_code || '' };
    });
    props.setProperty(key, JSON.stringify(results));
    return results;
  } catch (e) {
    return [];
  }
}

// If the text is a country name, returns its country code ("Greece" -> "GR").
function countryCodeOf_(name) {
  const n = normalize_(name);
  const hit = geoLookup_(name).filter(function (r) {
    return r.code.indexOf('PCL') === 0 && normalize_(r.name) === n;
  })[0];
  return hit ? hit.cc : null;
}

// Returns the most populous real town whose name matches the text exactly,
// optionally limited to one country. Country names never count as towns, so
// "Greece" is never read as Greece, New York.
function geocodeCity_(name, cc) {
  const n = normalize_(name);
  if (n.length < 3 || countryCodeOf_(name)) return null;
  const towns = geoLookup_(name).filter(function (r) {
    return r.code.indexOf('PPL') === 0 && r.pop >= CONFIG.MIN_CITY_POPULATION
        && normalize_(r.name) === n && (!cc || r.cc === cc);
  }).sort(function (a, b) { return b.pop - a.pop; });
  const r = towns[0];
  return r ? { name: r.name + (r.country ? ', ' + r.country : ''), tz: r.tz, lat: r.lat, lon: r.lon } : null;
}

function getYesterdayContext_(today) {
  const yesterday = new Date(today.getTime() - 86400000);
  const evs = CalendarApp.getDefaultCalendar().getEventsForDay(yesterday);
  const lines = [];
  if (!evs.length) {
    lines.push('No events on calendar yesterday.');
  } else {
    evs.forEach(function (e) {
      const s = Utilities.formatDate(e.getStartTime(), CONFIG.TIME_ZONE, 'h:mm a');
      lines.push('- ' + s + ': ' + e.getTitle());
    });
  }
  return 'YESTERDAY CALENDAR EVENTS (context for strain and sleep):\n' + lines.join('\n');
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

// =================== SPORTS FIXTURES ============================
function getSportsBlock_(today) {
  return 'FOOTBALL FIXTURES (today, grouped by competition, local times):\n' + getFootballFixtures_(today)
    + '\n\nTENNIS (tracked players, from news headlines, NO exact times available):\n' + getTennisFixtures_();
}

function ymd_(d) { return Utilities.formatDate(d, 'GMT', 'yyyy-MM-dd'); }

// Today's matches, plus tomorrow's only if they start before 3 AM local.
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
  const to = ymd_(new Date(today.getTime() + 86400000));
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
  if (!comps.length) return 'No matches today for your club or tracked tournaments';
  return comps.map(function (c) { return c + ':\n' + byComp[c].join('\n'); }).join('\n');
}

// Tennis comes from news headlines, not a fixtures API, so there are no exact
// times and NO hardcoded fallbacks. When nothing is found it says so plainly.
function getTennisFixtures_() {
  const playerList = CONFIG.TENNIS_PLAYERS.join(' OR ');
  const query = 'tennis (' + playerList + ') (match OR quarterfinal OR semifinal OR final OR "order of play" OR vs)';
  const url = 'https://news.google.com/rss/search?q=' + encodeURIComponent(query) + '&hl=en-US&gl=US&ceid=US:en';

  try {
    const res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    if (res.getResponseCode() !== 200) return 'Tennis coverage unavailable.';

    const channel = XmlService.parse(res.getContentText()).getRootElement().getChild('channel');
    const items = channel ? channel.getChildren('item') : [];

    const results = [];      // matches already played
    const upcoming = [];     // matches still to come
    const seen = {};
    const cutoff = Date.now() - 36 * 3600000;

    const resultWords = ['outduel', 'upset', 'dethrone', 'beat', 'beats', 'defeat', 'defeats', 'overcomes', 'loses', 'wins', 'advances', 'knocks out'];
    const noiseWords = ['how to watch', 'highlights', 'tv schedule', 'live stream', 'stream', 'prediction', 'odds', 'preview', 'analysis', 'podcast', 'betting'];
    const skipWords = ['women', 'wta', 'doubles'];

    for (let i = 0; i < items.length; i++) {
      const titleEl = items[i].getChild('title');
      const pubDateEl = items[i].getChild('pubDate');
      if (!titleEl) continue;

      if (pubDateEl) {
        const d = new Date(pubDateEl.getText());
        if (!isNaN(d) && d.getTime() < cutoff) continue;
      }

      const title = titleEl.getText().replace(/\s+-[^-]+$/, '').trim();
      const lower = title.toLowerCase();

      if (skipWords.some(function (w) { return lower.indexOf(w) !== -1; })) continue;
      if (noiseWords.some(function (w) { return lower.indexOf(w) !== -1; })) continue;
      if (!CONFIG.TENNIS_PLAYERS.some(function (p) { return lower.indexOf(p) !== -1; })) continue;

      const key = title.slice(0, 30).toLowerCase();
      if (seen[key]) continue;
      seen[key] = true;

      if (resultWords.some(function (w) { return lower.indexOf(w) !== -1; })) {
        if (results.length < 2) results.push('- ' + title);
      } else if (lower.indexOf(' vs ') !== -1 || lower.indexOf(' v ') !== -1 || lower.indexOf('order of play') !== -1) {
        if (upcoming.length < 2) upcoming.push('- ' + title);
      }
    }

    const out = [];
    out.push('RECENT RESULTS:');
    out.push(results.length ? results.join('\n') : '- Nothing recent for tracked players.');
    out.push('\nUPCOMING:');
    out.push(upcoming.length ? upcoming.join('\n') : '- No upcoming matches found for tracked players.');
    return out.join('\n');
  } catch (err) {
    Logger.log('Tennis fetch error: ' + err);
    return 'Tennis coverage unavailable.';
  }
}

function debugTennis() {
  Logger.log('--- Tennis Output ---\n' + getTennisFixtures_());
}

function debugWeather() {
  Logger.log(getWeather_(detectCurrentLocation_(new Date())));
}

// =================== ACADEMIC PAPERS (arXiv) ====================
function getArxiv_() {
  const reqs = ARXIV.map(function (a) { return { url: 'https://export.arxiv.org/rss/' + a.cat, muteHttpExceptions: true }; });
  let responses = [];
  try { responses = UrlFetchApp.fetchAll(reqs); } catch (e) { return '(papers unavailable)'; }
  const blocks = [];
  responses.forEach(function (res, i) {
    const titles = parseArxivTitles_(res, 1);     // one per field is plenty at this length
    if (titles.length) blocks.push(ARXIV[i].label + ': ' + titles[0]);
  });
  return blocks.length ? blocks.join('\n') : '(no fresh papers)';
}

function parseArxivTitles_(res, max) {
  if (!res || res.getResponseCode() !== 200) return [];
  try {
    const root = XmlService.parse(res.getContentText()).getRootElement();
    const channel = root.getChild('channel');
    let items, ns = null;
    if (channel && channel.getChildren('item').length) {
      items = channel.getChildren('item');
    } else {
      ns = XmlService.getNamespace('http://purl.org/rss/1.0/');
      items = root.getChildren('item', ns);
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

// =================== FOLLOW-UPS ================================
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

// ======================= WHOOP =================================
function whoopAuthUrl() {
  const state = Utilities.getUuid();
  PropertiesService.getScriptProperties().setProperty('whoopState', state);
  const url = 'https://api.prod.whoop.com/oauth/oauth2/auth'
    + '?client_id=' + encodeURIComponent(CONFIG.WHOOP_CLIENT_ID)
    + '&redirect_uri=' + encodeURIComponent(CONFIG.WHOOP_REDIRECT_URI)
    + '&response_type=code'
    + '&scope=' + encodeURIComponent('read:recovery read:sleep read:cycles offline')
    + '&state=' + encodeURIComponent(state);
  Logger.log('Open this URL to authorize Whoop:\n\n' + url);
  return url;
}

function whoopHandleCallback_(e) {
  const props = PropertiesService.getScriptProperties();
  if (e.parameter.state !== props.getProperty('whoopState')) {
    return 'Whoop authorization failed: state mismatch. Run whoopAuthUrl() again.';
  }
  const res = UrlFetchApp.fetch('https://api.prod.whoop.com/oauth/oauth2/token', {
    method: 'post',
    payload: {
      grant_type: 'authorization_code',
      code: e.parameter.code,
      client_id: CONFIG.WHOOP_CLIENT_ID,
      client_secret: CONFIG.WHOOP_CLIENT_SECRET,
      redirect_uri: CONFIG.WHOOP_REDIRECT_URI,
    },
    muteHttpExceptions: true,
  });
  if (res.getResponseCode() !== 200) return 'Whoop token exchange failed: ' + res.getContentText();
  const tok = JSON.parse(res.getContentText());
  if (!tok.refresh_token) return 'Whoop returned no refresh token. Check that the offline scope is included.';
  props.setProperty('whoopRefresh', tok.refresh_token);
  props.deleteProperty('whoopState');
  return 'Whoop connected. You can close this tab.';
}

// Whoop rotates refresh tokens: each refresh returns a new one and invalidates
// the old immediately, so the new one is saved at once.
function whoopAccessToken_() {
  const props = PropertiesService.getScriptProperties();
  const refresh = props.getProperty('whoopRefresh');
  if (!refresh) throw new Error('no refresh token, run whoopAuthUrl() once');
  const res = UrlFetchApp.fetch('https://api.prod.whoop.com/oauth/oauth2/token', {
    method: 'post',
    payload: {
      grant_type: 'refresh_token',
      refresh_token: refresh,
      client_id: CONFIG.WHOOP_CLIENT_ID,
      client_secret: CONFIG.WHOOP_CLIENT_SECRET,
      scope: 'offline',
    },
    muteHttpExceptions: true,
  });
  if (res.getResponseCode() !== 200) throw new Error('refresh failed: ' + res.getContentText());
  const tok = JSON.parse(res.getContentText());
  if (tok.refresh_token) props.setProperty('whoopRefresh', tok.refresh_token);
  return tok.access_token;
}

function whoopGet_(path, token) {
  const res = UrlFetchApp.fetch(CONFIG.WHOOP_API_BASE + path, {
    headers: { Authorization: 'Bearer ' + token }, muteHttpExceptions: true,
  });
  return res.getResponseCode() === 200 ? JSON.parse(res.getContentText()) : null;
}

function getWhoopBlock_(today) {
  if (!CONFIG.WHOOP_CLIENT_ID || CONFIG.WHOOP_CLIENT_ID.indexOf('PASTE') === 0) return 'WHOOP: (not configured)';
  try {
    const token = whoopAccessToken_();
    const todayStr = Utilities.formatDate(today, CONFIG.TIME_ZONE, 'yyyy-MM-dd');
    const lines = [];

    const rec = whoopGet_('/v2/recovery?limit=1', token);
    const r = rec && rec.records && rec.records[0];
    if (r && r.score_state === 'SCORED' && r.score) {
      const fresh = Utilities.formatDate(new Date(r.created_at), CONFIG.TIME_ZONE, 'yyyy-MM-dd') === todayStr;
      lines.push('Recovery: ' + Math.round(r.score.recovery_score) + '%'
        + ', HRV ' + Math.round(r.score.hrv_rmssd_milli) + ' ms'
        + ', resting heart rate ' + Math.round(r.score.resting_heart_rate) + ' bpm'
        + (fresh ? ' (scored this morning)' : ' (STALE, not from last night, do not present as today)'));
    } else {
      lines.push('Recovery: not scored yet this morning');
    }

    const sl = whoopGet_('/v2/activity/sleep?limit=1', token);
    const s = sl && sl.records && sl.records[0];
    if (s && s.score_state === 'SCORED' && s.score) {
      const st = s.score.stage_summary || {};
      const asleep = (st.total_light_sleep_time_milli || 0) + (st.total_slow_wave_sleep_time_milli || 0) + (st.total_rem_sleep_time_milli || 0);
      const bedStart = s.start ? Utilities.formatDate(new Date(s.start), CONFIG.TIME_ZONE, 'h:mm a') : '';
      const bedEnd = s.end ? Utilities.formatDate(new Date(s.end), CONFIG.TIME_ZONE, 'h:mm a') : '';
      lines.push('Sleep: ' + Math.floor(asleep / 3600000) + 'h ' + Math.round((asleep % 3600000) / 60000) + 'm asleep'
        + ' (in bed ' + bedStart + ' to ' + bedEnd + ')'
        + ', performance ' + Math.round(s.score.sleep_performance_percentage) + '%'
        + ', efficiency ' + Math.round(s.score.sleep_efficiency_percentage) + '%'
        + ', ' + (st.disturbance_count || 0) + ' disturbances');
    } else {
      lines.push('Sleep: not scored yet');
    }

    // Strain from the last COMPLETED cycle (end is null while a day is in progress).
    const cy = whoopGet_('/v2/cycle?limit=3', token);
    const c = cy && cy.records && cy.records.filter(function (x) {
      return x.end && x.score_state === 'SCORED' && x.score;
    })[0];
    if (c) lines.push('Yesterday\'s strain: ' + c.score.strain.toFixed(1) + ' out of 21');

    return 'WHOOP:\n' + lines.join('\n');
  } catch (err) {
    return 'WHOOP: (unavailable, ' + err + ')';
  }
}

function debugWhoop() {
  const props = PropertiesService.getScriptProperties();
  Logger.log('refresh token stored: ' + (props.getProperty('whoopRefresh') ? 'yes' : 'NO'));
  try {
    const token = whoopAccessToken_();
    Logger.log('access token: ok');
    ['/v2/recovery?limit=1', '/v2/activity/sleep?limit=1', '/v2/cycle?limit=1'].forEach(function (p) {
      const res = UrlFetchApp.fetch(CONFIG.WHOOP_API_BASE + p, {
        headers: { Authorization: 'Bearer ' + token }, muteHttpExceptions: true,
      });
      Logger.log(p + '  ->  ' + res.getResponseCode() + '  ' + res.getContentText().slice(0, 400));
    });
  } catch (err) {
    Logger.log('ERROR: ' + err);
  }
  Logger.log('--- block passed to the model ---\n' + getWhoopBlock_(new Date()));
}

// ===================== NON-REPETITION STATE =====================
function getState_() {
  const raw = PropertiesService.getScriptProperties().getProperty('briefState');
  const s = raw ? JSON.parse(raw) : {};
  return { quotes: s.quotes || [], recentTitles: s.recentTitles || [] };
}

function saveState_(quote, titlesToday, state) {
  const quotes = [quote].concat(state.quotes).slice(0, 7);
  let titles = dedupe_(titlesToday.concat(state.recentTitles)).slice(0, 80);
  let payload = JSON.stringify({ quotes: quotes, recentTitles: titles });
  while (payload.length > 8500 && titles.length > 10) {
    titles = titles.slice(0, titles.length - 10);
    payload = JSON.stringify({ quotes: quotes, recentTitles: titles });
  }
  PropertiesService.getScriptProperties().setProperty('briefState', payload);
}

function pickRotating_(arr, doy, recent) {
  const idx = doy % arr.length;
  for (let n = 0; n < arr.length; n++) {
    const cand = arr[(idx + n) % arr.length];
    if (recent.indexOf(cand) === -1) return cand;
  }
  return arr[idx];
}

function dedupe_(a) { const seen = {}; return a.filter(function (x) { if (seen[x]) return false; seen[x] = 1; return true; }); }
function dayOfYear_(d) { return Math.floor((d - new Date(d.getFullYear(), 0, 0)) / 86400000); }

// ========================= ANTHROPIC ============================
function buildUserMessage_(dateLong, location, events, weather, newsletters, material, skip, quote, lens, habits, lang, cultureItem) {
  return [
    'DATE: ' + dateLong + '. CURRENT LOCATION: ' + location.name + ' (Time Zone: ' + location.tz + ').',
    'GROUND TRUTH TIME RULES:',
    '- All calendar events and football kickoff times below are ALREADY converted to local time in ' + location.name + '. State them exactly as given. Never add, subtract, or mention time zone offsets.',
    '- Tennis comes from news headlines and carries NO exact times. Never invent a time for a tennis match.',
    '',
    'CALENDAR (keep these 12-hour times exactly):',
    events,
    '',
    weather,
    '',
    'MY INVESTMENT NEWSLETTERS (unread, source for the macro line):',
    newsletters,
    '',
    'MATERIAL (headlines, fixtures, papers, follow-ups, Whoop; your only source, do not invent beyond these):',
    material,
    '',
    'RECENTLY COVERED, DO NOT REPEAT:',
    (skip.length ? '- ' + skip.slice(0, 40).join('\n- ') : '(none yet)'),
    '',
    'TODAY\'S REFLECTION LENS: ' + lens,
    'TODAY\'S FEATURED HABITS (pick the ONE that best fits today): ' + habits.join('; '),
    'TODAY\'S LANGUAGE: ' + lang,
    'TODAY\'S CULTURE PACK (use directly): Fact: ' + cultureItem.fact + ' | Phrase: ' + cultureItem.phrase + ' ("' + cultureItem.meaning + '")',
    'DAILY QUOTE (place verbatim in the Reflection section): ' + quote,
  ].join('\n');
}

const SYSTEM_PROMPT = [
  'You write the reader\'s daily briefing. It is emailed and read aloud as a podcast by a warm British narrator. EDIT THIS LINE to describe the reader, for example an investor who supports a football club and is learning languages. Their current city is given in each message; never assume one.',
  '',
  'LENGTH IS THE PRIORITY. The whole brief must be UNDER ' + CONFIG.TARGET_WORDS + ' WORDS, about four minutes spoken. This is a hard ceiling, not a target to approach from below. Be ruthless: every section is one to three sentences. Cut adjectives, cut throat-clearing, cut anything that does not change what he does today. If a section has nothing worth saying, say so in four words and move on. Brevity beats completeness.',
  '',
  'TONE: warm, direct, spoken. Short sentences. Never stiff, never padded.',
  '',
  'FORMAT: Start each section with "### " then the title. Use "- " lines only where a list is genuinely clearer. Do not repeat the section title inside the text.',
  '',
  'AUDIO RULES:',
  '- Never open with the words "Good morning". Start straight with the day and date.',
  '- Speak foreign words ONCE in Latin letters. No bracketed phonetics, no repetition.',
  '',
  'SECTIONS, in this exact order:',
  '### Good Morning  (Two sentences. The day and date, then the wake-up routine: morning light, cold last minute of the shower, no phone until after. Add the ONE featured habit that best fits today. Nothing else.)',
  '### The Day Ahead  (Weather first, in one short clause from the WEATHER line. Then the calendar: only the items that matter, with their times, and one clause of prep for the most demanding one. Skip trivial entries. No sports here, ever.)',
  '### Whoop  (Two sentences max. Recovery, sleep hours, and what that means for today, briefly tied to yesterday if there is an obvious cause. If the WHOOP block says stale, not scored, not configured, or unavailable, say in four words that recovery is not scored yet and give one line of general guidance. Never present a stale figure as last night.)',
  '### Follow-Ups  (One or two lines. Only genuinely pending emails and tasks. If none, say "nothing pending" and move on.)',
  '### Markets  (One sentence of macro. Then name ONLY the holdings with real news today, at most four, one short clause each. Do not list holdings that are quiet. If nothing moved, say the book is quiet in one line.)',
  '### Geopolitics  (One or two sentences. Only what matters for the Middle East and Lebanon, Europe and Greece, or markets.)',
  '### Entertainment  (The ONLY section with sports. One line for football fixtures with their times, one line for tennis, one clause for a notable film if there is one. If a block reports nothing, say so in a few words. Never invent a fixture or a time.)',
  '### Science  (One sentence: the single most interesting item, or one arXiv paper finding. Not both.)',
  '### Language  (One sentence: the provided fact, compressed, then the phrase and its meaning.)',
  '### Reflection  (Two sentences on today\'s lens, tied to something concrete from today. Then the daily quote verbatim on its own line.)',
  '',
  'CLOSING (not a header): One short send-off, then "Good morning" once in today\'s language.',
  '',
  'HARD RULES: Never use em dashes or en dashes, use commas or the word "to". Stay under ' + CONFIG.TARGET_WORDS + ' words.',
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
      html += '<h3 style="font-size:14px;letter-spacing:.5px;color:#0b5;margin:16px 0 5px">' + esc_(line.slice(4)) + '</h3>';
    } else if (line.indexOf('- ') === 0) {
      if (!inList) { html += '<ul style="margin:0 0 8px;padding-left:18px">'; inList = true; }
      html += '<li style="margin:3px 0">' + boldLead_(esc_(line.slice(2))) + '</li>';
    } else {
      closeList();
      html += '<p style="margin:0 0 9px">' + boldLead_(esc_(line)) + '</p>';
    }
  });
  closeList();
  return '<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:640px;margin:0 auto;color:#1a1a1a;line-height:1.5;font-size:14px">' + html + '</div>';
}

function boldLead_(s) {
  const m = s.match(/^([^:]{1,28}):\s(.*)$/);
  return m ? '<b>' + m[1] + ':</b> ' + m[2] : s;
}

function renderAudio_(text) {
  let t = text
    .replace(/^###\s*.*$/gm, '')
    .replace(/^-\s*/gm, '')
    .replace(/\n{2,}/g, '. ')
    .replace(/\n/g, '. ')
    .replace(/\.\s*\.\s*/g, '. ')
    .replace(/\s+/g, ' ')
    .trim();
  if (t.length > CONFIG.MAX_AUDIO_CHARS) t = t.slice(0, CONFIG.MAX_AUDIO_CHARS);
  return t;
}

function stripTags_(html) { return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(); }
function makeSummary_(script) { return renderAudio_(script).slice(0, 300).trim() + '...'; }
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
  const content = Utilities.base64Encode(blob.getBytes());

  for (let attempt = 1; attempt <= 2; attempt++) {
    // Look up the current file, if any, so its sha can be passed when overwriting.
    let sha = null;
    const getRes = UrlFetchApp.fetch(githubApi_(fileName) + '?ref=' + CONFIG.GITHUB_BRANCH, { headers: headers, muteHttpExceptions: true });
    if (getRes.getResponseCode() === 200) sha = JSON.parse(getRes.getContentText()).sha;

    const payload = { message: 'Add ' + fileName, content: content, branch: CONFIG.GITHUB_BRANCH };
    if (sha) payload.sha = sha;
    const putRes = UrlFetchApp.fetch(githubApi_(fileName), {
      method: 'put', headers: headers, contentType: 'application/json',
      payload: JSON.stringify(payload), muteHttpExceptions: true,
    });

    const code = putRes.getResponseCode();
    if (code < 300) return;
    // 409 or 422 means the file changed between the lookup and the write. Look it up again once.
    if ((code === 409 || code === 422) && attempt === 1) { Utilities.sleep(2000); continue; }
    throw new Error('GitHub upload failed: ' + putRes.getContentText());
  }
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

// ==================== PODCAST RSS AND WEBHOOK ===================
function doGet(e) {
  if (e && e.parameter && e.parameter.code) {          // Whoop OAuth callback
    return ContentService.createTextOutput(whoopHandleCallback_(e));
  }
  return ContentService.createTextOutput(buildRssXml_(getOrCreateFolder_())).setMimeType(ContentService.MimeType.RSS);
}

// Whoop webhook. The once-per-day guard lives inside sendMorningBrief, so this
// and the time trigger can never produce two briefs in the same day.
function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return ContentService.createTextOutput('No payload received');
    }
    const payload = JSON.parse(e.postData.contents);
    if (payload.type === 'sleep.updated' || payload.type === 'recovery.updated') {
      sendMorningBrief();
      return ContentService.createTextOutput('Brief triggered via Whoop webhook');
    }
    return ContentService.createTextOutput('Ignored event: ' + payload.type);
  } catch (err) {
    Logger.log('Webhook error: ' + err);
    return ContentService.createTextOutput('Error processing webhook: ' + err);
  }
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

// Forces a run even if today's brief already went out. Use this for testing.
function forceRun() {
  PropertiesService.getScriptProperties().deleteProperty('lastRunDate');
  sendMorningBrief();
}

// Safety net that follows you across time zones. It runs every hour and only
// generates once YOUR local time (from the calendar) has passed SEND_HOUR:SEND_MINUTE.
// The once-per-day guard in sendMorningBrief makes all later hours exit instantly.
function hourlySafetyNet() {
  const now = new Date();
  const loc = detectCurrentLocation_(now);
  const localMinutes = parseInt(Utilities.formatDate(now, loc.tz, 'H'), 10) * 60
                     + parseInt(Utilities.formatDate(now, loc.tz, 'm'), 10);
  if (localMinutes >= CONFIG.SEND_HOUR * 60 + CONFIG.SEND_MINUTE) sendMorningBrief();
}

// Replaces any old fixed-hour trigger with the hourly, location-aware safety net.
function createDailyTrigger() {
  removeAllTimeTriggers();
  ScriptApp.newTrigger('hourlySafetyNet').timeBased().everyHours(1).create();
  Logger.log('Hourly safety net set; it fires once local time passes ' + CONFIG.SEND_HOUR + ':' + CONFIG.SEND_MINUTE + '.');
}

function debugLocation() {
  Logger.log(JSON.stringify(detectCurrentLocation_(new Date())));
}

function removeAllTimeTriggers() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    const fn = t.getHandlerFunction();
    if (fn === 'sendMorningBrief' || fn === 'hourlySafetyNet') ScriptApp.deleteTrigger(t);
  });
  Logger.log('All brief triggers deleted.');
}
