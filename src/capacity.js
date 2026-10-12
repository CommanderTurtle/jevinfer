// Request capacity is not the model's chat sequence count or GPU batch width.
export function positiveInteger(value, name = 'Request limit') {
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < 1) throw Error(name + ' must be a positive integer.');
  return n;
}

export class RequestBudget {
  constructor(limit = 1) { this.limit = positiveInteger(limit); this.active = 0; this.queue = []; }
  setLimit(limit) { this.limit = positiveInteger(limit); this.drain(); }
  acquire(signal, priority = 0) {
    return new Promise((resolve, reject) => {
      if (signal?.aborted) return reject(signal.reason);
      const job = {resolve, reject, signal, priority};
      job.cancel = () => { this.queue = this.queue.filter(x => x !== job); reject(signal.reason); };
      signal?.addEventListener('abort', job.cancel, {once:true});
      this.queue.push(job); this.queue.sort((a,b) => b.priority-a.priority); this.drain();
    });
  }
  drain() {
    while (this.active < this.limit && this.queue.length) {
      const job = this.queue.shift(); job.signal?.removeEventListener('abort', job.cancel);
      if (job.signal?.aborted) { job.reject(job.signal.reason); continue; }
      this.active++; let released = false;
      job.resolve(() => { if (!released) { released = true; this.active--; this.drain(); } });
    }
  }
}

// Explicit Jev metadata only. Never reinterpret context length, chat slots or
// ordinary HTTP thread counts as decision capacity.
export function advertisedCapacity(catalog, model = '') {
  const selected = catalog?.data?.find(x => x.id === model) ?? (catalog?.data?.length === 1 ? catalog.data[0] : null);
  const value = selected?.capabilities?.jev?.max_concurrent_requests ?? catalog?.capabilities?.jev?.max_concurrent_requests;
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

// Small, bounded connection probe. Results describe this request shape now,
// not guaranteed capacity for larger prompts or another model/protocol.
export async function measureCapacity(probe, {ceiling = 64, budgetMs = 8000, signal, now = () => performance.now(), onSample = () => {}} = {}) {
  positiveInteger(ceiling, 'Probe ceiling');
  const began = now(), samples = []; let best = null;
  for (let width = 1; width <= ceiling;) {
    signal?.throwIfAborted();
    if (samples.length && now()-began >= budgetMs) break;
    const start = now();
    const results = await Promise.allSettled(Array.from({length:width}, () => probe(signal)));
    signal?.throwIfAborted();
    const errors = results.filter(r => r.status === 'rejected');
    if (errors.length && errors.some(r => r.reason?.status !== 429)) throw errors.find(r => r.reason?.status !== 429).reason;
    const ms = Math.max(.01, now()-start), sample = {width, ms, completed:width-errors.length, rejected:errors.length, perSecond:(width-errors.length)*1000/ms};
    samples.push(sample); onSample(sample);
    if (errors.length) { if (!best) throw errors[0].reason; break; }
    // Prefer the smallest width on a throughput plateau; filling a server queue
    // without gaining completed decisions only increases control latency.
    if (!best || sample.perSecond > best.perSecond*1.1) best = sample;
    else break;
    if (width === ceiling) break;
    width = Math.min(ceiling, width*2);
  }
  return {limit:best?.width || 1, samples, source:'measured'};
}
