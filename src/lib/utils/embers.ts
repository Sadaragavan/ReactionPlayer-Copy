/**
 * Warm light for the Home screen: a comet that chases the pointer, the sparks it sheds, and a few motes that drift up.
 *
 * Plain canvas 2D. The comet's head follows the pointer on a spring, so a quick flick makes it swing past and loop back
 * instead of tracking the cursor exactly. The last 0.7 s of its path is drawn as a tapered ribbon in three additive
 * passes (a wide deep-orange haze, an amber body, a hot core), with a soft halo at the head. Sparks shed from the head
 * and rise as they fade. Motes are the idle motion: specks that drift upward and wrap, the same idea as Ren'Py's
 * SnowBlossom with the direction reversed.
 *
 * The loop runs only while something is moving, runs at about half rate when only motes are, and never starts when
 * the viewer prefers reduced motion (the caller decides; see EmberTrail.svelte).
 */

export interface EmberOptions {
  /** Specks that keep drifting up while the pointer is still. */
  ambient?: boolean;
  /** Swap in a seeded generator to make a frame reproducible. */
  random?: () => number;
}

interface Sample {
  x: number;
  y: number;
  t: number;
}
interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  life: number;
  r: number;
}
interface Mote {
  x: number;
  y: number;
  vx: number;
  vy: number;
  phase: number;
  r: number;
  a: number;
}

/** How long a point of the path stays visible, ms. */
const TRAIL_MS = 720;
/** Spring pull towards the pointer (1/s²) and drag (1/s): a damping ratio near 0.54, so quick moves overshoot and loop. */
const SPRING = 170;
const DRAG = 14;
/** The comet lingers this long after the pointer stops, ms. */
const IDLE_MS = 900;
/** Below this speed (px/s) the head is resting and adds nothing to the path. */
const REST_SPEED = 6;
/** Path samples are subdivided this many times so a fast flick still draws a curve rather than a polyline. */
const SUBDIVIDE = 4;

/** `--ember-core`, `--ember`, `--ember-deep` as r,g,b triples (see src/app.css). */
let CORE = '255,243,207';
let AMBER = '255,194,77';
let DEEP = '255,138,31';

/** rgba() strings by alpha bucket, so a frame allocates no new strings. */
const LEVELS = 24;
const ramp = (rgb: string, peak: number) => Array.from({ length: LEVELS + 1 }, (_, i) => `rgba(${rgb},${((i / LEVELS) * peak).toFixed(3)})`);
let HAZE = ramp(DEEP, 0.1);
let BODY = ramp(AMBER, 0.42);
let HOT = ramp(CORE, 0.98);

/** Changes the glow's colours (r,g,b triples as "255,243,207"); the theme calls this. */
export function setEmberColors(core: string, amber: string, deep: string): void {
  CORE = core;
  AMBER = amber;
  DEEP = deep;
  HAZE = ramp(DEEP, 0.1);
  BODY = ramp(AMBER, 0.42);
  HOT = ramp(CORE, 0.98);
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export class EmberField {
  readonly #canvas: HTMLCanvasElement;
  readonly #ctx: CanvasRenderingContext2D;
  readonly #rand: () => number;
  readonly #ambient: boolean;

  #w = 0;
  #h = 0;
  #raf = 0;
  #last = 0;
  #lastPaint = 0;
  #enabled = false;

  #head = { x: 0, y: 0, vx: 0, vy: 0 };
  #target = { x: 0, y: 0 };
  #inside = false;
  #lastMove = -1e9;
  #trail: Sample[] = [];
  #sparks: Spark[] = [];
  #motes: Mote[] = [];

  constructor(canvas: HTMLCanvasElement, options: EmberOptions = {}) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('A 2D canvas is not available.');
    this.#canvas = canvas;
    this.#ctx = ctx;
    this.#ambient = options.ambient ?? true;
    this.#rand = options.random ?? Math.random;
  }

  /* ── control ── */

  /** Match the backing store to the canvas's CSS size. Call again whenever that changes. */
  resize(width: number, height: number, dpr: number): void {
    this.#w = Math.max(1, Math.round(width));
    this.#h = Math.max(1, Math.round(height));
    this.#canvas.width = Math.round(this.#w * dpr);
    this.#canvas.height = Math.round(this.#h * dpr);
    this.#ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (this.#enabled) {
      this.#seedMotes();
      this.#schedule();
    }
  }

  start(): void {
    if (this.#enabled) return;
    this.#enabled = true;
    this.#seedMotes();
    this.#schedule();
  }

  /** Stops drawing and clears the canvas. `start()` brings it back. */
  stop(): void {
    this.#enabled = false;
    cancelAnimationFrame(this.#raf);
    this.#raf = 0;
    this.#trail.length = 0;
    this.#sparks.length = 0;
    this.#inside = false;
    this.#ctx.clearRect(0, 0, this.#w, this.#h);
  }

  /** Pause while the tab is hidden; the next pointer move or `resume()` carries on. */
  pause(): void {
    cancelAnimationFrame(this.#raf);
    this.#raf = 0;
  }

  resume(): void {
    this.#schedule();
  }

  destroy(): void {
    this.stop();
  }

  /** The pointer is at (x, y), in CSS pixels relative to the canvas. */
  move(x: number, y: number): void {
    if (!this.#enabled) return;
    this.#target.x = x;
    this.#target.y = y;
    if (!this.#inside) {
      // Entering the window: start at the pointer rather than swooping in from wherever it last was.
      this.#head = { x, y, vx: 0, vy: 0 };
      this.#trail.length = 0;
    }
    this.#inside = true;
    this.#lastMove = performance.now();
    this.#schedule();
  }

  /** The pointer left the window. The comet finishes its swing and fades. */
  leave(): void {
    this.#inside = false;
  }

  /** A small spray of sparks at (x, y): a click or a tap. */
  burst(x: number, y: number, count = 10): void {
    if (!this.#enabled) return;
    for (let i = 0; i < count; i++) {
      const angle = this.#rand() * Math.PI * 2;
      const speed = 40 + this.#rand() * 110;
      this.#sparks.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 18,
        age: 0,
        life: 0.5 + this.#rand() * 0.7,
        r: 0.7 + this.#rand() * 1.3
      });
    }
    this.#schedule();
  }

  /* ── loop ── */

  #schedule(): void {
    if (!this.#enabled || this.#raf) return;
    this.#last = performance.now();
    this.#raf = requestAnimationFrame(this.#tick);
  }

  #cometActive(now: number): boolean {
    return this.#trail.length > 1 || this.#sparks.length > 0 || now - this.#lastMove < IDLE_MS;
  }

  #tick = (now: number): void => {
    this.#raf = 0;
    if (!this.#enabled) return;
    const dt = Math.min(0.05, Math.max(0.001, (now - this.#last) / 1000));
    this.#last = now;
    const comet = this.#cometActive(now);
    this.#step(dt, now, comet);
    // With only motes on screen, paint every other frame: the drift is slow and this halves the idle cost.
    if (comet || now - this.#lastPaint >= 30) {
      this.#paint(now);
      this.#lastPaint = now;
    }
    if (this.#cometActive(now) || (this.#ambient && this.#motes.length > 0)) {
      this.#raf = requestAnimationFrame(this.#tick);
    }
  };

  #step(dt: number, now: number, comet: boolean): void {
    const head = this.#head;
    if (comet) {
      const sub = Math.max(1, Math.ceil(dt * 120));
      const h = dt / sub;
      for (let i = 0; i < sub; i++) {
        head.vx += ((this.#target.x - head.x) * SPRING - head.vx * DRAG) * h;
        head.vy += ((this.#target.y - head.y) * SPRING - head.vy * DRAG) * h;
        head.x += head.vx * h;
        head.y += head.vy * h;
      }
      const speed = Math.hypot(head.vx, head.vy);
      if (speed > REST_SPEED && now - this.#lastMove < IDLE_MS * 2) {
        this.#trail.push({ x: head.x, y: head.y, t: now });
        // Fast heads shed sparks, a few per frame at most.
        const shed = Math.min(3, Math.floor(speed / 520 + this.#rand()));
        for (let i = 0; i < shed; i++) {
          this.#sparks.push({
            x: head.x + (this.#rand() - 0.5) * 6,
            y: head.y + (this.#rand() - 0.5) * 6,
            vx: -head.vx * 0.04 + (this.#rand() - 0.5) * 34,
            vy: -head.vy * 0.04 + (this.#rand() - 0.5) * 34 - 22,
            age: 0,
            life: 0.5 + this.#rand() * 0.9,
            r: 0.6 + this.#rand() * 1.2
          });
        }
      }
    }
    while (this.#trail.length && now - this.#trail[0].t > TRAIL_MS) this.#trail.shift();

    for (let i = this.#sparks.length - 1; i >= 0; i--) {
      const s = this.#sparks[i];
      s.age += dt;
      if (s.age >= s.life) {
        this.#sparks.splice(i, 1);
        continue;
      }
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.vy -= 14 * dt; // embers rise
      s.vx *= 1 - 0.8 * dt;
    }

    if (this.#ambient) {
      for (const m of this.#motes) {
        m.phase += dt * 0.7;
        m.x += (m.vx + Math.sin(m.phase) * 7) * dt;
        m.y += m.vy * dt;
        if (m.y < -10) {
          m.y = this.#h + 10;
          m.x = this.#rand() * this.#w;
        }
        if (m.x < -10) m.x = this.#w + 10;
        else if (m.x > this.#w + 10) m.x = -10;
      }
    }
  }

  #seedMotes(): void {
    if (!this.#ambient) return;
    const want = clamp(Math.round((this.#w * this.#h) / 72_000), 8, 22);
    while (this.#motes.length > want) this.#motes.pop();
    while (this.#motes.length < want) {
      this.#motes.push({
        x: this.#rand() * this.#w,
        y: this.#rand() * this.#h,
        vx: (this.#rand() - 0.4) * 5,
        vy: -(6 + this.#rand() * 13),
        phase: this.#rand() * Math.PI * 2,
        r: 0.7 + this.#rand() * 1.3,
        a: 0.25 + this.#rand() * 0.45
      });
    }
  }

  /* ── drawing ── */

  #paint(now: number): void {
    const ctx = this.#ctx;
    ctx.clearRect(0, 0, this.#w, this.#h);
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (this.#ambient) this.#paintMotes(now);
    this.#paintRibbon(now);
    this.#paintHead(now);
    this.#paintSparks();
  }

  #paintMotes(now: number): void {
    const ctx = this.#ctx;
    const t = now / 1000;
    for (const m of this.#motes) {
      const a = m.a * (0.6 + 0.4 * Math.sin(t * 1.3 + m.phase * 3));
      ctx.fillStyle = `rgba(${AMBER},${(a * 0.16).toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(m.x, m.y, m.r * 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = `rgba(${AMBER},${a.toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(m.x, m.y, m.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /** The path as a Catmull-Rom curve, each point carrying how much life it has left (1 at the head, 0 at the tail). */
  #smooth(now: number): { x: number; y: number; life: number }[] {
    const p = this.#trail;
    const n = p.length;
    if (n < 2) return [];
    const out: { x: number; y: number; life: number }[] = [];
    const life = (t: number) => clamp(1 - (now - t) / TRAIL_MS, 0, 1);
    for (let i = 0; i < n - 1; i++) {
      const p0 = p[Math.max(0, i - 1)];
      const p1 = p[i];
      const p2 = p[i + 1];
      const p3 = p[Math.min(n - 1, i + 2)];
      for (let s = 0; s < SUBDIVIDE; s++) {
        const u = s / SUBDIVIDE;
        const u2 = u * u;
        const u3 = u2 * u;
        const cr = (a: number, b: number, c: number, d: number) =>
          0.5 * (2 * b + (-a + c) * u + (2 * a - 5 * b + 4 * c - d) * u2 + (-a + 3 * b - 3 * c + d) * u3);
        out.push({ x: cr(p0.x, p1.x, p2.x, p3.x), y: cr(p0.y, p1.y, p2.y, p3.y), life: life(p1.t + (p2.t - p1.t) * u) });
      }
    }
    const last = p[n - 1];
    out.push({ x: last.x, y: last.y, life: life(last.t) });
    return out;
  }

  #paintRibbon(now: number): void {
    const pts = this.#smooth(now);
    if (pts.length < 2) return;
    const ctx = this.#ctx;
    const passes: { levels: string[]; width: number; floor: number; power: number }[] = [
      { levels: HAZE, width: 12, floor: 0.25, power: 1 },
      { levels: BODY, width: 4.4, floor: 0.2, power: 1.15 },
      { levels: HOT, width: 1.8, floor: 0.2, power: 1.3 }
    ];
    for (const pass of passes) {
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1];
        const b = pts[i];
        const l = b.life;
        if (l <= 0.01) continue;
        ctx.strokeStyle = pass.levels[Math.round(Math.pow(l, pass.power) * LEVELS)];
        ctx.lineWidth = pass.width * (pass.floor + (1 - pass.floor) * l);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
    }
  }

  #paintHead(now: number): void {
    const since = now - this.#lastMove;
    // Full strength while the pointer moves, then a quick fade once it has been still for a moment.
    const strength = clamp(1 - (since - 250) / 650, 0, 1);
    if (strength <= 0.01) return;
    const { x, y } = this.#head;
    const ctx = this.#ctx;

    const halo = ctx.createRadialGradient(x, y, 0, x, y, 90);
    halo.addColorStop(0, `rgba(${DEEP},${(0.16 * strength).toFixed(3)})`);
    halo.addColorStop(1, `rgba(${DEEP},0)`);
    ctx.fillStyle = halo;
    ctx.fillRect(x - 90, y - 90, 180, 180);

    const orb = ctx.createRadialGradient(x, y, 0, x, y, 17);
    orb.addColorStop(0, `rgba(${CORE},${(0.98 * strength).toFixed(3)})`);
    orb.addColorStop(0.18, `rgba(${AMBER},${(0.8 * strength).toFixed(3)})`);
    orb.addColorStop(0.5, `rgba(${DEEP},${(0.26 * strength).toFixed(3)})`);
    orb.addColorStop(1, `rgba(${DEEP},0)`);
    ctx.fillStyle = orb;
    ctx.fillRect(x - 17, y - 17, 34, 34);
  }

  #paintSparks(): void {
    const ctx = this.#ctx;
    for (const s of this.#sparks) {
      const k = 1 - s.age / s.life;
      const a = Math.pow(k, 1.3) * (0.75 + 0.25 * Math.sin(s.age * 40 + s.x));
      ctx.fillStyle = `rgba(${AMBER},${(a * 0.22).toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r * 3.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = `rgba(${CORE},${a.toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r * (0.6 + 0.4 * k), 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
