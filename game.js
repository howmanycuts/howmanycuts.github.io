// How Many Cuts? The game of the "How many cuts can it take?" videos.
// A round: swipe across the giant fruit until the cut count is reached, then it falls into cubes.
// Four rounds (10, 100, 500, 1,000 cuts); the knife gets more blades each round. The score is the cutting time.
import * as THREE from './vendor/three.module.min.js';
import { CONFIG } from './config.js';
import { FRUITS, Shape, splitCuts, buildCollapse, GLSL_COMMON, GLSL_FRUIT } from './fruits.js';

const $ = (id) => document.getElementById(id);
const Q = new URLSearchParams(location.search);
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const fmt = (n) => Math.round(n).toLocaleString('en-US');
const secs = (t) => `${t.toFixed(1)}s`;

// cuts of the round, cuts per swipe, seconds allowed
const ROUNDS = [
  { cuts: 10, blades: 1, time: 9 },
  { cuts: 100, blades: 5, time: 12 },
  { cuts: 500, blades: 20, time: 13 },
  { cuts: 1000, blades: 40, time: 13 },
];
const STAR3 = 20, STAR2 = 30;            // total cutting time (s) for 3 and 2 stars
const T_PAUSE = 0.35, T_COLLAPSE = 2.5, T_COUNT = 1.3, T_BETWEEN = 0.3;

// ---------------------------------------------------------------- text (English, Arabic)
const TEXT = {
  en: {
    title: 'HOW MANY <em>CUTS?</em>', tagline: 'Swipe to cut a giant fruit into millions of cubes', play: 'PLAY',
    cuts: 'CUTS', cubes: 'CUBES', round: 'ROUND', knife: 'KNIFE', swipe: 'SWIPE', wrong: 'OTHER WAY', startHint: 'SWIPE ACROSS THE FRUIT',
    timeup: "TIME'S UP!", done: 'ALL CUT!', retry: 'TRY AGAIN', next: 'NEXT FRUIT', again: 'PLAY AGAIN', share: 'SHARE', home: 'HOME',
    time: 'Time', best: 'Best', newBest: 'NEW BEST TIME!', unlocked: (f) => `${f} unlocked!`, locked: (f) => `Finish ${f} to unlock`,
    failNote: (a, b) => `${a} of ${b} cuts. Swipe faster!`, faster: 'Cut faster for 3 stars',
    shareText: (e, c, t) => `I cut a giant ${e} into ${c} cubes in ${t}! Can you beat me?`, copied: 'Copied!',
    lang: 'العربية', privacy: 'Privacy', videos: 'Watch the videos', bestShort: 'BEST',
    ask: 'This free game shows ads. Do you accept cookies for the ads?', askLink: 'Privacy', yes: 'ACCEPT', no: 'No thanks',
    noGl: 'This game needs WebGL (3D in the browser). Please try another browser or device.',
  },
  ar: {
    title: 'كم <em>قطعة؟</em>', tagline: 'اسحب لتقطيع فاكهة عملاقة إلى ملايين المكعبات', play: 'العب',
    cuts: 'قطعة', cubes: 'مكعب', round: 'الجولة', knife: 'السكين', swipe: 'اسحب', wrong: 'الاتجاه الآخر', startHint: 'اسحب فوق الفاكهة',
    timeup: 'انتهى الوقت!', done: 'تم التقطيع!', retry: 'حاول مجددًا', next: 'الفاكهة التالية', again: 'العب مجددًا', share: 'شارك', home: 'الرئيسية',
    time: 'الوقت', best: 'الأفضل', newBest: 'رقم قياسي جديد!', unlocked: (f) => `تم فتح ${f}!`, locked: (f) => `أكمل ${f} للفتح`,
    failNote: (a, b) => `${a} من ${b} قطعة. اسحب أسرع!`, faster: 'قطّع أسرع لتحصل على 3 نجوم',
    shareText: (e, c, t) => `قطّعت ${e} عملاقة إلى ${c} مكعب في ${t}! هل تستطيع التغلب عليّ؟`, copied: 'تم النسخ!',
    lang: 'English', privacy: 'الخصوصية', videos: 'شاهد الفيديوهات', bestShort: 'الأفضل',
    ask: 'هذه اللعبة المجانية تعرض إعلانات. هل تقبل ملفات تعريف الارتباط للإعلانات؟', askLink: 'الخصوصية', yes: 'موافق', no: 'لا شكرًا',
    noGl: 'هذه اللعبة تحتاج WebGL. جرّب متصفحًا أو جهازًا آخر.',
  },
};

// ---------------------------------------------------------------- saved on this device
const SAVE_KEY = 'howmanycuts.v1';
const save = { best: {}, done: {}, mute: false, lang: null, fruit: 0 };
try { Object.assign(save, JSON.parse(localStorage.getItem(SAVE_KEY) || '{}')); } catch { /* private window: play without saving */ }
const persist = () => { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch { /* same */ } };
let LANG = Q.get('lang') || save.lang || ((navigator.language || 'en').toLowerCase().startsWith('ar') ? 'ar' : 'en');
if (!TEXT[LANG]) LANG = 'en';
let T = TEXT[LANG];
const fruitName = (f) => (LANG === 'ar' ? f.ar : f.en);
const unlocked = (i) => i === 0 || !!save.done[FRUITS[i - 1].id] || Q.has('all');

// ---------------------------------------------------------------- sound (all synthesized, like the videos)
let ac = null, master = null, noiseBuf = null;
function audioInit() {
  if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ac = new AC();
  master = ac.createGain(); master.gain.value = save.mute ? 0 : 0.85; master.connect(ac.destination);
  noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
}
function nz(t, dur, type, freq, q, gain) {
  const s = ac.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
  const f = ac.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
  const g = ac.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
  s.connect(f).connect(g).connect(master); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02);
}
function tone(t, f0, f1, dur, gain, type = 'sine') {
  const o = ac.createOscillator(); o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  const g = ac.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
  o.connect(g).connect(master); o.start(t); o.stop(t + dur + 0.02);
}
const sfx = {
  chop(power) {                                         // blade click, wet slice, thud on the board
    if (!ac) return; const t = ac.currentTime, v = 0.7 + 0.3 * Math.random();
    nz(t, 0.018, 'highpass', 3200, 0.7, 0.32 * v);
    nz(t + 0.004, 0.07 + 0.03 * power, 'bandpass', 950 + 500 * Math.random(), 1.1, 0.5 * v);
    tone(t + 0.01, 150 + 30 * Math.random(), 55, 0.09, 0.55);
  },
  collapse() {                                          // many small pieces falling on wood
    if (!ac) return; const t = ac.currentTime;
    nz(t, 1.5, 'lowpass', 420, 0.5, 0.42);
    for (let i = 0; i < 46; i++) { const u = Math.random(); nz(t + 0.08 + 1.35 * u * u, 0.03, 'bandpass', 700 + 2400 * Math.random(), 2.5, 0.2 * (1 - 0.6 * u)); }
  },
  tick() { if (!ac) return; tone(ac.currentTime, 1500, 1100, 0.025, 0.07, 'square'); },
  round() { if (!ac) return; const t = ac.currentTime; tone(t, 660, 660, 0.12, 0.2, 'triangle'); tone(t + 0.1, 990, 990, 0.2, 0.2, 'triangle'); },
  win() { if (!ac) return; const t = ac.currentTime; [523, 659, 784, 1047].forEach((f, i) => tone(t + i * 0.1, f, f, 0.32, 0.2, 'triangle')); },
  fail() { if (!ac) return; const t = ac.currentTime; tone(t, 320, 110, 0.5, 0.28, 'sawtooth'); },
  click() { if (!ac) return; tone(ac.currentTime, 900, 600, 0.05, 0.14, 'triangle'); },
  wrong() { if (!ac) return; tone(ac.currentTime, 220, 160, 0.12, 0.16, 'square'); },
};
const buzz = (ms) => { try { navigator.vibrate?.(ms); } catch { /* not allowed */ } };

// ---------------------------------------------------------------- 3D scene
const stage = $('stage'), canvas = $('gl');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
} catch {
  const d = document.createElement('div'); d.id = 'fatal'; d.textContent = T.noGl; stage.append(d);
  throw new Error('no WebGL');
}
const COARSE = matchMedia('(pointer: coarse)').matches;
const CORES = navigator.hardwareConcurrency || 4;
const CUBE_CAP = +Q.get('cap') || (COARSE ? (CORES >= 8 ? 45000 : 26000) : 70000);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(40, 0.6, 0.05, 20);
camera.up.set(0, 0, 1);
const CAM = new THREE.Vector3(0, -0.76, 0.50), LOOK = new THREE.Vector3(0, 0.03, 0.012);

const VERT = /* glsl */`
varying vec3 vP; varying vec3 vN; varying vec3 vW;
void main(){ vP = position; vN = normal; vec4 w = modelMatrix * vec4(position, 1.); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
const HEAD = /* glsl */`varying vec3 vP; varying vec3 vN; varying vec3 vW;\n` + GLSL_COMMON;

function shader(frag, uniforms = {}, extra = {}) {
  return new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: HEAD + frag, uniforms, ...extra });
}
const v3 = (a) => new THREE.Vector3(a[0], a[1], a[2]);

// wall and counter: two tones of one colour, lit by a soft spot
const plainFrag = /* glsl */`
uniform vec3 uC0, uC1, uSpot; uniform float uScale, uGain;
void main(){
  vec3 c = mix(uC0, uC1, fbm(vP * uScale));
  float l = 1.5 - 1.15 * smoothstep(.05, 1.25, length(vW - uSpot));
  gl_FragColor = vec4(toScreen(c * l * uGain), 1.);
}`;
const wallMat = shader(plainFrag, { uC0: { value: new THREE.Vector3() }, uC1: { value: new THREE.Vector3() }, uSpot: { value: new THREE.Vector3(-0.1, 0.75, 0.42) }, uScale: { value: 2.5 }, uGain: { value: 1.5 } });
const counterMat = shader(plainFrag, { uC0: { value: new THREE.Vector3() }, uC1: { value: new THREE.Vector3() }, uSpot: { value: new THREE.Vector3(-0.05, -0.05, 0) }, uScale: { value: 4 }, uGain: { value: 1.7 } });
const wall = new THREE.Mesh(new THREE.PlaneGeometry(6, 6), wallMat); wall.rotation.x = Math.PI / 2; wall.position.set(0, 0.75, 1);
const counter = new THREE.Mesh(new THREE.PlaneGeometry(6, 6), counterMat); counter.position.z = -0.024;
scene.add(wall, counter);

// the board, with the soft shadow of what is on it
const boardMat = shader(/* glsl */`
uniform vec4 uSh; uniform float uShK;
void main(){
  float gr = fbm(vec3(vP.x * 5., vP.y * 46., vP.z * 46.)), ring = .5 + .5 * sin(vP.y * 150. + gr * 9.);
  vec3 alb = mix(vec3(.26, .125, .05), vec3(.5, .28, .12), gr * .65 + ring * .35);
  vec3 N = normalize(vN), V = normalize(cameraPosition - vW);
  float sh = 1.;
  if (N.z > .5) { vec2 q = (vW.xy - uSh.xy) / uSh.zw; sh = 1. - uShK * (1. - smoothstep(.7, 1.5, length(q))); }
  gl_FragColor = vec4(toScreen(shade(alb, N, V, .3) * sh), 1.);
}`, { uSh: { value: new THREE.Vector4(0.012, 0.015, 0.12, 0.12) }, uShK: { value: 0.62 } });
const board = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.34, 0.024), boardMat); board.position.z = -0.012;
scene.add(board);

// one colour, used for the knife
const solid = (col, gloss) => shader(/* glsl */`
uniform vec3 uCol; uniform float uGloss;
void main(){ vec3 N = normalize(vN), V = normalize(cameraPosition - vW);
  float sky = .55 + .45 * N.z;
  gl_FragColor = vec4(toScreen(shade(uCol, N, V, uGloss) + uCol * sky * uGloss * .35), 1.); }`,
  { uCol: { value: v3(col) }, uGloss: { value: gloss } });
const knife = new THREE.Group();
{
  const s = new THREE.Shape();
  s.moveTo(0, 0); s.lineTo(0.235, 0); s.quadraticCurveTo(0.29, 0.006, 0.305, 0.05); s.lineTo(0, 0.05); s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.0026, bevelEnabled: false });
  g.translate(-0.15, 0, -0.0013); g.rotateX(Math.PI / 2);
  const blade = new THREE.Mesh(g, solid([0.62, 0.64, 0.68], 0.95));
  const handle = new THREE.Mesh(new THREE.BoxGeometry(0.115, 0.017, 0.03), solid([0.03, 0.025, 0.022], 0.5));
  handle.position.set(-0.15 - 0.0575, 0, 0.032);
  knife.add(blade, handle);
  for (const m of knife.children) m.material.side = THREE.DoubleSide;
}
knife.scale.setScalar(0.82); knife.visible = false; scene.add(knife);

// the whole fruit: its skin, and the cut lines drawn on it
function fruitMaterial(f) {
  const frag = GLSL_FRUIT + /* glsl */`
uniform vec3 uB0, uB1, uN, uDone, uLine;
float lineOf(float x, float b0, float b1, float n, float done){
  if (done <= 0.) return 0.;
  float cell = (b1 - b0) / (n + 1.), gi = (x - b0) / cell, i = floor(gi + .5);
  if (i < 1. || i > n) return 0.;
  float on = clamp(done + .5 - i, 0., 1.), dd = abs(gi - i) * cell;
  float w = min(.0012, cell * .17), fw = fwidth(x) + 1e-6;
  float a = 1. - smoothstep(w - fw, w + fw, dd);
  a = mix(a, min(1., 2. * w / cell), smoothstep(.25, .6, fw / cell));     // lines closer than a pixel: an even tint
  return a * on;
}
void main(){
  float g; vec3 alb = fruitCol(vP, 0., g);
  float L = max(lineOf(vP.x, uB0.x, uB1.x, uN.x, uDone.x), max(lineOf(vP.y, uB0.y, uB1.y, uN.y, uDone.y), lineOf(vP.z, uB0.z, uB1.z, uN.z, uDone.z)));
  alb = mix(alb, uLine, L * .92);
  vec3 N = normalize(vN), V = normalize(cameraPosition - vW);
  float ao = mix(.62, 1., smoothstep(0., .03, vW.z));
  gl_FragColor = vec4(toScreen(shade(alb, N, V, g * (1. - .6 * L)) * ao), 1.);
}`;
  return shader(frag, {
    uShape: { value: new THREE.Vector3(f.shape.ax, f.shape.ay, f.shape.H) }, uWob: { value: wobUniform(f) },
    uB0: { value: new THREE.Vector3() }, uB1: { value: new THREE.Vector3() }, uN: { value: new THREE.Vector3(1, 1, 1) },
    uDone: { value: new THREE.Vector3() }, uLine: { value: v3(f.line) },
  }, { defines: { FRUIT: f.glsl }, extensions: { derivatives: true } });
}
function wobUniform(f) {
  const w = [0, 1, 2].map((i) => f.shape.wob[i] || [1, 0, 0]);
  return w.map((a) => new THREE.Vector3(a[0], a[1], a[2]));
}

// the cubes: every cube flies from its place in the fruit to its place in the pile, all in the vertex shader
const CUBE_VERT = /* glsl */`
attribute vec3 aP0, aP1, aRot; attribute vec2 aDT;
uniform vec3 uSize; uniform float uT, uShrink, uScale;
varying vec3 vP; varying vec3 vN; varying vec3 vW; varying float vR;
mat3 rot(vec3 r){ vec3 c = cos(r), s = sin(r);
  return mat3(c.y * c.z, c.y * s.z, -s.y, s.x * s.y * c.z - c.x * s.z, s.x * s.y * s.z + c.x * c.z, s.x * c.y, c.x * s.y * c.z + s.x * s.z, c.x * s.y * s.z - s.x * c.z, c.x * c.y); }
void main(){
  float u = clamp((uT - aDT.x) / aDT.y, 0., 1.), e = 1. - (1. - u) * (1. - u);
  vec3 c = mix(aP0, aP1, e); c.z = mix(aP0.z, aP1.z, u * u);
  mat3 R = rot(aRot * e);
  vec3 l = position * uSize;
  vP = aP0 + l; vN = R * normal; vR = fract(aRot.x * 91.7 + aRot.y * 37.3);
  vW = c + R * (l * uShrink * uScale);
  gl_Position = projectionMatrix * viewMatrix * vec4(vW, 1.);
}`;
function cubeMaterial(f) {
  const frag = `varying float vR;\n` + HEAD + GLSL_FRUIT + /* glsl */`
void main(){
  float g; vec3 alb = fruitCol(vP, depthOf(vP), g) * (.9 + .2 * vR);
  vec3 N = normalize(vN), V = normalize(cameraPosition - vW);
  float ao = mix(.6, 1., smoothstep(0., .035, vW.z));
  gl_FragColor = vec4(toScreen(shade(alb, N, V, g) * ao), 1.);
}`;
  return new THREE.ShaderMaterial({
    vertexShader: CUBE_VERT, fragmentShader: frag, defines: { FRUIT: f.glsl },
    uniforms: { uShape: { value: new THREE.Vector3(f.shape.ax, f.shape.ay, f.shape.H) }, uWob: { value: wobUniform(f) },
      uSize: { value: new THREE.Vector3(1, 1, 1) }, uT: { value: 0 }, uShrink: { value: 0.94 }, uScale: { value: 1 } },
  });
}
const BOX = new THREE.BoxGeometry(1, 1, 1);

// juice drops
const DROPS = 220;
const dropPos = new Float32Array(DROPS * 3).fill(-9), dropVel = new Float32Array(DROPS * 3), dropLife = new Float32Array(DROPS);
const dropGeo = new THREE.BufferGeometry(); dropGeo.setAttribute('position', new THREE.BufferAttribute(dropPos, 3));
const dropMat = new THREE.PointsMaterial({ size: 0.0075, sizeAttenuation: true, transparent: true, opacity: 0.95, depthWrite: false });
const drops = new THREE.Points(dropGeo, dropMat); drops.frustumCulled = false; scene.add(drops);
let dropNext = 0;
function spawnDrop(x, y, z, vx, vy, vz) {
  const i = dropNext; dropNext = (dropNext + 1) % DROPS;
  dropPos.set([x, y, z], i * 3); dropVel.set([vx, vy, vz], i * 3); dropLife[i] = 0.5 + 0.3 * Math.random();
}

// ---------------------------------------------------------------- the fruit on the board
const F = { i: -1, def: null, shape: null, mesh: null, mat: null, cubes: null, cubeMat: null };
function setFruit(i) {
  if (F.i === i) return;
  if (F.mesh) { scene.remove(F.mesh); F.mesh.geometry.dispose(); F.mat.dispose(); }
  if (F.cubes) { scene.remove(F.cubes); F.cubes.geometry.dispose(); F.cubeMat.dispose(); F.cubes = null; }
  const f = FRUITS[i], sh = new Shape(f.shape), m = sh.mesh();
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(m.pos, 3)); geo.setIndex(m.idx); geo.computeVertexNormals();
  F.i = i; F.def = f; F.shape = sh; F.mat = fruitMaterial(f); F.cubeMat = cubeMaterial(f);
  F.mat.uniforms.uB0.value.set(sh.bbox[0], sh.bbox[2], sh.bbox[4]); F.mat.uniforms.uB1.value.set(sh.bbox[1], sh.bbox[3], sh.bbox[5]);
  F.mesh = new THREE.Mesh(geo, F.mat); scene.add(F.mesh);
  wallMat.uniforms.uC0.value.fromArray(f.wall[0]); wallMat.uniforms.uC1.value.fromArray(f.wall[1]);
  counterMat.uniforms.uC0.value.fromArray(f.counter[0]); counterMat.uniforms.uC1.value.fromArray(f.counter[1]);
  dropMat.color.setRGB(f.juice[0], f.juice[1], f.juice[2]);
  setShadow(1);
  measure();
}
function setShadow(k) {                                     // k = 1: the fruit, larger: the pile
  const s = F.shape, u = boardMat.uniforms.uSh.value;
  u.z = s.ax * s.rmax * k; u.w = s.ay * s.rmax * k;
}
function setCubes(col) {
  if (F.cubes) { scene.remove(F.cubes); F.cubes.geometry.dispose(); }
  const g = new THREE.InstancedBufferGeometry();
  g.index = BOX.index; g.setAttribute('position', BOX.attributes.position); g.setAttribute('normal', BOX.attributes.normal);
  g.setAttribute('aP0', new THREE.InstancedBufferAttribute(col.p0, 3)); g.setAttribute('aP1', new THREE.InstancedBufferAttribute(col.p1, 3));
  g.setAttribute('aDT', new THREE.InstancedBufferAttribute(col.dt, 2)); g.setAttribute('aRot', new THREE.InstancedBufferAttribute(col.rot, 3));
  g.instanceCount = col.n;
  F.cubeMat.uniforms.uSize.value.fromArray(col.size); F.cubeMat.uniforms.uT.value = 0; F.cubeMat.uniforms.uScale.value = 1;
  F.cubes = new THREE.Mesh(g, F.cubeMat); F.cubes.frustumCulled = false; scene.add(F.cubes);
}

// ---------------------------------------------------------------- screen size, and where things are on the screen
const view = { w: 1, h: 1, fx: 0, fy: 0, fr: 1, dirX: [1, 0], dirY: [0, -1] };
const tmp = new THREE.Vector3();
function toPx(x, y, z) { tmp.set(x, y, z).project(camera); return [(tmp.x * 0.5 + 0.5) * view.w, (-tmp.y * 0.5 + 0.5) * view.h]; }
function measure() {
  if (!F.shape) return;
  camera.position.copy(CAM); camera.lookAt(LOOK); camera.updateMatrixWorld(); camera.updateProjectionMatrix();
  const s = F.shape, zc = s.H * 0.45;
  const c = toPx(0, 0, zc), px = toPx(s.ax, 0, zc), py = toPx(0, s.ay, zc), top = toPx(0, 0, s.H);
  const unit = (a, b) => { const d = [b[0] - a[0], b[1] - a[1]], l = Math.hypot(d[0], d[1]) || 1; return [d[0] / l, d[1] / l]; };
  view.fx = c[0]; view.fy = c[1]; view.dirX = unit(c, px); view.dirY = unit(c, py);
  view.fr = Math.max(Math.hypot(px[0] - c[0], px[1] - c[1]), Math.hypot(py[0] - c[0], py[1] - c[1]), Math.hypot(top[0] - c[0], top[1] - c[1])) * 1.15;
}
const trail = $('trail'), tctx = trail.getContext('2d');
function resize() {
  const r = stage.getBoundingClientRect();
  view.w = Math.max(1, r.width); view.h = Math.max(1, r.height);
  const dpr = Math.min(window.devicePixelRatio || 1, CORES <= 4 ? 1.5 : 2);
  renderer.setPixelRatio(dpr); renderer.setSize(view.w, view.h, false);
  trail.width = Math.round(view.w * dpr); trail.height = Math.round(view.h * dpr); tctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  camera.aspect = view.w / view.h;
  // a narrow phone: open the lens so the pile still fits between the edges
  camera.fov = Math.max(40, 2 * Math.atan(0.205 / 0.92 / camera.aspect) * 180 / Math.PI);
  measure();
}
new ResizeObserver(resize).observe(stage);

// ---------------------------------------------------------------- game state
const G = {
  state: 'home', round: 0, nxyz: [0, 0, 0], done: [0, 0, 0], shown: [0, 0, 0], cuts: 0, timeLeft: 0, started: false, used: 0, total: 0,
  col: null, colJob: 0, t: 0, lastCut: 0, cubes: 0, lastTick: 0, axisCuts: 0, pop: 0, squash: 0, shake: 0,
  kAxis: 0, kPos: 0, kAnim: 1, kFrom: 0,
};
const axisNow = () => (G.done[0] < G.nxyz[0] ? 0 : G.done[1] < G.nxyz[1] ? 1 : 2);
const cutCoord = (a, k) => { const b = F.shape.bbox; return b[a * 2] + (b[a * 2 + 1] - b[a * 2]) * (k + 1) / (G.nxyz[a] + 1); };

const ui = {
  hud: $('hud'), home: $('home'), sheet: $('sheet'), pill: $('pill'), nCuts: $('nCuts'), lCuts: $('lCuts'), nCubes: $('nCubes'), cCubes: $('cCubes'),
  clock: $('clock'), fill: $('clockFill'), hint: $('hint'), float: $('float'), banner: $('banner'),
};
const restart = (el, cls) => { el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); };

function showHint(kind) {
  const a = axisNow();
  ui.hint.className = a === 0 ? 'v' : '';
  if (kind === 'bad') { ui.hint.innerHTML = `${T.wrong} <i>${a === 0 ? '↕' : '↔'}</i>`; restart(ui.hint, 'bad'); }
  else ui.hint.innerHTML = `${T.swipe} <i>${a === 0 ? '↕' : '↔'}</i>`;
  ui.hint.hidden = false;
}

function goHome() {
  G.state = 'home'; G.done = [0, 0, 0]; G.shown = [0, 0, 0];
  ui.hud.hidden = true; ui.sheet.hidden = true; ui.home.hidden = false;
  knife.visible = false; if (F.cubes) F.cubes.visible = false;
  F.mesh.visible = true; F.mesh.scale.set(1, 1, 1); F.mat.uniforms.uDone.value.set(0, 0, 0);
  setShadow(1); boardMat.uniforms.uShK.value = 0.62;
  topAd();
  renderHome();
}
function startGame() {
  audioInit(); sfx.click();
  ui.home.hidden = true; ui.sheet.hidden = true; ui.hud.hidden = false;
  G.round = 0; G.total = 0;
  topAd();
  startRound();
}
function startRound() {
  const r = ROUNDS[G.round];
  G.state = 'cut'; G.nxyz = splitCuts(r.cuts, F.shape); G.done = [0, 0, 0]; G.shown = [0, 0, 0]; G.cuts = 0; G.axisCuts = 0;
  G.timeLeft = r.time; G.started = false; G.used = 0; G.t = 0; G.cubes = 0;
  F.mat.uniforms.uN.value.fromArray(G.nxyz); F.mat.uniforms.uDone.value.set(0, 0, 0);
  F.mesh.visible = true; G.pop = 1;
  if (F.cubes) F.cubes.visible = false;
  setShadow(1);
  G.kAxis = 0; G.kPos = cutCoord(0, 0); G.kFrom = G.kPos; G.kAnim = 1; knife.visible = true;
  ui.pill.textContent = `${T.round} ${G.round + 1}/${ROUNDS.length}`; restart(ui.pill, 'pop');
  ui.nCuts.textContent = '0'; ui.lCuts.textContent = `${T.cuts} / ${fmt(r.cuts)}`;
  ui.cCubes.hidden = true; ui.clock.hidden = false; ui.clock.classList.remove('low'); ui.fill.style.transform = 'scaleX(1)';
  $('banTitle').textContent = `${fmt(r.cuts)} ${T.cuts}`;
  $('banSub').textContent = `${T.knife} ×${r.blades}`; $('banSub').hidden = r.blades === 1;
  restart(ui.banner, 'go');
  if (G.round === 0) { ui.hint.className = ''; ui.hint.innerHTML = `${T.startHint} <i>↕</i>`; ui.hint.classList.add('v'); ui.hint.hidden = false; } else showHint();
  if (G.round > 0) sfx.round();
  // the cubes of this round are prepared while the player cuts
  G.col = null; const job = ++G.colJob, nxyz = G.nxyz.slice(), sh = F.shape, seed = G.round + 1 + F.i * 7;
  setTimeout(() => { if (job === G.colJob) G.col = buildCollapse(sh, nxyz, CUBE_CAP, seed); }, 60);
}
function doCut() {
  if (G.state !== 'cut') return;
  const r = ROUNDS[G.round], a = axisNow(), n = Math.min(r.blades, G.nxyz[a] - G.done[a]);
  const first = G.done[a], last = first + n - 1;
  G.done[a] += n; G.cuts += n; G.started = true; G.lastCut = performance.now();
  G.squash = 1; G.shake = Math.min(1, 0.35 + n * 0.02);
  G.kAxis = a; G.kFrom = cutCoord(a, first); G.kPos = cutCoord(a, last); G.kAnim = 0;
  ui.nCuts.textContent = fmt(G.cuts); restart(ui.nCuts, 'pop');
  if (n > 1) { ui.float.textContent = `+${n}`; restart(ui.float, 'go'); }
  sfx.chop(Math.min(1, n / 40)); buzz(n > 1 ? 14 : 8);
  // juice along the cut
  const s = F.shape, count = 10 + Math.min(14, n);
  for (let i = 0; i < count; i++) {
    const k = first + Math.floor(Math.random() * n), c = cutCoord(a, k), t = (Math.random() * 2 - 1) * 0.9;
    let x, y, z;
    if (a === 0) { x = c; y = t * s.ay; } else if (a === 1) { x = t * s.ax; y = c; } else { const th = Math.random() * Math.PI * 2, q = Math.sqrt(Math.max(0, 1 - (c / s.H) ** 2)); x = Math.cos(th) * s.ax * q; y = Math.sin(th) * s.ay * q; }
    const rho = s.rho(x, y); if (rho >= 1) continue;
    z = a === 2 ? c : s.top(rho);
    spawnDrop(x, y, z, (Math.random() - 0.5) * 0.5 + x * 1.5, (Math.random() - 0.5) * 0.5 + y * 1.5 - 0.1, 0.35 + Math.random() * 0.5);
  }
  if (++G.axisCuts >= 3) ui.hint.hidden = true;
  if (G.cuts >= r.cuts) { G.state = 'pause'; G.t = 0; G.total += G.used; ui.hint.hidden = true; ui.clock.hidden = true; }
  else if (axisNow() !== a) { G.axisCuts = 0; showHint(); }
}
function startCollapse() {
  if (!G.col) G.col = buildCollapse(F.shape, G.nxyz, CUBE_CAP, G.round + 1 + F.i * 7);
  setCubes(G.col);
  F.mesh.visible = false; knife.visible = false;
  G.state = 'collapse'; G.t = 0; G.shake = 1;
  ui.cCubes.hidden = false; ui.nCubes.textContent = '0';
  sfx.collapse(); buzz(40);
}
function endGame(win) {
  G.state = win ? 'result' : 'fail';
  knife.visible = false; ui.hint.hidden = true;
  const f = F.def, r = ROUNDS[G.round], last = F.i === FRUITS.length - 1;
  const stars = win ? (G.total <= STAR3 ? 3 : G.total <= STAR2 ? 2 : 1) : 0;
  let note = '', isNew = false;
  if (win) {
    const old = save.best[f.id], firstTime = !save.done[f.id];
    if (!old || G.total < old.t) { save.best[f.id] = { t: +G.total.toFixed(2), s: stars }; isNew = !!old; }
    save.done[f.id] = true; persist();
    note = isNew ? T.newBest : firstTime && !last ? T.unlocked(fruitName(FRUITS[F.i + 1])) : stars < 3 ? T.faster : '';
    sfx.win(); buzz([30, 40, 60]);
  } else { note = T.failNote(fmt(G.cuts), fmt(r.cuts)); sfx.fail(); buzz(120); }
  $('shTitle').textContent = win ? `${f.emoji} ${T.done}` : T.timeup; $('shTitle').className = win ? '' : 'bad';
  $('stars').innerHTML = [0, 1, 2].map((i) => `<span class="${i < stars ? '' : 'off'}">★</span>`).join(''); $('stars').hidden = !win;
  $('big').textContent = win ? fmt(G.col.nTrue) : `${T.round} ${G.round + 1}/${ROUNDS.length}`;
  $('bigLabel').textContent = win ? T.cubes : ''; $('bigLabel').hidden = !win;
  $('stats').hidden = !win;
  $('stTime').textContent = secs(G.total); $('stTimeL').textContent = T.time;
  $('stBest').textContent = save.best[f.id] ? secs(save.best[f.id].t) : '–'; $('stBestL').textContent = T.best;
  $('note').textContent = note; $('note').className = isNew ? 'new' : '';
  const main = $('shMain');
  main.textContent = !win ? T.retry : last ? T.again : T.next; main.dataset.act = !win ? 'again' : last ? 'again' : 'next';
  $('shAgain').textContent = T.again; $('shAgain').hidden = !win || last;
  $('shShare').textContent = T.share; $('shShare').hidden = !win;
  $('shHome').textContent = T.home;
  topAd();
  ui.sheet.hidden = false;
  const room = view.h - $('sheet').querySelector('.card').offsetHeight - 40;
  if (adsOk() && CONFIG.ads.card.key && room >= CONFIG.ads.card.h) showAd($('adCard'), CONFIG.ads.card); else clearAd($('adCard'));
}

// ---------------------------------------------------------------- swipes
let ptr = null;
const pts = [];                                             // the trail under the finger
function local(e) { const r = stage.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }
function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, l = dx * dx + dy * dy || 1, t = clamp(((px - ax) * dx + (py - ay) * dy) / l, 0, 1);
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
}
canvas.addEventListener('pointerdown', (e) => {
  audioInit();
  const [x, y] = local(e);
  ptr = { id: e.pointerId, x, y, sign: 0 };
  pts.length = 0; pts.push([x, y, performance.now()]);
  try { canvas.setPointerCapture(e.pointerId); } catch { /* old browser */ }
});
canvas.addEventListener('pointermove', (e) => {
  if (!ptr || e.pointerId !== ptr.id) return;
  const [x, y] = local(e), now = performance.now();
  pts.push([x, y, now]); if (pts.length > 40) pts.shift();
  if (G.state !== 'cut') return;
  const dir = axisNow() === 0 ? view.dirY : view.dirX;
  const dx = x - ptr.x, dy = y - ptr.y, along = dx * dir[0] + dy * dir[1], across = Math.abs(dx * dir[1] - dy * dir[0]);
  const need = Math.max(34, view.w * 0.15);
  if (ptr.sign && along * ptr.sign > 0) { ptr.x = x; ptr.y = y; return; }        // still going the same way: wait for the way back
  if (Math.abs(along) >= need && Math.abs(along) > across * 0.8) {
    if (segDist(view.fx, view.fy, ptr.x, ptr.y, x, y) <= view.fr && now - G.lastCut > 55) { const a0 = axisNow(); ptr.sign = Math.sign(along); doCut(); if (G.state !== 'cut' || axisNow() !== a0) ptr.mute = true; }
    ptr.x = x; ptr.y = y;
  } else if (across >= need * 1.25 && across > Math.abs(along) * 1.7) {
    if (!ptr.mute && segDist(view.fx, view.fy, ptr.x, ptr.y, x, y) <= view.fr) { showHint('bad'); sfx.wrong(); }
    ptr.x = x; ptr.y = y; ptr.sign = 0;
  }
});
const lift = (e) => { if (ptr && e.pointerId === ptr.id) ptr = null; };
canvas.addEventListener('pointerup', lift); canvas.addEventListener('pointercancel', lift);
addEventListener('keydown', (e) => { if (e.code === 'Space' && G.state === 'cut') { e.preventDefault(); audioInit(); if (performance.now() - G.lastCut > 55) doCut(); } });

function drawTrail() {
  const now = performance.now();
  tctx.clearRect(0, 0, trail.width, trail.height);
  while (pts.length && now - pts[0][2] > 220) pts.shift();
  if (pts.length < 2) { pts.length = 0; return; }
  tctx.lineCap = 'round'; tctx.lineJoin = 'round';
  for (let i = 1; i < pts.length; i++) {
    const k = clamp(1 - (now - pts[i][2]) / 220, 0, 1);
    if (k <= 0) continue;
    tctx.strokeStyle = `rgba(255,248,235,${0.85 * k})`; tctx.lineWidth = 2 + 9 * k * (i / pts.length);
    tctx.beginPath(); tctx.moveTo(pts[i - 1][0], pts[i - 1][1]); tctx.lineTo(pts[i][0], pts[i][1]); tctx.stroke();
  }
}

// ---------------------------------------------------------------- every frame
let prev = performance.now(), clockT = 0;
function frame() {
  requestAnimationFrame(frame);
  const now = performance.now();
  const dt = Math.min(0.05, (now - prev) / 1000); prev = now; clockT += dt;
  const s = F.shape;

  if (G.state === 'cut') {
    if (G.started) {
      G.timeLeft -= dt; G.used += dt;
      const r = ROUNDS[G.round], k = clamp(G.timeLeft / r.time, 0, 1);
      ui.fill.style.transform = `scaleX(${k})`; ui.clock.classList.toggle('low', G.timeLeft < 3);
      if (G.timeLeft <= 0) endGame(false);
    }
  } else if (G.state === 'pause') {
    G.t += dt; if (G.t >= T_PAUSE) startCollapse();
  } else if (G.state === 'collapse') {
    G.t += dt;
    F.cubeMat.uniforms.uT.value = G.t;
    setShadow(1 + 0.2 * clamp(G.t / 1.2, 0, 1));
    const k = clamp(G.t / T_COUNT, 0, 1), val = Math.round(G.col.nTrue * (1 - (1 - k) ** 3));
    if (val !== G.cubes) { G.cubes = val; ui.nCubes.textContent = fmt(val); if (now - G.lastTick > 45 && k < 1) { G.lastTick = now; sfx.tick(); } }
    if (G.t >= T_COLLAPSE) {
      if (G.round === ROUNDS.length - 1) endGame(true);
      else { G.state = 'between'; G.t = 0; }
    }
  } else if (G.state === 'between') {
    G.t += dt;
    F.cubeMat.uniforms.uScale.value = 1 - clamp(G.t / T_BETWEEN, 0, 1) ** 2;
    if (G.t >= T_BETWEEN) { G.round++; startRound(); }
  }

  // the fruit: lines appear one after the other, a small squash on each cut, a pop when it arrives
  if (F.mesh.visible) {
    const u = F.mat.uniforms.uDone.value, k = Math.min(1, dt * 26);
    for (let a = 0; a < 3; a++) G.shown[a] += (G.done[a] - G.shown[a]) * k;
    u.set(G.shown[0], G.shown[1], G.shown[2]);
    G.squash = Math.max(0, G.squash - dt * 9); G.pop = Math.max(0, G.pop - dt * 4);
    const pop = 1 - G.pop * G.pop * 0.45 + Math.sin(G.pop * Math.PI) * 0.12;
    const breathe = G.state === 'home' ? 1 + 0.012 * Math.sin(clockT * 2.2) : 1;
    F.mesh.scale.set(pop * (1 + 0.025 * G.squash) * breathe, pop * (1 + 0.025 * G.squash) * breathe, pop * (1 - 0.06 * G.squash) * breathe);
  }

  // the knife: waits above the next cut, comes down and goes back up
  if (knife.visible) {
    G.kAnim = Math.min(1, G.kAnim + dt / 0.2);
    const a = G.kAnim < 1 ? G.kAxis : axisNow();
    const down = G.kAnim < 0.35 ? G.kAnim / 0.35 : 1 - (G.kAnim - 0.35) / 0.65;
    const d = G.kAnim < 1 ? down * (2 - down) : 0;
    let c = G.kAnim < 1 ? G.kFrom + (G.kPos - G.kFrom) * clamp(G.kAnim / 0.35, 0, 1) : (G.done[a] < G.nxyz[a] ? cutCoord(a, G.done[a]) : G.kPos);
    const hover = 0.006 * Math.sin(clockT * 3);
    if (a === 0) { knife.rotation.set(0, 0, -Math.PI / 2); knife.position.set(c, 0.01, (s.H + 0.03 + hover) * (1 - d) + 0.004 * d); }
    else if (a === 1) { knife.rotation.set(0, 0, 0); knife.position.set(0.012, c, (s.H + 0.03 + hover) * (1 - d) + 0.004 * d); }
    else { knife.rotation.set(Math.PI / 2, 0, 0); knife.position.set(0.012, (-s.ay - 0.07 + hover) * (1 - d) + s.ay * 0.25 * d, c); }
  }

  // juice
  let live = false;
  for (let i = 0; i < DROPS; i++) {
    if (dropLife[i] <= 0) continue;
    live = true; dropLife[i] -= dt;
    const j = i * 3; dropVel[j + 2] -= 3.2 * dt;
    dropPos[j] += dropVel[j] * dt; dropPos[j + 1] += dropVel[j + 1] * dt; dropPos[j + 2] += dropVel[j + 2] * dt;
    if (dropLife[i] <= 0 || dropPos[j + 2] < 0) { dropLife[i] = 0; dropPos[j + 2] = -9; }
  }
  if (live || dropGeo.attributes.position.needsUpdate) dropGeo.attributes.position.needsUpdate = true;

  G.shake = Math.max(0, G.shake - dt * 6);
  const sh = G.shake * G.shake * 0.006;
  camera.position.set(CAM.x + (Math.random() - 0.5) * sh, CAM.y, CAM.z + (Math.random() - 0.5) * sh);
  camera.lookAt(LOOK);
  renderer.render(scene, camera);
  drawTrail();
}

// ---------------------------------------------------------------- home screen and buttons
function renderHome() {
  $('title').innerHTML = T.title; $('tagline').textContent = T.tagline; $('play').textContent = T.play;
  $('langBtn').textContent = T.lang; $('privacy').textContent = T.privacy;
  const yt = $('yt'); yt.hidden = !CONFIG.youtube; yt.href = CONFIG.youtube || '#'; yt.textContent = T.videos;
  document.documentElement.lang = LANG;
  for (const id of ['home', 'sheet', 'hint', 'banner', 'ask', 'lCuts', 'lCubes', 'pill']) $(id).dir = LANG === 'ar' ? 'rtl' : 'ltr';
  $('lCubes').textContent = T.cubes;
  const box = $('fruits'); box.replaceChildren();
  FRUITS.forEach((f, i) => {
    const b = document.createElement('button'), open = unlocked(i), best = save.best[f.id];
    b.className = `fruit${open ? '' : ' locked'}`; b.setAttribute('aria-pressed', i === F.i); b.setAttribute('aria-label', fruitName(f));
    b.innerHTML = `<span class="e">${f.emoji}</span><span class="s">${best ? '★'.repeat(best.s) : ''}</span>`;
    b.addEventListener('click', () => { audioInit(); sfx.click(); save.fruit = i; persist(); setFruit(i); G.pop = 1; renderHome(); });
    box.append(b);
  });
  const open = unlocked(F.i), best = save.best[F.def.id];
  $('fruitName').innerHTML = `${fruitName(F.def)}<small>${open ? (best ? `${T.bestShort} ${secs(best.t)}` : '') : T.locked(fruitName(FRUITS[F.i - 1]))}</small>`;
  $('play').disabled = !open;
}
$('play').addEventListener('click', () => { if (unlocked(F.i)) startGame(); });
$('langBtn').addEventListener('click', () => { LANG = LANG === 'ar' ? 'en' : 'ar'; T = TEXT[LANG]; save.lang = LANG; persist(); renderHome(); setAskText(); });
$('bHome').addEventListener('click', () => { sfx.click(); G.colJob++; goHome(); });
function setMute() { if (master) master.gain.value = save.mute ? 0 : 0.85; $('mOn').toggleAttribute('hidden', save.mute); $('mOff').toggleAttribute('hidden', !save.mute); }
$('bMute').addEventListener('click', () => { save.mute = !save.mute; persist(); audioInit(); setMute(); sfx.click(); });
$('shMain').addEventListener('click', (e) => {
  if (e.currentTarget.dataset.act === 'next') { save.fruit = F.i + 1; persist(); setFruit(F.i + 1); }
  startGame();
});
$('shAgain').addEventListener('click', startGame);
$('shHome').addEventListener('click', () => { sfx.click(); goHome(); });
let toastT = 0;
function toast(msg) { const t = $('toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 1600); }
$('shShare').addEventListener('click', async () => {
  const text = T.shareText(F.def.emoji, fmt(G.col.nTrue), secs(G.total)), url = location.origin + location.pathname;
  try {
    if (navigator.share) await navigator.share({ text, url });
    else { await navigator.clipboard.writeText(`${text} ${url}`); toast(T.copied); }
  } catch { /* the player closed the share box */ }
});

// ---------------------------------------------------------------- ads (Adsterra banners; off until config.js has keys)
const AD_OK_KEY = 'howmanycuts.ads';
const IN_EUROPE = Q.has('eu') || /^(Europe\/|Atlantic\/(Reykjavik|Canary|Madeira|Azores|Faroe)|Asia\/(Nicosia|Famagusta))/.test(Intl.DateTimeFormat().resolvedOptions().timeZone || '');
const ADS_BASE = CONFIG.ads.on && !Q.has('noads') && (Q.has('ads') || !/^(localhost|127\.0\.0\.1)$/.test(location.hostname));
const adAnswer = () => { try { return localStorage.getItem(AD_OK_KEY); } catch { return null; } };
const adsOk = () => ADS_BASE && (!IN_EUROPE || adAnswer() === '1');
let adChain = Promise.resolve();                          // the Adsterra script reads one global, so one banner at a time
function showAd(slot, unit) {
  if (!adsOk() || !unit.key || !unit.src || view.w < unit.w) return;
  const turn = (slot.adTurn = (slot.adTurn || 0) + 1);
  slot.style.width = `${unit.w}px`; slot.style.height = `${unit.h}px`; slot.hidden = false;
  adChain = adChain.then(() => new Promise((done) => {
    if (slot.adTurn !== turn) return done();
    window.atOptions = { key: unit.key, format: 'iframe', height: unit.h, width: unit.w, params: {} };
    const s = document.createElement('script');
    s.src = unit.src; s.onload = s.onerror = done; setTimeout(done, 4000);
    slot.replaceChildren(s);
  }));
}
// the banner at the top: there from the moment the page opens, and a new one on each screen (home, round, result)
function topAd() {
  const u = CONFIG.ads.top, ok = adsOk() && !!u.key && view.h >= 520 && view.w >= u.w;
  document.body.classList.toggle('adtop', ok);
  if (ok) showAd($('adTop'), u); else clearAd($('adTop'));
}
// popunder and social bar: one script each, loaded once, as soon as ads are allowed
const adOnce = {};
function pageAds() {
  if (!adsOk()) return;
  for (const name of ['popunder', 'socialBar']) {
    const src = CONFIG.ads[name];
    if (!src || adOnce[name]) continue;
    adOnce[name] = true;
    const s = document.createElement('script'); s.async = true; s.dataset.cfasync = 'false'; s.src = src;
    document.body.append(s);
  }
}
function clearAd(slot) { slot.adTurn = (slot.adTurn || 0) + 1; slot.hidden = true; slot.replaceChildren(); }
function setAskText() { $('askText').textContent = T.ask; $('askLink').textContent = T.askLink; $('askYes').textContent = T.yes; $('askNo').textContent = T.no; }
if (ADS_BASE && IN_EUROPE && adAnswer() === null) {
  setAskText(); $('ask').hidden = false;
  for (const [id, v] of [['askYes', '1'], ['askNo', '0']]) $(id).addEventListener('click', () => { try { localStorage.setItem(AD_OK_KEY, v); } catch { /* no storage */ } $('ask').hidden = true; topAd(); pageAds(); });
}

// ---------------------------------------------------------------- start
resize();
setFruit(clamp(save.fruit | 0, 0, FRUITS.length - 1));
if (!unlocked(F.i)) setFruit(0);
setMute();
goHome();
pageAds();
requestAnimationFrame(frame);
if (Q.has('dev')) window.__g = { G, F, view, doCut, startGame, setFruit, goHome, endGame, ROUNDS };
