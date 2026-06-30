# Morning Brief

A single Google Apps Script that builds a personal daily briefing every morning, on Google's servers, with no machine of your own left running. It emails the briefing to you and publishes the same content as a private podcast you can ask Siri (or any podcast app) to play when you wake up.

One model call writes everything. There is no paid web search: free RSS feeds supply the raw material, and the language model only curates and writes. Total running cost is a few dollars a month.

## What it produces

Each morning the brief contains:

- **Good Morning**: a greeting, a short wake-up routine, your featured brain habits, and an end-of-day reflection question.
- **The Day Ahead**: your Google Calendar events in 12-hour times.
- **Follow-Ups**: unread emails awaiting a reply, and Google Tasks due soon or overdue.
- **Markets and Holdings**: a macro read from your unread investment newsletters plus one line of company-specific news for each holding you track.
- **Geopolitics**: the few items that matter most for your regions.
- **Entertainment**: new films in theaters, plus exact football and tennis fixtures for today (and overnight matches before 3 AM), grouped by competition or tournament.
- **Innovation and Science**: the most striking recent item across AI, Computer Science, Biotech, Physics, Chemistry and Engineering, including a named arXiv paper.
- **Reflection**: a short passage on a rotating theme drawn from your own values, ending with a daily quote.
- **Language and Culture**: a culture note and a useful word or phrase in a language you are learning, with a closing greeting in that language.

Quotes, reflection themes and featured habits rotate by day, and recently covered news is remembered and skipped, so consecutive days do not repeat.

## How it works

```
Google Apps Script (time-driven trigger, ~7am)
  ├─ reads Google Calendar, Gmail (newsletters + follow-ups), Google Tasks
  ├─ fetches free Google News RSS per topic and per holding
  ├─ fetches football-data.org and api-tennis.com fixtures
  ├─ fetches arXiv RSS for recent papers
  ├─ one Anthropic Messages API call writes the whole briefing
  ├─ emails it (HTML) via Gmail
  ├─ renders the same text to MP3 via Google Cloud Text-to-Speech
  ├─ uploads the MP3 to a public GitHub repo (podcast-friendly URL)
  └─ a published Web App (doGet) serves the podcast RSS feed
```

Everything runs inside Apps Script on Google's infrastructure, so it fires whether or not your own devices are on.

## Cost

| Component | Cost |
|---|---|
| Anthropic API (one call/day, no paid web search) | about 3 to 5 USD per month |
| Google Cloud Text-to-Speech (Chirp 3 HD) | free under the 1,000,000 characters/month tier |
| football-data.org | free tier |
| api-tennis.com | free tier |
| GitHub hosting | free |
| Google Apps Script | free |

## Prerequisites

You will need free accounts and keys for:

1. **Anthropic** API key, from the Anthropic Console.
2. **Google Cloud Text-to-Speech** API key. Create a Google Cloud project, enable billing on it (you stay inside the free tier, but the API requires a billing account attached), enable the Cloud Text-to-Speech API, and create an API key restricted to that API.
3. **football-data.org** free token (the free tier includes the World Cup and Premier League).
4. **api-tennis.com** free tier key.
5. **GitHub**: an account, a public repository to hold the audio, and a fine-grained Personal Access Token scoped to that one repo with Contents set to Read and write.

## Setup

1. Create a new project at [script.google.com](https://script.google.com) and paste in `MorningBrief.gs`.
2. In **Project Settings**, set the time zone to your own (the script uses it for scheduling and for all displayed times).
3. In the editor, click **Services +** and add the advanced **Tasks API** service (needed for the tasks-due-soon list).
4. Fill in every `PASTE_...` value in the `CONFIG` block, and set `RECIPIENT` to your email. Edit the persona line in `SYSTEM_PROMPT` to describe yourself, and replace the placeholder `QUOTES` with your own.
5. Create a public GitHub repo (use a non-obvious name) initialized with a README, and set `GITHUB_OWNER`, `GITHUB_REPO`, and a random `AUDIO_SLUG`.
6. Run the `testRun` function once and approve the authorization prompts. Confirm an email arrives, an MP3 lands in the `Morning Brief Audio` Drive folder, and a file appears under `audio/` in your GitHub repo.
7. **Deploy** the project: Deploy, New deployment, type **Web app**, Execute as **Me**, Who has access **Anyone**. Copy the Web app URL. That is your podcast feed.
8. In your podcast app, add a show by URL and paste that Web app URL. In Apple Podcasts: Library, the three-dot menu, **Add a Show by URL**.
9. Run the `createDailyTrigger` function once to schedule the daily run.

After this, a new episode appears every morning. With Apple Podcasts you can say, for example, "Hey Siri, play Morning Brief".

## Configuration reference

All settings live in the `CONFIG` object and a few arrays at the top of the file.

| Setting | What it controls |
|---|---|
| `MODEL` | Anthropic model. Sonnet is a good cost/quality balance. |
| `SEND_HOUR`, `TIME_ZONE` | When the daily trigger fires, in your time zone. |
| `TTS_LANG`, `TTS_VOICE` | The narrator voice. Defaults to a British female Chirp 3 HD voice. |
| `RETENTION_DAYS` | How many recent episodes to keep before auto-deleting. |
| `NEWSLETTER_QUERY` | Gmail search that selects which unread newsletters feed the markets section. |
| `HOLDINGS` | The stocks you want per-company news for. |
| `TOPICS`, `ARXIV` | News and academic-paper topics. |
| `LANGUAGES` | Languages you are learning; one is featured per day. |
| `TENNIS_PLAYERS`, `LIVERPOOL_TEAM_ID` | Sports you follow. |
| `QUOTES`, `MANIFESTO_ANGLES`, `HABITS` | The rotating personal content. Replace with your own. |
| `EMAIL_FOLLOWUP_QUERY` | Gmail search for emails needing a reply. |

## Privacy

The audio is hosted on a **public** GitHub repo, because podcast apps must fetch the MP3 without logging in. The briefing mentions your schedule and holdings, so:

- Use a non-obvious repository name and a random `AUDIO_SLUG`, which makes the file URLs unguessable.
- Episodes are auto-deleted from both Drive and GitHub after `RETENTION_DAYS`.

This stops casual discovery, but a public repo still appears on your GitHub profile. If you need it fully unlinked from your identity, host the audio on a separate throwaway GitHub account or on object storage with random keys (for example Cloudflare R2) instead.

## Notes and troubleshooting

- **Never commit your keys.** Keep real `CONFIG` values in your Apps Script project only. The version in this repo uses placeholders.
- **The deployed Web app serves the version you last deployed**, while the daily trigger runs your latest saved code. After changing anything that affects the feed (for example the audio URL), redeploy a new version.
- **Podcast app rejects the feed**: this almost always means the audio host is not returning a fetchable MP3. GitHub raw URLs work; older Google Drive direct links do not.
- **Voice name error in the log**: Chirp 3 HD voice names vary by region; try another British female name, or fall back to a Neural2 voice.
- **GitHub token expires** (fine-grained tokens have a max lifetime): when it does, only the audio upload fails and the script emails you a failure notice. Generate a new token and paste it in.
- **Tasks line says the service is not enabled**: add the advanced Tasks API service in the editor as in step 3.

## Disclaimer

This is a personal-automation template shared as-is, with no warranty. You are responsible for your own API usage and costs, for complying with each provider's terms, and for what you publish. The content the model produces is informational and is not financial advice.
