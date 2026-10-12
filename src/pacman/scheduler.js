// Adapted from Jevman, Copyright (c) 2026 Johnny Chadda. AGPL-3.0-or-later.
// https://github.com/opper-ai/jevman-benchmark/tree/b202e2cefd3dcf62b99835b319450b687960f40a
// Ported to static browser ESM; local endpoint integration and strict inference handling.
import { buildRequest, fallbackDecision, parseAnswer, questionName } from "./brain.js";
import { fruitRoute, optionFeatures } from "./features.js";
import { decisionPoints } from "./sim.js";
import { ACTOR_IDS } from "./types.js";

export class Scheduler {
  deps;
  pending = new Map;
  ready = new Map;
  consumed = new Set;
  lastDecision = null;
  slots;
  timeoutMs;
  maxInFlight;
  actors;
  failed = false;
  constructor(deps) {
    this.deps = deps;
    this.timeoutMs = deps.timeoutMs ?? 2000;
    this.maxInFlight = deps.maxInFlight ?? 1;
    this.actors = deps.actors ?? ACTOR_IDS;
    this.slots = deps.slots ?? { inFlight: 0 };
  }
  update(state) {
    if (this.failed) return;
    this.state = state;
    const now = this.deps.now();
    const live = new Set;
    const fruitOnBoard = state.fruit !== null;
    for (const id of typeof this.actors === "function" ? this.actors(state) : this.actors) {
      for (const point of decisionPoints(state, id)) {
        live.add(point.key);
        const model = this.deps.modelFor?.(id);
        const sent = this.pending.get(point.key);
        if (sent && sent.sentAt !== null && sent.model !== model)
          this.cancelPending(point.key);
        if (this.ready.has(point.key) && this.ready.get(point.key).model !== model)
          this.dropReady(point.key);
        if (id === "pacman") {
          if (this.pending.get(point.key)?.fruitOnBoard === !fruitOnBoard)
            this.cancelPending(point.key);
          if (this.ready.get(point.key)?.fruitOnBoard === !fruitOnBoard)
            this.dropReady(point.key);
        }
        if (this.pending.has(point.key) || this.ready.has(point.key) || this.consumed.has(point.key))
          continue;
        const features = optionFeatures(state, point);
        this.pending.set(point.key, {
          q: { point, features },
          sentAt: null,
          queuedAt: now,
          fruitOnBoard,
          fruitRoute: id === "pacman" ? fruitRoute(state, point, features) : null
        });
      }
    }
    for (const key of [...this.pending.keys()])
      if (!live.has(key))
        this.cancelPending(key);
    for (const key of [...this.ready.keys()])
      if (!live.has(key))
        this.dropReady(key);
    for (const key of [...this.consumed])
      if (!live.has(key))
        this.consumed.delete(key);
    for (const [key, p] of [...this.pending]) {
      const from = this.deps.timeoutFrom === "queue" ? p.queuedAt : p.sentAt;
      if (from !== null && now - from > this.timeoutMs) {
        if (!this.deps.allowFallback) return this.fail("Decision timed out. Resume to retry.");
        this.resolve(key, fallbackDecision(state, p.q, "timeout"), null);
      }
    }
    const byModel = new Map;
    for (const p of this.pending.values()) {
      if (p.sentAt !== null)
        continue;
      const model = this.deps.modelFor?.(p.q.point.actor);
      byModel.set(model, [...byModel.get(model) ?? [], p]);
    }
    for (const [model, batch] of byModel) {
      const limit = typeof this.maxInFlight === "function" ? this.maxInFlight() : this.maxInFlight;
      const available = Math.max(0, limit - this.slots.inFlight);
      if (!available) break;
      const size = this.deps.splitIndependent===false?batch.length:Math.ceil(batch.length / available);
      for (let i=0;i<batch.length;i+=size) this.send(state,batch.slice(i,i+size),now,model);
    }
  }
  decide(point, state) {
    const r = this.ready.get(point.key);
    if (!r)
      return null;
    this.ready.delete(point.key);
    let d = r.decision;
    this.lastDecision = d;
    const features = point.actor === "pacman" && (r.fruitOnBoard || state.fruit) ? optionFeatures(state, point) : null;
    if (features && (r.fruitOnBoard !== (state.fruit !== null) || fruitRoute(state, point, features) !== r.fruitRoute)) {
      this.deps.onEvent({ type: "superseded", decision: d });
      if (!this.deps.allowFallback) {
        this.lastDecision = null;
        return null;
      }
      d = fallbackDecision(state, { point, features }, "fruit changed");
      this.lastDecision = d;
      this.deps.onEvent({ type: "decision", decision: d, latencyMs: null, fruitOnBoard: state.fruit !== null });
    }
    if (!point.escape)
      return d.choice;
    this.consumed.add(point.key);
    return d.choice === d.options[0] ? point.options[0] : point.options[1];
  }
  reset() {
    this.failed = false;
    this.state = null;
    this.lastDecision = null;
    for (const key of this.pending.keys()) this.cancelPending(key);
    this.ready.clear();
    this.consumed.clear();
  }
  fail(message) {
    this.reset();
    this.failed = true;
    this.deps.onEvent({ type: "error", message });
  }
  cancelPending(key) {
    const p=this.pending.get(key); this.pending.delete(key);
    if(p?.flight && ![...this.pending.values()].some(other=>other.flight===p.flight))p.flight.abort();
  }
  send(state, batch, now, requested) {
    const flight=new AbortController();
    for (const p of batch) {
      // Queueing may outlive the snapshot which created this junction request.
      const point=decisionPoints(state,p.q.point.actor).find(point=>point.key===p.q.point.key)??p.q.point;
      p.q={point,features:optionFeatures(state,point)};
      p.fruitOnBoard=state.fruit!==null;
      p.fruitRoute=point.actor==='pacman'?fruitRoute(state,point,p.q.features):null;
      p.flight = flight;
      p.sentAt = now;
      p.model = requested;
    }
    this.slots.inFlight += 1;
    const isCurrent = (p) => this.pending.get(p.q.point.key) === p;
    this.deps.transport({ ...requested ? { model: requested } : {}, ...buildRequest(state, batch.map((p) => p.q)), keys: Object.fromEntries(batch.map((p) => [questionName(p.q.point), p.q.point.key])) }, flight.signal).then((res) => {
      const model = res.model ?? requested;
      this.deps.onEvent({
        type: "call",
        model,
        actors: batch.map((p) => p.q.point.actor),
        latencyMs: res.latencyMs,
        usage: res.usage,
        costUsd: res.costUsd,
        costEstimated: res.costEstimated === true,
        traceId: res.traceId
      });
      for (const p of batch) {
        if (!isCurrent(p)) {
          this.deps.onEvent({ type: "stale", actor: p.q.point.actor, key: p.q.point.key });
          continue;
        }
        const parsed = parseAnswer(res.answers[questionName(p.q.point)], p.q);
        if (!parsed && !this.deps.allowFallback) return this.fail("Invalid decision. Resume to retry.");
        const sig = res.signatures?.[questionName(p.q.point)];
        const decision = parsed ? { ...parsed, model, ...sig && res.signedAs ? { sig, signedAs: res.signedAs } : {} } : fallbackDecision(state, p.q, "invalid answer");
        this.resolve(p.q.point.key, decision, res.latencyMs);
      }
    }, (err) => {
      if (!batch.some(isCurrent)) return;
      if (!this.deps.allowFallback) return this.fail(err instanceof Error ? err.message : String(err));
      this.deps.onEvent({ type: "error", message: err instanceof Error ? err.message : String(err) });
      for (const p of batch)
        if (isCurrent(p))
          this.resolve(p.q.point.key, fallbackDecision(state, p.q, "error"), null);
    }).catch((err) => {
      if (batch.some(isCurrent)) this.fail(err instanceof Error ? err.message : String(err));
    }).finally(() => {
      this.slots.inFlight -= 1;
      if (!this.failed && this.state) this.update(this.state);
    });
  }
  dropReady(key) {
    const r = this.ready.get(key);
    if (!r)
      return;
    this.ready.delete(key);
    this.deps.onEvent({ type: "superseded", decision: r.decision });
  }
  resolve(key, decision, latencyMs) {
    const p = this.pending.get(key);
    if (!p)
      return;
    this.pending.delete(key);
    this.ready.set(key, { decision, fruitOnBoard: p.fruitOnBoard, fruitRoute: p.fruitRoute, model: p.model });
    this.deps.onEvent({ type: "decision", decision, latencyMs, fruitOnBoard: p.fruitOnBoard });
  }
}

