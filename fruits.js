// The fruits: same shapes and colours as the videos (objects/*.json and the materials of scene.py).
// Units are metres, z is up, the board is z = 0. Colours are linear, the shaders convert to sRGB at the end.

export const FRUITS = [
  { id: 'orange', emoji: '🍊', en: 'ORANGE', ar: 'برتقالة', glsl: 0,
    shape: { ax: 0.1, ay: 0.1, H: 0.1, wob: [[3, 0.006, 0.0], [5, 0.004, 1.0]] },
    line: [1.0, 0.72, 0.38], juice: [1.0, 0.42, 0.02],
    wall: [[0.012, 0.045, 0.06], [0.03, 0.10, 0.13]], counter: [[0.05, 0.048, 0.046], [0.09, 0.085, 0.08]] },
  { id: 'watermelon', emoji: '🍉', en: 'WATERMELON', ar: 'بطيخة', glsl: 1,
    shape: { ax: 0.135, ay: 0.1, H: 0.1, wob: [[2, 0.03, 0.0], [3, -0.015, 0.5]] },
    line: [1.0, 0.45, 0.4], juice: [0.95, 0.1, 0.12],
    wall: [[0.09, 0.03, 0.018], [0.17, 0.06, 0.03]], counter: [[0.05, 0.048, 0.046], [0.09, 0.085, 0.08]] },
  { id: 'kiwi', emoji: '🥝', en: 'KIWI', ar: 'كيوي', glsl: 2,
    shape: { ax: 0.135, ay: 0.088, H: 0.088, wob: [[2, 0.008, 0.4], [5, 0.003, 1.3]] },
    line: [0.55, 0.85, 0.12], juice: [0.3, 0.6, 0.02],
    wall: [[0.06, 0.02, 0.07], [0.12, 0.05, 0.13]], counter: [[0.05, 0.048, 0.046], [0.09, 0.085, 0.08]] },
  { id: 'dragonfruit', emoji: '🐉', en: 'DRAGON FRUIT', ar: 'فاكهة التنين', glsl: 3,
    shape: { ax: 0.14, ay: 0.095, H: 0.095, wob: [[2, 0.01, 0.2], [7, 0.004, 0.9]] },
    line: [1.0, 0.7, 0.85], juice: [0.75, 0.03, 0.33],
    wall: [[0.02, 0.05, 0.035], [0.05, 0.10, 0.07]], counter: [[0.16, 0.15, 0.135], [0.22, 0.21, 0.19]] },
  { id: 'pomegranate', emoji: '❤️', en: 'POMEGRANATE', ar: 'رمانة', glsl: 4,
    shape: { ax: 0.105, ay: 0.105, H: 0.1, wob: [[6, 0.006, 0.3], [3, 0.004, 1.1]] },
    line: [1.0, 0.85, 0.65], juice: [0.7, 0.02, 0.07],
    wall: [[0.03, 0.035, 0.06], [0.07, 0.08, 0.12]], counter: [[0.05, 0.048, 0.046], [0.09, 0.085, 0.08]] },
];

// ---------------------------------------------------------------- shape (port of core.py Shape, dome fruits only)
export class Shape {
  constructor(s) {
    this.ax = s.ax; this.ay = s.ay; this.H = s.H; this.wob = s.wob;
    let rmax = 0;
    for (let i = 0; i < 720; i++) rmax = Math.max(rmax, this.r(i / 720 * Math.PI * 2));
    this.rmax = rmax;
    this.bbox = [-this.ax * rmax, this.ax * rmax, -this.ay * rmax, this.ay * rmax, 0, this.H];
  }
  r(th) { let o = 1; for (const [k, a, ph] of this.wob) o += a * Math.cos(k * th + ph); return o; }
  rho(x, y) { const u = x / this.ax, v = y / this.ay; return Math.hypot(u, v) / this.r(Math.atan2(v, u)); }
  top(rho) { const q = Math.min(Math.max(rho, 0), 1); return this.H * Math.sqrt(1 - q * q); }
  // the dome only: the flat bottom is on the board and is never seen
  mesh(rings = 40, segs = 128) {
    const pos = [], idx = [];
    for (let i = 0; i <= rings; i++) {
      const rho = Math.sin(i / rings * Math.PI / 2);
      for (let j = 0; j < segs; j++) {
        const th = j / segs * Math.PI * 2, rr = this.r(th);
        pos.push(this.ax * rho * rr * Math.cos(th), this.ay * rho * rr * Math.sin(th), this.top(rho));
      }
    }
    for (let i = 0; i < rings; i++) for (let j = 0; j < segs; j++) {
      const a = i * segs + j, b = i * segs + (j + 1) % segs, c = (i + 1) * segs + (j + 1) % segs, d = (i + 1) * segs + j;
      idx.push(a, d, c, a, c, b);
    }
    return { pos: new Float32Array(pos), idx };
  }
}

// n cuts shared between x, y and z so the pieces are close to cubes (core.py split_cuts)
export function splitCuts(n, shape) {
  const [x0, x1, y0, y1, z0, z1] = shape.bbox;
  const L = [x1 - x0, y1 - y0, z1 - z0], sum = L[0] + L[1] + L[2];
  const raw = L.map((l) => n * l / sum), k = raw.map(Math.floor);
  const order = [0, 1, 2].sort((a, b) => (raw[b] - k[b]) - (raw[a] - k[a]));
  let left = n - k[0] - k[1] - k[2];
  for (const i of order) { if (left-- <= 0) break; k[i]++; }
  return k;
}

// the real number of cubes for this grid (core.py count_cubes)
export function countCubes(shape, gx, gy, gz) {
  const [x0, x1, y0, y1] = shape.bbox, dz = shape.H / gz;
  let tot = 0;
  for (let i = 0; i < gx; i++) {
    const x = x0 + (i + 0.5) * (x1 - x0) / gx;
    for (let j = 0; j < gy; j++) {
      const rho = shape.rho(x, y0 + (j + 0.5) * (y1 - y0) / gy);
      if (rho < 1) tot += Math.min(gz, Math.max(0, Math.floor(shape.top(rho) / dz + 0.5)));
    }
  }
  return tot;
}

function rng(seed) {                                  // mulberry32
  let a = seed >>> 0;
  const u = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const n = () => Math.sqrt(-2 * Math.log(u() + 1e-9)) * Math.cos(2 * Math.PI * u());
  return { u, n };
}

// The cubes of a round and where each one lands (core.py Collapse, stack = 'depth': the heart of the fruit ends on top).
// Returns the per-cube arrays that the cube shader animates; nothing moves on the CPU after this.
export function buildCollapse(shape, nxyz, cap, seed = 1) {
  let gx = nxyz[0] + 1, gy = nxyz[1] + 1, gz = nxyz[2] + 1;
  const nTrue = countCubes(shape, gx, gy, gz);
  if (nTrue > cap) {                                  // too many cubes to draw: a coarser grid with the same look
    const k = Math.cbrt(nTrue / cap);
    gx = Math.max(2, Math.round(gx / k)); gy = Math.max(2, Math.round(gy / k)); gz = Math.max(1, Math.round(gz / k));
  }
  const [x0, x1, y0, y1] = shape.bbox, H = shape.H;
  const dx = (x1 - x0) / gx, dy = (y1 - y0) / gy, dz = H / gz;
  const R = rng(seed);
  const px = [], py = [], pz = [], pr = [];
  for (let i = 0; i < gx; i++) {
    const x = x0 + (i + 0.5) * dx;
    for (let j = 0; j < gy; j++) {
      const y = y0 + (j + 0.5) * dy, rho = shape.rho(x, y);
      if (rho >= 1) continue;
      const cnt = Math.min(gz, Math.max(0, Math.floor(shape.top(rho) / dz + 0.5)));
      for (let l = 0; l < cnt; l++) { px.push(x); py.push(y); pz.push((l + 0.5) * dz); pr.push(rho); }
    }
  }
  const n = px.length;
  // the pile: a dome of the same volume, a little wider than the fruit
  const f = 1.18, lay = dz * 0.92;
  const bx = [], by = [], bq = [];
  let profSum = 0;
  for (let x = x0 * f + dx / 2; x < x1 * f; x += dx) for (let y = y0 * f + dy / 2; y < y1 * f; y += dy) {
    const q = shape.rho(x / f, y / f);
    if (q < 1) { bx.push(x); by.push(y); bq.push(q); profSum += 1 - q * q; }
  }
  let hm = n * lay / Math.max(profSum, 1e-9), caps = null;
  for (let it = 0; it < 40; it++) {
    let tot = 0;
    caps = bq.map((q) => { const c = Math.floor(hm * (1 - q * q) / lay); tot += c; return c; });
    if (tot >= n) break;
    hm *= 1.04;
  }
  const sx = [], sy = [], sz = [], sd = [];
  for (let i = 0; i < bx.length; i++) for (let l = 0; l < caps[i]; l++) {
    const z = (l + 0.5) * lay;
    sx.push(bx[i]); sy.push(by[i]); sz.push(z); sd.push(hm * (1 - bq[i] * bq[i]) - z);
  }
  const S = 48;
  const sector = (x, y) => ((Math.floor((Math.atan2(y / shape.ay, x / shape.ax) + Math.PI) / (2 * Math.PI) * S) % S) + S) % S;
  const cubeSec = Array.from({ length: S }, () => []), slotSec = Array.from({ length: S }, () => []);
  const dep = new Float32Array(n);
  const mn = Math.min(shape.ax, shape.ay);
  for (let i = 0; i < n; i++) {
    const q = Math.min(pr[i], 1);
    dep[i] = Math.max(0, Math.min(shape.top(q) - pz[i], (1 - q) * mn * 1.4));
    cubeSec[sector(px[i], py[i])].push(i);
  }
  for (let i = 0; i < sx.length; i++) slotSec[sector(sx[i], sy[i])].push(i);
  const all = sx.map((_, i) => i);
  const p0 = new Float32Array(n * 3), p1 = new Float32Array(n * 3), dt = new Float32Array(n * 2), rot = new Float32Array(n * 3);
  const g = 1.4;
  for (let k = 0; k < S; k++) {
    const co = cubeSec[k];
    if (!co.length) continue;
    const so = slotSec[k].length ? slotSec[k] : all;
    co.sort((a, b) => dep[a] - dep[b]);               // the skin first...
    so.sort((a, b) => sd[b] - sd[a]);                 // ...goes to the most buried places
    for (let m = 0; m < co.length; m++) {
      const i = co[m], s = so[co.length > 1 ? Math.floor(m * (so.length - 1) / (co.length - 1)) : 0];
      const fz = sz[s];
      p0[i * 3] = px[i]; p0[i * 3 + 1] = py[i]; p0[i * 3 + 2] = pz[i];
      p1[i * 3] = sx[s] + 0.3 * dx * R.n(); p1[i * 3 + 1] = sy[s] + 0.3 * dy * R.n(); p1[i * 3 + 2] = fz;
      // the outside crumbles first, then the heart
      dt[i * 2] = 0.45 * (1 - Math.min(pr[i], 1)) + 0.12 * R.u() + 0.25 * (1 - pz[i] / H);
      dt[i * 2 + 1] = Math.sqrt(2 * Math.max(pz[i] - fz, 0.002) / g) + 0.18;
      rot[i * 3] = 0.35 * R.n(); rot[i * 3 + 1] = 0.35 * R.n(); rot[i * 3 + 2] = 0.5 * R.n();
    }
  }
  return { n, nTrue, size: [dx, dy, dz], p0, p1, dt, rot, pileR: f };
}

// ---------------------------------------------------------------- GLSL
export const GLSL_COMMON = /* glsl */`
vec3 hash33(vec3 p){ p = fract(p * vec3(.1031, .1030, .0973)); p += dot(p, p.yxz + 33.33); return fract((p.xxy + p.yxx) * p.zyx); }
float hash13(vec3 p){ p = fract(p * .1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
float vnoise(vec3 p){
  vec3 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
  return mix(mix(mix(hash13(i), hash13(i + vec3(1, 0, 0)), f.x), mix(hash13(i + vec3(0, 1, 0)), hash13(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(hash13(i + vec3(0, 0, 1)), hash13(i + vec3(1, 0, 1)), f.x), mix(hash13(i + vec3(0, 1, 1)), hash13(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
float fbm(vec3 p){ return .6 * vnoise(p) + .3 * vnoise(p * 2.03) + .1 * vnoise(p * 4.1); }
// distance to the nearest and to the second nearest cell point
vec2 voro(vec3 p){
  vec3 i = floor(p), f = fract(p); float a = 8., b = 8.;
  for (int x = -1; x <= 1; x++) for (int y = -1; y <= 1; y++) for (int z = -1; z <= 1; z++) {
    vec3 g = vec3(float(x), float(y), float(z)); vec3 r = g + hash33(i + g) - f; float d = dot(r, r);
    if (d < a) { b = a; a = d; } else if (d < b) { b = d; }
  }
  return sqrt(vec2(a, b));
}
// three soft lights, as in the videos: warm key (left, front), cool fill (right), warm rim (behind)
vec3 shade(vec3 alb, vec3 N, vec3 V, float gloss){
  vec3 Lk = normalize(vec3(-.45, -.5, .7)), Lf = normalize(vec3(.6, -.4, .35)), Lr = normalize(vec3(.1, .55, .45));
  float k = max(dot(N, Lk), 0.), f = max(dot(N, Lf), 0.), r = max(dot(N, Lr), 0.);
  vec3 c = alb * (vec3(1., .9, .8) * k * 1.3 + vec3(.85, .9, 1.) * f * .4 + vec3(1., .85, .7) * r * .5 + vec3(.22, .2, .19) * (.6 + .4 * N.z));
  float s = pow(max(dot(N, normalize(Lk + V)), 0.), mix(10., 110., gloss)) * gloss * .8;
  float s2 = pow(max(dot(N, normalize(Lr + V)), 0.), mix(10., 60., gloss)) * gloss * .25;
  float fres = pow(1. - max(dot(N, V), 0.), 4.) * gloss * .18;
  return c + vec3(1., .96, .9) * (s + s2) + fres;
}
vec3 toScreen(vec3 c){ c = c / (1. + .22 * c); return pow(max(c, 0.), vec3(1. / 2.2)); }
`;

// the inside of each fruit: p = place in the whole fruit (m), d = depth under the skin (m)
export const GLSL_FRUIT = /* glsl */`
uniform vec3 uShape;                 // ax, ay, H
uniform vec3 uWob[3];                // k, amplitude, phase
float rOf(float th){ float o = 1.; for (int i = 0; i < 3; i++) o += uWob[i].y * cos(uWob[i].x * th + uWob[i].z); return o; }
float depthOf(vec3 p){
  vec2 q = p.xy / uShape.xy; float rho = length(q) / rOf(atan(q.y, q.x));
  float top = uShape.z * sqrt(max(1. - rho * rho, 0.));
  float side = (1. - min(rho, 1.)) * min(uShape.x, uShape.y);
  return max(0., min(top - p.z, side * 1.4));
}
const float TAU = 6.2831853;
#if FRUIT == 0
vec3 fruitCol(vec3 p, float d, out float g){                       // orange: peel, white pith, flesh in segments
  vec3 peel = mix(vec3(.8, .15, 0.), vec3(.92, .22, 0.), smoothstep(.2, .8, fbm(p * 45.)));
  peel *= .9 + .1 * vnoise(p * 420.);
  g = .75; float k = d / .012;
  if (k < .3) return peel;
  vec3 c = mix(peel, vec3(.95, .85, .62), smoothstep(.3, .38, k));
  if (k > .62) {
    float tri = abs(fract(atan(p.y, p.x) * 11. / TAU) - .5);
    vec3 fl = mix(vec3(1., .36, 0.), vec3(.85, .17, 0.), clamp(voro(p * 70.).x / .45, 0., 1.));
    fl = mix(fl, vec3(1., .62, .3), 1. - smoothstep(.035, .06, tri));
    c = mix(c, fl, smoothstep(.62, .7, k)); g = .85;
  }
  return c;
}
#elif FRUIT == 1
vec3 fruitCol(vec3 p, float d, out float g){                       // watermelon: striped rind, white layer, red flesh, seeds
  float st = .5 + .5 * sin(p.y * 210. + 5. * fbm(vec3(p.x * 10., p.y * 30., p.z * 30.)));
  vec3 rind = mix(vec3(.012, .07, .015), vec3(.09, .26, .05), smoothstep(.35, .55, st));
  g = .7; float k = d * 33.3;
  if (k < .13) return rind;
  vec3 c = mix(rind, vec3(.86, .9, .7), smoothstep(.13, .17, k));
  if (k > .3) {
    vec3 fl = mix(vec3(.72, .03, .05), vec3(.95, .12, .12), smoothstep(.3, .7, fbm(p * 8.)));
    if (k > .6) fl = mix(fl, vec3(.02, .015, .012), 1. - smoothstep(.09, .13, voro(p * 38.).x));
    c = mix(c, fl, smoothstep(.3, .38, k)); g = .8;
  }
  return c;
}
#elif FRUIT == 2
vec3 fruitCol(vec3 p, float d, out float g){                       // kiwi lying on its side: fuzzy skin, green flesh, seed ring, cream heart
  vec3 skin = mix(vec3(.085, .045, .016), vec3(.15, .085, .033), smoothstep(.25, .75, fbm(p * 260.)));
  skin *= .8 + .4 * vnoise(p * 520.);
  g = .1;
  if (d < .0025) return skin;
  float u = p.y / .088, v = (p.z - .042) / .05, rr = length(vec2(u, v));
  vec3 fl = rr < .22 ? mix(vec3(.8, .76, .42), vec3(.75, .72, .36), rr / .22)
          : rr < .3 ? mix(vec3(.75, .72, .36), vec3(.2, .5, 0.), (rr - .22) / .08)
          : rr < .6 ? mix(vec3(.2, .5, 0.), vec3(.08, .34, 0.), (rr - .3) / .3)
          : mix(vec3(.08, .34, 0.), vec3(.03, .16, 0.), clamp((rr - .6) / .4, 0., 1.));
  float tri = abs(fract(atan(v, u) * 34. / TAU) - .5);
  fl = mix(fl, vec3(.4, .62, .08), .35 * (1. - smoothstep(0., .12, tri)));
  if (rr > .27 && rr < .53) {
    float ring = smoothstep(.27, .3, rr) * (1. - smoothstep(.5, .53, rr));
    fl = mix(fl, vec3(.015, .01, .008), ring * (1. - smoothstep(.3, .36, voro(p * 110.).x)));
  }
  g = .8; return fl;
}
#elif FRUIT == 3
vec3 fruitCol(vec3 p, float d, out float g){                       // dragon fruit: pink scales with green edges, magenta flesh full of seeds
  g = .7;
  if (d < .0008) {
    vec3 skin = mix(vec3(.75, .02, .18), vec3(.95, .08, .3), smoothstep(.35, .65, fbm(p * 30.)));
    vec2 sc = voro(p * 26.);
    return mix(skin, vec3(.25, .45, .04), 1. - smoothstep(.015, .06, sc.y - sc.x));
  }
  float k = d / .004;
  vec3 fl = mix(vec3(.5, 0., .2), vec3(.72, .02, .32), smoothstep(.35, .65, fbm(p * 18.)));
  fl = mix(fl, vec3(.012, .006, .006), 1. - smoothstep(.24, .3, voro(p * 170.).x));
  g = .8;
  return mix(vec3(.9, .12, .38), fl, smoothstep(.7, .9, k));
}
#else
vec3 fruitCol(vec3 p, float d, out float g){                       // pomegranate: matte red skin, cream rind, ruby arils, thin white walls
  vec3 skin = mix(vec3(.22, .01, .02), vec3(.42, .03, .04), smoothstep(.3, .7, fbm(p * 14.)));
  g = .35; float k = d / .01;
  if (k < .1) return skin;
  vec3 c = mix(skin, vec3(.93, .78, .55), smoothstep(.1, .14, k));
  if (k > .55) {
    vec2 v = voro(p * 55.);
    vec3 ar = v.x < .25 ? mix(vec3(.85, .08, .12), vec3(.55, 0., .05), v.x / .25) : mix(vec3(.55, 0., .05), vec3(.3, 0., .03), clamp((v.x - .25) / .35, 0., 1.));
    ar = mix(vec3(.8, .6, .45), ar, smoothstep(.02, .07, v.y - v.x));
    float tri = abs(fract(atan(p.y, p.x) * 6. / TAU) - .5);
    ar = mix(ar, vec3(.95, .84, .66), 1. - smoothstep(.012, .022, tri));
    c = mix(c, ar, smoothstep(.55, .6, k)); g = .95;
  }
  return c;
}
#endif
`;
