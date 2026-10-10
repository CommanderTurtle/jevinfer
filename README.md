# jev infer

A standalone, local-first Jev playground. Five experiments, one configurable NInfer endpoint. No runtime dependencies, CDN, telemetry, proxy, or cloud account.

```sh
bun start
```

Open **http://127.0.0.1:8198/**. Choose **Connect endpoint**, enter the origin of NInfer served with `--jev --cors`, and connect. The default is `http://alien.local:8000`. An optional API key stays in memory for the current tab only.

The site is ordinary HTML, CSS and ES modules. Any static HTTP server can host the directory, including under a subpath. There is no build step. The included Bun server serves only the page and its assets, on loopback. Set `PORT` to change its port. HTTPS pages may not call an HTTP LAN endpoint because of browser mixed-content restrictions.

## Experiments

- **Playground:** editable state and up to 32 Choice, Noul or Score questions; full percentage distributions, raw exchanges and JSON import/export. Run always requests a new inference. Noul displays P(true); confidence is displayed separately from a choice's probability.
- **Drive:** a retro three-lane road with traffic. Jev receives numeric lane sensors and chooses a lane and throttle. Rendering runs independently of inference; there is never more than one control request in flight. Commands older than 1.5 seconds are ignored and the car brakes. Manual arrow-key driving makes no inference requests. This is a game, not a vehicle controller.
- **Paint:** 8–128 square inference grids, three palettes, crisp pixels, probability blending or decorative pigment splatter. Requests group 16 independent pixel questions. PNG export supports 512–4096 pixels; scaling and splatter are rendering effects, not additional inferred detail. Painting quality depends on the served model; independently classified pixels are not a diffusion image generator.
- **Tornado:** a pink filament funnel with rotating row/result cards, drifting particles, ground spray, live operator bars and a result ticker around a real CSV/TSV/JSONL/JSON inference stream. Select columns and labels, then process one row per request. Portrait and immersive views change framing; Pause motion freezes the visual independently of inference. Idle cards are explicitly decorative; probabilities and timings only come from real responses. Stream Pause drains in-flight work and holds new dispatch; Stop cancels pending requests. Results and errors are journaled in IndexedDB and exported as JSONL. No trading, wallets, orders or profit simulations.
- **Chat:** paste or upload a chat transcript and replay it beside a buffered, filtered feed. The six-category preset (Question, Insight, Feedback, Funny, Noise, Spam) is editable; safety triage is also included. Configure context, criteria, kept categories, probability threshold and optional Noul/Score questions. Steady, burst and original-timestamp arrivals run independently of inference, using 1–32 concurrent individual-message requests. Slow responses grow the visible queue; out-of-order completions wait for earlier messages. There is no deduplication, answer caching, retry or overflow dropping. This is a local simulation, not a Twitch connection or moderation bot.

`/v1/systemone` is the default because it exposes complete distributions. `/v1/decision` is also supported, with selected scores explicitly marked rather than fabricated distributions.

## Data and storage

Tornado files are parsed incrementally, with bounded concurrent requests (default 2; selectable up to 8). There is no file-size cap or overflow-dropping queue, but browser storage capacity and request timeouts still apply. Individual records are limited to 256 KiB. JSON must be a top-level array of objects; JSONL must contain one object per line. CSV/TSV needs a header; quoted fields, embedded newlines and UTF-8 BOMs are supported. Duplicate/blank headers receive unique names. Malformed rows stop the reader with an error.

The column preview examines the first five rows. Only checked keys are sent, even if later records introduce other keys. Polymarket-style exports (for example `timestamp,slug,yes_bid,yes_ask,no_bid,no_ask`) need no special importer. The supplied sample is synthetic and labeled as such. Importing a file alone does not send it anywhere.

Completed CSV results are stored locally before their completion is counted. Storage failures stop the stream; endpoint failures are recorded per row. Five consecutive initial failures stop an otherwise unsuccessful run. Streaming export uses the browser's Save File Picker when available; other browsers have a 64 MiB in-memory export fallback. The latest run remains exportable after reload. Older runs remain in IndexedDB until **Clear CSV results** is used; export a run before starting another if you need its file.

Chat accepts plain lines, `username: message`, optional `[HH:MM:SS.mmm]` prefixes, or JSONL objects with `user`/`username`, `message`/`text`, and optional `timestamp` (Unix seconds or ISO time) or `at_ms`. Timestamp replay requires every timestamp in nondecreasing order. Transcripts are limited to 16 MiB, messages to 4,096 characters and usernames to 128. **Short sample** fills 288 synthetic messages. **Long test · 1,344** fills the original 64-message decision-test corpus repeated 21 times. Both populate the editable textbox without starting inference; neither is a captured Twitch conversation. The long preset preserves the inference policy and rate controls, switching original-timestamp mode to bursts if necessary. Only the latest 120 items are rendered in each feed; the entire arrived portion remains exportable as JSONL, including errors and cancellations. Transcripts and judgments stay in memory, so export before starting another run or closing the page.

Chat workers control HTTP concurrency, not model sequences. The HTTP meter measures request round trips; ordered-output delay measures wall time from actual arrival through queueing, inference and in-order release (including pauses). Pause freezes source time and new dispatch; active requests can finish. Hiding the page automatically pauses replay to avoid browser timer throttling. Resume explicitly when returning. Endpoint errors release visible error rows, without blocking later results. Stop cancels unfinished requests and leaves completed data available for export.

Connection settings are saved in localStorage. API keys, playground prompts, chat transcripts and paintings are not persisted. CSV results include selected input fields and remain in this browser until cleared. Switching experiments cancels the previous experiment's requests; switching away from the page parks the racer and pauses chat. Closing the page stops all work. There is no background service.

## Checks

```sh
bun test
```

Unit checks cover protocol normalization, probability validation, streaming parsers, bounded scheduling, cancellation, pixel mapping, driving snapshots, chat timing, independent arrivals, ordered release and error recovery. No browser-testing package is installed.

## Inspiration

- [Jev decision UI](https://youtu.be/f6We53TnkbU?t=455)
- [Pixel inference demonstration](https://x.com/anshuc/status/2100246929611411501) and [jev-paint](https://github.com/achimala/jev-paint)
- [Pink tornado demonstration](https://x.com/thegreatest_sv/status/2107851693232975941)
- [Polymarket data export formats](https://github.com/TenghanZhong/polymarket-data-scraper)
- [Realtime chat moderation demonstration](https://www.reddit.com/r/vibecoding/comments/1wk8jco/using_jev_for_realtime_live_chat_moderation/)

The renderer, simulator and interface here are original implementations inspired by those demonstrations, not their unpublished source code. AGPL-3.0-only.
