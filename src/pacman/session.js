import {createGame, jevActors, step} from './sim.js';
import {greedyChoice, optionFeatures} from './features.js';
import {Scheduler} from './scheduler.js';

export const MODES = {
  pacman: {pacmanControl:'jev', ghostsByAI:false},
  classic: {pacmanControl:'keyboard', ghostsByAI:false},
  ghosts: {pacmanControl:'keyboard', ghostsByAI:true},
  both: {pacmanControl:'jev', ghostsByAI:true},
};

export class PacmanSession {
  constructor(client, onEvent = () => {}) {
    this.client = client;
    this.onEvent = onEvent;
    this.slots = {inFlight:0};
    this.active = false;
    this.reset();
  }
  reset(mode = this.mode || 'pacman') {
    this.stop();
    this.mode = Object.hasOwn(MODES, mode) ? mode : 'pacman';
    this.state = createGame(MODES[this.mode]);
    this.stats = {calls:0, decisions:0, stale:0, latencyMs:null};
    this.error = '';
  }
  start() {
    if (this.active || this.state.status === 'gameover') return;
    const run = new AbortController();
    this.run = run;
    this.active = true;
    this.error = '';
    const emit = event => {
      if (run.signal.aborted) return;
      if (event.type === 'call') {
        this.stats.calls++;
        this.stats.latencyMs = event.latencyMs;
      } else if (event.type === 'decision') this.stats.decisions++;
      else if (event.type === 'stale') this.stats.stale++;
      else if (event.type === 'error') {
        this.error = event.message;
        this.stop();
      }
      this.onEvent(event);
    };
    this.scheduler = new Scheduler({
      now: () => performance.now(),
      actors: jevActors,
      slots: this.slots,
      maxInFlight: Math.max(1, Math.min(3, Number(this.client.config.concurrency) || 1)),
      timeoutMs: (Number(this.client.config.timeout) || 30) * 1000,
      allowFallback: false,
      onEvent: emit,
      transport: async body => {
        run.signal.throwIfAborted();
        emit({type:'request', body:{state:body.state, questions:body.questions}});
        const result = await this.client.infer(body.state, body.questions, run.signal);
        run.signal.throwIfAborted();
        emit({type:'response', body:result.raw});
        return {answers:result.answers, latencyMs:result.ms, usage:null, costUsd:null, traceId:null};
      },
    });
  }
  tick(dt) {
    if (!this.active) return;
    const before = this.state.status;
    if (before === 'ready' || before === 'playing') this.scheduler.update(this.state);
    if (!this.active) return;
    step(this.state, Math.min(.05, Math.max(0, dt)), {decide:(point, state) => {
      // Classic ghosts keep Jevman's four distinct scripted personalities.
      if (point.actor !== 'pacman' && !state.ghostsByAI)
        return greedyChoice(state, point, optionFeatures(state, point));
      return this.scheduler.decide(point, state);
    }});
    if (before !== this.state.status && this.state.status !== 'playing') this.scheduler.reset();
    if (this.state.status === 'gameover') this.stop();
  }
  steer(dir) {
    if (this.state.pacmanControl === 'keyboard' && ['up','down','left','right'].includes(dir)) this.state.keyDir = dir;
  }
  stop() {
    this.active = false;
    this.run?.abort();
    this.scheduler?.reset();
  }
}
