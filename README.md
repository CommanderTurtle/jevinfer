# jev infer

A static Jev playground for a configurable NInfer endpoint. Dark UI, local assets, no telemetry, CDN, cloud account or proxy.

```sh
bun start
```

Open **http://127.0.0.1:8198/**, choose **Connect endpoint**, and enter the origin of NInfer served with `--jev --cors`. The default is `http://alien.local:8000`. An optional API key stays in memory for the current tab.

Ordinary HTML, CSS and ES modules; no build required. Serve the directory with any static HTTP server, including under a subpath. The included Bun server binds loopback and serves only application assets. Set `PORT` to change its port. Browser mixed-content and local-network permission rules still apply. Opening ES modules directly through `file://` is not supported by browsers.

## Experiments

- **Playground:** editable state and up to 32 Choice, Noul or Score questions; percentages, raw exchanges and JSON import/export. Each run performs new inference.
- **Drive:** Three.js road, moving traffic, obstacle course and a 2 km race. Adjustable speed limit and 0.5–3× simulation speed. Swept collision detection prevents tunnelling during lane changes. Jev receives numeric lane sensors, including adjacent traffic and time to contact. One control request is in flight at a time; stale commands cause braking. Manual arrow keys work without inference.
- **Paint:** palette, HSL, binary RGB and silhouette representations from [jev-paint](https://github.com/achimala/jev-paint). Independent coordinate questions share the full composition description. Probability distributions drive its pigment renderer: mean underpaint, correlated pigment sampling, relief and contour strokes. Any integer grid dimensions from 1–1,024 work, including rectangles. New compositions use SystemOne with at most 30 questions per request; inference concurrency is bounded. A browser worker renders locally. Crisp pixels and probability blend are also available; PNG exports support a 512–4096-pixel long edge. Larger exports do not invent additional inferred pixels.
- **Custom paint:** named regions and classic/slim Minecraft UV presets, 64×64 skin import/export, brush/erase/pick, undo and selective edits. Edit passes use current RGBA state and neighbors; KEEP preserves pixels and CLEAR handles outer-layer transparency. Skin exports remain exact pixel textures. Visual coherence depends on the served model.
- **Tornado:** pink filament funnel, orbiting request/result cards, activity bars, evidence matrix and result ticker around streamed CSV/TSV/JSONL/JSON classification. Every row gets its own request. Cards and metrics reflect actual dispatches and answers. Portrait, immersive and motion-pause controls affect presentation independently. No wallets, trading or profit simulation.
- **Chat:** independent timed arrivals beside a filtered result feed. Visible category toggles update existing results immediately. Edit classification instructions, categories, confidence threshold and extra Noul/Score questions. As-ready delivery avoids head-of-line blocking; arrival-order delivery remains optional. Follow-scroll continues beyond the 120-row display window. Source pacing, bursts and HTTP concurrency are independent; backlog is shown without dropping messages.

SystemOne exposes full distributions. Decision returns selected scores, which are labeled accordingly. Neither endpoint's answers are cached by this app.

## Data

CSV files are parsed incrementally with bounded concurrency (default 2, up to 8). No file-size cap is imposed, but browser storage capacity still applies. Individual records are limited to 256 KiB. CSV/TSV supports quoting, embedded newlines and UTF-8 BOMs; JSON expects an array of objects and JSONL one object per line. Only selected columns are sent. Importing a file alone makes no inference request.

CSV results are journaled in IndexedDB before completion is counted. Storage failures stop the stream; endpoint errors are recorded by row. Five initial failures without a successful result stop the run. Export uses the browser's Save File Picker when available, otherwise a 64 MiB in-memory fallback. The latest journal can be exported after reload; **Clear CSV results** removes saved journals.

Chat accepts plain lines, `user: message`, optional `[HH:MM:SS.mmm]` timestamps, or JSONL with `user`/`username`, `message`/`text` and `timestamp` (Unix seconds or ISO time) or `at_ms`. Timestamp replay requires nondecreasing timestamps. Limits: 16 MiB per transcript, 4,096 characters per message and 128 per username.

**Barrage** prefills 1,344 editable synthetic messages, with roughly 7.7% substantive prompts. Actual retention is decided by the endpoint. **Short sample** has 288 messages; **Long test** repeats the original 64-message decision corpus 21 times. Prefill does not start inference. Both feeds render their latest 120 rows; all arrived records, errors and cancellations remain exportable as JSONL. Chat and paintings stay in memory.

Workers represent HTTP concurrency, not model sequences. HTTP time is the request round trip; output delay includes queueing, inference and any ordered-release wait. Pause freezes arrivals and new dispatch while active requests finish. Hiding the page pauses chat; switching experiments stops the previous run. Closing the page stops all work.

Connection preferences and explicitly saved canvas layouts use localStorage. API keys are not persisted. Only configured endpoint requests leave the page; fonts, scripts, rendering and imported files remain local.

## Development

```sh
bun test
```

Tests cover protocol validation, streaming parsing, bounded scheduling/cancellation, chat timing and filters, ordered/as-ready delivery, skin UV regions, paint distributions/rendering and swept driving collisions.

Set `JEV_ENDPOINT` to your NInfer origin, then `bun run test:live` checks all five mode payloads through both endpoints and every paint representation. Optional `JEV_API_KEY` is read from the environment. These checks send only synthetic fixtures.

Three.js **0.186.1** is bundled locally in `vendor/three.js`. To regenerate that asset:

```sh
bun install --frozen-lockfile
bun run vendor
```

The paint modules are based on **achimala/jev-paint @ ecf9c48d290e086bde790d6e24b93324667155e9**. Its renderer and probability math are included; adaptations add local NInfer calls, smaller request batches, arbitrary dimensions and custom-canvas support. No upstream cloud proxy is included. Upstream notices are retained with those sources and the Three.js bundle.

## References

- [Decision UI](https://youtu.be/f6We53TnkbU?t=455)
- [Paint demonstration](https://x.com/anshuc/status/2100246929611411501) · [paint source](https://github.com/achimala/jev-paint)
- [Pink tornado demonstration](https://x.com/thegreatest_sv/status/2107851693232975941)
- [Polymarket export formats](https://github.com/TenghanZhong/polymarket-data-scraper)
- [Chat moderation demonstration](https://www.reddit.com/r/vibecoding/comments/1wk8jco/using_jev_for_realtime_live_chat_moderation/)

The tornado visualization is a local interpretation of the clip. The research's [trading analogue](https://github.com/VGabriel45/polymarket-btc5m-jev-trading) has a terminal UI, not the clip's animation source.

AGPL-3.0-only; included dependency notices remain applicable.
