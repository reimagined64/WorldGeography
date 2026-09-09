/**
 * Monotonic, pausable per-question clock. No wall-clock drift or setInterval counting.
 *
 * A structural port of the v7 `clock.js`. `now` stays an injected reader rather
 * than a direct `performance.now()` call, which is what lets the timing suite
 * run the clock forward without waiting for real time to pass.
 */
export class GeoClock {
  limitMs: number;
  accumulated: number;
  now: () => number;
  running: boolean;
  startedAt: number;

  constructor(limitMs: number, elapsedMs = 0, now: () => number = () => performance.now()) {
    if(!Number.isFinite(limitMs)||limitMs<0||!Number.isFinite(elapsedMs)||elapsedMs<0)throw new RangeError('Neplatný čas.');
    this.limitMs=limitMs;this.accumulated=limitMs?Math.min(limitMs,elapsedMs):elapsedMs;this.now=now;this.running=false;this.startedAt=0;
  }
  elapsed(): number {return Math.min(this.limitMs||Infinity,this.accumulated+(this.running?Math.max(0,this.now()-this.startedAt):0));}
  remaining(): number {return this.limitMs?Math.max(0,this.limitMs-this.elapsed()):Infinity;}
  start(): this {if(!this.running&&(!this.limitMs||this.accumulated<this.limitMs)){this.startedAt=this.now();this.running=true;}return this;}
  pause(): this {this.accumulated=this.elapsed();this.running=false;return this;}
}
