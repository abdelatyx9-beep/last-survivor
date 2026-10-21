// آخر الناجين 3D — third-person battle royale (three.js)
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import * as SkeletonUtils from "three/addons/utils/SkeletonUtils.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

const $ = (id) => document.getElementById(id);
const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const ar = (n) => Number(n).toLocaleString("ar-EG");
const MODEL_URL = window.SOLDIER_URL || "Soldier.glb";
const IS_TOUCH = matchMedia("(pointer: coarse)").matches || "ontouchstart" in window;

const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
};
$("nick").value = store.get("ls3.nick", "");
const SETTINGS = Object.assign({ look: 1, aim: 1, quality: "auto", sound: true }, store.get("ls3.settings", {}));
function saveSettings() { store.set("ls3.settings", SETTINGS); }

function rng(seed) {
  let a = seed >>> 0;
  return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// ---------------- constants (metres) ----------------
const S = 800;
const PR = 0.42;
const WALL_H = 3.2, CRATE_H = 2.6;
const ARMOR = [0, 0.3, 0.45, 0.6];
const WEAP = [
  { name: "مسدس",   dmg: 22, rate: 0.28, spread: 0.012, mag: 12, reload: 1.3, range: 60,  ammo: "l", pel: 1, snd: 1.0, fov: 62 },
  { name: "رشاش",   dmg: 15, rate: 0.075, spread: 0.028, mag: 30, reload: 1.9, range: 65, ammo: "l", pel: 1, snd: 0.8, fov: 62 },
  { name: "بندقية", dmg: 24, rate: 0.11, spread: 0.014, mag: 30, reload: 2.2, range: 160, ammo: "h", pel: 1, snd: 1.2, fov: 55 },
  { name: "شوزن",   dmg: 13, rate: 0.9,  spread: 0.07,  mag: 5,  reload: 2.6, range: 26,  ammo: "s", pel: 8, snd: 1.7, fov: 62 },
  { name: "قناصة",  dmg: 95, rate: 1.5,  spread: 0.0015, mag: 5, reload: 3.0, range: 400, ammo: "h", pel: 1, snd: 2.0, fov: 30 }
];
const AMMO_NAME = { l: "خفيفة", h: "ثقيلة", s: "خرطوش" };
const PHASES = [
  { wait: 90, shrink: 60, f: 0.55, dps: 1.5 },
  { wait: 60, shrink: 45, f: 0.55, dps: 3 },
  { wait: 45, shrink: 35, f: 0.5, dps: 5 },
  { wait: 35, shrink: 25, f: 0.45, dps: 8 },
  { wait: 25, shrink: 20, f: 0.35, dps: 12 },
  { wait: 15, shrink: 15, f: 0.0, dps: 20 }
];
const TINTS = ["#ffffff", "#d8c9a3", "#9fb08a", "#b9a58a", "#8f9aa8", "#c7b29a", "#a8b49a", "#b5aa98"];
const NET_COLORS = ["#f2a541", "#7bd389", "#6cb4ee", "#e98aa3", "#c3a6ff", "#f5e663", "#8ee3ef", "#ff9f6e"];
const BOT_NAMES = ["ذيب", "صقر_٧", "Ghost", "أبو_فهد", "Rex", "نمر_الليل", "Nova", "شبح", "Viper", "سهم", "Kilo", "عاصفة", "Hawk", "ريم", "Blaze", "الوحش", "Zed", "قناص_٩", "Echo", "برق", "Taz", "فارس", "Moxy", "ظل", "Rook", "جمرة", "Axe", "سيف", "Jinx", "موج"];

// ---------------- map ----------------
let MAP = null;
function genMap(seed) {
  const R = rng(seed);
  const obs = [], blds = [], loot = [], roads = [], fields = [], cars = [], poles = [];
  let lootId = 0;
  const free = (x, y, r) => {
    if (x < 10 || y < 10 || x > S - 10 || y > S - 10) return false;
    for (const o of near2(obs, x, y, r + 30)) {
      if (o.t === "c") { if (Math.hypot(o.x - x, o.y - y) < o.r + r) return false; }
      else if (x > o.x - r && x < o.x + o.w + r && y > o.y - r && y < o.y + o.h + r) return false;
    }
    for (const b of blds) if (x > b.x - r - 4 && x < b.x + b.w + r + 4 && y > b.y - r - 4 && y < b.y + b.h + r + 4) return false;
    return true;
  };
  const addLoot = (x, y, rich) => {
    const r = R(); let it;
    if (r < (rich ? 0.4 : 0.28)) { const wr = R(); it = { k: "w", v: wr < 0.22 ? 0 : wr < 0.47 ? 1 : wr < 0.76 ? 2 : wr < 0.92 ? 3 : 4 }; }
    else if (r < 0.62) { const t = ["l", "h", "s"][Math.floor(R() * 3)]; it = { k: "a", v: t, n: t === "s" ? 10 : 30 }; }
    else if (r < 0.78) it = { k: "b", n: 2 };
    else if (r < 0.86) it = { k: "m", n: 1 };
    else it = { k: "v", v: R() < 0.55 ? 1 : R() < 0.75 ? 2 : 3 };
    it.id = lootId++; it.x = x; it.y = y; it.rot = R() * TAU; loot.push(it);
  };
  // towns, linked by roads
  const towns = [];
  for (let i = 0; i < 13; i++) for (let k = 0; k < 60; k++) {
    const x = 70 + R() * (S - 140), y = 70 + R() * (S - 140);
    if (towns.every((t) => Math.hypot(t.x - x, t.y - y) > 150)) { towns.push({ x, y, n: 5 + Math.floor(R() * 6), big: R() < 0.3 }); break; }
  }
  const linked = new Set();
  for (let i = 0; i < towns.length; i++) {
    const others = towns.map((t, j) => [j, Math.hypot(t.x - towns[i].x, t.y - towns[i].y)]).filter((p) => p[0] !== i).sort((a, b) => a[1] - b[1]).slice(0, 2);
    for (const [j] of others) { const key = Math.min(i, j) + "-" + Math.max(i, j); if (linked.has(key)) continue; linked.add(key); roads.push([towns[i].x, towns[i].y, towns[j].x, towns[j].y]); }
  }
  const T = 0.3;
  const TYPES = {
    house:     { w: [9, 12],  h: [8, 10],  st: 1, wallH: 3.2, roof: "gable", tex: "plaster", gap: 1.9 },
    house2:    { w: [10, 13], h: [9, 11],  st: 2, wallH: 3.2, roof: "gable", tex: "brick", gap: 1.9 },
    warehouse: { w: [18, 24], h: [12, 16], st: 1, wallH: 6.0, roof: "metal", tex: "metal", gap: 4.0 },
    flat:      { w: [14, 18], h: [10, 12], st: 4, wallH: 3.2, roof: "flat", tex: "concrete", gap: 2.2 }
  };
  const roofCols = [0x8a3b2a, 0x6e3324, 0x5b4a3f, 0x7a4a2e, 0x4f5a5f];
  for (const t of towns) {
    let placed = 0;
    for (let k = 0; k < 120 && placed < t.n; k++) {
      const rr = R(), type = t.big && rr < 0.2 ? "flat" : rr < 0.16 ? "warehouse" : rr < 0.42 ? "house2" : rr < 0.48 && t.big ? "flat" : "house";
      const D = TYPES[type];
      const w = D.w[0] + Math.floor(R() * (D.w[1] - D.w[0])), h = D.h[0] + Math.floor(R() * (D.h[1] - D.h[0]));
      const spread = t.big ? 130 : 100;
      const x = t.x + (R() - 0.5) * spread - w / 2, y = t.y + (R() - 0.5) * spread - h / 2;
      if (x < 16 || y < 16 || x + w > S - 16 || y + h > S - 16) continue;
      const pad = type === "house" || type === "house2" ? 11 : 9;
      if (blds.some((b) => x < b.x + b.w + pad && x + w + pad > b.x && y < b.y + b.h + pad && y + h + pad > b.y)) continue;
      const door = ["n", "s", "e", "w"][Math.floor(R() * 4)];
      const b = { x, y, w, h, type, door, st: D.st, wallH: D.wallH, tex: D.tex, roofKind: D.roof, roof: roofCols[Math.floor(R() * roofCols.length)], walls: [] };
      const GAP = D.gap, mx = x + w / 2, my = y + h / 2;
      const side = (s, horiz, pos, from, len) => {
        if (door === s || (type === "warehouse" && ((door === "n" && s === "s") || (door === "s" && s === "n") || (door === "e" && s === "w") || (door === "w" && s === "e")))) {
          const half = len / 2 - GAP / 2;
          if (horiz) b.walls.push({ x: from, y: pos, w: half, h: T }, { x: from + len / 2 + GAP / 2, y: pos, w: half, h: T });
          else b.walls.push({ x: pos, y: from, w: T, h: half }, { x: pos, y: from + len / 2 + GAP / 2, w: T, h: half });
        } else if (horiz) b.walls.push({ x: from, y: pos, w: len, h: T }); else b.walls.push({ x: pos, y: from, w: T, h: len });
      };
      side("n", true, y, x, w); side("s", true, y + h - T, x, w); side("w", false, x, y, h); side("e", false, x + w - T, y, h);
      // an inside partition wall with a doorway, so houses have rooms
      if (type === "house" || type === "house2") {
        const px = x + w * (0.45 + R() * 0.15);
        b.walls.push({ x: px, y: y + T, w: T, h: h * 0.38 - T, inner: true }, { x: px, y: y + h * 0.38 + 1.6, w: T, h: h * 0.62 - 1.6 - T, inner: true });
      }
      for (const wl of b.walls) obs.push({ t: "r", kind: "wall", h3: wl.inner ? D.wallH : D.wallH * D.st, b, ...wl });
      blds.push(b);
      const nl = type === "warehouse" ? 5 + Math.floor(R() * 4) : type === "flat" ? 4 + Math.floor(R() * 3) : 2 + Math.floor(R() * 3);
      for (let q = 0; q < nl; q++) addLoot(x + 1.4 + R() * (w - 2.8), y + 1.4 + R() * (h - 2.8), true);
      // wooden fence around some houses
      if ((type === "house" || type === "house2") && R() < 0.5) {
        const m = 3.5, fx = x - m, fy = y - m, fw = w + m * 2, fh = h + m * 2, FT = 0.12, FG = 2.6;
        const segs = [];
        const fside = (s, horiz, pos, from, len) => {
          if (s === door) { const half = len / 2 - FG / 2; if (horiz) segs.push({ x: from, y: pos, w: half, h: FT }, { x: from + len / 2 + FG / 2, y: pos, w: half, h: FT }); else segs.push({ x: pos, y: from, w: FT, h: half }, { x: pos, y: from + len / 2 + FG / 2, w: FT, h: half }); }
          else if (horiz) segs.push({ x: from, y: pos, w: len, h: FT }); else segs.push({ x: pos, y: from, w: FT, h: len });
        };
        fside("n", true, fy, fx, fw); fside("s", true, fy + fh - FT, fx, fw); fside("w", false, fx, fy, fh); fside("e", false, fx + fw - FT, fy, fh);
        for (const sg of segs) if (sg.x > 4 && sg.y > 4 && sg.x + sg.w < S - 4 && sg.y + sg.h < S - 4) obs.push({ t: "r", kind: "fence", h3: 1.15, ...sg });
      }
      placed++;
    }
  }
  // farmland between towns
  for (let i = 0; i < 26; i++) {
    const w = 40 + R() * 60, h = 30 + R() * 50, x = 20 + R() * (S - w - 40), y = 20 + R() * (S - h - 40);
    if (towns.some((t) => Math.hypot(t.x - (x + w / 2), t.y - (y + h / 2)) < 95)) continue;
    fields.push({ x, y, w, h, rot: R() < 0.5 ? 0 : Math.PI / 2, c: R() < 0.6 ? 0 : 1 });
  }
  // shipping containers
  const crateCols = [0x7a5230, 0x3f6b55, 0x8a3b2f, 0x435a7a];
  for (let i = 0; i < 70; i++) {
    const hz = R() < 0.5, w = hz ? 6 : 2.4, h = hz ? 2.4 : 6, x = 12 + R() * (S - 24), y = 12 + R() * (S - 24);
    if (!free(x + w / 2, y + h / 2, 9)) continue;
    obs.push({ t: "r", kind: "crate", x, y, w, h, h3: CRATE_H, c: crateCols[i % 4] });
    if (R() < 0.6) addLoot(x + (hz ? w / 2 : w + 1.6), y + (hz ? h + 1.6 : h / 2), false);
  }
  // abandoned cars and power poles along roads
  for (const r of roads) {
    const len = Math.hypot(r[2] - r[0], r[3] - r[1]), a = Math.atan2(r[3] - r[1], r[2] - r[0]), nx = -Math.sin(a), ny = Math.cos(a);
    for (let d = 20; d < len - 20; d += 34) {
      const px = r[0] + Math.cos(a) * d + nx * 6.5, py = r[1] + Math.sin(a) * d + ny * 6.5;
      if (free(px, py, 1.2)) { poles.push({ x: px, y: py, a }); obs.push({ t: "c", kind: "pole", x: px, y: py, r: 0.18, h3: 8 }); }
    }
    const nc = Math.floor(len / 110);
    for (let k = 0; k < nc; k++) {
      const d = 30 + R() * (len - 60), off = (R() - 0.5) * 6, ca = a + (R() - 0.5) * 0.6;
      const cx = r[0] + Math.cos(a) * d + nx * off, cy = r[1] + Math.sin(a) * d + ny * off;
      if (!free(cx, cy, 3)) continue;
      const hz = Math.abs(Math.cos(ca)) > 0.7, w = hz ? 4.3 : 1.9, h = hz ? 1.9 : 4.3;
      cars.push({ x: cx, y: cy, a: hz ? (Math.cos(ca) > 0 ? 0 : Math.PI) : (Math.sin(ca) > 0 ? Math.PI / 2 : -Math.PI / 2), c: [0x8a1d1d, 0x2d4f7a, 0xcfcfc8, 0x3a3a3a, 0x6b6f3a][k % 5] });
      obs.push({ t: "r", kind: "car", x: cx - w / 2, y: cy - h / 2, w, h, h3: 1.5 });
    }
  }
  for (let i = 0; i < 900; i++) { const x = R() * S, y = R() * S; if (free(x, y, 3.5)) obs.push({ t: "c", kind: "tree", x, y, r: 0.45, s: 0.8 + R() * 0.7, h3: 7, pine: R() < 0.7 }); }
  for (let i = 0; i < 260; i++) { const r = 0.8 + R() * 1.8, x = R() * S, y = R() * S; if (free(x, y, r + 3)) obs.push({ t: "c", kind: "rock", x, y, r, h3: r * 1.1, rot: R() * TAU }); }
  for (let i = 0; i < 160; i++) { const x = R() * S, y = R() * S; if (free(x, y, 2.5)) addLoot(x, y, false); }

  const zones = [{ x: S / 2, y: S / 2, r: S * 0.74 }];
  for (const p of PHASES) {
    const c = zones[zones.length - 1], nr = c.r * p.f, a = R() * TAU, d = R() * (c.r - nr) * 0.85;
    zones.push({ x: clamp(c.x + Math.cos(a) * d, 50, S - 50), y: clamp(c.y + Math.sin(a) * d, 50, S - 50), r: nr });
  }
  const pa = R() * TAU, half = S * 0.62;
  const plane = { x1: S / 2 + Math.cos(pa) * half, y1: S / 2 + Math.sin(pa) * half, x2: S / 2 - Math.cos(pa) * half, y2: S / 2 - Math.sin(pa) * half, speed: 42 };
  plane.len = Math.hypot(plane.x2 - plane.x1, plane.y2 - plane.y1); plane.dur = plane.len / plane.speed;

  const CELL = 30, GN = Math.ceil(S / CELL) + 1, grid = new Array(GN * GN);
  for (let i = 0; i < grid.length; i++) grid[i] = [];
  for (const o of obs) {
    const x0 = o.t === "c" ? o.x - o.r : o.x, y0 = o.t === "c" ? o.y - o.r : o.y, x1 = o.t === "c" ? o.x + o.r : o.x + o.w, y1 = o.t === "c" ? o.y + o.r : o.y + o.h;
    for (let gx = Math.max(0, Math.floor(x0 / CELL)); gx <= Math.min(GN - 1, Math.floor(x1 / CELL)); gx++)
      for (let gy = Math.max(0, Math.floor(y0 / CELL)); gy <= Math.min(GN - 1, Math.floor(y1 / CELL)); gy++) grid[gy * GN + gx].push(o);
  }
  return { seed, obs, blds, loot, roads, towns, zones, plane, grid, CELL, GN, R, fields, cars, poles };
}
// rough spatial helper used only while generating (before the grid exists)
const genGrid = new Map();
function near2(obs, x, y, r) {
  if (obs.length < 200) return obs;
  // rebuild a coarse bucket index lazily
  if (genGrid.size === 0 || genGrid.get("n") !== obs.length) {
    genGrid.clear(); genGrid.set("n", obs.length);
    for (const o of obs) { const k = Math.floor(o.x / 40) + "," + Math.floor(o.y / 40); if (!genGrid.has(k)) genGrid.set(k, []); genGrid.get(k).push(o); }
  }
  const out = [], gx = Math.floor(x / 40), gy = Math.floor(y / 40), n = Math.ceil(r / 40);
  for (let i = gx - n; i <= gx + n; i++) for (let j = gy - n; j <= gy + n; j++) { const c = genGrid.get(i + "," + j); if (c) out.push(...c); }
  return out;
}

function near(x, y, r) {
  const { grid, CELL, GN } = MAP, out = [];
  const gx0 = Math.max(0, Math.floor((x - r) / CELL)), gx1 = Math.min(GN - 1, Math.floor((x + r) / CELL));
  const gy0 = Math.max(0, Math.floor((y - r) / CELL)), gy1 = Math.min(GN - 1, Math.floor((y + r) / CELL));
  for (let gx = gx0; gx <= gx1; gx++) for (let gy = gy0; gy <= gy1; gy++) { const c = grid[gy * GN + gx]; for (let i = 0; i < c.length; i++) out.push(c[i]); }
  return out;
}
function pointBlocked(x, y) {
  for (const o of near(x, y, 1)) {
    if (o.kind === "tree" || o.kind === "fence" || o.kind === "pole" || o.kind === "car") continue;
    if (o.t === "c") { const dx = x - o.x, dy = y - o.y; if (dx * dx + dy * dy < o.r * o.r) return true; }
    else if (x > o.x && x < o.x + o.w && y > o.y && y < o.y + o.h) return true;
  }
  return false;
}
function los(x1, y1, x2, y2) {
  const d = Math.hypot(x2 - x1, y2 - y1), steps = Math.ceil(d / 1.2);
  for (let i = 1; i < steps; i++) { const t = i / steps; if (pointBlocked(x1 + (x2 - x1) * t, y1 + (y2 - y1) * t)) return false; }
  return true;
}
function collide(e) {
  for (let pass = 0; pass < 2; pass++) for (const o of near(e.x, e.y, PR + 1)) {
    if ((o.kind === "fence" && e.z > 0.9) || (o.kind === "car" && e.z > 1.35)) continue;
    if (o.t === "c") {
      const dx = e.x - o.x, dy = e.y - o.y, d = Math.hypot(dx, dy), m = o.r + PR;
      if (d < m && d > 1e-4) { e.x = o.x + dx / d * m; e.y = o.y + dy / d * m; }
    } else {
      const cx = clamp(e.x, o.x, o.x + o.w), cy = clamp(e.y, o.y, o.y + o.h), dx = e.x - cx, dy = e.y - cy, d2 = dx * dx + dy * dy;
      if (d2 < PR * PR) {
        if (d2 > 1e-8) { const d = Math.sqrt(d2); e.x = cx + dx / d * PR; e.y = cy + dy / d * PR; }
        else { const l = e.x - o.x, r = o.x + o.w - e.x, t = e.y - o.y, b = o.y + o.h - e.y, m = Math.min(l, r, t, b);
          if (m === l) e.x = o.x - PR; else if (m === r) e.x = o.x + o.w + PR; else if (m === t) e.y = o.y - PR; else e.y = o.y + o.h + PR; }
      }
    }
  }
  e.x = clamp(e.x, 2, S - 2); e.y = clamp(e.y, 2, S - 2);
}
function insideBuilding(x, y) { for (const b of MAP.blds) if (x > b.x && x < b.x + b.w && y > b.y && y < b.y + b.h) return b; return null; }

function zoneAt(t) {
  const Z = MAP.zones; let acc = 0;
  for (let i = 0; i < PHASES.length; i++) {
    const p = PHASES[i], a = Z[i], b = Z[i + 1];
    if (t < acc + p.wait) return { x: a.x, y: a.y, r: a.r, nx: b.x, ny: b.y, nr: b.r, dps: i === 0 ? 1 : PHASES[i - 1].dps, phase: i, shrinking: false, left: acc + p.wait - t };
    acc += p.wait;
    if (t < acc + p.shrink) { const k = (t - acc) / p.shrink; return { x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k), r: lerp(a.r, b.r, k), nx: b.x, ny: b.y, nr: b.r, dps: p.dps, phase: i, shrinking: true, left: acc + p.shrink - t }; }
    acc += p.shrink;
  }
  const z = Z[Z.length - 1];
  return { x: z.x, y: z.y, r: 0, nx: z.x, ny: z.y, nr: 0, dps: 25, phase: PHASES.length, shrinking: false, left: 0 };
}

// ---------------- audio ----------------
let ac = null, noiseBuf = null;
function audio() {
  if (!SETTINGS.sound) return null;
  if (!ac) { try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; } }
  if (ac.state === "suspended") ac.resume();
  return ac;
}
function noise(vol, dur, f0, f1, pan) {
  const a = audio(); if (!a) return;
  if (!noiseBuf) { noiseBuf = a.createBuffer(1, a.sampleRate, a.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
  const s = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain(), t = a.currentTime;
  s.buffer = noiseBuf; f.type = "lowpass"; f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  let out = g;
  if (pan !== undefined && a.createStereoPanner) { const p = a.createStereoPanner(); p.pan.value = clamp(pan, -1, 1); g.connect(p); out = p; }
  s.connect(f).connect(g); out.connect(a.destination); s.start(t, Math.random() * 0.5); s.stop(t + dur);
}
function tone(freq, dur, type = "square", vol = 0.05, slide = 0) {
  const a = audio(); if (!a) return;
  const t = a.currentTime, o = a.createOscillator(), g = a.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t); if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(a.destination); o.start(t); o.stop(t + dur);
}
let lastSfx = 0;
function shotSfx(w, k) { const n = performance.now(); if (n - lastSfx < 30) return; lastSfx = n; const v = WEAP[w].snd * 0.13 * k; if (v < 0.006) return; noise(v, 0.12 + WEAP[w].snd * 0.06, 3400 - WEAP[w].snd * 900, 180); noise(v * 0.5, 0.05, 6000, 2000); }
function buzz(ms) { try { navigator.vibrate && navigator.vibrate(ms); } catch (e) {} }

// ---------------- renderer ----------------
const canvas = $("cv");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !IS_TOUCH, powerPreference: "high-performance" });
let pixelRatio = Math.min(window.devicePixelRatio || 1, IS_TOUCH ? 1.5 : 2);
renderer.setPixelRatio(pixelRatio);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
const SKY = new THREE.Color(0xa9c7d8);
scene.background = SKY;
scene.fog = new THREE.Fog(SKY, 90, 420);
const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 2600);
const hemi = new THREE.HemisphereLight(0xdfeefa, 0x5b5a3c, 0.85); scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff1d6, 2.2);
sun.castShadow = true;
sun.shadow.mapSize.set(IS_TOUCH ? 1024 : 2048, IS_TOUCH ? 1024 : 2048);
const sc = sun.shadow.camera; sc.left = -45; sc.right = 45; sc.top = 45; sc.bottom = -45; sc.near = 1; sc.far = 200;
sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.03;
scene.add(sun); scene.add(sun.target);
function resize() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
}
window.addEventListener("resize", resize);
const QUALITY = {
  low:    { pr: 0.75, shadows: false, map: 512,  fog: 240, draw: 170, loot: 40 },
  medium: { pr: 1.0,  shadows: true,  map: 1024, fog: 340, draw: 250, loot: 55 },
  high:   { pr: 2.0,  shadows: true,  map: 2048, fog: 420, draw: 320, loot: 60 }
};
let Q = QUALITY.medium;
function applyQuality() {
  const k = SETTINGS.quality === "auto" ? (IS_TOUCH ? "medium" : "high") : SETTINGS.quality;
  Q = QUALITY[k];
  pixelRatio = Math.min(Q.pr, Math.max(1, window.devicePixelRatio || 1)); if (k === "low") pixelRatio = 0.75;
  renderer.setPixelRatio(pixelRatio);
  sun.castShadow = Q.shadows;
  if (sun.shadow.mapSize.x !== Q.map) { sun.shadow.mapSize.set(Q.map, Q.map); if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; } }
  scene.fog.far = Q.fog; shadowsOff = false; resize();
}

// textures
function canvasTex(w, h, draw, repeat) {
  const c = document.createElement("canvas"); c.width = w; c.height = h; draw(c.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = renderer.capabilities.getMaxAnisotropy();
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat, repeat); }
  return t;
}
const grassTex = canvasTex(512, 512, (g, w, h) => {
  g.fillStyle = "#5f7d3b"; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 9000; i++) { const x = Math.random() * w, y = Math.random() * h; g.fillStyle = `hsla(${78 + Math.random() * 30},${30 + Math.random() * 25}%,${22 + Math.random() * 22}%,0.55)`; g.fillRect(x, y, 1 + Math.random() * 2, 2 + Math.random() * 4); }
  for (let i = 0; i < 40; i++) { const x = Math.random() * w, y = Math.random() * h, r = 12 + Math.random() * 40; g.fillStyle = "rgba(120,104,70,0.18)"; g.beginPath(); g.ellipse(x, y, r, r * 0.6, Math.random() * 3, 0, TAU); g.fill(); }
}, 70);
const roadTex = canvasTex(64, 256, (g, w, h) => {
  g.fillStyle = "#6c6a5f"; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 1400; i++) { g.fillStyle = `rgba(${Math.random() < 0.5 ? 255 : 0},${Math.random() < 0.5 ? 255 : 0},0,0.05)`; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
  g.fillStyle = "rgba(240,230,190,0.7)"; for (let y = 0; y < h; y += 64) g.fillRect(w / 2 - 1.5, y, 3, 32);
});
const wallTex = canvasTex(256, 128, (g, w, h) => {
  g.fillStyle = "#fff"; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 2500; i++) { g.fillStyle = `rgba(0,0,0,${Math.random() * 0.06})`; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
  g.strokeStyle = "rgba(0,0,0,0.08)"; for (let y = 16; y < h; y += 16) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
});
wallTex.wrapS = wallTex.wrapT = THREE.RepeatWrapping;

// ---- material textures (drawn once) ----
function windowTile(base, draw) {
  return canvasTex(256, 320, (g, w, h) => {
    base(g, w, h);
    if (draw) { // window: frame, glass with sky reflection, sill
      const x = 70, y = 70, ww = 116, wh = 130;
      g.fillStyle = "#e9e4d8"; g.fillRect(x - 10, y - 10, ww + 20, wh + 20);
      const gr = g.createLinearGradient(x, y, x + ww, y + wh); gr.addColorStop(0, "#9fb7c6"); gr.addColorStop(0.45, "#3d5363"); gr.addColorStop(1, "#22313b");
      g.fillStyle = gr; g.fillRect(x, y, ww, wh);
      g.fillStyle = "#e9e4d8"; g.fillRect(x + ww / 2 - 4, y, 8, wh); g.fillRect(x, y + wh / 2 - 4, ww, 8);
      g.fillStyle = "rgba(0,0,0,0.25)"; g.fillRect(x - 14, y + wh + 10, ww + 28, 10);
    }
  });
}
function noiseFill(g, w, h, col, n, a) { g.fillStyle = col; g.fillRect(0, 0, w, h); for (let i = 0; i < n; i++) { g.fillStyle = `rgba(${Math.random() < 0.5 ? 0 : 255},${Math.random() < 0.5 ? 0 : 255},${Math.random() < 0.5 ? 0 : 255},${Math.random() * a})`; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); } }
const TEX = {};
function makeTextures() {
  if (TEX.ready) return; TEX.ready = true;
  TEX.plaster = windowTile((g, w, h) => { noiseFill(g, w, h, "#d8ccb0", 2500, 0.06); g.fillStyle = "rgba(90,70,40,0.25)"; g.fillRect(0, h - 26, w, 26); }, true);
  TEX.brick = windowTile((g, w, h) => {
    g.fillStyle = "#9b5a43"; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 16) for (let x = (y / 16) % 2 ? -16 : 0; x < w; x += 32) { g.fillStyle = `hsl(${12 + Math.random() * 8},${40 + Math.random() * 15}%,${30 + Math.random() * 10}%)`; g.fillRect(x + 1, y + 1, 30, 14); }
  }, true);
  TEX.concrete = windowTile((g, w, h) => { noiseFill(g, w, h, "#a9a69c", 3000, 0.08); g.fillStyle = "rgba(0,0,0,0.12)"; g.fillRect(0, h - 8, w, 8); }, true);
  TEX.metal = canvasTex(256, 256, (g, w, h) => { g.fillStyle = "#7d8288"; g.fillRect(0, 0, w, h); for (let x = 0; x < w; x += 16) { const gr = g.createLinearGradient(x, 0, x + 16, 0); gr.addColorStop(0, "#5d6267"); gr.addColorStop(0.5, "#9aa0a6"); gr.addColorStop(1, "#5d6267"); g.fillStyle = gr; g.fillRect(x, 0, 16, h); } for (let i = 0; i < 40; i++) { g.fillStyle = "rgba(120,70,30,0.18)"; g.fillRect(Math.random() * w, Math.random() * h, 3 + Math.random() * 10, 20 + Math.random() * 60); } });
  TEX.tiles = canvasTex(256, 256, (g, w, h) => { g.fillStyle = "#7a3424"; g.fillRect(0, 0, w, h); for (let y = 0; y < h; y += 18) for (let x = (y / 18) % 2 ? -14 : 0; x < w; x += 28) { g.fillStyle = `hsl(${8 + Math.random() * 10},${45 + Math.random() * 15}%,${24 + Math.random() * 12}%)`; g.beginPath(); g.ellipse(x + 14, y + 12, 13, 10, 0, 0, Math.PI); g.fill(); } });
  TEX.fence = canvasTex(256, 64, (g, w, h) => { g.clearRect(0, 0, w, h); for (let x = 2; x < w; x += 22) { g.fillStyle = `hsl(28,${30 + Math.random() * 15}%,${28 + Math.random() * 10}%)`; g.fillRect(x, 4, 16, h - 4); g.beginPath(); g.moveTo(x, 4); g.lineTo(x + 8, 0); g.lineTo(x + 16, 4); g.fill(); } g.fillStyle = "#4a3523"; g.fillRect(0, 14, w, 6); g.fillRect(0, 44, w, 6); });
  TEX.wheat = canvasTex(256, 256, (g, w, h) => { g.fillStyle = "#b9a25a"; g.fillRect(0, 0, w, h); for (let x = 0; x < w; x += 8) { g.fillStyle = x % 16 ? "rgba(120,96,40,0.35)" : "rgba(230,210,140,0.35)"; g.fillRect(x, 0, 4, h); } for (let i = 0; i < 3000; i++) { g.fillStyle = `rgba(${200 + Math.random() * 50},${170 + Math.random() * 40},80,0.4)`; g.fillRect(Math.random() * w, Math.random() * h, 1, 3); } });
  TEX.green = canvasTex(256, 256, (g, w, h) => { g.fillStyle = "#6f8a3c"; g.fillRect(0, 0, w, h); for (let x = 0; x < w; x += 10) { g.fillStyle = x % 20 ? "rgba(40,70,20,0.35)" : "rgba(160,190,90,0.3)"; g.fillRect(x, 0, 5, h); } });
  for (const k in TEX) if (TEX[k].isTexture) { TEX[k].wrapS = TEX[k].wrapT = THREE.RepeatWrapping; }
}
// world-space planar UVs so textures keep a real-world scale on every wall
function planarUV(geo, tu, tv) {
  const pos = geo.attributes.position, nor = geo.attributes.normal, uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i), nx = Math.abs(nor.getX(i)), nz = Math.abs(nor.getZ(i)), ny = Math.abs(nor.getY(i));
    if (ny > 0.5) uv.setXY(i, x / tu, z / tu); else if (nx > 0.5) uv.setXY(i, z / tu, y / tv); else uv.setXY(i, x / tu, y / tv);
  }
  uv.needsUpdate = true; return geo;
}
function boxAt(w, h, d, x, y, z) { const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y, z); return g; }
function gableRoof(b, overhang, height) {
  const long = b.w >= b.h, span = (long ? b.h : b.w) + overhang * 2, len = (long ? b.w : b.h) + overhang * 2;
  const sh = new THREE.Shape(); sh.moveTo(-span / 2, 0); sh.lineTo(span / 2, 0); sh.lineTo(0, height); sh.lineTo(-span / 2, 0);
  const g = new THREE.ExtrudeGeometry(sh, { depth: len, bevelEnabled: false });
  g.translate(0, 0, -len / 2);
  if (long) g.rotateY(Math.PI / 2);
  g.translate(b.x + b.w / 2, b.wallH * b.st, b.y + b.h / 2);
  return g;
}

let world = null;
const roofMeshes = [];
function buildWorld() {
  makeTextures();
  if (world) { scene.remove(world); world.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); }
  world = new THREE.Group(); scene.add(world); roofMeshes.length = 0;
  // sky dome
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1200, 24, 12), new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color(0x4f86b8) }, bot: { value: new THREE.Color(0xc9dbe3) } },
    vertexShader: "varying float h; void main(){ h = normalize(position).y; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }",
    fragmentShader: "uniform vec3 top; uniform vec3 bot; varying float h; void main(){ gl_FragColor = vec4(mix(bot, top, clamp(h*1.6,0.,1.)),1.); }" }));
  sky.position.set(S / 2, 0, S / 2); world.add(sky);
  const water = new THREE.Mesh(new THREE.PlaneGeometry(S * 5, S * 5), new THREE.MeshStandardMaterial({ color: 0x2f6f8a, roughness: 0.2, metalness: 0.2 }));
  water.rotation.x = -Math.PI / 2; water.position.set(S / 2, -0.3, S / 2); world.add(water);
  const beach = new THREE.Mesh(new THREE.PlaneGeometry(S + 30, S + 30), new THREE.MeshStandardMaterial({ color: 0xd8c690, roughness: 1 }));
  beach.rotation.x = -Math.PI / 2; beach.position.set(S / 2, -0.06, S / 2); beach.receiveShadow = true; world.add(beach);
  grassTex.repeat.set(S / 6, S / 6);
  const land = new THREE.Mesh(new THREE.PlaneGeometry(S, S), new THREE.MeshStandardMaterial({ map: grassTex, roughness: 1 }));
  land.rotation.x = -Math.PI / 2; land.position.set(S / 2, 0, S / 2); land.receiveShadow = true; world.add(land);
  // fields
  for (const f of MAP.fields) {
    const t = (f.c ? TEX.green : TEX.wheat).clone(); t.needsUpdate = true; t.repeat.set(f.w / 8, f.h / 8);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(f.w, f.h), new THREE.MeshStandardMaterial({ map: t, roughness: 1 }));
    m.rotation.x = -Math.PI / 2; m.position.set(f.x + f.w / 2, 0.012, f.y + f.h / 2); m.receiveShadow = true; world.add(m);
  }
  // roads
  for (const r of MAP.roads) {
    const len = Math.hypot(r[2] - r[0], r[3] - r[1]);
    const t = roadTex.clone(); t.wrapT = THREE.RepeatWrapping; t.repeat.set(1, len / 28); t.needsUpdate = true;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(8, len), new THREE.MeshStandardMaterial({ map: t, roughness: 0.95 }));
    m.rotation.x = -Math.PI / 2; m.rotation.z = -Math.atan2(r[3] - r[1], r[2] - r[0]) + Math.PI / 2;
    m.position.set((r[0] + r[2]) / 2, 0.025, (r[1] + r[3]) / 2); m.receiveShadow = true; world.add(m);
  }
  // buildings
  const groundWalls = { plaster: [], brick: [], concrete: [], metal: [] }, floors = [];
  for (const b of MAP.blds) {
    for (const wl of b.walls) groundWalls[b.tex].push(planarUV(boxAt(wl.w, b.wallH, wl.h, wl.x + wl.w / 2, b.wallH / 2, wl.y + wl.h / 2), b.tex === "metal" ? 4 : 2.6, b.tex === "metal" ? 6 : 3.2));
    floors.push(boxAt(b.w, 0.08, b.h, b.x + b.w / 2, 0.04, b.y + b.h / 2));
    // everything above the ground floor: hidden while you are inside this building
    const upper = new THREE.Group(); upper.userData.b = b;
    const upGeos = [];
    upGeos.push(planarUV(boxAt(b.w, 0.25, b.h, b.x + b.w / 2, b.wallH + 0.12, b.y + b.h / 2), 2.6, 3.2)); // ceiling slab
    if (b.st > 1) upGeos.push(planarUV(boxAt(b.w, b.wallH * (b.st - 1), b.h, b.x + b.w / 2, b.wallH + b.wallH * (b.st - 1) / 2, b.y + b.h / 2), 2.6, 3.2));
    const wallMat = new THREE.MeshStandardMaterial({ map: TEX[b.tex], roughness: 0.92, metalness: b.tex === "metal" ? 0.12 : 0, color: b.tex === "metal" ? 0xd9dee2 : 0xffffff });
    const body = new THREE.Mesh(mergeGeometries(upGeos), wallMat); body.castShadow = true; body.receiveShadow = true; upper.add(body);
    if (b.roofKind === "gable") {
      const g = planarUV(gableRoof(b, 0.6, 2.4), 3, 3);
      const roof = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: TEX.tiles, color: b.roof, roughness: 0.85 })); roof.castShadow = true; upper.add(roof);
      // chimney
      const ch = new THREE.Mesh(boxAt(0.7, 2.2, 0.7, b.x + b.w * 0.7, b.wallH * b.st + 1.8, b.y + b.h * 0.35), new THREE.MeshStandardMaterial({ color: 0x6b3f30, roughness: 1 })); ch.castShadow = true; upper.add(ch);
    } else if (b.roofKind === "metal") {
      const roof = new THREE.Mesh(planarUV(gableRoof(b, 0.5, 1.5), 4, 4), new THREE.MeshStandardMaterial({ map: TEX.metal, roughness: 0.6, metalness: 0.15, color: 0xc4b6a4 })); roof.castShadow = true; upper.add(roof);
    } else {
      const top = b.wallH * b.st, pg = [];
      pg.push(boxAt(b.w, 0.9, 0.3, b.x + b.w / 2, top + 0.45, b.y + 0.15), boxAt(b.w, 0.9, 0.3, b.x + b.w / 2, top + 0.45, b.y + b.h - 0.15), boxAt(0.3, 0.9, b.h, b.x + 0.15, top + 0.45, b.y + b.h / 2), boxAt(0.3, 0.9, b.h, b.x + b.w - 0.15, top + 0.45, b.y + b.h / 2));
      const par = new THREE.Mesh(mergeGeometries(pg), new THREE.MeshStandardMaterial({ color: 0x8f8c84, roughness: 1 })); par.castShadow = true; upper.add(par);
      // balconies on the front
      const bal = [];
      for (let f = 1; f < b.st; f++) for (let k = 0; k < Math.floor(b.w / 4.5); k++) bal.push(boxAt(2.2, 0.15, 1.0, b.x + 2.2 + k * 4.5, b.wallH * f + 0.1, b.y + b.h + 0.5), boxAt(2.2, 0.9, 0.08, b.x + 2.2 + k * 4.5, b.wallH * f + 0.6, b.y + b.h + 1.0));
      if (bal.length) { const bm = new THREE.Mesh(mergeGeometries(bal), new THREE.MeshStandardMaterial({ color: 0x77736b, roughness: 1 })); bm.castShadow = true; upper.add(bm); }
    }
    world.add(upper); roofMeshes.push(upper);
  }
  for (const k in groundWalls) {
    if (!groundWalls[k].length) continue;
    const m = new THREE.Mesh(mergeGeometries(groundWalls[k]), new THREE.MeshStandardMaterial({ map: TEX[k], roughness: 0.92, metalness: k === "metal" ? 0.12 : 0, color: k === "metal" ? 0xd9dee2 : 0xffffff }));
    m.castShadow = true; m.receiveShadow = true; world.add(m);
  }
  if (floors.length) { const fl = new THREE.Mesh(mergeGeometries(floors), new THREE.MeshStandardMaterial({ color: 0x8a7458, roughness: 0.8 })); fl.receiveShadow = true; world.add(fl); }
  // fences
  const fences = MAP.obs.filter((o) => o.kind === "fence").map((o) => planarUV(boxAt(Math.max(o.w, 0.06), 1.15, Math.max(o.h, 0.06), o.x + o.w / 2, 0.575, o.y + o.h / 2), 2.4, 1.15));
  if (fences.length) { const fm = new THREE.Mesh(mergeGeometries(fences), new THREE.MeshStandardMaterial({ map: TEX.fence, transparent: true, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 1 })); fm.castShadow = true; world.add(fm); }
  // containers
  const crates = MAP.obs.filter((o) => o.kind === "crate");
  if (crates.length) {
    const cg = planarUV(new THREE.BoxGeometry(1, 1, 1), 0.25, 1);
    const im = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ map: TEX.metal, roughness: 0.6, metalness: 0.35 }), crates.length);
    const m4 = new THREE.Matrix4(), col = new THREE.Color();
    crates.forEach((o, i) => { m4.compose(new THREE.Vector3(o.x + o.w / 2, CRATE_H / 2, o.y + o.h / 2), new THREE.Quaternion(), new THREE.Vector3(o.w, CRATE_H, o.h)); im.setMatrixAt(i, m4); im.setColorAt(i, col.setHex(o.c).multiplyScalar(1.6)); });
    im.castShadow = true; im.receiveShadow = true; world.add(im); cg.dispose();
  }
  // cars
  if (MAP.cars.length) {
    const body = mergeGeometries([boxAt(4.3, 0.75, 1.85, 0, 0.65, 0), boxAt(2.3, 0.6, 1.65, -0.25, 1.3, 0)]);
    const glass = boxAt(2.32, 0.42, 1.68, -0.25, 1.33, 0);
    const wheel = new THREE.CylinderGeometry(0.36, 0.36, 0.25, 12); wheel.rotateX(Math.PI / 2);
    const bodyIm = new THREE.InstancedMesh(body, new THREE.MeshStandardMaterial({ roughness: 0.45, metalness: 0.5 }), MAP.cars.length);
    const glassIm = new THREE.InstancedMesh(glass, new THREE.MeshStandardMaterial({ color: 0x1c2a33, roughness: 0.1, metalness: 0.6 }), MAP.cars.length);
    const wheelIm = new THREE.InstancedMesh(wheel, new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.9 }), MAP.cars.length * 4);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), col = new THREE.Color(), up = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1);
    MAP.cars.forEach((c, i) => {
      q.setFromAxisAngle(up, -c.a); m4.compose(new THREE.Vector3(c.x, 0, c.y), q, one);
      bodyIm.setMatrixAt(i, m4); bodyIm.setColorAt(i, col.setHex(c.c)); glassIm.setMatrixAt(i, m4);
      [[1.35, 0.85], [1.35, -0.85], [-1.35, 0.85], [-1.35, -0.85]].forEach(([wx, wz], k) => { const off = new THREE.Vector3(wx, 0.36, wz).applyQuaternion(q); const mm = new THREE.Matrix4().compose(new THREE.Vector3(c.x + off.x, 0.36, c.y + off.z), q, one); wheelIm.setMatrixAt(i * 4 + k, mm); });
    });
    for (const im of [bodyIm, glassIm, wheelIm]) { im.castShadow = true; world.add(im); }
  }
  // power poles
  if (MAP.poles.length) {
    const pole = mergeGeometries([boxAt(0.22, 8, 0.22, 0, 4, 0), boxAt(0.15, 0.15, 2.2, 0, 7.4, 0)]);
    const pim = new THREE.InstancedMesh(pole, new THREE.MeshStandardMaterial({ color: 0x5a4532, roughness: 1 }), MAP.poles.length);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1);
    MAP.poles.forEach((p, i) => { q.setFromAxisAngle(up, -p.a); m4.compose(new THREE.Vector3(p.x, 0, p.y), q, one); pim.setMatrixAt(i, m4); });
    pim.castShadow = true; world.add(pim);
  }
  // trees: pines and round leafy trees
  const trees = MAP.obs.filter((o) => o.kind === "tree"), pines = trees.filter((t) => t.pine), oaks = trees.filter((t) => !t.pine);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sv = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  const trunkG = new THREE.CylinderGeometry(0.2, 0.32, 3.2, 6); trunkG.translate(0, 1.6, 0);
  const trunk = new THREE.InstancedMesh(trunkG, new THREE.MeshStandardMaterial({ color: 0x5b4330, roughness: 1 }), trees.length);
  trees.forEach((o, i) => { q.setFromAxisAngle(up, (o.x * 13 + o.y) % TAU); m4.compose(v.set(o.x, 0, o.y), q, sv.set(o.s, o.s, o.s)); trunk.setMatrixAt(i, m4); });
  trunk.castShadow = true; world.add(trunk);
  const pineG = mergeGeometries([new THREE.ConeGeometry(2.3, 4.2, 8).translate(0, 4.3, 0), new THREE.ConeGeometry(1.7, 3.4, 8).translate(0, 6.1, 0), new THREE.ConeGeometry(1.0, 2.4, 8).translate(0, 7.6, 0)]);
  const pineIm = new THREE.InstancedMesh(pineG, new THREE.MeshStandardMaterial({ color: 0x35532a, roughness: 0.95 }), Math.max(1, pines.length));
  pines.forEach((o, i) => { q.setFromAxisAngle(up, o.x % TAU); m4.compose(v.set(o.x, 0, o.y), q, sv.set(o.s, o.s * 1.05, o.s)); pineIm.setMatrixAt(i, m4); });
  const oakG = mergeGeometries([new THREE.IcosahedronGeometry(2.4, 1).translate(0, 4.4, 0), new THREE.IcosahedronGeometry(1.7, 1).translate(1.1, 5.4, 0.4), new THREE.IcosahedronGeometry(1.6, 1).translate(-1.0, 5.2, -0.6)]);
  const oakIm = new THREE.InstancedMesh(oakG, new THREE.MeshStandardMaterial({ color: 0x4d6e30, roughness: 0.95, flatShading: true }), Math.max(1, oaks.length));
  oaks.forEach((o, i) => { q.setFromAxisAngle(up, o.y % TAU); m4.compose(v.set(o.x, 0, o.y), q, sv.set(o.s, o.s, o.s)); oakIm.setMatrixAt(i, m4); });
  for (const im of [pineIm, oakIm]) { im.castShadow = true; im.receiveShadow = true; world.add(im); }
  // rocks
  const rocks = MAP.obs.filter((o) => o.kind === "rock");
  const rockIm = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 1), new THREE.MeshStandardMaterial({ color: 0x8b8a82, roughness: 0.95, flatShading: true }), Math.max(1, rocks.length));
  rocks.forEach((o, i) => { q.setFromEuler(new THREE.Euler(o.rot * 0.3, o.rot, o.rot * 0.5)); m4.compose(v.set(o.x, o.r * 0.3, o.y), q, sv.set(o.r, o.r * 0.75, o.r * 1.1)); rockIm.setMatrixAt(i, m4); });
  rockIm.castShadow = true; rockIm.receiveShadow = true; world.add(rockIm);
  // distant hills
  const hillMat = new THREE.MeshStandardMaterial({ color: 0x6f7f63, roughness: 1, flatShading: true });
  for (let i = 0; i < 30; i++) { const a = i / 30 * TAU, rr = S * 0.95 + (i % 3) * 40, h = 60 + (i * 37 % 70); const hill = new THREE.Mesh(new THREE.ConeGeometry(90 + (i * 13 % 60), h, 6), hillMat); hill.position.set(S / 2 + Math.cos(a) * rr, h / 2 - 4, S / 2 + Math.sin(a) * rr); world.add(hill); }
  buildLoot();
  zoneWall = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 128, 1, true), new THREE.MeshBasicMaterial({ color: 0x8a4cff, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false, fog: false }));
  world.add(zoneWall);
  nextRing = new THREE.Mesh(new THREE.RingGeometry(0.99, 1, 160), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false }));
  nextRing.rotation.x = -Math.PI / 2; nextRing.position.y = 0.1; world.add(nextRing);
  planeMesh = makePlane(); world.add(planeMesh);
}

let zoneWall = null, nextRing = null, planeMesh = null;
function makePlane() {
  const g = new THREE.Group(), m = new THREE.MeshStandardMaterial({ color: 0xc9c4b0, roughness: 0.6, metalness: 0.3 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.3, 22, 10), m); body.rotation.z = Math.PI / 2; g.add(body);
  const wing = new THREE.Mesh(new THREE.BoxGeometry(5, 0.3, 30), m); g.add(wing);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(2.5, 4, 0.3), m); tail.position.set(-10, 2.2, 0); g.add(tail);
  const stab = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.25, 9), m); stab.position.set(-10, 1, 0); g.add(stab);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

// ---- realistic ground loot ----
const M_GUN = new THREE.MeshStandardMaterial({ color: 0x1c1c1c, roughness: 0.45, metalness: 0.7 });
const M_WOOD = new THREE.MeshStandardMaterial({ color: 0x6b4426, roughness: 0.8 });
const M_TAN = new THREE.MeshStandardMaterial({ color: 0x8a7a55, roughness: 0.7, metalness: 0.2 });
const M_BRASS = new THREE.MeshStandardMaterial({ color: 0xc9a24a, roughness: 0.3, metalness: 0.9 });
const M_RED = new THREE.MeshStandardMaterial({ color: 0xd32626, roughness: 0.6 });
const M_WHITE = new THREE.MeshStandardMaterial({ color: 0xf1f1ee, roughness: 0.7 });
const M_OLIVE = new THREE.MeshStandardMaterial({ color: 0x4e5a35, roughness: 0.9 });
const M_GLASS = new THREE.MeshStandardMaterial({ color: 0x223344, roughness: 0.1, metalness: 0.8 });
const cyl = (r, l, x, y, z, axis = "z") => { const g = new THREE.CylinderGeometry(r, r, l, 10); if (axis === "z") g.rotateX(Math.PI / 2); if (axis === "x") g.rotateZ(Math.PI / 2); g.translate(x, y, z); return g; };
function group(parts) { const gr = new THREE.Group(); for (const [geo, mat] of parts) { const m = new THREE.Mesh(geo, mat); m.castShadow = true; gr.add(m); } return gr; }
const LOOT_PROTO = {};
function lootProtos() {
  if (LOOT_PROTO.ready) return; LOOT_PROTO.ready = true;
  // weapons (barrel along +x), lying flat on the ground
  LOOT_PROTO.w0 = group([[boxAt(0.2, 0.05, 0.035, 0.05, 0.05, 0), M_GUN], [boxAt(0.05, 0.12, 0.032, -0.02, 0.0, 0), M_GUN], [cyl(0.008, 0.04, 0.17, 0.05, 0, "x"), M_GUN]]);
  LOOT_PROTO.w1 = group([[boxAt(0.42, 0.08, 0.05, 0, 0.06, 0), M_GUN], [boxAt(0.05, 0.2, 0.04, 0.05, -0.06, 0), M_GUN], [boxAt(0.05, 0.12, 0.04, -0.08, -0.02, 0), M_GUN], [cyl(0.012, 0.14, 0.27, 0.07, 0, "x"), M_GUN], [boxAt(0.18, 0.04, 0.03, -0.27, 0.05, 0), M_GUN]]);
  LOOT_PROTO.w2 = group([[boxAt(0.55, 0.09, 0.06, 0, 0.06, 0), M_GUN], [boxAt(0.25, 0.12, 0.05, -0.38, 0.03, 0), M_TAN], [boxAt(0.06, 0.2, 0.05, 0.08, -0.07, 0), M_GUN], [boxAt(0.05, 0.12, 0.04, -0.06, -0.03, 0), M_TAN], [cyl(0.013, 0.3, 0.42, 0.07, 0, "x"), M_GUN], [boxAt(0.18, 0.05, 0.04, 0.05, 0.13, 0), M_GUN], [boxAt(0.22, 0.06, 0.07, 0.22, 0.05, 0), M_TAN]]);
  LOOT_PROTO.w3 = group([[boxAt(0.5, 0.08, 0.06, 0.05, 0.06, 0), M_GUN], [cyl(0.02, 0.45, 0.5, 0.08, 0, "x"), M_GUN], [cyl(0.018, 0.35, 0.48, 0.04, 0, "x"), M_GUN], [boxAt(0.3, 0.1, 0.055, -0.33, 0.03, 0), M_WOOD], [boxAt(0.2, 0.05, 0.06, 0.32, 0.02, 0), M_WOOD]]);
  LOOT_PROTO.w4 = group([[boxAt(0.62, 0.08, 0.06, 0, 0.06, 0), M_OLIVE], [cyl(0.012, 0.55, 0.58, 0.07, 0, "x"), M_GUN], [boxAt(0.3, 0.13, 0.055, -0.45, 0.03, 0), M_OLIVE], [cyl(0.03, 0.32, 0.02, 0.15, 0, "x"), M_GUN], [cyl(0.034, 0.03, 0.19, 0.15, 0, "x"), M_GLASS], [boxAt(0.05, 0.1, 0.04, -0.05, -0.02, 0), M_GUN], [boxAt(0.02, 0.12, 0.02, 0.4, -0.02, 0.03), M_GUN], [boxAt(0.02, 0.12, 0.02, 0.4, -0.02, -0.03), M_GUN]]);
  // ammo: olive box with rounds on top
  const ammo = (col) => { const parts = [[boxAt(0.36, 0.18, 0.2, 0, 0.09, 0), new THREE.MeshStandardMaterial({ color: col, roughness: 0.7 })], [boxAt(0.12, 0.03, 0.06, 0, 0.195, 0), M_GUN]]; for (let i = 0; i < 5; i++) parts.push([cyl(0.012, 0.07, -0.1 + i * 0.05, 0.215, 0.06, "y"), M_BRASS]); return group(parts); };
  LOOT_PROTO.al = ammo(0x5c6640); LOOT_PROTO.ah = ammo(0x6b5a3a);
  LOOT_PROTO.as = group([[boxAt(0.3, 0.14, 0.18, 0, 0.07, 0), new THREE.MeshStandardMaterial({ color: 0x8a2b20, roughness: 0.7 })], ...[0, 1, 2, 3].map((i) => [cyl(0.022, 0.08, -0.09 + i * 0.06, 0.18, 0, "y"), i % 2 ? M_RED : M_BRASS])]);
  // bandage roll
  LOOT_PROTO.b = group([[cyl(0.07, 0.11, 0, 0.07, 0, "z"), M_WHITE], [cyl(0.03, 0.115, 0, 0.07, 0, "z"), new THREE.MeshStandardMaterial({ color: 0xd8d0c0 })], [boxAt(0.16, 0.012, 0.09, 0.08, 0.006, 0), M_WHITE]]);
  // first aid kit: white case with red cross and handle
  LOOT_PROTO.m = group([[boxAt(0.42, 0.2, 0.3, 0, 0.1, 0), M_WHITE], [boxAt(0.2, 0.012, 0.06, 0, 0.206, 0), M_RED], [boxAt(0.06, 0.012, 0.2, 0, 0.206, 0), M_RED], [boxAt(0.16, 0.04, 0.03, 0, 0.23, 0), M_GUN]]);
  // armour vest: front plate, shoulder straps, pouches
  const vest = (col) => { const m = new THREE.MeshStandardMaterial({ color: col, roughness: 0.85 }); return group([[boxAt(0.46, 0.06, 0.56, 0, 0.03, 0), m], [boxAt(0.1, 0.07, 0.16, -0.14, 0.035, -0.34), m], [boxAt(0.1, 0.07, 0.16, 0.14, 0.035, -0.34), m], [boxAt(0.12, 0.09, 0.1, -0.13, 0.08, 0.16), m], [boxAt(0.12, 0.09, 0.1, 0, 0.08, 0.16), m], [boxAt(0.12, 0.09, 0.1, 0.13, 0.08, 0.16), m], [boxAt(0.4, 0.02, 0.04, 0, 0.065, -0.05), M_GUN]]); };
  LOOT_PROTO.v1 = vest(0x7d7f63); LOOT_PROTO.v2 = vest(0x3e4f63); LOOT_PROTO.v3 = vest(0x22262b);
}
const glowTex = canvasTex(64, 64, (g, w, h) => { const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, "rgba(255,230,160,0.8)"); gr.addColorStop(1, "rgba(255,230,160,0)"); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
function buildLoot() {
  lootProtos();
  for (const it of MAP.loot) makeLootMesh(it);
}
const deathBoxes = [];
const M_BOX = new THREE.MeshStandardMaterial({ color: 0x7a5a36, roughness: 0.85 });
const M_BOX2 = new THREE.MeshStandardMaterial({ color: 0x5a4126, roughness: 0.85 });
function dropDeathBox(e) {
  if (e.ph !== "ground") return;
  const items = [];
  e.w.forEach((w) => { if (w >= 0) items.push({ k: "w", v: w }); });
  for (const t of ["l", "h", "s"]) if (e.ammo[t] > 0) items.push({ k: "a", v: t, n: e.ammo[t] });
  if (e.heals.b > 0) items.push({ k: "b", n: e.heals.b });
  if (e.heals.m > 0) items.push({ k: "m", n: e.heals.m });
  if (e.armor > 0) items.push({ k: "v", v: e.armor });
  if (!items.length) return;
  // wooden crate where they fell, with their gear laid out around it
  const box = new THREE.Group();
  const body = new THREE.Mesh(boxAt(0.9, 0.55, 0.6, 0, 0.275, 0), M_BOX); body.castShadow = true; box.add(body);
  const lid = new THREE.Mesh(boxAt(0.95, 0.08, 0.65, 0, 0.59, 0), M_BOX2); lid.castShadow = true; box.add(lid);
  for (const sx of [-0.3, 0, 0.3]) { const sl = new THREE.Mesh(boxAt(0.05, 0.5, 0.62, sx, 0.27, 0), M_BOX2); box.add(sl); }
  box.position.set(e.x, 0, e.y); box.rotation.y = e.a; world.add(box); deathBoxes.push(box);
  items.forEach((it, i) => {
    const a = e.a + i / items.length * TAU, r = 1.15;
    let x = e.x + Math.cos(a) * r, y = e.y + Math.sin(a) * r;
    if (pointBlocked(x, y)) { x = e.x + Math.cos(a) * 0.5; y = e.y + Math.sin(a) * 0.5; }
    it.x = x; it.y = y; it.rot = a; it.id = MAP.loot.length; MAP.loot.push(it); makeLootMesh(it); it.mesh.visible = true;
  });
}
function makeLootMesh(it) {
  {
    const key = it.k === "w" ? "w" + it.v : it.k === "a" ? "a" + it.v : it.k === "v" ? "v" + it.v : it.k;
    const m = LOOT_PROTO[key].clone();
    m.position.set(it.x, 0.02, it.y); m.rotation.y = it.rot || 0;
    m.scale.setScalar(it.k === "w" ? 1.6 : 1.4);
    // soft ground glow so items are easy to spot
    const glow = new THREE.Mesh(new THREE.CircleGeometry(0.55, 16), new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, depthWrite: false, opacity: 0.55, color: it.k === "w" ? 0xffb347 : it.k === "v" ? 0x7fb8ff : it.k === "a" ? 0xe9d38a : 0x8de39a }));
    glow.rotation.x = -Math.PI / 2; glow.position.y = 0.015; m.add(glow);
    m.visible = false; world.add(m); it.mesh = m;
  }
}
// ---- stance, jump, footsteps ----
function setStance(e, s) {
  if (!e.alive || e.ph !== "ground" || e.z > 0.05) return;
  e.stance = e.stance === s ? "stand" : s;
  if (e === me) { updateStanceUi(); tone(e.stance === "stand" ? 520 : 360, 0.05, "triangle", 0.03); }
}
function doJump(e) {
  if (!e.alive || e.ph !== "ground" || e.z > 0.05 || e.healT > 0) return;
  if (e.stance !== "stand") { e.stance = "stand"; if (e === me) updateStanceUi(); return; }
  e.vz = 4.8; if (e === me) noise(0.04, 0.06, 900, 300);
}
function updateStanceUi() { $("crouchBtn").classList.toggle("on", me.stance === "crouch"); $("proneBtn").classList.toggle("on", me.stance === "prone"); }
const stepEls = [];
function footsteps(e, moved) {
  if (e.stance === "prone" || e.z > 0.05 || moved <= 0) return;
  e.stepAcc += moved;
  const stride = e.stance === "crouch" ? 0.9 : 1.55;
  if (e.stepAcc < stride) return;
  e.stepAcc = 0;
  if (e === me) { noise(0.018, 0.05, 700, 180); return; }
  const dx = e.x - me.x, dy = e.y - me.y, d = Math.hypot(dx, dy), hear = e.stance === "crouch" ? 14 : 34;
  if (d > hear || !me.alive || me.ph !== "ground") return;
  const fx = Math.cos(camYaw), fy = Math.sin(camYaw), rx = -Math.sin(camYaw), ry = Math.cos(camYaw);
  const side = (dx * rx + dy * ry) / (d || 1), ahead = (dx * fx + dy * fy) / (d || 1);
  const k = Math.pow(1 - d / hear, 1.6);
  noise(0.11 * k + 0.008, 0.07, 650, 150, side);
  // on-screen footprint pointing to where the steps come from
  if (d > 3) {
    const el = document.createElement("i"); el.className = "step";
    const ang = Math.atan2(side, ahead);
    el.style.transform = `translate(-50%,-50%) rotate(${ang}rad) translateY(-118px)`;
    el.style.opacity = 0.35 + k * 0.6;
    $("steps").append(el); setTimeout(() => el.remove(), 600);
    if ($("steps").children.length > 10) $("steps").firstChild.remove();
  }
}

// ---------------- soldier model ----------------
let soldierGltf = null;
const loadModel = new Promise((resolve, reject) => {
  new GLTFLoader().load(MODEL_URL, (g) => { soldierGltf = g; resolve(g); }, (ev) => {
    if (ev.total) $("loadPct").textContent = ar(Math.round(ev.loaded / ev.total * 100)) + "٪";
  }, reject);
});
loadModel.then(() => { $("loading").hidden = true; $("menuBtns").hidden = false; }).catch(() => { $("loadPct").textContent = "ما قدرنا نحمّل الجندي. تأكد من النت وحدّث الصفحة."; });

const FACE = Math.PI; // model faces -Z; rotate so it looks along the entity's heading
function makeGun() {
  const g = new THREE.Group(), m = new THREE.MeshStandardMaterial({ color: 0x1f1f1f, roughness: 0.5, metalness: 0.6 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.11, 0.62), m); g.add(body);
  const mag = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.16, 0.08), m); mag.position.set(0, -0.11, 0.05); g.add(mag);
  const stock = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.1, 0.22), m); stock.position.set(0, -0.02, -0.38); g.add(stock);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}
function makeVisual(e) {
  const root = SkeletonUtils.clone(soldierGltf.scene);
  const tint = new THREE.Color(e.tint || "#ffffff");
  root.traverse((o) => {
    if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; o.frustumCulled = false; if (e.tint && e.tint !== "#ffffff" && o.material && o.material.name !== "Vanguard_VisorMat") { o.material = o.material.clone(); o.material.color.multiply(tint); } }
  });
  const holder = new THREE.Group(); holder.add(root); root.rotation.y = FACE;
  const gun = makeGun();
  const hand = root.getObjectByName("mixamorigRightHand");
  if (hand) { gun.scale.setScalar(100); gun.rotation.set(Math.PI / 2, 0, 0); gun.position.set(0, 9, 3); hand.add(gun); }
  else { gun.position.set(-0.22, 1.25, -0.38); root.add(gun); }
  const mixer = new THREE.AnimationMixer(root);
  const clip = (n) => soldierGltf.animations.find((a) => a.name === n);
  const acts = { idle: mixer.clipAction(clip("Idle")), walk: mixer.clipAction(clip("Walk")), run: mixer.clipAction(clip("Run")) };
  for (const k in acts) { acts[k].play(); acts[k].setEffectiveWeight(k === "idle" ? 1 : 0); }
  const chute = new THREE.Group();
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(2.4, 16, 8, 0, TAU, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: e.kind === "me" ? 0xf2a541 : 0xd9d2bb, side: THREE.DoubleSide, roughness: 0.8 }));
  canopy.scale.y = 0.55; canopy.position.y = 5.2; chute.add(canopy);
  const lines = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-2.2, 5.2, 0), new THREE.Vector3(0, 1.5, 0), new THREE.Vector3(2.2, 5.2, 0), new THREE.Vector3(0, 1.5, 0), new THREE.Vector3(0, 5.2, -2.2), new THREE.Vector3(0, 1.5, 0), new THREE.Vector3(0, 5.2, 2.2), new THREE.Vector3(0, 1.5, 0)]), new THREE.LineBasicMaterial({ color: 0x333333 }));
  chute.add(lines); chute.visible = false; holder.add(chute);
  holder.visible = false;
  scene.add(holder);
  let tag = null;
  if (e.kind === "remote") { tag = nameTag(e.name, e.color); tag.position.y = 2.25; holder.add(tag); }
  return { holder, root, mixer, acts, cur: "idle", chute, gun, tag };
}
function nameTag(text, color) {
  const c = document.createElement("canvas"); c.width = 256; c.height = 64; const g = c.getContext("2d");
  g.font = "700 30px sans-serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillStyle = "rgba(0,0,0,0.5)"; g.fillRect(20, 10, 216, 44); g.fillStyle = color; g.fillText(text, 128, 33);
  const t = new THREE.CanvasTexture(c); const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true })); s.scale.set(1.6, 0.4, 1); return s;
}
function setAnim(v, name) {
  if (v.cur === name) return;
  const from = v.acts[v.cur], to = v.acts[name];
  to.enabled = true; to.setEffectiveTimeScale(1); to.setEffectiveWeight(1); to.time = 0; from.crossFadeTo(to, 0.2, true);
  v.cur = name;
}
function disposeVisual(v) { if (!v) return; scene.remove(v.holder); v.mixer.stopAllAction(); }

// ---------------- game state ----------------
let mode = "menu", online = false, isHost = false;
let ents = [], me = null, feedEl = $("feed"), matchT = 0, matchStartWall = 0, ended = false, deathRank = 0, aliveCache = -1;
let camYaw = 0, camPitch = 0.12, camYawT = 0, camPitchT = 0.12, camDist = 3.4, aimZoom = false, camH = 1.55, shadowsOff = false;
let lastZoneHurt = 0, zoneWarned = -1, tutorial = null;

function newEnt(id, name, kind) {
  return { id, name, kind, color: "#f2a541", tint: "#ffffff", x: 0, y: 0, z: 110, a: 0, hp: 100, armor: 0, alive: true, ph: "plane", paraT: 0,
    w: [-1, -1], mag: [0, 0], cur: 0, ammo: { l: 0, h: 0, s: 0 }, heals: { b: 0, m: 0 }, fireT: 0, reloadT: 0, healT: 0, healKind: null, kills: 0,
    vx: 0, vy: 0, moving: false, jumpAt: 0, think: 0, target: null, goal: null, react: 0, strafe: 1, stuckT: 0, lx: 0, ly: 0, aimErr: 0, skill: 0.7,
    tx: 0, ty: 0, ta: 0, deadT: 0, vis: null, zoneAcc: 0, stance: "stand", vz: 0, stepAcc: 0, mode: "roam", memory: 0, underFire: 0 };
}
function startMatch(seed, opts) {
  for (const e of ents) disposeVisual(e.vis);
  MAP = genMap(seed); buildWorld(); groundMini = renderMiniGround();
  ents = []; feedEl.innerHTML = ""; ended = false; deathRank = 0; zoneWarned = -1; aliveCache = -1; tracers.length = 0;
  const nick = ($("nick").value.trim() || "لاعب").slice(0, 14);
  me = newEnt("me", nick, "me"); me.color = opts.color || NET_COLORS[0]; ents.push(me);
  const names = BOT_NAMES.slice().sort(() => MAP.R() - 0.5);
  for (let i = 0; i < opts.bots; i++) {
    const b = newEnt("b" + i, names[i % names.length], "bot"); b.tint = TINTS[1 + (i % (TINTS.length - 1))];
    b.jumpAt = MAP.plane.dur * (0.08 + MAP.R() * 0.84); b.skill = 0.5 + MAP.R() * 0.4; ents.push(b);
  }
  for (const e of ents) e.vis = makeVisual(e);
  const P = MAP.plane; camYaw = camYawT = Math.atan2(P.y2 - P.y1, P.x2 - P.x1); camPitch = camPitchT = 0.35;
  for (const b of deathBoxes) world.remove(b); deathBoxes.length = 0;
  matchStartWall = opts.t0; matchT = 0; mode = "play";
  tutorial = { step: store.get("ls3.tut", 0) >= 3 ? 99 : 0, t: 0 };
  showHud(true); updateHud(true); keepAwake(); hint(IS_TOUCH ? "اضغط زر «اقفز» لما تكون فوق مكان يعجبك" : "اضغط مسافة (Space) عشان تقفز من الطيارة");
}

// ---------------- combat ----------------
const ray = { o: new THREE.Vector3(), d: new THREE.Vector3() };
function rayBox(o, d, x0, y0, z0, x1, y1, z1) {
  let tmin = 0, tmax = 1e9;
  const ax = [[o.x, d.x, x0, x1], [o.y, d.y, y0, y1], [o.z, d.z, z0, z1]];
  for (const [p, v, a, b] of ax) {
    if (Math.abs(v) < 1e-9) { if (p < a || p > b) return Infinity; continue; }
    let t1 = (a - p) / v, t2 = (b - p) / v; if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
    tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2); if (tmin > tmax) return Infinity;
  }
  return tmin;
}
function rayCyl(o, d, cx, cz, r, y0, y1) {
  const ox = o.x - cx, oz = o.z - cz, a = d.x * d.x + d.z * d.z;
  if (a < 1e-9) return Infinity;
  const b = 2 * (ox * d.x + oz * d.z), c = ox * ox + oz * oz - r * r, disc = b * b - 4 * a * c;
  if (disc < 0) return Infinity;
  const s = Math.sqrt(disc);
  for (const t of [(-b - s) / (2 * a), (-b + s) / (2 * a)]) { if (t < 0) continue; const y = o.y + d.y * t; if (y >= y0 && y <= y1) return t; }
  return Infinity;
}
function castShot(o, d, range, shooter) {
  // nearest obstacle
  let best = range, hitEnt = null, head = false;
  const seen = new Set();
  for (let s = 0; s <= range; s += 18) {
    const px = o.x + d.x * s, pz = o.z + d.z * s;
    for (const ob of near(px, pz, 14)) {
      if (seen.has(ob)) continue; seen.add(ob);
      let t;
      if (ob.t === "r") t = rayBox(o, d, ob.x, 0, ob.y, ob.x + ob.w, ob.h3, ob.y + ob.h);
      else if (ob.kind === "tree") t = rayCyl(o, d, ob.x, ob.y, 0.3 * ob.s, 0, 6);
      else t = rayCyl(o, d, ob.x, ob.y, ob.r * 0.85, 0, ob.h3);
      if (t < best) best = t;
    }
    if (best < s) break;
  }
  if (o.y + d.y * best < 0 && d.y < 0) best = Math.min(best, -o.y / d.y); // ground
  for (const e of ents) {
    if (e === shooter || !e.alive || e.ph !== "ground") continue;
    const hh = e.stance === "prone" ? 0.55 : e.stance === "crouch" ? 1.25 : 1.85, z0 = e.z || 0;
    const t = rayCyl(o, d, e.x, e.y, e.stance === "prone" ? 0.6 : 0.36, z0, z0 + hh);
    if (t < best) { best = t; hitEnt = e; head = o.y + d.y * t > z0 + hh * 0.82; }
  }
  return { t: best, ent: hitEnt, head };
}
function canShoot(e) { return e.alive && e.ph === "ground" && e.healT <= 0 && e.reloadT <= 0 && e.fireT <= 0; }
function totalAmmo(e) { const wi = e.w[e.cur]; return wi < 0 ? 0 : e.ammo[WEAP[wi].ammo]; }
function startReload(e) {
  const wi = e.w[e.cur]; if (wi < 0 || e.reloadT > 0 || e.healT > 0) return;
  const W = WEAP[wi]; if (e.mag[e.cur] >= W.mag || e.ammo[W.ammo] <= 0) { if (e === me && e.ammo[W.ammo] <= 0) hint("خلصت الذخيرة! دوّر على ذخيرة " + AMMO_NAME[W.ammo]); return; }
  e.reloadT = W.reload; if (e === me) tone(520, 0.05, "square", 0.03);
}
function finishReload(e) { const wi = e.w[e.cur]; if (wi < 0) return; const W = WEAP[wi], take = Math.min(W.mag - e.mag[e.cur], e.ammo[W.ammo]); e.mag[e.cur] += take; e.ammo[W.ammo] -= take; if (e === me) { tone(760, 0.05, "square", 0.03); updateHud(); } }
function startHeal(e, kind) {
  if (!e.alive || e.ph !== "ground" || e.healT > 0 || e.heals[kind] <= 0) return;
  if (kind === "b" && e.hp >= 75) { if (e === me) hint("الضماد يعالج لين ٧٥ بس، استخدم الإسعاف"); return; }
  if (kind === "m" && e.hp >= 100) return;
  e.reloadT = 0; e.healKind = kind; e.healT = kind === "b" ? 2.2 : 5;
}
function finishHeal(e) { const k = e.healKind; e.heals[k]--; e.hp = k === "b" ? Math.min(75, e.hp + 18) : 100; e.healKind = null; if (e === me) { tone(660, 0.12, "sine", 0.06); tone(990, 0.12, "sine", 0.05); updateHud(); } }

const tmpV = new THREE.Vector3(), tmpV2 = new THREE.Vector3();
function muzzlePos(e, out) { return out.set(e.x + Math.cos(e.a) * 0.6 + Math.cos(e.a + Math.PI / 2) * 0.22, 1.32, e.y + Math.sin(e.a) * 0.6 + Math.sin(e.a + Math.PI / 2) * 0.22); }

function playerFire() {
  const e = me, wi = e.w[e.cur];
  if (!canShoot(e)) return;
  if (wi < 0) { hint("ما عندك سلاح! امشِ فوق سلاح عشان تلتقطه"); e.fireT = 0.6; return; }
  const W = WEAP[wi];
  if (e.mag[e.cur] <= 0) { startReload(e); return; }
  e.mag[e.cur]--; e.fireT = W.rate;
  camera.getWorldDirection(ray.d); ray.o.copy(camera.position);
  // skip past the player so walls behind the shoulder don't block
  const skip = camera.position.distanceTo(tmpV.set(e.x, 1.5, e.y)) + 0.3;
  const moving = (e.moving ? 1.6 : 1) * (e.z > 0.05 ? 2 : 1) * (e.stance === "prone" ? 0.5 : e.stance === "crouch" ? 0.7 : 1), zoomK = aimZoom ? 0.45 : 1;
  let anyHit = false;
  for (let p = 0; p < W.pel; p++) {
    const d = tmpV2.copy(ray.d);
    d.x += (Math.random() - 0.5) * W.spread * 2 * moving * zoomK; d.y += (Math.random() - 0.5) * W.spread * 2 * moving * zoomK; d.z += (Math.random() - 0.5) * W.spread * 2 * moving * zoomK; d.normalize();
    const o = tmpV.copy(ray.o).addScaledVector(d, skip);
    const r = castShot(o, d, W.range, e);
    const end = o.clone().addScaledVector(d, r.t);
    addTracer(muzzlePos(e, new THREE.Vector3()), end, wi === 4);
    if (r.ent) {
      anyHit = true;
      const fall = wi === 3 ? clamp(1 - r.t / W.range * 0.7, 0.3, 1) : 1;
      dealHit(e, r.ent, W.dmg * fall * (r.head ? 1.8 : 1), wi, r.head);
      blood(end);
    } else if (r.t < W.range - 0.5) dust(end);
  }
  if (anyHit) hitMarker();
  alertBots(e.x, e.y, e, wi === 4 ? 140 : 80);
  if (online) netShot(e, wi);
  recoil += wi === 4 ? 0.05 : wi === 3 ? 0.04 : 0.012;
  shotSfx(wi, 1); flash(e);
  if (e.mag[e.cur] === 0 && totalAmmo(e) > 0) startReload(e);
  updateHud();
}
function botFire(b, t) {
  const wi = b.w[b.cur]; if (!canShoot(b) || wi < 0) return;
  const W = WEAP[wi]; if (b.mag[b.cur] <= 0) { startReload(b); return; }
  b.mag[b.cur]--; b.fireT = W.rate * (1.25 + (1 - b.skill) * 0.6);
  const d = Math.hypot(t.x - b.x, t.y - b.y);
  const mv = (t.moving ? 0.65 : 1) * (t.stance === "prone" ? 0.55 : t.stance === "crouch" ? 0.8 : 1), base = b.skill * clamp(1 - d / (W.range * 1.05), 0.05, 1) * mv * (t === me && me.ph === "ground" && insideBuilding(me.x, me.y) ? 0.8 : 1);
  const from = muzzlePos(b, new THREE.Vector3());
  let hits = 0;
  for (let p = 0; p < W.pel; p++) if (Math.random() < clamp(base * 0.6, 0.03, 0.7)) hits++;
  const to = new THREE.Vector3(t.x + (hits ? 0 : (Math.random() - 0.5) * 1.6), 0.9 + Math.random() * 0.8, t.y + (hits ? 0 : (Math.random() - 0.5) * 1.6));
  addTracer(from, to, wi === 4);
  if (online) netShot(b, wi);
  alertBots(b.x, b.y, b, 60);
  const dm = Math.hypot(b.x - me.x, b.y - me.y);
  shotSfx(wi, clamp(1 - dm / 180, 0, 1));
  flash(b);
  if (hits) dealHit(b, t, W.dmg * hits * (t === me || t.kind === "remote" ? 0.75 : 1), wi, false);
  if (t === me && !hits && dm < 25) { whizz(); }
}
function dealHit(src, target, dmg, wi, head) {
  if (online) {
    if (target.kind === "remote") { netDamage(target.id, dmg, wi); return; }
    if (target.kind === "bot" && !isHost) { netDamage(target.id, dmg, wi); return; }
  }
  applyDamage(target, dmg, src ? src.id : null, src ? src.name : "", wi, head);
}
function applyDamage(t, dmg, killerId, killerName, wi, head) {
  if (!t.alive) return;
  if (t.kind === "bot") { t.underFire = 2.5; const src = ents.find((x) => x.id === killerId); if (src && src.alive && src !== t && !t.seen) { t.target = src; t.memory = 6; t.react = 0.3; } }
  t.hp -= dmg * (1 - (ARMOR[t.armor] || 0));
  if (t === me) {
    hurt = 1; buzz(30); tone(140, 0.12, "sawtooth", 0.05, -40);
    if (t.healT > 0) { t.healT = 0; t.healKind = null; }
    const src = ents.find((x) => x.id === killerId); if (src) showDamageDir(src);
    updateHud();
  }
  if (t.hp <= 0) kill(t, killerId, killerName, wi, head);
}
function kill(t, killerId, killerName, wi, head) {
  t.alive = false; t.hp = 0; t.deadT = 0;
  if (!online) dropDeathBox(t);
  const killer = ents.find((e) => e.id === killerId);
  if (killer && killer !== t) { killer.kills++; if (killer === me) { tone(880, 0.1, "triangle", 0.06); tone(1320, 0.14, "triangle", 0.05); buzz(40); killBanner(t.name, head); } }
  const how = wi === -2 ? "العاصفة" : (WEAP[wi] ? WEAP[wi].name : "");
  addFeed(killerName && killerId !== t.id ? killerName : null, t.name, how, t === me || killer === me);
  if (online && isHost && t.kind === "bot") netBotDeath(t, killerId);
  if (t === me) onMyDeath(killerName, how);
  updateHud();
}

// effects
const tracers = [];
const tracerMat = new THREE.LineBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.9, fog: false });
const tracerMatS = new THREE.LineBasicMaterial({ color: 0xfff6d8, transparent: true, opacity: 1, fog: false });
function addTracer(a, b, sniper) {
  const g = new THREE.BufferGeometry().setFromPoints([a, b]); const l = new THREE.Line(g, (sniper ? tracerMatS : tracerMat).clone());
  scene.add(l); tracers.push({ l, life: sniper ? 0.25 : 0.07, max: sniper ? 0.25 : 0.07 });
}
const flashTex = canvasTex(64, 64, (g) => { const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, "rgba(255,250,220,1)"); gr.addColorStop(0.3, "rgba(255,190,80,0.9)"); gr.addColorStop(1, "rgba(255,120,0,0)"); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); });
const flashes = [];
function flash(e) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: flashTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); muzzlePos(e, s.position); s.scale.set(0.7, 0.7, 1); scene.add(s); flashes.push({ s, life: 0.05 }); }
const puffs = [];
const puffTex = canvasTex(64, 64, (g) => { const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, "rgba(255,255,255,0.9)"); gr.addColorStop(1, "rgba(255,255,255,0)"); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); });
function puff(p, color, size, life) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: puffTex, color, transparent: true, depthWrite: false })); s.position.copy(p); s.scale.set(size, size, 1); scene.add(s); puffs.push({ s, life, max: life, grow: size * 1.5 }); }
function dust(p) { puff(p, 0xcbbd98, 0.5, 0.45); }
function blood(p) { puff(p, 0xa31414, 0.6, 0.35); }

let hurt = 0, recoil = 0, hitT = 0;
function hitMarker() { hitT = 0.15; tone(1400, 0.03, "square", 0.03); }
function whizz() { tone(2200, 0.08, "sine", 0.02, -1500); }
function killBanner(name, head) { const k = $("killBanner"); k.textContent = (head ? "طلقة راس! " : "") + "قتلت " + name; k.hidden = false; clearTimeout(killBanner.t); killBanner.t = setTimeout(() => (k.hidden = true), 1800); }
function addFeed(killer, victim, how, mine) {
  const d = document.createElement("div"); d.textContent = killer ? killer + " ← " + victim + (how ? " (" + how + ")" : "") : victim + " مات" + (how ? " (" + how + ")" : "");
  if (mine) d.className = "me"; feedEl.prepend(d); while (feedEl.children.length > 5) feedEl.lastChild.remove();
}
let hintTimer = null;
function hint(t, ms = 3200) { const h = $("hint"); h.textContent = t; h.hidden = false; clearTimeout(hintTimer); hintTimer = setTimeout(() => (h.hidden = true), ms); }
function showDamageDir(src) {
  const ang = Math.atan2(src.y - me.y, src.x - me.x) - camYaw; const el = $("dmgDir");
  el.style.transform = `translate(-50%,-50%) rotate(${ang + Math.PI / 2}rad)`; el.hidden = false; clearTimeout(showDamageDir.t); showDamageDir.t = setTimeout(() => (el.hidden = true), 700);
}

// ---------------- loot ----------------
function itemLabel(it) {
  if (it.k === "w") return WEAP[it.v].name; if (it.k === "a") return "ذخيرة " + AMMO_NAME[it.v] + " ×" + ar(it.n);
  if (it.k === "b") return "ضماد ×" + ar(it.n); if (it.k === "m") return "حقيبة إسعاف"; if (it.k === "v") return "درع مستوى " + ar(it.v); return "";
}
function takeLoot(e, it, force) {
  if (it.k === "a") e.ammo[it.v] = Math.min(e.ammo[it.v] + it.n, it.v === "s" ? 60 : 240);
  else if (it.k === "b") { if (e.heals.b >= 10) return false; e.heals.b += it.n; }
  else if (it.k === "m") { if (e.heals.m >= 4) return false; e.heals.m += it.n; }
  else if (it.k === "v") { if (it.v <= e.armor) return false; e.armor = it.v; }
  else if (it.k === "w") {
    if (e.w.includes(it.v) && !force) e.ammo[WEAP[it.v].ammo] += 15;
    else {
      let slot = e.w[0] < 0 ? 0 : e.w[1] < 0 ? 1 : -1;
      if (slot < 0) { if (!force) return false; slot = e.cur; }
      e.w[slot] = it.v; e.mag[slot] = Math.ceil(WEAP[it.v].mag / 2); e.cur = slot; e.ammo[WEAP[it.v].ammo] += WEAP[it.v].ammo === "s" ? 5 : 15;
    }
  }
  it.taken = true; if (it.mesh) it.mesh.visible = false;
  if (online) netTook(it.id);
  if (e === me) { tone(980, 0.06, "triangle", 0.05); updateHud(); hint("أخذت: " + itemLabel(it), 1600); if (it.k === "w") tutorialEvent("gun"); }
  return true;
}
let nearLoot = null;
function autoLoot(e) {
  let best = null, bd = 1e9;
  for (const it of MAP.loot) {
    if (it.taken) continue;
    const dx = it.x - e.x, dy = it.y - e.y, d2 = dx * dx + dy * dy; if (d2 > 2.2 * 2.2) continue;
    const auto = it.k !== "w" || e.w[0] < 0 || e.w[1] < 0 || e.w.includes(it.v);
    if (auto && (it.k !== "v" || it.v > e.armor)) { if (takeLoot(e, it, false)) continue; }
    if (d2 < bd) { bd = d2; best = it; }
  }
  return best;
}
function nearestWeapon(x, y) {
  let best = null, bd = 1e9;
  for (const it of MAP.loot) { if (it.taken || it.k !== "w") continue; const d = Math.hypot(it.x - x, it.y - y); if (d < bd) { bd = d; best = it; } }
  return best;
}

// ---------------- bots ----------------
// pick a spot behind an obstacle that the enemy cannot see
function findCover(b, t) {
  let best = null, bd = 26;
  const cands = near(b.x, b.y, 22);
  let n = 0;
  for (const o of cands) {
    if (o.kind === "tree" || o.kind === "pole" || o.kind === "fence" || o.kind === "wall" && o.h3 < 2) continue;
    if (++n > 28) break;
    let cx, cy, size;
    if (o.t === "c") { cx = o.x; cy = o.y; size = o.r; }
    else { cx = clamp(b.x, o.x, o.x + o.w); cy = clamp(b.y, o.y, o.y + o.h); size = 0.2; }
    const dx = cx - t.x, dy = cy - t.y, dl = Math.hypot(dx, dy) || 1;
    const px = cx + dx / dl * (size + 1.0), py = cy + dy / dl * (size + 1.0);
    if (px < 3 || py < 3 || px > S - 3 || py > S - 3 || pointBlocked(px, py)) continue;
    const d = Math.hypot(px - b.x, py - b.y);
    if (d < bd && !los(t.x, t.y, px, py)) { bd = d; best = { x: px, y: py }; }
  }
  return best;
}
// gunshots and footsteps draw nearby bots to the noise
function alertBots(x, y, src, radius) {
  for (const b of ents) {
    if (b.kind !== "bot" || !b.alive || b.ph !== "ground" || b === src) continue;
    if (Math.abs(b.x - x) + Math.abs(b.y - y) > radius * 1.4 || Math.hypot(b.x - x, b.y - y) > radius) continue;
    if (!b.target) { b.heard = { x, y, t: 6 }; b.a = Math.atan2(y - b.y, x - b.x); }
  }
}
function attackersOf(t) { let n = 0; for (const e of ents) if (e.kind === "bot" && e.alive && e.target === t) n++; return n; }

function botThink(b, dt, zone) {
  if (b.ph === "plane") return;
  b.think -= dt;
  if (b.underFire > 0) b.underFire -= dt;
  if (b.heard) { b.heard.t -= dt; if (b.heard.t <= 0) b.heard = null; }
  const hasGun = b.w[b.cur] >= 0;
  if (b.think <= 0) {
    b.think = 0.25 + Math.random() * 0.15;
    // who can I see? (prone targets are hard to spot from far away)
    let tgt = null, td = b.w[b.cur] === 4 ? 150 : 90;
    for (const o of ents) {
      if (o === b || !o.alive || o.ph !== "ground") continue;
      const d = Math.hypot(o.x - b.x, o.y - b.y), range = o.stance === "prone" ? Math.min(td, 40) : o.stance === "crouch" ? td * 0.8 : td;
      if (d < range && d < td && los(b.x, b.y, o.x, o.y)) { td = d; tgt = o; }
    }
    b.seen = !!tgt;
    if (!tgt && b.target && b.target.alive && b.memory > 0) tgt = b.target; // keep hunting a target we just lost
    if (tgt !== b.target) { b.react = 0.45 + (1 - b.skill) * 0.6; b.target = tgt; b.mode = "fight"; b.memory = 5; }
    if (b.seen) b.memory = 5;
    b.aimErr = (Math.random() - 0.5) * 0.2;
    if (Math.random() < 0.25) b.strafe *= -1;
    // tactics
    if (tgt && hasGun) {
      if ((b.hp < 55 || b.underFire > 0) && b.mode !== "cover" && b.mode !== "peek" && Math.random() < 0.6) {
        const cp = findCover(b, tgt);
        if (cp) { b.mode = "cover"; b.coverPt = cp; b.modeT = 2 + Math.random() * 2.5; }
      } else if (b.mode === "fight" && !b.flanked && attackersOf(tgt) >= 2 && Math.random() < 0.3) {
        b.mode = "flank"; b.flankSide = Math.random() < 0.5 ? -1 : 1; b.modeT = 5; b.flanked = true;
      }
      b.stance = b.mode === "fight" && b.seen && Math.random() < 0.3 ? "crouch" : b.mode === "cover" ? b.stance : "stand";
    } else b.stance = "stand";
    // where to go when not fighting
    const dz = Math.hypot(b.x - zone.nx, b.y - zone.ny);
    const outside = Math.hypot(b.x - zone.x, b.y - zone.y) > zone.r - 6 || (zone.shrinking && dz > zone.nr * 0.8) || (zone.left < 20 && dz > zone.nr * 0.85);
    if (outside) { b.goal = { x: zone.nx + (Math.random() - 0.5) * zone.nr * 0.5, y: zone.ny + (Math.random() - 0.5) * zone.nr * 0.5 }; b.urgent = true; }
    else if (b.heard && !tgt) { b.goal = { x: b.heard.x + (Math.random() - 0.5) * 8, y: b.heard.y + (Math.random() - 0.5) * 8 }; b.urgent = false; }
    else if (!b.goal || Math.hypot(b.goal.x - b.x, b.goal.y - b.y) < 2 || Math.random() < 0.03) {
      b.urgent = false;
      let pick = null, pd = b.w[0] < 0 ? 160 : 70;
      for (const it of MAP.loot) {
        if (it.taken || (it.k === "w" && b.w[0] >= 0 && b.w[1] >= 0) || (it.k === "v" && it.v <= b.armor)) continue;
        const d = Math.hypot(it.x - b.x, it.y - b.y);
        if (d < pd && Math.hypot(it.x - zone.x, it.y - zone.y) < zone.r) { pd = d; pick = it; }
      }
      if (pick) b.goal = { x: pick.x, y: pick.y };
      else { const a = Math.random() * TAU, r = Math.random() * zone.nr * 0.9; b.goal = { x: clamp(zone.nx + Math.cos(a) * r, 8, S - 8), y: clamp(zone.ny + Math.sin(a) * r, 8, S - 8) }; }
    }
    if (Math.hypot(b.x - b.lx, b.y - b.ly) < 0.3 && (b.goal || b.mode === "cover") && b.ph === "ground" && b.healT <= 0 && !(b.mode === "cover" && b.atCover)) { b.stuckT = 0.8; b.stuckA = Math.random() * TAU; }
    b.lx = b.x; b.ly = b.y;
  }
  if (b.memory > 0) b.memory -= dt;
  let mx = 0, my = 0;
  const t = b.target;
  const go = (gx, gy) => { const a = Math.atan2(gy - b.y, gx - b.x); mx = Math.cos(a); my = Math.sin(a); return a; };
  if (b.ph === "para") { if (b.goal) b.a = go(b.goal.x, b.goal.y); }
  else if (t && t.alive && hasGun && !b.urgent) {
    const d = Math.hypot(t.x - b.x, t.y - b.y), a = Math.atan2(t.y - b.y, t.x - b.x);
    const wi = b.w[b.cur], want = wi === 3 ? 10 : wi === 4 ? 70 : 28;
    b.react -= dt;
    if (b.mode === "cover" && b.coverPt) {
      const dc = Math.hypot(b.coverPt.x - b.x, b.coverPt.y - b.y);
      b.atCover = dc < 0.8;
      if (!b.atCover) { go(b.coverPt.x, b.coverPt.y); b.stance = "stand"; }
      else {
        b.stance = "crouch"; b.a = a;
        if (b.hp < 70 && b.healT <= 0) { if (b.heals.m > 0 && b.hp < 45) startHeal(b, "m"); else if (b.heals.b > 0 && b.hp < 75) startHeal(b, "b"); }
        if (b.mag[b.cur] < WEAP[wi].mag) startReload(b);
        b.modeT -= dt;
        if (b.modeT <= 0 && b.healT <= 0) { b.mode = "peek"; b.modeT = 1.2 + Math.random(); b.peekSide = Math.random() < 0.5 ? -1 : 1; }
      }
    } else if (b.mode === "peek") {
      // step out to the side, shoot, then go back to cover
      mx = Math.cos(a + Math.PI / 2) * b.peekSide * 0.6; my = Math.sin(a + Math.PI / 2) * b.peekSide * 0.6;
      b.a = a + b.aimErr * 0.2;
      if (b.react <= 0 && d < WEAP[wi].range && b.seen) botFire(b, t);
      b.modeT -= dt; if (b.modeT <= 0) { b.mode = b.hp < 55 ? "cover" : "fight"; b.modeT = 2 + Math.random() * 2; }
    } else if (b.mode === "flank") {
      // circle round to the target's side
      const back = Math.atan2(b.y - t.y, b.x - t.x) + b.flankSide * 1.1;
      go(t.x + Math.cos(back) * want, t.y + Math.sin(back) * want);
      if (b.seen && b.react <= 0 && d < WEAP[wi].range) { b.a = a + b.aimErr * 0.2; botFire(b, t); } else b.a = Math.atan2(my, mx);
      b.modeT -= dt; if (b.modeT <= 0) b.mode = "fight";
    } else {
      b.a = a + b.aimErr * 0.2;
      if (!b.seen) { go(t.x, t.y); } // chase the last known position
      else {
        const fwd = d > want + 6 ? 1 : d < want - 8 ? -0.7 : 0;
        const strafeK = b.stance === "crouch" ? 0.2 : 0.8;
        mx = Math.cos(a) * fwd + Math.cos(a + Math.PI / 2) * b.strafe * strafeK; my = Math.sin(a) * fwd + Math.sin(a + Math.PI / 2) * b.strafe * strafeK;
        if (b.react <= 0 && d < WEAP[wi].range) botFire(b, t);
      }
    }
    if (b.mag[b.cur] === 0 && totalAmmo(b) === 0 && b.w[1 - b.cur] >= 0) b.cur = 1 - b.cur;
  } else {
    b.mode = "roam";
    if (b.hp < 60 && b.healT <= 0) { if (b.heals.m > 0 && b.hp < 40) startHeal(b, "m"); else if (b.heals.b > 0 && b.hp < 75) startHeal(b, "b"); }
    if (b.w[b.cur] >= 0 && b.mag[b.cur] < WEAP[b.w[b.cur]].mag * 0.5) startReload(b);
    if (b.goal) b.a = go(b.goal.x, b.goal.y);
    if (b.w[b.cur] < 0 && b.w[1 - b.cur] >= 0) b.cur = 1 - b.cur;
  }
  if (b.stuckT > 0) { b.stuckT -= dt; mx = Math.cos(b.stuckA); my = Math.sin(b.stuckA); }
  const l = Math.hypot(mx, my); if (l > 0.01) { b.vx = mx / Math.max(1, l); b.vy = my / Math.max(1, l); } else b.vx = b.vy = 0;
  if (b.ph === "ground") { const lt = autoLoot(b); if (lt && lt.k === "w" && b.w[b.cur] >= 0 && lt.v > b.w[b.cur] && lt.v !== 4) takeLoot(b, lt, true); }
}

// ---------------- update ----------------
function jump(e) {
  if (e.ph !== "plane") return;
  e.ph = "para"; e.paraT = 0; e.z = 105;
  if (e.kind === "bot") { const b = MAP.blds[Math.floor(MAP.R() * MAP.blds.length)]; e.goal = b ? { x: b.x + b.w / 2, y: b.y + b.h / 2 } : { x: e.x, y: e.y }; }
  if (e === me) { tone(300, 0.3, "sine", 0.06, 300); hint(IS_TOUCH ? "حرّك العصا اليسار عشان توجّه المظلة، ودوّر حول نفسك بالسحب يمين الشاشة" : "وجّه المظلة بـ WASD والماوس", 4200); tutorialEvent("jump"); }
}
function update(dt) {
  matchT = (nowSync() - matchStartWall) / 1000;
  if (matchT < 0) { $("countdown").hidden = false; $("countdown").textContent = ar(Math.ceil(-matchT)); return; }
  $("countdown").hidden = true;
  const zone = zoneAt(matchT), P = MAP.plane, pk = clamp(matchT / P.dur, 0, 1);
  const px = lerp(P.x1, P.x2, pk), py = lerp(P.y1, P.y2, pk);

  // my input
  if (me.alive) {
    const mv = input.move();
    const fwdX = Math.cos(camYaw), fwdY = Math.sin(camYaw), rX = -Math.sin(camYaw), rY = Math.cos(camYaw);
    let vx = fwdX * -mv.y + rX * mv.x, vy = fwdY * -mv.y + rY * mv.x; const l = Math.hypot(vx, vy);
    if (l > 1) { vx /= l; vy /= l; }
    const k = 1 - Math.exp(-dt * 14); // ease in/out so movement feels smooth
    me.vx = lerp(me.vx, vx, k); me.vy = lerp(me.vy, vy, k);
    if (me.ph === "ground") { if (input.firing() || aimZoom || l > 0.1) me.a = camYaw; }
    else if (me.ph === "para") me.a = camYaw;
    if (input.firing()) playerFire();
  }
  for (const e of ents) {
    if (e.kind === "remote" || (e.kind === "bot" && online && !isHost)) {
      const k = 1 - Math.exp(-dt * 12), ox = e.x, oy = e.y;
      e.x = lerp(e.x, e.tx, k); e.y = lerp(e.y, e.ty, k); e.z = lerp(e.z, e.tz || 0, k);
      let da = e.ta - e.a; da = Math.atan2(Math.sin(da), Math.cos(da)); e.a += da * k;
      const moved = Math.hypot(e.x - ox, e.y - oy);
      e.moving = moved / Math.max(dt, 1e-4) > 1;
      if (e.alive && e.ph === "ground") footsteps(e, moved);
      continue;
    }
    if (!e.alive) { e.deadT += dt; continue; }
    if (e.ph === "plane") { e.x = px; e.y = py; e.z = 110; if (e.kind === "bot" && matchT >= e.jumpAt) jump(e); if (pk >= 1) jump(e); continue; }
    if (e.kind === "bot") botThink(e, dt, zone);
    if (e.ph === "para") {
      e.paraT += dt;
      const fall = e.z > 32 ? 38 : 7; e.z -= fall * dt;
      const steer = e.z > 32 ? 24 : 11; e.x += e.vx * steer * dt; e.y += e.vy * steer * dt;
      e.x = clamp(e.x, 4, S - 4); e.y = clamp(e.y, 4, S - 4);
      if (e.z <= 0) { e.z = 0; e.vz = 0; e.stance = "stand"; e.ph = "ground"; collide(e); if (e === me) { hint("هبطت! دوّر على سلاح، الأسلحة تلمع بلون برتقالي", 4500); tutorialEvent("land"); updateHud(); } }
      continue;
    }
    let sp = e.kind === "bot" ? 6.2 : 7.2;
    if (e.healT > 0) sp *= 0.45; if (e === me && aimZoom) sp *= 0.55;
    sp *= e.stance === "prone" ? 0.28 : e.stance === "crouch" ? 0.55 : 1;
    e.x += e.vx * sp * dt; e.y += e.vy * sp * dt; e.moving = Math.hypot(e.vx, e.vy) > 0.1;
    if (e.z > 0 || e.vz > 0) { e.vz -= 13 * dt; e.z += e.vz * dt; if (e.z <= 0) { e.z = 0; e.vz = 0; if (e === me) noise(0.05, 0.08, 500, 120); } }
    collide(e);
    footsteps(e, sp * Math.hypot(e.vx, e.vy) * dt);
    if (e.fireT > 0) e.fireT -= dt;
    if (e.reloadT > 0) { e.reloadT -= dt; if (e.reloadT <= 0) finishReload(e); }
    if (e.healT > 0) { e.healT -= dt; if (e.healT <= 0) finishHeal(e); }
    if (Math.hypot(e.x - zone.x, e.y - zone.y) > zone.r) {
      e.zoneAcc += zone.dps * dt;
      if (e.zoneAcc >= 1) { const d = Math.floor(e.zoneAcc); e.zoneAcc -= d; e.hp -= d; if (e === me) { hurt = Math.max(hurt, 0.4); updateHud(); } if (e.hp <= 0) kill(e, null, null, -2); }
    }
  }
  if (me.alive && me.ph === "ground") {
    nearLoot = autoLoot(me);
    const pb = $("pickupBtn"); if (nearLoot) { pb.hidden = false; pb.textContent = (IS_TOUCH ? "" : "F · ") + "التقط " + itemLabel(nearLoot); } else pb.hidden = true;
  } else $("pickupBtn").hidden = true;
  $("jumpBtn").hidden = !(me.alive && me.ph === "plane");

  // zone ui
  const outside = me.alive && Math.hypot(me.x - zone.x, me.y - zone.y) > zone.r;
  const zm = $("zoneMsg");
  if (zone.phase < PHASES.length) { zm.textContent = (outside ? "أنت برا المنطقة الآمنة! ارجع داخل الدائرة البيضاء · " : "") + (zone.shrinking ? "العاصفة تضيق · " : "العاصفة تضيق بعد ") + fmtTime(zone.left); zm.classList.toggle("hot", outside); }
  else { zm.textContent = "المنطقة انتهت!"; zm.classList.add("hot"); }
  $("storm").style.opacity = outside ? 0.55 : 0;
  if (!zone.shrinking && zone.left < 10 && zoneWarned !== zone.phase && zone.phase < PHASES.length) { zoneWarned = zone.phase; tone(440, 0.2, "square", 0.04); setTimeout(() => tone(440, 0.2, "square", 0.04), 300); hint("العاصفة بتضيق! روح داخل الدائرة البيضاء على الخريطة"); }
  tutorialTick(dt, zone);
  if (online) netTick(dt);
  checkEnd();
}
function fmtTime(s) { s = Math.max(0, Math.ceil(s)); return ar(Math.floor(s / 60)) + ":" + String(s % 60).padStart(2, "0").replace(/\d/g, (d) => "٠١٢٣٤٥٦٧٨٩"[d]); }

// tutorial: short hints that tell a new player exactly what to do next
function tutorialEvent(ev) {
  if (!tutorial || tutorial.step >= 99) return;
  if (ev === "jump" && tutorial.step === 0) tutorial.step = 1;
  if (ev === "land" && tutorial.step <= 1) { tutorial.step = 2; tutorial.t = 0; }
  if (ev === "gun" && tutorial.step <= 2) { tutorial.step = 3; store.set("ls3.tut", 3); setTimeout(() => hint(IS_TOUCH ? "صوّب بالسحب يمين الشاشة، واضغط الزر الأحمر عشان تطلق" : "صوّب بالماوس، واضغط كليك يسار عشان تطلق، وكليك يمين للتنشين", 5000), 1700); }
}
function tutorialTick(dt, zone) {
  if (!tutorial || tutorial.step !== 2 || me.ph !== "ground") { $("guide").hidden = true; return; }
  tutorial.t += dt;
  const w = nearestWeapon(me.x, me.y);
  if (!w) { $("guide").hidden = true; return; }
  const ang = Math.atan2(w.y - me.y, w.x - me.x) - camYaw, d = Math.hypot(w.x - me.x, w.y - me.y);
  const g = $("guide"); g.hidden = false;
  g.querySelector("i").style.transform = `rotate(${ang + Math.PI / 2}rad)`;
  g.querySelector("span").textContent = "أقرب سلاح: " + ar(Math.round(d)) + " م";
}

function aliveCount() { let n = 0; for (const e of ents) if (e.alive) n++; return n; }
function checkEnd() {
  const n = aliveCount(); if (n !== aliveCache) { aliveCache = n; $("alive").textContent = ar(n); }
  if (!ended && me.alive && n <= 1 && matchT > 5) {
    ended = true; if (online) netState("win");
    tone(523, 0.15, "triangle", 0.07); setTimeout(() => tone(659, 0.15, "triangle", 0.07), 150); setTimeout(() => tone(1046, 0.3, "triangle", 0.07), 300);
    setTimeout(() => showEnd(true, 1, ""), 1400);
  }
}
function onMyDeath(killerName, how) {
  deathRank = aliveCount() + 1; if (online) netState("dead"); buzz([80, 40, 160]);
  setTimeout(() => { if (!ended) { ended = true; showEnd(false, deathRank, killerName ? "قتلك " + killerName + (how ? " بـ" + how : "") : "قتلتك " + how); } }, 2200);
}

// ---------------- render ----------------
const camTarget = new THREE.Vector3();
let lootTick = 0;
function render(dt) {
  if (!MAP || mode !== "play") { renderer.render(scene, camera); return; }
  // visuals
  const myBld = me.ph === "ground" ? insideBuilding(me.x, me.y) : null;
  for (const r of roofMeshes) r.visible = r.userData.b !== myBld;
  for (const e of ents) {
    const v = e.vis; if (!v) continue;
    const d = Math.hypot(e.x - me.x, e.y - me.y);
    const show = e.ph !== "plane" && d < Q.draw && (e.alive || e.deadT < 6);
    v.holder.visible = show; if (!show) continue;
    const hb = e.ph === "ground" && e !== me ? insideBuilding(e.x, e.y) : null;
    if (hb && hb !== myBld) { v.holder.visible = false; continue; }
    v.holder.position.set(e.x, e.z || 0, e.y);
    v.holder.rotation.y = Math.PI / 2 - e.a;
    v.chute.visible = e.ph === "para" && e.z < 32;
    if (!e.alive) { v.root.rotation.x = lerp(v.root.rotation.x, -Math.PI / 2, 1 - Math.exp(-dt * 6)); v.root.position.y = 0.25; continue; }
    const st = e.ph === "ground" ? e.stance : "stand";
    v.root.rotation.x = lerp(v.root.rotation.x, st === "prone" ? -Math.PI / 2 + 0.12 : 0, 1 - Math.exp(-dt * 10));
    v.root.position.y = lerp(v.root.position.y, st === "prone" ? 0.32 : 0, 1 - Math.exp(-dt * 10));
    const sy = st === "crouch" ? 0.72 : 1; v.root.scale.y = lerp(v.root.scale.y, sy, 1 - Math.exp(-dt * 12));
    setAnim(v, e.ph !== "ground" || e.z > 0.05 ? "idle" : e.moving ? (e.healT > 0 || (e === me && aimZoom) || st !== "stand" ? "walk" : "run") : "idle");
    v.acts.walk.timeScale = st === "prone" ? 0.5 : 1;
    v.acts.run.timeScale = e.kind === "bot" ? 1.05 : 1.2; // match the legs to the real running speed
    v.gun.visible = e.w[e.cur] >= 0;
    if (d < 120) v.mixer.update(dt);
  }
  // loot: only draw what is close (keeps phones fast)
  if ((lootTick = (lootTick + 1) % 6) === 0) for (const it of MAP.loot) { if (!it.mesh) continue; const d = Math.abs(it.x - me.x) + Math.abs(it.y - me.y); it.mesh.visible = !it.taken && d < Q.loot && me.ph === "ground"; }
  // zone
  const zone = zoneAt(Math.max(0, matchT));
  zoneWall.scale.set(Math.max(0.01, zone.r), 90, Math.max(0.01, zone.r)); zoneWall.position.set(zone.x, 44, zone.y);
  nextRing.scale.set(Math.max(0.01, zone.nr), Math.max(0.01, zone.nr), 1); nextRing.position.set(zone.nx, 0.08, zone.ny);
  // plane
  const P = MAP.plane, pk = matchT / P.dur;
  planeMesh.visible = pk < 1.3; planeMesh.position.set(lerp(P.x1, P.x2, pk), 114, lerp(P.y1, P.y2, pk)); planeMesh.rotation.y = -Math.atan2(P.y2 - P.y1, P.x2 - P.x1);
  // camera
  const W = me.w[me.cur] >= 0 ? WEAP[me.w[me.cur]] : null;
  const targetFov = aimZoom && W ? W.fov : 62; camera.fov = lerp(camera.fov, targetFov, 1 - Math.exp(-dt * 10)); camera.updateProjectionMatrix();
  recoil = Math.max(0, recoil - dt * 0.5); const pitch = camPitch - recoil;
  const inAir = me.ph !== "ground";
  const dist = me.ph === "plane" ? 26 : me.ph === "para" ? (me.z > 32 ? 9 : 6) : aimZoom ? 1.6 : camDist;
  const ex = me.ph === "plane" ? planeMesh.position.x : me.x, ey = me.ph === "plane" ? 114 : me.z, ez = me.ph === "plane" ? planeMesh.position.z : me.y;
  camH = lerp(camH, me.ph !== "ground" ? 1.55 : me.stance === "prone" ? 0.75 : me.stance === "crouch" ? 1.15 : 1.55, 1 - Math.exp(-dt * 8));
  const ky = 1 - Math.exp(-dt * (document.pointerLockElement ? 45 : 26)); // smooth camera turning
  camYaw += (camYawT - camYaw) * ky; camPitch += (camPitchT - camPitch) * ky;
  camTarget.set(ex, (me.ph === "ground" ? me.z : ey) + camH, ez);
  const dx = Math.cos(camYaw) * Math.cos(pitch), dy = -Math.sin(pitch), dz = Math.sin(camYaw) * Math.cos(pitch);
  const rx = -Math.sin(camYaw), rz = Math.cos(camYaw), sh = inAir ? 0 : aimZoom ? 0.45 : 0.6;
  let want = dist;
  if (me.ph === "ground") { // keep the camera out of walls
    const o = tmpV.set(camTarget.x + rx * sh, camTarget.y, camTarget.z + rz * sh), d = tmpV2.set(-dx, -dy, -dz);
    for (const ob of near(me.x, me.y, dist + 2)) { if (ob.t !== "r") continue; const t = rayBox(o, d, ob.x, 0, ob.y, ob.x + ob.w, ob.h3 + 0.4, ob.y + ob.h); if (t < want) want = Math.max(0.6, t - 0.25); }
  }
  camera.position.set(camTarget.x + rx * sh - dx * want, Math.max(0.35, camTarget.y - dy * want), camTarget.z + rz * sh - dz * want);
  camera.lookAt(camera.position.x + dx, camera.position.y + dy, camera.position.z + dz);
  // sun follows the player
  sun.position.set(ex + 40, 80, ez + 25); sun.target.position.set(ex, 0, ez);
  // effects
  for (let i = tracers.length - 1; i >= 0; i--) { const t = tracers[i]; t.life -= dt; t.l.material.opacity = Math.max(0, t.life / t.max); if (t.life <= 0) { scene.remove(t.l); t.l.geometry.dispose(); tracers.splice(i, 1); } }
  for (let i = flashes.length - 1; i >= 0; i--) { const f = flashes[i]; f.life -= dt; if (f.life <= 0) { scene.remove(f.s); flashes.splice(i, 1); } }
  for (let i = puffs.length - 1; i >= 0; i--) { const p = puffs[i]; p.life -= dt; const k = p.life / p.max; p.s.material.opacity = Math.max(0, k); const s = p.grow * (1.5 - k); p.s.scale.set(s, s, 1); if (p.life <= 0) { scene.remove(p.s); puffs.splice(i, 1); } }
  hurt = Math.max(0, hurt - dt * 2); $("hurt").style.opacity = hurt * 0.6;
  hitT = Math.max(0, hitT - dt); $("hitmark").style.opacity = hitT > 0 ? 1 : 0;
  $("cross").classList.toggle("zoom", aimZoom); $("scope").hidden = !(aimZoom && me.w[me.cur] === 4);
  renderer.render(scene, camera);
}

// minimap
const mini = $("mini"), mctx = mini.getContext("2d");
let groundMini = null;
function renderMiniGround() {
  const c = document.createElement("canvas"); c.width = c.height = 232; const g = c.getContext("2d"), k = 232 / S;
  g.fillStyle = "#5e7a3a"; g.fillRect(0, 0, 232, 232);
  g.strokeStyle = "#8f8467"; g.lineWidth = 3; for (const r of MAP.roads) { g.beginPath(); g.moveTo(r[0] * k, r[1] * k); g.lineTo(r[2] * k, r[3] * k); g.stroke(); }
  for (const f of MAP.fields) { g.fillStyle = f.c ? "#6f8a3c" : "#b9a25a"; g.fillRect(f.x * k, f.y * k, f.w * k, f.h * k); }
  g.fillStyle = "#6b4f3a"; for (const b of MAP.blds) g.fillRect(b.x * k, b.y * k, Math.max(1.5, b.w * k), Math.max(1.5, b.h * k));
  g.fillStyle = "#3e5f2e"; for (const o of MAP.obs) if (o.kind === "tree") g.fillRect(o.x * k - 1, o.y * k - 1, 2, 2);
  return c;
}
function drawMini() {
  if (!MAP || mode !== "play") return;
  const M = 232, k = M / S;
  mctx.setTransform(1, 0, 0, 1, 0, 0); mctx.fillStyle = "#2f6f8a"; mctx.fillRect(0, 0, M, M); mctx.drawImage(groundMini, 0, 0);
  const zone = zoneAt(Math.max(0, matchT));
  mctx.save(); mctx.beginPath(); mctx.rect(0, 0, M, M); mctx.arc(zone.x * k, zone.y * k, Math.max(0, zone.r * k), 0, TAU, true); mctx.fillStyle = "rgba(120,60,220,0.45)"; mctx.fill("evenodd"); mctx.restore();
  mctx.strokeStyle = "#fff"; mctx.lineWidth = 2; mctx.setLineDash([5, 4]); mctx.beginPath(); mctx.arc(zone.nx * k, zone.ny * k, zone.nr * k, 0, TAU); mctx.stroke(); mctx.setLineDash([]);
  const P = MAP.plane; if (me.ph === "plane") { mctx.strokeStyle = "rgba(242,165,65,0.95)"; mctx.lineWidth = 2.5; mctx.beginPath(); mctx.moveTo(P.x1 * k, P.y1 * k); mctx.lineTo(P.x2 * k, P.y2 * k); mctx.stroke(); }
  if (online) for (const e of ents) if (e.kind === "remote" && e.alive) { mctx.fillStyle = e.color; mctx.beginPath(); mctx.arc(e.x * k, e.y * k, 4, 0, TAU); mctx.fill(); }
  const mx = (me.ph === "plane" ? planeMesh.position.x : me.x) * k, my = (me.ph === "plane" ? planeMesh.position.z : me.y) * k;
  mctx.save(); mctx.translate(mx, my); mctx.rotate(camYaw); mctx.fillStyle = "#fff"; mctx.beginPath(); mctx.moveTo(8, 0); mctx.lineTo(-5, -5); mctx.lineTo(-2, 0); mctx.lineTo(-5, 5); mctx.closePath(); mctx.fill(); mctx.restore();
}

// ---------------- HUD ----------------
function showHud(on) { $("hud").hidden = !on; }
function updateHud() {
  if (!me) return;
  $("kills").textContent = ar(me.kills);
  $("hpfill").style.width = clamp(me.hp, 0, 100) + "%";
  $("hpbar").classList.toggle("low", me.hp < 35); $("hpbar").classList.toggle("heal", me.healT > 0);
  for (let s = 0; s < 2; s++) {
    const el = $("slot" + s), wi = me.w[s];
    el.classList.toggle("on", me.cur === s);
    el.querySelector(".wn").textContent = wi < 0 ? "فاضي" : WEAP[wi].name;
    el.querySelector(".am").textContent = wi < 0 ? "—" : ar(me.mag[s]) + " / " + ar(me.ammo[WEAP[wi].ammo]);
  }
  $("bandN").textContent = ar(me.heals.b); $("medN").textContent = ar(me.heals.m);
  $("armorChip").textContent = me.armor ? "درع " + ar(me.armor) : "بدون درع";
}
function progressUi() {
  const p = $("progress");
  if (me && me.alive && (me.reloadT > 0 || me.healT > 0)) {
    const tot = me.healT > 0 ? (me.healKind === "b" ? 2.2 : 5) : WEAP[me.w[me.cur]].reload, left = me.healT > 0 ? me.healT : me.reloadT;
    p.hidden = false; p.querySelector("i").style.width = ((1 - left / tot) * 100) + "%"; p.querySelector("span").textContent = me.healT > 0 ? "علاج…" : "تعبئة…";
  } else p.hidden = true;
}

// ---------------- input ----------------
const input = (() => {
  const keys = {}; let look = null, move = null, fireTouch = null, mouseFire = false;
  const SENS_T = 0.0062, SENS_M = 0.0024;
  const api = {};
  window.addEventListener("keydown", (e) => {
    if (e.target.tagName === "INPUT") return;
    const k = e.key.toLowerCase(); keys[k] = true;
    if (mode !== "play" || !me) return;
    if (k === "r") startReload(me); if (k === "f" && nearLoot) takeLoot(me, nearLoot, true);
    if (k === "1" || k === "2") switchSlot(+k - 1); if (k === "q") startHeal(me, "b"); if (k === "e") startHeal(me, "m");
    if (k === " ") { e.preventDefault(); if (me.ph === "plane") jump(me); else doJump(me); }
    if (k === "c") setStance(me, "crouch"); if (k === "z" || k === "x") setStance(me, "prone");
  });
  window.addEventListener("keyup", (e) => { keys[e.key.toLowerCase()] = false; });
  const look2 = (dx, dy, s) => { const k = s * (aimZoom ? 0.45 * SETTINGS.aim : SETTINGS.look); camYawT += dx * k; camPitchT = clamp(camPitchT + dy * k, -0.75, 0.95); };
  canvas.addEventListener("pointerdown", (e) => {
    audio(); if (mode !== "play") return;
    if (e.pointerType === "mouse") {
      if (document.pointerLockElement !== canvas) { try { canvas.requestPointerLock(); } catch (er) {} }
      if (e.button === 0) mouseFire = true; if (e.button === 2) aimZoom = true;
      return;
    }
    const w = canvas.clientWidth;
    if (e.clientX < w * 0.42 && !move) { move = { id: e.pointerId, ox: e.clientX, oy: e.clientY, x: e.clientX, y: e.clientY }; showStick(move, true); }
    else if (!look) look = { id: e.pointerId, x: e.clientX, y: e.clientY };
    try { canvas.setPointerCapture(e.pointerId); } catch (er) {}
  });
  canvas.addEventListener("pointermove", (e) => {
    if (e.pointerType === "mouse") { if (document.pointerLockElement === canvas) look2(e.movementX, e.movementY, SENS_M); else if (e.buttons) look2(e.movementX, e.movementY, SENS_M * 1.4); return; }
    if (move && e.pointerId === move.id) { move.x = e.clientX; move.y = e.clientY; showStick(move, true); }
    if (look && e.pointerId === look.id) { look2(e.clientX - look.x, e.clientY - look.y, SENS_T); look.x = e.clientX; look.y = e.clientY; }
  });
  const up = (e) => {
    if (e.pointerType === "mouse") { if (e.button === 0) mouseFire = false; if (e.button === 2) aimZoom = false; return; }
    if (move && e.pointerId === move.id) { move = null; showStick(null, false); }
    if (look && e.pointerId === look.id) look = null;
  };
  canvas.addEventListener("pointerup", up); canvas.addEventListener("pointercancel", up);
  canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  // fire button: hold to shoot, drag on it to aim
  const fb = $("fireBtn");
  fb.addEventListener("pointerdown", (e) => { e.preventDefault(); audio(); fireTouch = { id: e.pointerId, x: e.clientX, y: e.clientY }; try { fb.setPointerCapture(e.pointerId); } catch (er) {} });
  fb.addEventListener("pointermove", (e) => { if (fireTouch && e.pointerId === fireTouch.id) { look2(e.clientX - fireTouch.x, e.clientY - fireTouch.y, SENS_T); fireTouch.x = e.clientX; fireTouch.y = e.clientY; } });
  const fup = (e) => { if (fireTouch && e.pointerId === fireTouch.id) fireTouch = null; };
  fb.addEventListener("pointerup", fup); fb.addEventListener("pointercancel", fup);
  $("aimBtn").addEventListener("click", () => { aimZoom = !aimZoom; $("aimBtn").classList.toggle("on", aimZoom); });
  api.move = () => {
    let x = (keys["d"] || keys["arrowright"] ? 1 : 0) - (keys["a"] || keys["arrowleft"] ? 1 : 0);
    let y = (keys["s"] || keys["arrowdown"] ? 1 : 0) - (keys["w"] || keys["arrowup"] ? 1 : 0);
    if (move) { const dx = move.x - move.ox, dy = move.y - move.oy, d = Math.hypot(dx, dy); if (d > 6) { const m = Math.min(1, d / 55); x = dx / d * m; y = dy / d * m; } }
    return { x, y };
  };
  api.firing = () => !!fireTouch || mouseFire;
  return api;
})();
function showStick(m, on) {
  const s = $("stick"); s.hidden = !on; if (!on) return;
  const dx = m.x - m.ox, dy = m.y - m.oy, d = Math.hypot(dx, dy), k = d > 55 ? 55 / d : 1;
  s.style.left = m.ox + "px"; s.style.top = m.oy + "px"; s.querySelector("i").style.transform = `translate(${dx * k}px, ${dy * k}px)`;
}
function switchSlot(s) { if (!me || me.w[s] < 0) return; if (me.cur !== s) { me.cur = s; me.reloadT = 0; me.fireT = Math.max(me.fireT, 0.3); aimZoom = false; $("aimBtn").classList.remove("on"); updateHud(); } }
$("slot0").addEventListener("click", () => switchSlot(0));
$("slot1").addEventListener("click", () => switchSlot(1));
$("reloadBtn").addEventListener("click", () => me && startReload(me));
$("bandBtn").addEventListener("click", () => me && startHeal(me, "b"));
$("medBtn").addEventListener("click", () => me && startHeal(me, "m"));
$("pickupBtn").addEventListener("click", () => { if (me && nearLoot) takeLoot(me, nearLoot, true); });
$("jumpBtn").addEventListener("click", () => me && jump(me));
if (!IS_TOUCH) document.body.classList.add("desktop");

$("hopBtn").addEventListener("click", () => { if (!me) return; if (me.ph === "plane") jump(me); else doJump(me); });
$("crouchBtn").addEventListener("click", () => me && setStance(me, "crouch"));
$("proneBtn").addEventListener("click", () => me && setStance(me, "prone"));
// settings panel
function openSettings() {
  $("sensLook").value = Math.round(SETTINGS.look * 100); $("sensAim").value = Math.round(SETTINGS.aim * 100);
  $("sensLookV").textContent = ar(Math.round(SETTINGS.look * 100)) + "٪"; $("sensAimV").textContent = ar(Math.round(SETTINGS.aim * 100)) + "٪";
  document.querySelectorAll("[data-q]").forEach((b) => b.classList.toggle("on", b.dataset.q === SETTINGS.quality));
  $("soundOn").checked = SETTINGS.sound; $("settings").hidden = false;
}
$("sensLook").addEventListener("input", (e) => { SETTINGS.look = e.target.value / 100; $("sensLookV").textContent = ar(e.target.value) + "٪"; saveSettings(); });
$("sensAim").addEventListener("input", (e) => { SETTINGS.aim = e.target.value / 100; $("sensAimV").textContent = ar(e.target.value) + "٪"; saveSettings(); });
document.querySelectorAll("[data-q]").forEach((b) => b.addEventListener("click", () => { SETTINGS.quality = b.dataset.q; saveSettings(); applyQuality(); openSettings(); }));
$("soundOn").addEventListener("change", (e) => { SETTINGS.sound = e.target.checked; saveSettings(); });
$("settingsDone").addEventListener("click", () => { $("settings").hidden = true; });
$("gearBtn").addEventListener("click", openSettings);
$("menuGear").addEventListener("click", openSettings);

// ---------------- menus ----------------
function show(id) { for (const o of ["menu", "lobby", "endScreen"]) $(o).hidden = o !== id; }
$("nick").addEventListener("change", () => store.set("ls3.nick", $("nick").value.trim()));
$("soloBtn").addEventListener("click", async () => {
  audio(); store.set("ls3.nick", $("nick").value.trim()); await loadModel;
  online = false; isHost = false; show(null); startMatch((Math.random() * 1e9) >>> 0, { bots: 49, t0: Date.now() + 3000 });
});
$("toMenuBtn").addEventListener("click", () => { if (online) leaveRoom(); toMenu(); });
$("againBtn").addEventListener("click", () => {
  if (online) { netState("lobby"); mode = "lobby"; showHud(false); show("lobby"); renderLobby(); return; }
  show(null); startMatch((Math.random() * 1e9) >>> 0, { bots: 49, t0: Date.now() + 3000 });
});
function toMenu() { mode = "menu"; showHud(false); show("menu"); if (document.pointerLockElement) document.exitPointerLock(); }
function showEnd(win, rank, sub) {
  mode = "end"; showHud(false); if (document.pointerLockElement) document.exitPointerLock();
  $("endTag").textContent = win ? "النصر" : "انتهت المباراة"; $("endTitle").textContent = win ? "أنت آخر الناجين!" : "انقتلت";
  $("endSub").textContent = win ? "فزت على " + ar(ents.length - 1) + " لاعب" : sub;
  $("endRank").textContent = "#" + ar(rank); $("endKills").textContent = ar(me.kills); $("endTime").textContent = fmtTime(Math.max(0, matchT));
  $("againBtn").textContent = online ? "ارجع للردهة" : "مباراة جديدة"; show("endScreen");
  try { wakeLock && wakeLock.release(); } catch (e) {}
}
let wakeLock = null;
async function keepAwake() { try { wakeLock = await navigator.wakeLock?.request("screen"); } catch (e) {} }

// ============ ONLINE (room capability, or Supabase adapter on the website) ============
let roomApi = null, room = null, myPeer = null, joinedAt = 0, clockOff = 0, hostPeer = null, lastGo = 0, myColor = NET_COLORS[0];
let netSeq = 0, evOut = [], shotsOut = [], tookOut = [], botDeaths = [], seenEv = {}, seenShot = {}, seenTook = {}, seenBD = {}, netAcc = 0, myState = "lobby";
(async () => { try { roomApi = await window.claude?.use?.("room"); } catch (e) { roomApi = null; } if (!roomApi) $("onlineNote").textContent = navigator.onLine ? "الأونلاين مو متاح هنا للحين. الفردي شغال عادي." : "ما فيه إنترنت. تقدر تلعب فردي ضد البوتات."; })();
$("onlineBtn").addEventListener("click", async () => {
  audio(); store.set("ls3.nick", $("nick").value.trim());
  if (!roomApi) { $("onlineNote").textContent = "الأونلاين يحتاج إنترنت وتسجيل دخول."; return; }
  await loadModel; mode = "lobby"; show("lobby"); $("lobbyJoin").hidden = false; $("lobbyRoom").hidden = true; $("lobbyBack").hidden = false;
});
$("lobbyBack").addEventListener("click", () => { leaveRoom(); toMenu(); });
$("createBtn").addEventListener("click", () => enterRoom(Array.from({ length: 4 }, () => "ABCDEFGHJKMNPQRSTUVWXYZ23456789"[Math.floor(Math.random() * 31)]).join("")));
$("joinBtn").addEventListener("click", () => { const c = $("codeIn").value.trim().toUpperCase().replace(/[^A-Z0-9]/g, ""); if (c.length >= 3) enterRoom(c); else $("codeIn").focus(); });
$("leaveBtn").addEventListener("click", () => { leaveRoom(); $("lobbyJoin").hidden = false; $("lobbyRoom").hidden = true; $("lobbyBack").hidden = false; });
$("startOnlineBtn").addEventListener("click", () => {
  if (!isHost) return;
  const humans = room.peers().filter((p) => p.presence && p.presence.st === "lobby").length;
  room.presence({ go: { seed: (Math.random() * 1e9) >>> 0, t0: Date.now() + 4000, nb: Math.max(0, Math.min(14, 16 - humans)) }, hn: Date.now() }).catch(() => {});
});
async function enterRoom(code) {
  $("lobbyStatus").textContent = "جاري الاتصال…";
  try { room = await roomApi.join("ls3-" + code.toLowerCase()); } catch (e) { $("lobbyStatus").textContent = "ما قدرنا ندخل الغرفة. جرّب مرة ثانية."; room = null; return; }
  joinedAt = Date.now(); myColor = NET_COLORS[Math.floor(Math.random() * NET_COLORS.length)]; myState = "lobby"; lastGo = 0;
  $("codeOut").textContent = code; $("lobbyJoin").hidden = true; $("lobbyRoom").hidden = false; $("lobbyBack").hidden = true;
  room.presence({ n: ($("nick").value.trim() || "لاعب").slice(0, 14), c: myColor, j: joinedAt, st: "lobby" }).catch(() => {});
  room.onPeers(onPeersChange, () => { $("lobbyStatus").textContent = "انقطع الاتصال بالغرفة."; });
  renderLobby();
}
function leaveRoom() { if (room) { try { room.leave(); } catch (e) {} } room = null; online = false; isHost = false; }
function computeHost(peers) { let best = null; for (const p of peers) { const pr = p.presence || {}; if (!pr.j) continue; if (!best || pr.j < best.presence.j || (pr.j === best.presence.j && p.peer < best.peer)) best = p; } return best; }
function onPeersChange(ch) {
  const peers = ch.peers, meP = peers.find((p) => p.isMe && p.sameTab); if (meP) myPeer = meP.peer;
  const host = computeHost(peers); hostPeer = host ? host.peer : null; isHost = !!host && host.peer === myPeer;
  if (host && host.presence.hn && !isHost) clockOff = host.presence.hn - Date.now(); if (isHost) clockOff = 0;
  const go = host && host.presence.go;
  if (go && go.t0 !== lastGo && (mode === "lobby" || (mode === "end" && myState === "lobby"))) { lastGo = go.t0; if (go.t0 + 5000 > nowSync()) beginOnline(go, peers); }
  if (mode === "lobby") renderLobby();
  if (mode === "play" && online) syncRemotes(peers);
}
function nowSync() { return Date.now() + (online ? clockOff : 0); }
function renderLobby() {
  if (!room) return;
  const peers = room.peers(), el = $("roster"); el.innerHTML = "";
  for (const p of peers) {
    const pr = p.presence || {}; if (!pr.j) continue;
    const row = document.createElement("div"), nm = document.createElement("span"), dot = document.createElement("span");
    dot.className = "dot"; dot.style.background = /^#[0-9a-f]{6}$/i.test(pr.c) ? pr.c : "#ccc";
    nm.append(dot, document.createTextNode(String(pr.n || "لاعب").slice(0, 14) + (p.isMe && p.sameTab ? " (أنت)" : "")));
    const tg = document.createElement("i"); tg.textContent = (p.peer === hostPeer ? "المضيف · " : "") + (pr.st === "lobby" ? "جاهز" : pr.st === "play" ? "في مباراة" : "ينتظر");
    row.append(nm, tg); el.append(row);
  }
  const n = peers.filter((p) => p.presence && p.presence.j).length;
  $("startOnlineBtn").hidden = !isHost;
  $("lobbyStatus").textContent = isHost ? "إنت المضيف. اللاعبين: " + ar(n) + "، والباقي بيكون بوتات." : "بانتظار المضيف يبدأ… (اللاعبين: " + ar(n) + ")";
}
function beginOnline(go, peers) {
  online = true; netSeq = 0; evOut = []; shotsOut = []; tookOut = []; botDeaths = []; seenEv = {}; seenShot = {}; seenTook = {}; seenBD = {};
  show(null); startMatch(go.seed >>> 0, { bots: go.nb, t0: go.t0, color: myColor });
  for (const p of peers) {
    if (p.isMe && p.sameTab) continue; const pr = p.presence || {}; if (pr.st !== "lobby" && pr.st !== "play") continue;
    const r = newEnt(p.peer, String(pr.n || "لاعب").slice(0, 14), "remote"); r.color = /^#[0-9a-f]{6}$/i.test(pr.c) ? pr.c : "#ccc"; r.tint = "#c9d6ff"; r.vis = makeVisual(r); ents.push(r);
  }
  myState = "play"; room.presence({ st: "play", go: isHost ? go : null }).catch(() => {});
}
function netShot(e, w) { shotsOut.push([++netSeq, e.id === "me" ? "" : e.id, w]); if (shotsOut.length > 8) shotsOut.shift(); }
function netDamage(target, dmg, w) { evOut.push([++netSeq, target, Math.round(dmg * 10) / 10, w]); if (evOut.length > 14) evOut.shift(); }
function netTook(id) { tookOut.push(id); if (tookOut.length > 250) tookOut.shift(); }
function netBotDeath(b, killerId) { botDeaths.push([b.id, killerId === "me" ? myPeer : killerId]); if (botDeaths.length > 30) botDeaths.shift(); }
function netState(st) { myState = st; if (room) room.presence({ st, hp: Math.max(0, Math.round(me.hp)), k: me.kills, kb: me.killedBy || null }).catch(() => {}); }
function netTick(dt) {
  netAcc += dt; if (netAcc < 1 / 15 || !room) return; netAcc = 0;
  const p = { st: myState, x: Math.round(me.x * 10) / 10, y: Math.round(me.y * 10) / 10, z: Math.round(me.z * 10) / 10, a: Math.round(me.a * 100) / 100, hp: Math.max(0, Math.round(me.hp)), w: me.w[me.cur], ar: me.armor, ph: me.ph === "plane" ? 0 : me.ph === "para" ? 1 : 2, k: me.kills, s: me.stance === "prone" ? 2 : me.stance === "crouch" ? 1 : 0, sh: shotsOut, ev: evOut, tk: tookOut };
  if (isHost) { p.hn = Date.now(); p.b = ents.filter((e) => e.kind === "bot").map((b) => [Math.round(b.x * 10) / 10, Math.round(b.y * 10) / 10, Math.round(b.a * 10) / 10, Math.max(0, Math.round(b.hp)), b.w[b.cur], b.ph === "plane" ? 0 : b.ph === "para" ? 1 : 2, b.alive ? 1 : 0, b.armor, Math.round(b.z * 10) / 10, b.stance === "prone" ? 2 : b.stance === "crouch" ? 1 : 0]); p.bd = botDeaths; }
  room.presence(p).catch(() => { tookOut.splice(0, 60); });
}
function syncRemotes(peers) {
  for (const pe of peers) {
    if (pe.isMe && pe.sameTab) continue;
    const pr = pe.presence || {}, r = ents.find((e) => e.id === pe.peer); if (!r) continue;
    if (typeof pr.x === "number") { r.tx = pr.x; r.ty = pr.y; r.tz = pr.z || 0; r.ta = pr.a || 0; if (r.ph === "plane" && pr.ph > 0) { r.x = pr.x; r.y = pr.y; r.z = pr.z || 0; } }
    r.ph = pr.ph === 0 ? "plane" : pr.ph === 1 ? "para" : "ground";
    r.stance = pr.s === 2 ? "prone" : pr.s === 1 ? "crouch" : "stand";
    if (typeof pr.hp === "number") r.hp = pr.hp; r.armor = pr.ar | 0; r.cur = 0; r.w[0] = typeof pr.w === "number" ? pr.w : -1; r.kills = pr.k | 0;
    if (r.alive && pr.st === "dead") { r.alive = false; r.deadT = 0; const kn = pr.kb ? nameOf(pr.kb) : null; addFeed(kn, r.name, "", pr.kb === myPeer); if (pr.kb === myPeer) { me.kills++; killBanner(r.name, false); updateHud(); } }
    const lastS = seenShot[pe.peer] || 0;
    for (const s of pr.sh || []) {
      if (!Array.isArray(s) || s[0] <= lastS) continue; seenShot[pe.peer] = Math.max(seenShot[pe.peer] || 0, s[0]);
      const shooter = s[1] ? ents.find((e) => e.id === s[1]) : r; if (!shooter || !WEAP[s[2]]) continue;
      if (isHost && s[1]) continue;
      const from = muzzlePos(shooter, new THREE.Vector3()), to = from.clone().add(new THREE.Vector3(Math.cos(shooter.a) * 40, 0, Math.sin(shooter.a) * 40));
      addTracer(from, to, s[2] === 4); flash(shooter); shotSfx(s[2], clamp(1 - Math.hypot(shooter.x - me.x, shooter.y - me.y) / 180, 0, 1));
    }
    const lastE = seenEv[pe.peer] || 0;
    for (const ev of pr.ev || []) {
      if (!Array.isArray(ev) || ev[0] <= lastE) continue; seenEv[pe.peer] = Math.max(seenEv[pe.peer] || 0, ev[0]);
      const dmg = clamp(+ev[2] || 0, 0, 180);
      if (ev[1] === myPeer && me.alive) { me.killedBy = pe.peer; applyDamage(me, dmg, pe.peer, r.name, ev[3], false); }
      else if (isHost && typeof ev[1] === "string" && ev[1][0] === "b") { const b = ents.find((e) => e.id === ev[1]); if (b) applyDamage(b, dmg, pe.peer, r.name, ev[3], false); }
    }
    for (const id of pr.tk || []) { if (seenTook[id]) continue; seenTook[id] = 1; const it = MAP.loot[id]; if (it) { it.taken = true; if (it.mesh) it.mesh.visible = false; } }
    if (!isHost && pe.peer === hostPeer && Array.isArray(pr.b)) {
      const bots = ents.filter((e) => e.kind === "bot");
      pr.b.forEach((bb, i) => {
        const b = bots[i]; if (!b || !Array.isArray(bb)) return;
        b.tx = bb[0]; b.ty = bb[1]; b.ta = bb[2]; b.hp = bb[3]; b.w[0] = bb[4]; b.cur = 0; b.armor = bb[7] | 0; b.tz = bb[8] || 0; b.stance = bb[9] === 2 ? "prone" : bb[9] === 1 ? "crouch" : "stand";
        const ph = bb[5] === 0 ? "plane" : bb[5] === 1 ? "para" : "ground"; if (b.ph === "plane" && ph !== "plane") { b.x = bb[0]; b.y = bb[1]; b.z = bb[8] || 0; } b.ph = ph;
        if (b.alive && !bb[6]) { b.alive = false; b.deadT = 0; }
      });
      for (const d of pr.bd || []) { if (!Array.isArray(d) || seenBD[d[0]]) continue; seenBD[d[0]] = 1; const b = ents.find((e) => e.id === d[0]); addFeed(d[1] ? nameOf(d[1]) : null, b ? b.name : "", "", d[1] === myPeer); if (d[1] === myPeer) { me.kills++; if (b) killBanner(b.name, false); updateHud(); } }
    }
  }
  for (const e of ents) if (e.kind === "remote" && e.alive && !peers.some((p) => p.peer === e.id)) { e.alive = false; addFeed(null, e.name, "طلع", false); }
}
function nameOf(peer) { if (peer === myPeer) return me.name; const e = ents.find((x) => x.id === peer); return e ? e.name : "لاعب"; }

// ---------------- loop ----------------
let last = performance.now(), slow = 0, samples = 0, miniAcc = 0;
function frame(now) {
  let dt = (now - last) / 1000; last = now;
  if (mode === "play" && !document.hidden && SETTINGS.quality === "auto") {
    samples++; if (dt > 0.024) slow++;
    if (samples >= 150) {
      if (slow > 60) {
        if (pixelRatio > 1) { pixelRatio = Math.max(1, pixelRatio - 0.25); renderer.setPixelRatio(pixelRatio); resize(); }
        else if (!shadowsOff) { shadowsOff = true; sun.castShadow = false; }
      }
      samples = 0; slow = 0;
    }
  }
  if (dt > 0.05) dt = 0.05;
  if (mode === "play" && MAP) update(dt);
  render(dt); progressUi();
  miniAcc += dt; if (miniAcc > 0.2) { miniAcc = 0; drawMini(); }
  requestAnimationFrame(frame);
}
applyQuality();
camera.position.set(0, 30, 0); camera.lookAt(10, 0, 10);
requestAnimationFrame(frame);
window.__game = { get me() { return me; }, get ents() { return ents; }, get map() { return MAP; }, _kill(i) { kill(ents[i], "me", me.name, 2, false); }, get yaw() { return camYaw; }, set yaw(v) { camYaw = v; }, set pitch(v) { camPitch = v; } };
