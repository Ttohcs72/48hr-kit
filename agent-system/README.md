# AssetForge Marketing Agent Team

An autonomous multi-platform social media system: point it at a business's
website, and it researches trends, plans a content calendar, writes
platform-native posts for X, LinkedIn, Facebook, Instagram, TikTok, and
Pinterest, has a Brand Guardian AI check every single one against the
business's real facts and voice, publishes the approved ones on schedule,
and tracks what performs so future posts get better.

## How the pieces fit together

```
 ┌─────────────────────┐
 │ Business Analyzer    │  reads the business's real website →
 │ agent                 │  BusinessProfile (voice, offers, real claims,
 └──────────┬───────────┘  banned topics) saved to Supabase
            │
 ┌──────────▼───────────┐
 │ Trend Research agent  │  live web search (falls back to model
 └──────────┬───────────┘  knowledge) for what's working right now per platform
            │
 ┌──────────▼───────────┐
 │ Strategist agent      │  builds content pillars + a daily,
 └──────────┬───────────┘  multi-platform posting calendar
            │
 ┌──────────▼───────────┐
 │ Platform copywriter   │  one "expert per platform" persona (see
 │ agent                 │  src/agents/platformPersonas.ts) drafts each post
 └──────────┬───────────┘
            │
 ┌──────────▼───────────┐
 │ Brand Guardian agent  │  the master verifier: checks every draft against
 │ (master AI)            │  the business's real facts, voice, banned topics,
 └──────────┬───────────┘  and platform norms. Approves, sends back for
            │              revision, or escalates to a human.
 ┌──────────▼───────────┐
 │ Publisher              │  posts approved + due content to the real
 └──────────┬───────────┘  platform APIs on schedule
            │
 ┌──────────▼───────────┐
 │ Analytics agent        │  pulls real engagement numbers, extracts
 └──────────┬───────────┘  "learnings", feeds them back into the Strategist
            │
            └──────────────► loop continues, informed by what actually worked
```

Every agent is a Claude call with a specific system prompt (see
`src/agents/`); every hand-off between agents happens through the Supabase
database (see `src/db/schema.sql`), not in-memory — because each pipeline
stage runs as a separate, short-lived GitHub Actions job with no shared
process. The database is the system's memory.

## What each file does

| File | What it's for |
|---|---|
| `src/lib/config.ts` | Reads and validates every secret/setting once, so a missing key fails loudly at startup instead of deep inside an API call. |
| `src/lib/claude.ts` | The one place every agent calls Claude through — text calls, JSON calls (with retry-on-bad-JSON), and web-search-grounded calls. |
| `src/lib/webScraper.ts` | Fetches a business's website and strips it to clean text for the Business Analyzer. |
| `src/db/schema.sql` | The full Postgres schema — run once in Supabase. This is the system's shared memory. |
| `src/db/client.ts` | Every typed DB read/write, so agents never touch raw SQL/Supabase calls directly. |
| `src/agents/businessAnalyzerAgent.ts` | "Enter any business website" — turns it into a structured `BusinessProfile`. |
| `src/agents/trendResearchAgent.ts` | Surfaces current trend angles per platform, scoped to this business. |
| `src/agents/strategistAgent.ts` | Builds content pillars and the actual daily/multi-platform posting calendar. |
| `src/agents/platformPersonas.ts` | The platform expertise knowledge base — format rules, char limits, hashtag conventions, hook style per platform. |
| `src/agents/platformCopywriterAgent.ts` | Turns one calendar entry into a real post draft, using the right platform persona. |
| `src/agents/brandGuardianAgent.ts` | **The master verification agent.** Checks every draft against real business facts, brand voice, banned topics, and platform norms before it's allowed to publish. |
| `src/agents/analyticsAgent.ts` | Turns "what performed best" into plain-language lessons for the Strategist to read next time — this is the improvement loop. |
| `src/agents/visualAgent.ts` | Generates the actual image for Instagram/Pinterest posts from the copywriter's `mediaBrief`, using `src/lib/imageGen.ts` (OpenAI Images API) and `src/lib/storage.ts` (Supabase Storage). TikTok is out of scope here — it needs real video. |
| `src/platforms/*.ts` | One connector per platform (X, LinkedIn, Meta/Facebook/Instagram, TikTok, Pinterest) behind a shared `publish()`/`fetchMetrics()` interface. Runs in dry-run/log-only mode automatically if that platform's keys aren't set. |
| `src/orchestrator/runBusinessAnalysis.ts` | Entry point 1: analyze the business website (run once, and monthly after). |
| `src/orchestrator/runContentGeneration.ts` | Entry point 2: the full plan → write → verify pipeline (run weekly). |
| `src/orchestrator/runPublisher.ts` | Entry point 3: publishes whatever is due and approved (run every 30 min). |
| `src/orchestrator/runAnalyticsSync.ts` | Entry point 4: pulls metrics and extracts learnings (run daily). |
| `src/orchestrator/runVisualGeneration.ts` | Entry point 5: generates and attaches images for Instagram/Pinterest posts waiting on media (run weekly, after content generation). No-ops cleanly if `OPENAI_API_KEY` isn't set. |
| `.github/workflows/*.yml` | The scheduler — GitHub Actions runs these five scripts on a cron so nothing needs a server. |
| `dashboard.html` | The human-in-the-loop review UI (see below). |

## Setup

1. **Supabase** (free tier): create a project at supabase.com, open the SQL
   editor, and run `src/db/schema.sql`. Copy the Project URL, the
   `service_role` key, and the `anon` key from Settings → API.
2. **Anthropic**: get an API key at console.anthropic.com.
3. Copy `.env.example` to `.env` and fill in `ANTHROPIC_API_KEY`,
   `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `BUSINESS_WEBSITE_URL`,
   `BUSINESS_SLUG`.
4. `npm install`, then `npm run analyze-business` to do the first website
   read, then `npm run generate-calendar` to produce your first batch of
   drafts. With `AUTO_PUBLISH_ENABLED=false` (the default) nothing goes out
   anywhere yet — everything lands as `needs_human_review` for you to look
   at.
5. Open `dashboard.html` (any static file server, or just the file:// path
   locally) and paste your Supabase URL + anon key in Settings to see the
   drafts.
6. For real posting, add each platform's credentials to `.env` — see the
   comments in `.env.example` for exactly which developer portal and which
   permissions each one needs.
7. Optional — automated Instagram/Pinterest images: get an `OPENAI_API_KEY`,
   and in the Supabase dashboard create a **public** Storage bucket named
   `post-media` (Storage → New bucket → toggle Public). Then
   `npm run generate-visuals`.
8. For hands-free operation: add all the same values as GitHub Actions
   **repository secrets** (tokens/keys) and **repository variables**
   (non-secret config like `BUSINESS_SLUG`, `ACTIVE_PLATFORMS`) — Settings →
   Secrets and variables → Actions, both tabs. The five workflows in
   `.github/workflows/` then run on their own schedule.

## Getting your first real post out: X (Twitter)

X has the fastest developer approval of any platform this system supports,
so it's the fastest way to see the whole pipeline — analyze, plan, write,
verify, publish — go end to end against a real account. The connector code
(`src/platforms/x.ts`) is already built; this is the account-side setup
only you can do (it requires your own X login and agreeing to X's
Developer Agreement):

1. Go to developer.x.com and sign in with the X account you want to post
   from. Apply for a developer account (usually near-instant for basic
   access).
2. Create a **Project** and an **App** inside it.
3. In the App's **User authentication settings**, turn on OAuth 1.0a, set
   **App permissions** to **Read and Write** (critical — it defaults to
   read-only), and fill in a placeholder callback URL/website if asked
   (e.g. your `BUSINESS_WEBSITE_URL`) — this system doesn't use the OAuth
   web flow, but X requires these fields to be filled to save the settings.
4. From the App's **Keys and tokens** tab: generate/copy the **API Key**
   and **API Key Secret**, then generate an **Access Token and Secret**
   (make sure you do this *after* step 3, so the token is generated with
   Read+Write permission — regenerate it if you flipped permissions after
   the fact).
5. Put those four values in `.env` (or as GitHub Actions secrets) as
   `X_API_KEY`, `X_API_SECRET`, `X_ACCESS_TOKEN`, `X_ACCESS_SECRET`.
6. Run `npm run generate-calendar`, approve an X post in `dashboard.html`
   (or set `AUTO_PUBLISH_ENABLED=true` once you trust it), then
   `npm run publish`. Without those four env vars set, the exact same
   command runs in dry-run mode and just logs what it would have posted —
   so you can sanity-check the pipeline before wiring up real credentials.

## Turning on autonomy

`AUTO_PUBLISH_ENABLED=false` is the default on purpose. In that mode,
Brand Guardian still reviews everything, but *nothing* is marked
`approved` automatically — every post, even a perfect one, waits in
`dashboard.html` for a human click. This is the mode to run in for at
least the first couple of weeks, so you can see what the agent team
actually produces before trusting it.

To flip it on: set `AUTO_PUBLISH_ENABLED=true` and pick
`AUTO_PUBLISH_MIN_SCORE` (default 90/100). From then on, a post publishes
without a human touching it only if **both** are true: Brand Guardian
approved it AND its confidence score cleared your bar. Anything Brand
Guardian itself flags as `needsHumanReview` — compliance-adjacent claims,
anything it's not fully sure about — still stops for a human regardless of
score. That escape hatch is intentional; don't remove it.

## What "95% hands-free" actually means here

Once running, these steps require zero human input:
- Reading the business's website and re-reading it monthly for changes
- Researching trends and planning the calendar
- Writing every platform's post in that platform's native style
- Verifying every post against the business's real facts and voice
- Publishing on schedule
- Pulling engagement data and extracting lessons that improve future content

The ~5% that stays human, and why it can't be automated away:
1. **One-time platform app setup.** Every platform requires a human to
   register a developer app under a real business identity and grant OAuth
   permissions — this is each platform's Terms of Service, not a technical
   limitation this system can code around.
2. **Meta and TikTok app review.** Both require a human to submit the app
   for manual review before autonomous posting permissions are granted.
   Budget 1-2 weeks for Meta, similar for TikTok's Content Posting API audit.
3. **Visual assets — mostly automated, TikTok is the exception.** Instagram,
   TikTok, and Pinterest cannot accept a text-only post — the
   Graph/TikTok/Pinterest APIs reject it outright. `runVisualGeneration.ts`
   generates and attaches real images for Instagram/Pinterest automatically;
   TikTok still needs a human to produce and attach a video. See "Visual
   content" below.
4. **The confidence safety valve.** Brand Guardian intentionally escalates
   instead of guessing when it's unsure. Raising `AUTO_PUBLISH_MIN_SCORE`
   trades hands-free-ness for safety; that's a business decision, not
   something to automate away.
5. **Token refresh.** Some platform tokens (notably Meta's long-lived page
   token) expire and need periodic manual renewal unless you build a
   refresh-token rotation job — not included here, noted as a next step.

## Visual content

- **Instagram & Pinterest (automated):** `runVisualGeneration.ts` reads
  each waiting post's `mediaBrief`, generates a real image via OpenAI's
  Images API (`src/lib/imageGen.ts`), uploads it to a public Supabase
  Storage bucket (`src/lib/storage.ts`), and sets `mediaUrl` on the post.
  This does **not** skip human review: the post stays at
  `needs_human_review`, so `dashboard.html` now shows the actual generated
  image next to the caption, and a human still clicks Approve or Reject —
  the quality gate is "look at the real picture before it goes out," not
  "trust the model blindly." Requires `OPENAI_API_KEY` and a public
  Supabase Storage bucket named `post-media` (create once: Supabase
  dashboard → Storage → New bucket → toggle Public). Without
  `OPENAI_API_KEY` set, this step no-ops and posts fall back to the manual
  path below.
- **TikTok (manual, on purpose):** TikTok needs real video, not a
  generated image — video generation is a meaningfully heavier, higher-cost,
  lower-reliability problem than image generation, so it's intentionally
  not automated here. A `mediaBrief` shows up in `dashboard.html`; a human
  (or a video generation pipeline you plug in later) creates and uploads
  the actual clip somewhere public, and pastes the URL into the dashboard
  to unblock that post.

## Runtime realities of GitHub Actions scheduling

`schedule` triggers in GitHub Actions are best-effort: GitHub's own docs
say scheduled runs can be delayed during high load, and a workflow's
schedule is automatically disabled after 60 days with no repository
activity (any commit resets that clock). For a system meant to post
"multiple times daily," this is fine — a 10-20 minute slip on a 30-minute
cron doesn't matter. It's not a fit if you need second-precision posting.

## Cost

Every agent call is a Claude API call; a full weekly `generate-calendar`
run (default: 7 days × 2 posts/platform/day × 6 platforms = 84 posts, each
with up to 3 Brand Guardian passes) is on the order of 150-250 Claude
calls. Monitor usage in the Anthropic console for the first few runs to see
real numbers for your calendar size before scaling `CONTENT_CALENDAR_DAYS`
or `POSTS_PER_PLATFORM_PER_DAY` up.

## Things to think about before scaling this up

- **Rate limits and posting cadence.** Every platform throttles API
  posting frequency and penalizes spammy cadence in its own algorithm.
  "Multiple times daily" across 6 platforms is realistic; more than that
  per platform risks looking automated and getting suppressed, not just
  rate-limited.
- **UTM tagging / link tracking.** `primaryCtaUrl` currently points straight
  at the business's site. Add UTM parameters per platform+post (a small
  change to the copywriter/connector layer) if you want to attribute
  traffic and sales back to specific posts in your website analytics —
  right now this system tracks *engagement*, not *conversions*.
- **Legal/compliance review cadence.** Brand Guardian catches obvious
  overclaiming, but have a human periodically spot-check a sample of
  auto-published posts, especially early on and especially for any
  regulated claims (pricing, guarantees, testimonials).
- **Crisis/pause switch.** If something goes wrong (a bad post got
  through, a PR situation), the fastest kill switch is disabling the
  `publish-scheduler.yml` workflow in the GitHub Actions UI, or flipping
  `AUTO_PUBLISH_ENABLED` back to `false` as a repository variable.
- **Multi-business reuse.** `BUSINESS_SLUG`/`BUSINESS_WEBSITE_URL` are the
  only business-specific config — running this for a second business is a
  second set of repo variables/secrets (or a second Supabase project),
  reusing all the same code.
- **Image/video generation**, discussed above — the biggest missing piece
  for full autonomy on Instagram/TikTok/Pinterest specifically.
