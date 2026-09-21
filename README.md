# Morning Brief (v5.0)

A single Google Apps Script that writes a personal daily briefing, emails it to you, and publishes the same text as a private podcast episode you can play hands-free ("Hey Siri, play Morning Brief"). It runs entirely on Google's servers, needs no machine of your own, and costs roughly 1 to 3 USD a month.

The brief is capped at about **600 words, roughly 4 minutes of listening**, and is generated **once per day, as soon as your Whoop has scored your recovery**, with a location-aware fallback if no Whoop signal arrives.

## What's in each brief

| Section | Source |
|---|---|
| **Good Morning** | Date, a fixed wake-up routine, one rotating brain habit |
| **The Day Ahead** | Today's weather, then your Google Calendar with 12-hour local times |
| **Whoop** | Recovery, HRV, sleep, and yesterday's strain, tied to yesterday's calendar |
| **Follow-Ups** | Unread emails awaiting a reply and Google Tasks due soon |
| **Markets** | One line of macro from your newsletters, then only the holdings with real news (max four) |
| **Geopolitics** | The few items that matter for your regions |
| **Entertainment** | Football fixtures with exact local kickoff times, tennis results for tracked players, notable films |
| **Science** | One striking research item or arXiv paper |
| **Language** | A culture fact and a phrase in a language you are learning (rotates daily) |
| **Reflection** | A short reflection on a rotating theme, then a daily quote |

Quotes, themes, habits, and languages rotate by day, and recently covered news titles are remembered and skipped, so consecutive days do not repeat.

## How it works

```
Whoop scores your recovery ──► webhook ──► doPost ─┐
                                                    ├─► sendMorningBrief()  (script lock, once per day)
Hourly trigger ──► hourlySafetyNet  ────────────────┘      │
   (fires only once YOUR local time passes 10:30)          │
                                                           ├─ location   ◄─ Google Calendar + Open-Meteo geocoder
                                                           ├─ weather    ◄─ Open-Meteo forecast (free, no key)
                                                           ├─ calendar, tasks, newsletters, follow-ups ◄─ Google
                                                           ├─ holdings, geopolitics, science ◄─ Google News RSS + arXiv
                                                           ├─ football ◄─ football-data.org   tennis ◄─ news headlines
                                                           ├─ recovery, sleep, strain ◄─ Whoop API (OAuth)
                                                           ├─ ONE Anthropic call writes the whole brief
                                                           ├─ Gmail sends it
                                                           └─ Google Cloud TTS reads it ─► MP3 ─► GitHub ─► RSS feed (doGet)
```

### Location is read from your calendar, never hardcoded

No city, coordinate, or time zone appears in the code. Each run works out where you are:

1. **Most recent trip wins.** It reads an arrow in an event's location or title (`Beirut (Rafic Hariri Intl) → Dubai (Dubai Intl)`), or "to X" in a travel title (`Flight to Dubai`, `✈️ Leave to Lisbon`).
2. **Otherwise, majority vote** of the cities in your last five located events (`Office, Beirut`, `Mövenpick Beirut`).
3. **Otherwise, the last city found.** On the very first run with an empty calendar, your calendar's own time zone.

Place names are resolved with Open-Meteo's free geocoder into coordinates and an IANA time zone. Country names are never mistaken for towns (so "Greece" is not read as Greece, New York), and a country at the end of an address narrows the search. Every time in the brief, including calendar events, football kickoffs, and Whoop sleep times, is shown in that city's local time.

### Exactly one brief per day

Whoop sends several webhooks in quick succession, and it retries slow deliveries. A script lock makes the "already sent today?" check atomic, so only one brief is generated no matter how many triggers fire. Once the email has gone out, a later failure (for example an audio upload error) can never cause a second copy.

## Cost

| Component | Cost |
|---|---|
| Anthropic API, one call per day, no paid web search | about 1 to 3 USD per month |
| Google Cloud Text-to-Speech (Chirp 3 HD voice) | free under 1,000,000 characters per month; a brief uses about 4,500 |
| Open-Meteo forecast and geocoding | free for non-commercial use, no key |
| Google News RSS, arXiv RSS | free |
| football-data.org | free tier |
| Whoop developer API | free for personal apps |
| GitHub hosting, Google Apps Script | free |

## Prerequisites

1. **Anthropic** API key.
2. **Google Cloud Text-to-Speech** API key. Create a Cloud project, attach a billing account (required even inside the free tier), enable the Text-to-Speech API, and create an API key restricted to it.
3. **football-data.org** free token.
4. **Whoop developer app** at developer.whoop.com with scopes `read:recovery`, `read:sleep`, `read:cycles`. The app needs a privacy policy URL (see `PRIVACY.md` in this repo for an example).
5. **GitHub** public repository to hold the audio, plus a fine-grained Personal Access Token scoped to that one repo with **Contents: Read and write**.

## Setup

1. Create a project at [script.google.com](https://script.google.com) and paste in `MorningBrief.gs`.
2. **Services +** → add the **Tasks API** advanced service.
3. Fill in every `PASTE_...` value in `CONFIG`, set `RECIPIENT`, edit the persona line in `SYSTEM_PROMPT`, and replace `QUOTES`, `MANIFESTO_ANGLES`, `HOLDINGS`, `TENNIS_PLAYERS`, and `LANGUAGES` with your own.
4. **Deploy → New deployment → Web app**, Execute as **Me**, access **Anyone**. Copy the `/exec` URL. It is three things at once: your podcast feed, your Whoop OAuth redirect, and your Whoop webhook endpoint.
5. In the Whoop developer app, set the **Redirect URL** and add a **Webhook** (model version V2), both to that `/exec` URL. Put the same URL in `WHOOP_REDIRECT_URI`.
6. Run `whoopAuthUrl`, open the logged link, approve. You should see "Whoop connected."
7. Run `createDailyTrigger` once. It installs the hourly, location-aware safety net.
8. Run `debugLocation` and `debugWeather` to confirm your city, then `forceRun` to generate today's brief.
9. In your podcast app, add a show by URL and paste the `/exec` URL. In Apple Podcasts: Library → ⋯ → **Add a Show by URL**.

**Any change to `doGet` or `doPost` only goes live after Deploy → Manage deployments → Edit → New version.** The hourly trigger always runs your latest saved code.

## Configuration reference

| Setting | What it controls |
|---|---|
| `MODEL` | Anthropic model |
| `SEND_HOUR`, `SEND_MINUTE` | Local time after which the hourly safety net generates, wherever you are |
| `SKIP_WEEKENDS` | Skip Saturdays and Sundays (checked by day number, so it works in any locale) |
| `TRAVEL_LOOKBACK_DAYS`, `LOCATION_VOTES`, `MIN_CITY_POPULATION` | How location is inferred from your calendar |
| `TARGET_WORDS`, `MAX_TOKENS`, `MAX_AUDIO_CHARS` | Length of the brief. Move all three together |
| `TTS_LANG`, `TTS_VOICE` | Narrator voice. Defaults to a British female Chirp 3 HD voice |
| `NEWSLETTER_QUERY`, `MAX_NEWSLETTERS` | Which unread newsletters feed the markets section |
| `HOLDINGS`, `TOPICS`, `ARXIV` | Companies, news topics, and paper categories |
| `LIVERPOOL_TEAM_ID`, `TENNIS_PLAYERS` | The club and players you follow |
| `LANGUAGES`, `CULTURE_NOTES` | Languages you are learning and their daily culture packs |
| `QUOTES`, `MANIFESTO_ANGLES`, `HABITS` | Rotating personal content |
| `RETENTION_DAYS` | Episodes older than this are deleted from Drive and GitHub |

## Helper functions

| Function | Use |
|---|---|
| `testRun` | Runs the brief, respecting the once-per-day guard |
| `forceRun` | Clears today's guard and regenerates |
| `debugLocation` | Logs the city and time zone the script believes you are in |
| `debugWeather` | Logs today's weather line |
| `debugWhoop` | Logs raw Whoop responses and the block passed to the model |
| `debugTennis` | Logs the tennis block |
| `createDailyTrigger` | Installs the hourly location-aware safety net (replaces any older trigger) |
| `removeAllTimeTriggers` | Removes all brief triggers |

## Privacy

Podcast apps must fetch the MP3 without logging in, so audio is stored in a **public** GitHub repo. The brief mentions your schedule and holdings, so use a non-obvious repo name and keep `RETENTION_DAYS` short. Only recent episodes ever exist. For stronger privacy, host the audio on a separate account or on object storage with random keys.

**Never commit your filled-in script.** Keys and tokens belong only in your Apps Script project. The web app accepts unauthenticated POSTs; the daily guard limits any abuse to one extra run per day at most.

## Troubleshooting

| Symptom | Cause and fix |
|---|---|
| Several briefs on the same morning | You are running code older than v5. Update and redeploy a new version |
| `GitHub upload failed ... "sha" wasn't supplied` | Two runs raced on the same file. Fixed in v5 by the lock and an upload retry |
| `debugLocation` shows "your calendar time zone" | No trip or located event in the last `TRAVEL_LOOKBACK_DAYS`. Add the route to your flight's location, e.g. `Athens → Beirut` |
| Wrong city after landing | The trip's destination names a country, not a city. Put the city in the location field |
| Whoop section says recovery is not scored | The brief ran before Whoop finished scoring. The webhook normally prevents this |
| Podcast app rejects the feed | The audio host is not returning a raw MP3. GitHub raw URLs work; Google Drive links do not |
| `TTS error` naming the voice | Chirp 3 HD voice names vary by region. Try another, or fall back to a Neural2 voice |
| Tasks line says the service is not enabled | Add the Tasks API advanced service (setup step 2) |

## Version history

| Version | Changes |
|---|---|
| **v5.0** | Location inferred from Google Calendar and geocoded, nothing hardcoded. Hourly safety net fires on local time wherever you are. Script lock makes the daily guard race-proof. GitHub upload retries on conflict |
| v4.0 | Four-minute brief (about 600 words). Weather added via Open-Meteo. Only holdings with news are mentioned |
| v3.0 | Whoop webhook as the primary trigger, shared once-per-day guard, locale-proof weekend skip, no hardcoded tennis fixtures |
| v2.0 | Whoop integration, structured football fixtures, arXiv papers, follow-ups, language section, GitHub-hosted podcast |
| v1.0 | Daily email briefing |

## Disclaimer

A personal automation template shared as-is, with no warranty. You are responsible for your own API usage and costs, for each provider's terms, and for what you publish. Nothing it produces is financial advice.
