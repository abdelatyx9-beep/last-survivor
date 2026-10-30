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
let S = 800;
const PR = 0.42;
const WALL_H = 3.2, CRATE_H = 2.6;
const ARMOR = [0, 0.3, 0.45, 0.6];
const WEAP = [
  { name: "مسدس",   dmg: 22, rate: 0.28, spread: 0.012, mag: 12, reload: 1.3, range: 60,  ammo: "l", pel: 1, snd: 1.0, fov: 62 },
  { name: "رشاش",   dmg: 15, rate: 0.075, spread: 0.028, mag: 30, reload: 1.9, range: 65, ammo: "l", pel: 1, snd: 0.8, fov: 62 },
  { name: "بندقية", dmg: 24, rate: 0.11, spread: 0.014, mag: 30, reload: 2.2, range: 160, ammo: "h", pel: 1, snd: 1.2, fov: 55 },
  { name: "شوزن",   dmg: 13, rate: 0.9,  spread: 0.07,  mag: 5,  reload: 2.6, range: 26,  ammo: "s", pel: 8, snd: 1.7, fov: 62 },
  { name: "قناصة",  dmg: 95, rate: 1.5,  spread: 0.0015, mag: 5, reload: 3.0, range: 400, ammo: "h", pel: 1, snd: 2.0, fov: 30 },
  { name: "رامي",   dmg: 46, rate: 0.3,  spread: 0.004, mag: 10, reload: 2.6, range: 300, ammo: "h", pel: 1, snd: 1.6, fov: 45 },
  { name: "رشاش ثقيل", dmg: 21, rate: 0.085, spread: 0.034, mag: 75, reload: 4.2, range: 150, ammo: "h", pel: 1, snd: 1.35, fov: 58 },
  { name: "مقلاة",  dmg: 70, rate: 0.75, spread: 0, mag: 0, reload: 0, range: 2, ammo: null, pel: 0, snd: 0, fov: 62, melee: true }
];
const AMMO_NAME = { l: "خفيفة", h: "ثقيلة", s: "خرطوش" };
const HOW = { "-2": "العاصفة", "-3": "دهس", "-4": "سقوط", "-5": "انفجار", "-6": "النار", "-7": "قنبلة" };
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

// ---------------- buildings: floors, rooms, stairs, doors, windows ----------------
const FH = 3.2, WT = 0.25, CW = 2.4, ZL = 4.9; // floor height, wall thickness, corridor width, stair zone length
const BTYPES = {
  house:     { w: [10, 13], h: [9, 11],  st: [1, 1], roof: "gable", tex: "plaster" },
  house2:    { w: [11, 14], h: [9, 11],  st: [2, 2], roof: "gable", tex: "brick" },
  flat:      { w: [14, 18], h: [10, 12], st: [2, 3], roof: "flat",  tex: "concrete" },
  tower:     { w: [15, 19], h: [12, 14], st: [4, 5], roof: "flat",  tex: "panel" },
  warehouse: { w: [18, 24], h: [12, 16], st: [1, 1], roof: "metal", tex: "metal" }
};
// local frame: u runs along the long side, v across it
function bToW(b, u, v) {
  const L = b.L;
  if (L.ax) return { x: L.fu ? b.x + L.W - u : b.x + u, y: L.fv ? b.y + L.H - v : b.y + v };
  return { x: L.fv ? b.x + b.w - v : b.x + v, y: L.fu ? b.y + b.h - u : b.y + u };
}
function bToL(b, x, y) {
  const L = b.L;
  if (L.ax) return { u: L.fu ? b.x + L.W - x : x - b.x, v: L.fv ? b.y + L.H - y : y - b.y };
  return { v: L.fv ? b.x + b.w - x : x - b.x, u: L.fu ? b.y + b.h - y : y - b.y };
}
function bRect(b, u0, v0, u1, v1) {
  const p = bToW(b, u0, v0), q = bToW(b, u1, v1);
  return { x: Math.min(p.x, q.x), y: Math.min(p.y, q.y), w: Math.abs(q.x - p.x), h: Math.abs(q.y - p.y) };
}
let doorSeq = 0;
function genBuilding(b, R, obs, addLoot, doors) {
  const W = Math.max(b.w, b.h), H = Math.min(b.w, b.h);
  b.L = { ax: b.w >= b.h, fu: R() < 0.5, fv: R() < 0.5, W, H };
  const push = (o) => { o.b = b; obs.push(o); return o; };
  const box = (u0, v0, u1, v1, z0, z1, m, extra) => push(Object.assign({ t: "r", kind: m === "slab" || m === "stair" ? "floor" : "wall", m, z0, h3: z1 }, bRect(b, u0, v0, u1, v1), extra || {}));
  const top = b.st * FH;
  b.top = top;
  if (b.type === "warehouse") {
    // one tall hall with big openings at both ends
    const hh = 6, G = 4, cv = H / 2;
    const wall = (u0, v0, u1, v1) => box(u0, v0, u1, v1, 0, hh, "ext");
    wall(0, 0, W, WT); wall(0, H - WT, W, H);
    wall(0, WT, WT, cv - G / 2); wall(0, cv + G / 2, WT, H - WT); box(0, cv - G / 2, WT, cv + G / 2, 4.2, hh, "ext");
    wall(W - WT, WT, W - WT + WT, cv - G / 2); wall(W - WT, cv + G / 2, W, H - WT); box(W - WT, cv - G / 2, W, cv + G / 2, 4.2, hh, "ext");
    box(0, 0, W, H, hh, hh + 0.2, "ceil");
    b.top = hh; b.wins = [];
    b.nav = { simple: true, cv };
    const nl = 5 + Math.floor(R() * 4);
    for (let q = 0; q < nl; q++) { const p = bToW(b, 1.5 + R() * (W - 3), 1.5 + R() * (H - 3)); addLoot(p.x, p.y, true, 0); }
    return;
  }
  const cy = (H - CW) / 2, walkRoof = b.roofKind === "flat";
  const topLevel = walkRoof ? b.st : b.st - 1;       // highest level you can stand on
  const stairs = topLevel >= 1, u0 = W - WT - ZL;
  const hallEnd = stairs ? u0 : W - WT;
  const big = b.type === "tower";
  const winW = big ? 1.9 : 1.2, sill = big ? 0.5 : 0.95, wtop = big ? 2.7 : 2.15;
  b.wins = [];
  // split one side into rooms; each room gets a door to the corridor or to its neighbour
  const splitRooms = (va, vb, side) => {
    const k = clamp(Math.round((W - 2 * WT) / 4.4), 1, 3), rooms = [];
    for (let i = 0; i < k; i++) {
      const a = WT + (W - 2 * WT) * i / k, c = WT + (W - 2 * WT) * (i + 1) / k;
      const room = { u0: a, u1: c, v0: va, v1: vb, side, i };
      let dc = clamp((a + c) / 2 + (R() - 0.5) * (c - a - 2) * 0.5, a + 0.8, c - 0.8);
      if (dc > hallEnd - 0.8) { room.via = i - 1; room.pdoor = (va + vb) / 2; } else room.door = dc;
      rooms.push(room);
    }
    return rooms;
  };
  const north = splitRooms(WT, cy - WT, "n"), south = splitRooms(cy + CW + WT, H - WT, "s");
  b.nav = { cy, u0, stairs, hallEnd, rooms: north.concat(south), topLevel, walkRoof };
  // wall run with openings (windows / doors)
  const run = (axis, fixed, a, c, F, opens, m) => {
    opens.sort((p, q) => p.c - q.c);
    let cur = a;
    const piece = (s, e, z0, z1) => { if (e - s < 0.02 || z1 - z0 < 0.02) return; if (axis === "u") box(s, fixed, e, fixed + WT, z0, z1, m); else box(fixed, s, fixed + WT, e, z0, z1, m); };
    for (const o of opens) {
      const s = clamp(o.c - o.w / 2, a, c), e = clamp(o.c + o.w / 2, a, c);
      if (s < cur + 0.05) continue;
      piece(cur, s, F, F + FH);
      if (o.type === "win") {
        piece(s, e, F, F + sill); piece(s, e, F + wtop, F + FH);
        b.wins.push({ axis, fixed, s, e, z0: F + sill, z1: F + wtop, m });
      } else {
        piece(s, e, F + 2.2, F + FH);
        if (o.type === "door") {
          const r = axis === "u" ? bRect(b, s, fixed, e, fixed + WT) : bRect(b, fixed, s, fixed + WT, e);
          const h0 = axis === "u" ? bToW(b, s, fixed + WT / 2) : bToW(b, fixed + WT / 2, s), h1 = axis === "u" ? bToW(b, e, fixed + WT / 2) : bToW(b, fixed + WT / 2, e);
          const a0 = Math.atan2(h1.y - h0.y, h1.x - h0.x);
          const d = push(Object.assign({ t: "r", kind: "door", m: "door", z0: F, h3: F + 2.2, id: doorSeq++, hx: h0.x, hy: h0.y, len: Math.hypot(h1.x - h0.x, h1.y - h0.y), a0, ang: a0, tAng: a0, open: false, ext: !!o.ext }, r));
          doors.push(d);
        }
      }
      cur = e;
    }
    piece(cur, c, F, F + FH);
  };
  const roomWins = (rooms) => { const o = []; for (const r of rooms) { const len = r.u1 - r.u0; if (len > 4.8 && !big) o.push({ c: r.u0 + len * 0.3, w: winW, type: "win" }, { c: r.u0 + len * 0.7, w: winW, type: "win" }); else if (big) for (let c = r.u0 + 1.4; c < r.u1 - 1.0; c += 2.6) o.push({ c, w: winW, type: "win" }); else o.push({ c: r.u0 + len / 2, w: winW, type: "win" }); } return o; };
  for (let f = 0; f < b.st; f++) {
    const F = f * FH;
    // outside walls
    run("u", 0, 0, W, F, roomWins(north), "ext");
    run("u", H - WT, 0, W, F, roomWins(south), "ext");
    const sideOpens = (front) => {
      const o = [{ c: cy / 2, w: Math.min(winW, cy - 1), type: "win" }, { c: cy + CW + (H - cy - CW) / 2, w: Math.min(winW, cy - 1), type: "win" }];
      if (front) o.push(f === 0 ? { c: cy + CW / 2, w: 1.3, type: "door", ext: true } : { c: cy + CW / 2, w: 1.2, type: "win" });
      else if (!stairs) o.push(f === 0 ? { c: cy + CW / 2, w: 1.2, type: "door", ext: true } : { c: cy + CW / 2, w: 1.0, type: "win" });
      return o;
    };
    run("v", 0, WT, H - WT, F, sideOpens(true), "ext");
    run("v", W - WT, WT, H - WT, F, sideOpens(false), "ext");
    // corridor walls with a door into each room
    run("u", cy - WT, WT, W - WT, F, north.filter((r) => r.door != null).map((r) => ({ c: r.door, w: 1.0, type: "door" })), "int");
    run("u", cy + CW, WT, W - WT, F, south.filter((r) => r.door != null).map((r) => ({ c: r.door, w: 1.0, type: "door" })), "int");
    // partitions between rooms
    for (const rooms of [north, south]) for (let i = 1; i < rooms.length; i++) {
      const r = rooms[i], p = r.u0;
      run("v", p - WT / 2, r.v0, r.v1, F, r.via === i - 1 ? [{ c: r.pdoor, w: 1.0, type: "door" }] : [], "int");
    }
    // the floor above (slab with a hole over the stairs)
    const Z = (f + 1) * FH, hole = stairs && f + 1 <= topLevel;
    if (f + 1 < b.st || walkRoof) {
      box(0, 0, W, cy, Z - 0.2, Z, "slab", { walk: true });
      box(0, cy + CW, W, H, Z - 0.2, Z, "slab", { walk: true });
      box(0, cy, hole ? u0 + 1.2 : W, cy + CW, Z - 0.2, Z, "slab", { walk: true });
    } else box(0, 0, W, H, Z - 0.2, Z, "ceil"); // top ceiling under a pitched roof
    // stairs from this floor to the next: two half flights with a landing
    if (stairs && f + 1 <= topLevel) {
      for (let i = 0; i < 5; i++) { const t = F + (i + 1) * 0.32; box(u0 + 1.2 + i * 0.5, cy, u0 + 1.7 + i * 0.5, cy + 1.2, t - 0.3, t, "stair", { walk: true }); }
      box(u0 + 3.7, cy, W - WT, cy + CW, F + 1.6 - 0.3, F + 1.6, "stair", { walk: true });
      for (let i = 0; i < 5; i++) { const t = F + 1.6 + (i + 1) * 0.32; box(u0 + 3.7 - (i + 1) * 0.5, cy + 1.2, u0 + 3.7 - i * 0.5, cy + CW, t - 0.3, t, "stair", { walk: true }); }
    }
  }
  if (stairs) { const T = topLevel * FH; box(u0 + 1.2, cy, u0 + 1.28, cy + 1.2, T, T + 1.0, "rail"); }
  // loot: a little in most rooms, on every floor
  for (let f = 0; f < b.st; f++) {
    for (const r of b.nav.rooms) {
      const n = R() < 0.72 ? 1 + (R() < 0.35 ? 1 : 0) : 0;
      for (let q = 0; q < n; q++) { const p = bToW(b, r.u0 + 0.7 + R() * (r.u1 - r.u0 - 1.4), r.v0 + 0.6 + R() * (r.v1 - r.v0 - 1.2)); addLoot(p.x, p.y, true, f * FH); }
    }
    if (R() < 0.4) { const p = bToW(b, WT + 0.8 + R() * (hallEnd - WT - 1.6), cy + 0.6 + R() * (CW - 1.2)); addLoot(p.x, p.y, true, f * FH); }
  }
  if (walkRoof) {
    // parapet, stair housing and roof clutter
    const T = top;
    box(0, 0, W, WT, T, T + 1.0, "par"); box(0, H - WT, W, H, T, T + 1.0, "par");
    box(0, WT, WT, H - WT, T, T + 1.0, "par"); box(W - WT, WT, W, H - WT, T, T + 1.0, "par");
    box(u0 - WT, cy - WT, W - WT, cy, T, T + 2.6, "ext"); box(u0 - WT, cy + CW, W - WT, cy + CW + WT, T, T + 2.6, "ext");
    box(u0 - WT, cy, u0, cy + 0.6, T, T + 2.6, "ext"); box(u0 - WT, cy + 1.8, u0, cy + CW, T, T + 2.6, "ext"); box(u0 - WT, cy + 0.6, u0, cy + 1.8, T + 2.2, T + 2.6, "ext");
    box(u0 - WT, cy - WT, W - WT, cy + CW + WT, T + 2.6, T + 2.8, "ceil");
    const nAc = 1 + Math.floor(R() * 3);
    for (let i = 0; i < nAc; i++) {
      const uu = 1.2 + R() * (u0 - 4), vv = R() < 0.5 ? 0.8 + R() * (cy - 2.4) : cy + CW + 0.8 + R() * (H - cy - CW - 2.4);
      box(uu, vv, uu + 1.6, vv + 1.1, T, T + 1.1, "ac", { walk: true });
    }
    if (R() < 0.7) { const p = bToW(b, 2 + R() * (u0 - 5), R() < 0.5 ? 1.6 : H - 1.6); push({ t: "c", kind: "tank", m: "tank", x: p.x, y: p.y, r: 0.9, z0: T, h3: T + 2.2 }); }
    const nl = 1 + Math.floor(R() * 2);
    for (let q = 0; q < nl; q++) { const p = bToW(b, 1 + R() * (u0 - 3), R() < 0.5 ? 0.9 + R() * (cy - 1.8) : cy + CW + 0.9 + R() * (H - cy - CW - 1.8)); addLoot(p.x, p.y, true, T); }
  }
}

// ----- navigation inside buildings (for bots) -----
function inBld(b, x, y, m = 0) { return x > b.x - m && x < b.x + b.w + m && y > b.y - m && y < b.y + b.h + m; }
function bldAt(x, y) { for (const b of MAP.blds) if (inBld(b, x, y)) return b; return null; }
function levelOf(b, z) { return clamp(Math.round(z / FH), 0, b.nav && b.nav.topLevel != null ? b.nav.topLevel : 0); }
// where in the building a point is: a room, the hallway, the stairs, or the roof
function bldSpot(b, x, y, z) {
  const N = b.nav, p = bToL(b, x, y), f = levelOf(b, z);
  if (N.simple) return { f: 0, kind: "hall" };
  if (N.walkRoof && f === b.st) return { f, kind: "roof", p };
  if (N.stairs && p.u > N.u0 + 1.1 && p.v > N.cy - 0.05 && p.v < N.cy + CW + 0.05) return { f: Math.floor((z + 0.4) / FH), kind: "stair", p };
  for (const r of N.rooms) if (p.u > r.u0 - 0.1 && p.u < r.u1 + 0.1 && p.v > r.v0 - 0.1 && p.v < r.v1 + 0.1) return { f, kind: "room", r, p };
  return { f, kind: "hall", p };
}
// waypoints (world x, y, z) from a point to a goal, through doors and stairs
function navPath(from, to) {
  const A = bldAt(from.x, from.y), B = bldAt(to.x, to.y), out = [];
  const W = (b, u, v, z) => { const p = bToW(b, u, v); return { x: p.x, y: p.y, z }; };
  const doorOut = (b) => b.nav.simple ? [W(b, -1.2, b.nav.cv, 0)] : [W(b, 0.9, b.nav.cy + CW / 2, 0), W(b, -1.3, b.nav.cy + CW / 2, 0)];
  const doorIn = (b) => doorOut(b).reverse();
  const roomOut = (b, r, f) => {
    const N = b.nav, F = f * FH, res = [];
    let cur = r;
    while (cur && cur.door == null && cur.via != null) { const nb = N.rooms.find((q) => q.side === cur.side && q.i === cur.via); res.push(W(b, cur.u0, cur.pdoor, F), W(b, (nb.u0 + nb.u1) / 2, (nb.v0 + nb.v1) / 2, F)); cur = nb; }
    if (cur && cur.door != null) { const vIn = cur.side === "n" ? N.cy - WT - 0.5 : N.cy + CW + WT + 0.5, vd = cur.side === "n" ? N.cy - WT / 2 : N.cy + CW + WT / 2, vh = N.cy + CW / 2; res.push(W(b, cur.door, vIn, F), W(b, cur.door, vd, F), W(b, cur.door, vh, F)); }
    return res;
  };
  const hall = (b, f) => { const N = b.nav; return f === b.st && N.walkRoof ? W(b, N.u0 - 1.4, N.cy + CW / 2, f * FH) : W(b, Math.min(N.u0 - 0.6, (WT + N.hallEnd) / 2), N.cy + CW / 2, f * FH); };
  const stairUp = (b, f) => { const N = b.nav, F = f * FH, u = N.u0, c = N.cy; const pts = [W(b, u + 0.6, c + 0.6, F), W(b, u + 3.9, c + 0.6, F + 1.6), W(b, u + 4.3, c + 1.8, F + 1.6), W(b, u + 0.7, c + 1.8, F + FH)]; if (f + 1 === b.st && N.walkRoof) pts.push(W(b, u - 1.2, c + 1.2, F + FH)); return pts; };
  const stairDown = (b, f) => { const N = b.nav, F = (f - 1) * FH, u = N.u0, c = N.cy; const pts = []; if (f === b.st && N.walkRoof) pts.push(W(b, u - 0.9, c + 1.2, f * FH)); pts.push(W(b, u + 0.7, c + 1.8, F + FH), W(b, u + 4.3, c + 1.8, F + 1.6), W(b, u + 3.9, c + 0.6, F + 1.6), W(b, u + 0.6, c + 0.6, F)); return pts; };
  // leave the current spot in A and reach its hallway at level f (or the outside)
  const toLevel = (b, f0, f1) => { const r = []; if (f1 > f0) for (let f = f0; f < f1; f++) r.push(...stairUp(b, f)); else for (let f = f0; f > f1; f--) r.push(...stairDown(b, f)); return r; };
  const exitSpot = (b, s) => { if (b.nav.simple) return []; if (s.kind === "room") return roomOut(b, s.r, s.f); if (s.kind === "stair") { const N = b.nav, F = Math.max(0, s.f) * FH; return [W(b, N.u0 + 0.6, N.cy + 1.2, F)]; } return []; };
  const enterSpot = (b, s) => { if (b.nav.simple) return []; if (s.kind === "room") return roomOut(b, s.r, s.f).reverse(); return []; };
  const sa = A ? bldSpot(A, from.x, from.y, from.z) : null, sb = B ? bldSpot(B, to.x, to.y, to.z) : null;
  if (A && A === B) {
    if (A.nav.simple) return [to];
    const fa = sa.kind === "stair" ? Math.max(0, sa.f) : sa.f;
    if (fa === sb.f && sa.kind !== "room" && sb.kind !== "room" && sa.kind !== "stair") return [to];
    if (fa === sb.f && sa.kind === "room" && sb.kind === "room" && sa.r === sb.r) return [to];
    out.push(...exitSpot(A, sa));
    if (fa !== sb.f) { out.push(hall(A, fa)); out.push(...toLevel(A, fa, sb.f)); }
    out.push(...enterSpot(A, sb)); out.push(to); return out;
  }
  if (A) { const fa = sa.kind === "stair" ? Math.max(0, sa.f) : sa.f; out.push(...exitSpot(A, sa)); if (fa > 0) { out.push(hall(A, fa)); out.push(...toLevel(A, fa, 0)); } out.push(...doorOut(A)); }
  if (B) { out.push(...doorIn(B)); if (sb.f > 0) out.push(...toLevel(B, 0, sb.f)); out.push(...enterSpot(B, sb)); }
  out.push(to); return out;
}

// ---------------- map ----------------
let MAP = null;
function genMap(seed) {
  S = 800; const R = rng(seed); doorSeq = 0;
  const obs = [], blds = [], loot = [], roads = [], fields = [], cars = [], poles = [], vehicles = [];
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
  const addLoot = (x, y, rich, z = 0) => {
    const r = R(); let it;
    const pick = (tab) => { let q = R() * tab.reduce((a, t) => a + t[1], 0); for (const t of tab) { q -= t[1]; if (q <= 0) return t[0]; } return tab[0][0]; };
    const lvl = () => { const q = R(); return q < (rich ? 0.42 : 0.56) ? 1 : q < (rich ? 0.8 : 0.88) ? 2 : 3; };
    if (r < (rich ? 0.32 : 0.24)) it = { k: "w", v: pick([[0, 14], [1, 17], [2, 24], [3, 12], [4, 6], [5, 9], [6, 5], [7, 5]]) };
    else if (r < 0.47) { const t = pick([["l", 4], ["h", 4], ["s", 2]]); it = { k: "a", v: t, n: t === "s" ? 10 : 30 }; }
    else if (r < 0.61) { const h = pick([["b", 40], ["f", 24], ["m", 6], ["d", 18], ["p", 9], ["x", 3]]); it = { k: "md", v: h, n: h === "b" ? 5 : 1 }; }
    else if (r < 0.74) { const g = pick([["v", 1], ["hm", 1], ["bp", 1]]); it = { k: g, v: lvl() }; }
    else if (r < 0.87) it = { k: "at", v: pick([["rd", 22], ["s2", 14], ["s4", 9], ["s8", 3], ["cp", 14], ["sp", 9], ["xm", 16], ["gr", 12]]) };
    else it = { k: "th", v: pick([["g", 40], ["s", 30], ["o", 18], ["z", 12]]), n: 1 };
    it.id = lootId++; it.x = x; it.y = y; it.z = z; it.rot = R() * TAU; loot.push(it);
  };
  // towns, linked by roads
  const towns = [];
  for (let i = 0; i < 13; i++) for (let k = 0; k < 60; k++) {
    const x = 70 + R() * (S - 140), y = 70 + R() * (S - 140);
    if (towns.every((t) => Math.hypot(t.x - x, t.y - y) > 150)) { { const big = towns.length < 3 || R() < 0.25; towns.push({ x, y, n: big ? 8 + Math.floor(R() * 3) : 4 + Math.floor(R() * 4), big }); } break; }
  }
  const linked = new Set();
  for (let i = 0; i < towns.length; i++) {
    const others = towns.map((t, j) => [j, Math.hypot(t.x - towns[i].x, t.y - towns[i].y)]).filter((p) => p[0] !== i).sort((a, b) => a[1] - b[1]).slice(0, 2);
    for (const [j] of others) { const key = Math.min(i, j) + "-" + Math.max(i, j); if (linked.has(key)) continue; linked.add(key); roads.push([towns[i].x, towns[i].y, towns[j].x, towns[j].y]); }
  }
  const roofCols = [0x8a3b2a, 0x6e3324, 0x5b4a3f, 0x7a4a2e, 0x4f5a5f];
  const doors = [];
  for (const t of towns) {
    let placed = 0, towers = t.big ? 1 : 0;
    for (let k = 0; k < 160 && placed < t.n; k++) {
      const rr = R(), type = towers > 0 ? "tower" : t.big && rr < 0.28 ? "flat" : rr < 0.14 ? "warehouse" : rr < 0.45 ? "house2" : rr < 0.52 ? "flat" : "house";
      const D = BTYPES[type];
      let w = D.w[0] + Math.floor(R() * (D.w[1] - D.w[0] + 1)), h = D.h[0] + Math.floor(R() * (D.h[1] - D.h[0] + 1));
      if (R() < 0.5) { const q = w; w = h; h = q; }
      const spread = t.big ? 150 : 100;
      const x = t.x + (R() - 0.5) * spread - w / 2, y = t.y + (R() - 0.5) * spread - h / 2;
      if (x < 16 || y < 16 || x + w > S - 16 || y + h > S - 16) continue;
      const pad = type === "house" || type === "house2" ? 11 : 9;
      if (blds.some((b) => x < b.x + b.w + pad && x + w + pad > b.x && y < b.y + b.h + pad && y + h + pad > b.y)) continue;
      const b = { x, y, w, h, type, st: D.st[0] + Math.floor(R() * (D.st[1] - D.st[0] + 1)), wallH: FH, tex: D.tex, roofKind: D.roof, roof: roofCols[Math.floor(R() * roofCols.length)] };
      genBuilding(b, R, obs, addLoot, doors);
      blds.push(b); if (type === "tower") towers--;
      // wooden fence around some houses, open at the doors
      if ((type === "house" || type === "house2") && R() < 0.5) {
        const m = 3.5, fx = x - m, fy = y - m, fw = w + m * 2, fh = h + m * 2, FT = 0.12, FG = 2.6;
        const L = b.L, front = L.ax ? (L.fu ? "e" : "w") : (L.fu ? "s" : "n"), back = { e: "w", w: "e", n: "s", s: "n" }[front];
        const gaps = b.nav.stairs ? [front] : [front, back];
        const segs = [];
        const fside = (s, horiz, pos, from, len) => {
          if (gaps.includes(s)) { const half = len / 2 - FG / 2; if (horiz) segs.push({ x: from, y: pos, w: half, h: FT }, { x: from + len / 2 + FG / 2, y: pos, w: half, h: FT }); else segs.push({ x: pos, y: from, w: FT, h: half }, { x: pos, y: from + len / 2 + FG / 2, w: FT, h: half }); }
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
    obs.push({ t: "r", kind: "crate", x, y, w, h, h3: CRATE_H, c: crateCols[i % 4], walk: true });
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
      obs.push({ t: "r", kind: "car", x: cx - w / 2, y: cy - h / 2, w, h, h3: 1.5, walk: true });
    }
  }
  // drivable vehicles: on the roads and in every town
  const VCOL = { sport: [0x1f6fe0, 0xd62828, 0xf2c230, 0x1aa37a, 0xeeeeee], jeep: [0x4f5a35, 0x7a6a4a, 0x2f3a44, 0x8a2d1d], pickup: [0xb8b2a6, 0x2d4f7a, 0x6b2b2b, 0x3a3a3a] };
  const addVeh = (x, y, a) => { const r = R(), type = r < 0.38 ? "sport" : r < 0.7 ? "jeep" : "pickup", cs = VCOL[type]; vehicles.push({ id: vehicles.length, type, x, y, a, c: cs[Math.floor(R() * cs.length)], vx: 0, vy: 0, w: 0, steer: 0, spin: 0, hp: 260, driver: null, dead: false }); };
  for (const r of roads) {
    const len = Math.hypot(r[2] - r[0], r[3] - r[1]), a = Math.atan2(r[3] - r[1], r[2] - r[0]), nx = -Math.sin(a), ny = Math.cos(a);
    for (let d = 40 + R() * 60; d < len - 30; d += 150 + R() * 90) { const px = r[0] + Math.cos(a) * d + nx * 2.4, py = r[1] + Math.sin(a) * d + ny * 2.4; if (free(px, py, 3)) addVeh(px, py, a + (R() < 0.5 ? 0 : Math.PI)); }
  }
  for (const t of towns) for (let k = 0; k < 30; k++) { const px = t.x + (R() - 0.5) * 60, py = t.y + (R() - 0.5) * 60; if (free(px, py, 3.5)) { addVeh(px, py, R() * TAU); break; } }
  for (let i = 0; i < 650; i++) { const x = R() * S, y = R() * S; if (free(x, y, 3.5)) obs.push({ t: "c", kind: "tree", x, y, r: 0.45, s: 0.8 + R() * 0.7, h3: 7, pine: R() < 0.7 }); }
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

  const CELL = 10, GN = Math.ceil(S / CELL) + 1, grid = new Array(GN * GN);
  for (let i = 0; i < grid.length; i++) grid[i] = [];
  for (const o of obs) {
    const x0 = o.t === "c" ? o.x - o.r : o.x, y0 = o.t === "c" ? o.y - o.r : o.y, x1 = o.t === "c" ? o.x + o.r : o.x + o.w, y1 = o.t === "c" ? o.y + o.r : o.y + o.h;
    for (let gx = Math.max(0, Math.floor(x0 / CELL)); gx <= Math.min(GN - 1, Math.floor(x1 / CELL)); gx++)
      for (let gy = Math.max(0, Math.floor(y0 / CELL)); gy <= Math.min(GN - 1, Math.floor(y1 / CELL)); gy++) grid[gy * GN + gx].push(o);
  }
  return { seed, obs, blds, loot, roads, towns, zones, plane, grid, CELL, GN, R, fields, cars, poles, doors, vehicles };
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
const EH = 1.35; // body height used for collisions (lets you walk under stairs and slabs)
function obsHit(o, x, y) { if (o.t === "c") { const dx = x - o.x, dy = y - o.y; return dx * dx + dy * dy < o.r * o.r; } return x > o.x && x < o.x + o.w && y > o.y && y < o.y + o.h; }
// solid on the ground level only (used for placing things)
function pointBlocked(x, y) {
  for (const o of near(x, y, 1)) {
    if (o.z0 || (o.kind === "door" && o.open) || o.kind === "tree" || o.kind === "fence" || o.kind === "pole" || o.kind === "car") continue;
    if (obsHit(o, x, y)) return true;
  }
  return false;
}
// is anything solid at this point and height?
function solidAt(x, y, h) {
  for (const o of near(x, y, 1)) {
    if (o.kind === "tree" || o.kind === "pole" || o.kind === "car" || o.kind === "fence" || (o.kind === "door" && o.open)) continue;
    if (h < (o.z0 || 0) || h > o.h3) continue;
    if (obsHit(o, x, y)) return true;
  }
  return false;
}
function los(x1, y1, x2, y2, z1 = 0, z2 = 0) {
  const d = Math.hypot(x2 - x1, y2 - y1), steps = Math.ceil(d / 1.1), h1 = z1 + 1.4, h2 = z2 + 1.4;
  for (let i = 1; i < steps; i++) { const t = i / steps; if (solidAt(x1 + (x2 - x1) * t, y1 + (y2 - y1) * t, lerp(h1, h2, t))) return false; }
  return true;
}
// height of the floor under a point (ground, a floor slab, stairs, a roof, a container top)
function groundAt(x, y, z) {
  let g = 0;
  for (const o of near(x, y, 0.5)) {
    if (!o.walk || o.h3 > z + 0.5 || o.h3 <= g) continue;
    if (x > o.x - 0.05 && x < o.x + o.w + 0.05 && y > o.y - 0.05 && y < o.y + o.h + 0.05) g = o.h3;
  }
  return g;
}
function collide(e) {
  const z = e.z || 0;
  for (let pass = 0; pass < 2; pass++) for (const o of near(e.x, e.y, PR + 1)) {
    const z0 = o.z0 || 0;
    if (z >= o.h3 - 0.05 || z + EH <= z0) continue;
    if (o.walk && o.h3 <= z + 0.45) continue;
    if (o.kind === "door" && o.open) continue;
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
  if (MAP.vehicles) for (const v of MAP.vehicles) { if (v.driver === e || Math.abs(v.x - e.x) > 4 || Math.abs(v.y - e.y) > 4 || z > 1.5) continue; vehPush(v, e); }
  e.x = clamp(e.x, 2, S - 2); e.y = clamp(e.y, 2, S - 2);
}
function insideBuilding(x, y) { return bldAt(x, y); }

function zoneAt(t) {
  if (MAP && MAP.kind === "arena") return { x: AS / 2, y: AS / 2, r: 999, nx: AS / 2, ny: AS / 2, nr: 70, dps: 0, phase: 0, shrinking: false, left: 999 };
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
  low:    { pr: 0.75, shadows: false, map: 512,  fog: 220, draw: 160, loot: 35, rigDist: 35, lodDist: 7,  shChar: 0,  charDraw: 110, grass: 900,  grassR: 14 },
  medium: { pr: 1.0,  shadows: true,  map: 1024, fog: 320, draw: 230, loot: 45, rigDist: 60, lodDist: 13, shChar: 14, charDraw: 170, grass: 3500, grassR: 26 },
  phone:  { pr: 1.0,  shadows: false, map: 512,  fog: 240, draw: 190, loot: 40, rigDist: 45, lodDist: 9,  shChar: 0,  charDraw: 130, grass: 1800, grassR: 18 },
  high:   { pr: 2.0,  shadows: true,  map: 2048, fog: 420, draw: 320, loot: 60, rigDist: 120, lodDist: 30, shChar: 35, charDraw: 260, grass: 7000, grassR: 38 }
};
let Q = QUALITY.medium;
function applyQuality() {
  const k = SETTINGS.quality === "auto" ? (IS_TOUCH ? "phone" : "high") : SETTINGS.quality;
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
  g.fillStyle = "#677a43"; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 26; i++) { const x = Math.random() * w, y = Math.random() * h, r = 30 + Math.random() * 70; const gr = g.createRadialGradient(x, y, 0, x, y, r); const c = Math.random() < 0.5 ? "130,128,70" : "70,96,48"; gr.addColorStop(0, `rgba(${c},0.35)`); gr.addColorStop(1, `rgba(${c},0)`); g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2); }
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
  TEX.plaster = windowTile((g, w, h) => { noiseFill(g, w, h, "#d8ccb0", 2500, 0.06); g.fillStyle = "rgba(90,70,40,0.18)"; g.fillRect(0, h - 22, w, 22); }, false);
  TEX.brick = windowTile((g, w, h) => {
    g.fillStyle = "#9b5a43"; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 16) for (let x = (y / 16) % 2 ? -16 : 0; x < w; x += 32) { g.fillStyle = `hsl(${12 + Math.random() * 8},${40 + Math.random() * 15}%,${30 + Math.random() * 10}%)`; g.fillRect(x + 1, y + 1, 30, 14); }
  }, false);
  TEX.concrete = windowTile((g, w, h) => { noiseFill(g, w, h, "#a9a69c", 3000, 0.08); g.fillStyle = "rgba(0,0,0,0.12)"; g.fillRect(0, h - 8, w, 8); }, false);
  TEX.panel = canvasTex(256, 320, (g, w, h) => { noiseFill(g, w, h, "#c9cbc8", 2000, 0.05); g.fillStyle = "rgba(0,0,0,0.18)"; g.fillRect(0, h - 12, w, 12); g.fillStyle = "rgba(0,0,0,0.08)"; g.fillRect(w / 2 - 1, 0, 2, h); });
  TEX.floor = canvasTex(256, 256, (g, w, h) => { for (let y = 0; y < h; y += 32) { g.fillStyle = `hsl(${26 + Math.random() * 8},${35 + Math.random() * 10}%,${36 + Math.random() * 10}%)`; g.fillRect(0, y, w, 32); g.fillStyle = "rgba(0,0,0,0.25)"; g.fillRect(0, y, w, 2); const o = Math.random() * w; g.fillRect(o, y, 2, 32); } });
  TEX.door = canvasTex(64, 128, (g, w, h) => { g.fillStyle = "#fff"; g.fillRect(0, 0, w, h); g.strokeStyle = "rgba(0,0,0,0.28)"; g.lineWidth = 3; g.strokeRect(8, 8, w - 16, h / 2 - 14); g.strokeRect(8, h / 2 + 6, w - 16, h / 2 - 14); g.fillStyle = "#555"; g.fillRect(w - 14, h / 2 - 2, 8, 6); });
  TEX.metal = canvasTex(256, 256, (g, w, h) => { g.fillStyle = "#7d8288"; g.fillRect(0, 0, w, h); for (let x = 0; x < w; x += 16) { const gr = g.createLinearGradient(x, 0, x + 16, 0); gr.addColorStop(0, "#5d6267"); gr.addColorStop(0.5, "#9aa0a6"); gr.addColorStop(1, "#5d6267"); g.fillStyle = gr; g.fillRect(x, 0, 16, h); } for (let i = 0; i < 40; i++) { g.fillStyle = "rgba(120,70,30,0.18)"; g.fillRect(Math.random() * w, Math.random() * h, 3 + Math.random() * 10, 20 + Math.random() * 60); } });
  TEX.tiles = canvasTex(256, 256, (g, w, h) => { g.fillStyle = "#7a3424"; g.fillRect(0, 0, w, h); for (let y = 0; y < h; y += 18) for (let x = (y / 18) % 2 ? -14 : 0; x < w; x += 28) { g.fillStyle = `hsl(${8 + Math.random() * 10},${45 + Math.random() * 15}%,${24 + Math.random() * 12}%)`; g.beginPath(); g.ellipse(x + 14, y + 12, 13, 10, 0, 0, Math.PI); g.fill(); } });
  TEX.fence = canvasTex(256, 64, (g, w, h) => { g.clearRect(0, 0, w, h); for (let x = 2; x < w; x += 22) { g.fillStyle = `hsl(28,${30 + Math.random() * 15}%,${28 + Math.random() * 10}%)`; g.fillRect(x, 4, 16, h - 4); g.beginPath(); g.moveTo(x, 4); g.lineTo(x + 8, 0); g.lineTo(x + 16, 4); g.fill(); } g.fillStyle = "#4a3523"; g.fillRect(0, 14, w, 6); g.fillRect(0, 44, w, 6); });
  TEX.wheat = canvasTex(256, 256, (g, w, h) => { g.fillStyle = "#b9a25a"; g.fillRect(0, 0, w, h); for (let x = 0; x < w; x += 8) { g.fillStyle = x % 16 ? "rgba(120,96,40,0.35)" : "rgba(230,210,140,0.35)"; g.fillRect(x, 0, 4, h); } for (let i = 0; i < 3000; i++) { g.fillStyle = `rgba(${200 + Math.random() * 50},${170 + Math.random() * 40},80,0.4)`; g.fillRect(Math.random() * w, Math.random() * h, 1, 3); } });
  TEX.green = canvasTex(256, 256, (g, w, h) => { g.fillStyle = "#6f8a3c"; g.fillRect(0, 0, w, h); for (let x = 0; x < w; x += 10) { g.fillStyle = x % 20 ? "rgba(40,70,20,0.35)" : "rgba(160,190,90,0.3)"; g.fillRect(x, 0, 5, h); } });
  // shipping container: light corrugated steel, tinted per container
  TEX.container = canvasTex(256, 128, (g, w, h) => { for (let x = 0; x < w; x += 12) { const gr = g.createLinearGradient(x, 0, x + 12, 0); gr.addColorStop(0, "#b9b9b9"); gr.addColorStop(0.5, "#f4f4f4"); gr.addColorStop(1, "#b9b9b9"); g.fillStyle = gr; g.fillRect(x, 0, 12, h); } g.fillStyle = "rgba(0,0,0,0.25)"; g.fillRect(0, 0, w, 6); g.fillRect(0, h - 6, w, 6); for (let i = 0; i < 30; i++) { g.fillStyle = "rgba(110,60,25,0.15)"; g.fillRect(Math.random() * w, Math.random() * h, 2 + Math.random() * 6, 10 + Math.random() * 30); } });
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
function mergeAll(gs) { if (gs.every((g) => !!g.index) || gs.every((g) => !g.index)) return mergeGeometries(gs); return mergeGeometries(gs.map((g) => g.index ? g.toNonIndexed() : g)); }
function boxAt(w, h, d, x, y, z) { const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y, z); return g; }
function gableRoof(b, overhang, height) {
  const long = b.w >= b.h, span = (long ? b.h : b.w) + overhang * 2, len = (long ? b.w : b.h) + overhang * 2;
  const sh = new THREE.Shape(); sh.moveTo(-span / 2, 0); sh.lineTo(span / 2, 0); sh.lineTo(0, height); sh.lineTo(-span / 2, 0);
  const g = new THREE.ExtrudeGeometry(sh, { depth: len, bevelEnabled: false });
  g.translate(0, 0, -len / 2);
  if (long) g.rotateY(Math.PI / 2);
  g.translate(b.x + b.w / 2, b.top, b.y + b.h / 2);
  return g;
}

let world = null, doorIm = null;
const chunks = [];
const roofMeshes = [];
const _dm = new THREE.Matrix4(), _dq = new THREE.Quaternion(), _dup = new THREE.Vector3(0, 1, 0), _dp = new THREE.Vector3(), _ds = new THREE.Vector3();
function setDoorMatrix(d) { _dq.setFromAxisAngle(_dup, -d.ang); _dm.compose(_dp.set(d.hx, d.z0, d.hy), _dq, _ds.set(d.len, 1, 1)); doorIm.setMatrixAt(d.id, _dm); doorIm.instanceMatrix.needsUpdate = true; }
const swinging = new Set();
function setDoor(d, open, local = true) {
  if (d.open === open) return;
  d.open = open; d.tAng = d.a0 + (open ? Math.PI / 2 : 0); swinging.add(d);
  const dd = Math.hypot(d.hx - (me ? me.x : 0), d.hy - (me ? me.y : 0));
  if (dd < 40) noise(0.05 * (1 - dd / 40) + 0.01, 0.12, open ? 500 : 300, 120);
  if (local && online) netDoor(d);
}
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
  const arena = MAP.kind === "arena";
  if (arena) buildArenaWorld();
  sun.intensity = arena ? 2.9 : 2.1; sun.color.set(arena ? 0xffe8c4 : 0xfff1d6); hemi.intensity = arena ? 1.3 : 1.35; hemi.color.set(arena ? 0xfff0dc : 0xdfeefa); scene.fog.near = arena ? 70 : 90;
  if (!arena) {
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
  }
  // buildings: every piece merged by material so phones draw them fast
  const G = {}, CH = 120; let curC = "0,0"; const add = (k, g) => { const kk = k + "|" + curC; (G[kk] || (G[kk] = [])).push(g); };
  for (const o of MAP.obs) {
    if (!o.b || o.kind === "door") continue;
    curC = Math.floor((o.b.x + o.b.w / 2) / CH) + "," + Math.floor((o.b.y + o.b.h / 2) / CH);
    const z0 = o.z0 || 0, hh = o.h3 - z0;
    if (o.t === "c") { const g = new THREE.CylinderGeometry(o.r, o.r, hh, 14); g.translate(o.x, z0 + hh / 2, o.y); add("tank", g); continue; }
    const g = planarUV(boxAt(o.w, hh, o.h, o.x + o.w / 2, z0 + hh / 2, o.y + o.h / 2), o.m === "slab" ? 2 : 2.6, o.m === "slab" ? 2 : 3.2);
    add(o.m === "ext" ? "ext_" + o.b.tex : o.m, g);
  }
  for (const b of MAP.blds) {
    curC = Math.floor((b.x + b.w / 2) / CH) + "," + Math.floor((b.y + b.h / 2) / CH);
    add("slab", planarUV(boxAt(b.w - 0.1, 0.06, b.h - 0.1, b.x + b.w / 2, 0.03, b.y + b.h / 2), 2, 2));
    // window frames, and glass on the towers
    for (const wn of b.wins) {
      const R2 = (u0, v0, u1, v1) => wn.axis === "u" ? bRect(b, u0, v0, u1, v1) : bRect(b, v0, u0, v1, u1);
      const f = wn.fixed, s = wn.s, e = wn.e, bx = (r, z0, z1) => add("frame", boxAt(r.w, z1 - z0, r.h, r.x + r.w / 2, (z0 + z1) / 2, r.y + r.h / 2));
      bx(R2(s - 0.1, f - 0.07, e + 0.1, f + WT + 0.07), wn.z0 - 0.07, wn.z0 + 0.02);
      bx(R2(s - 0.08, f - 0.03, e + 0.08, f + WT + 0.03), wn.z1 - 0.02, wn.z1 + 0.07);
      bx(R2(s - 0.08, f - 0.03, s, f + WT + 0.03), wn.z0, wn.z1); bx(R2(e, f - 0.03, e + 0.08, f + WT + 0.03), wn.z0, wn.z1);
      if (b.type === "tower") { const r = R2(s, f + WT / 2 - 0.015, e, f + WT / 2 + 0.015); add("glass", boxAt(r.w, wn.z1 - wn.z0, r.h, r.x + r.w / 2, (wn.z0 + wn.z1) / 2, r.y + r.h / 2)); }
    }
    if (b.roofKind === "gable") {
      add("roof_" + b.roof, planarUV(gableRoof(b, 0.6, 2.4), 3, 3));
      add("chimney", boxAt(0.7, 2.2, 0.7, b.x + b.w * 0.7, b.top + 1.8, b.y + b.h * 0.35));
    } else if (b.roofKind === "metal") add("metalroof", planarUV(gableRoof(b, 0.5, 1.5), 4, 4));
  }
  const MATS = {
    ext_plaster: () => ({ map: TEX.plaster, roughness: 0.92 }), ext_brick: () => ({ map: TEX.brick, roughness: 0.92 }), ext_concrete: () => ({ map: TEX.concrete, roughness: 0.92 }),
    ext_panel: () => ({ map: TEX.panel, roughness: 0.8 }), ext_sand: () => ({ map: TEX.sand, roughness: 0.95 }), ext_cream: () => ({ map: TEX.cream, roughness: 0.95 }), ext_metal: () => ({ map: TEX.metal, roughness: 0.9, metalness: 0, color: 0xeef1f3 }),
    int: () => ({ map: wallTex, color: 0xe6dccb, roughness: 0.95, emissive: 0x1a1712 }), slab: () => ({ map: TEX.floor, roughness: 0.8, emissive: 0x120d08 }),
    stair: () => ({ color: 0x9a968c, roughness: 0.95 }), rail: () => ({ color: 0x3a3a3a, roughness: 0.5, metalness: 0.6 }), par: () => ({ color: 0xa8a49a, roughness: 1 }),
    ac: () => ({ map: TEX.metal, color: 0xcfd3d6, roughness: 0.6, metalness: 0.3 }), ceil: () => ({ color: 0xd9d4c8, roughness: 1 }), tank: () => ({ color: 0xd8d8d0, roughness: 0.5, metalness: 0.4 }),
    frame: () => ({ color: 0xeeeae0, roughness: 0.7 }), glass: () => ({ color: 0x6f9cc0, roughness: 0.08, metalness: 0.7, transparent: true, opacity: 0.38, depthWrite: false }),
    chimney: () => ({ color: 0x6b3f30, roughness: 1 }), metalroof: () => ({ map: TEX.metal, roughness: 0.75, metalness: 0, color: 0xd4c6b4 })
  };
  const matCache = {}; chunks.length = 0;
  for (const kk in G) {
    const [k, c] = kk.split("|"), [cx, cz] = c.split(",").map(Number);
    const mat = matCache[k] || (matCache[k] = new THREE.MeshStandardMaterial(k.startsWith("roof_") ? { map: TEX.tiles, color: +k.slice(5), roughness: 0.85 } : MATS[k]()));
    const m = new THREE.Mesh(mergeAll(G[kk]), mat);
    m.castShadow = k !== "glass"; m.receiveShadow = true; world.add(m);
    m.userData.cx = (cx + 0.5) * CH; m.userData.cz = (cz + 0.5) * CH; chunks.push(m);
    for (const g of G[kk]) g.dispose();
  }
  // doors: one instanced mesh, each door swings on its hinge
  const dg = new THREE.BoxGeometry(1, 2.16, 0.05); dg.translate(0.5, 1.08, 0);
  doorIm = new THREE.InstancedMesh(dg, new THREE.MeshStandardMaterial({ map: TEX.door, roughness: 0.75 }), Math.max(1, MAP.doors.length));
  const dc = new THREE.Color();
  for (const d of MAP.doors) { setDoorMatrix(d); doorIm.setColorAt(d.id, dc.setHex(d.ext ? 0x8a5a36 : 0xd8c8a8)); }
  doorIm.castShadow = true; doorIm.receiveShadow = true; world.add(doorIm);
  // fences
  const fences = MAP.obs.filter((o) => o.kind === "fence").map((o) => planarUV(boxAt(Math.max(o.w, 0.06), 1.15, Math.max(o.h, 0.06), o.x + o.w / 2, 0.575, o.y + o.h / 2), 2.4, 1.15));
  if (fences.length) { const fm = new THREE.Mesh(mergeGeometries(fences), new THREE.MeshStandardMaterial({ map: TEX.fence, transparent: true, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 1 })); fm.castShadow = true; world.add(fm); }
  // containers
  const crates = MAP.obs.filter((o) => o.kind === "crate");
  if (crates.length) {
    const cg = planarUV(new THREE.BoxGeometry(1, 1, 1), 0.25, 1);
    const im = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ map: TEX.container, roughness: 0.75, metalness: 0.05 }), crates.length);
    const m4 = new THREE.Matrix4(), col = new THREE.Color();
    crates.forEach((o, i) => { m4.compose(new THREE.Vector3(o.x + o.w / 2, CRATE_H / 2, o.y + o.h / 2), new THREE.Quaternion(), new THREE.Vector3(o.w, CRATE_H, o.h)); im.setMatrixAt(i, m4); im.setColorAt(i, col.setHex(o.c).multiplyScalar(1.7)); });
    im.castShadow = true; im.receiveShadow = true; world.add(im); cg.dispose();
  }
  // cars
  if (MAP.cars.length) {
    const body = mergeGeometries([boxAt(4.3, 0.75, 1.85, 0, 0.65, 0), boxAt(2.3, 0.6, 1.65, -0.25, 1.3, 0)]);
    const glass = boxAt(2.32, 0.42, 1.68, -0.25, 1.33, 0);
    const wheel = new THREE.CylinderGeometry(0.36, 0.36, 0.25, 12); wheel.rotateX(Math.PI / 2);
    const bodyIm = new THREE.InstancedMesh(body, new THREE.MeshStandardMaterial({ roughness: 0.5, metalness: 0.15 }), MAP.cars.length);
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
  if (pines.length) world.add(pineIm); if (oaks.length) world.add(oakIm); for (const im of [pineIm, oakIm]) { im.castShadow = true; im.receiveShadow = true; }
  // rocks
  const rocks = MAP.obs.filter((o) => o.kind === "rock");
  const rockIm = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 1), new THREE.MeshStandardMaterial({ color: 0x8b8a82, roughness: 0.95, flatShading: true }), Math.max(1, rocks.length));
  rocks.forEach((o, i) => { q.setFromEuler(new THREE.Euler(o.rot * 0.3, o.rot, o.rot * 0.5)); m4.compose(v.set(o.x, o.r * 0.3, o.y), q, sv.set(o.r, o.r * 0.75, o.r * 1.1)); rockIm.setMatrixAt(i, m4); });
  rockIm.castShadow = true; rockIm.receiveShadow = true; if (rocks.length) world.add(rockIm);
  // distant hills
  const hillMat = new THREE.MeshStandardMaterial({ color: 0x6f7f63, roughness: 1, flatShading: true });
  for (let i = 0; i < 30; i++) { const a = i / 30 * TAU, rr = (arena ? 260 : S * 0.95) + (i % 3) * 40, h = 60 + (i * 37 % 70); const hill = new THREE.Mesh(new THREE.ConeGeometry(90 + (i * 13 % 60), h, 6), hillMat); hill.position.set(S / 2 + Math.cos(a) * rr, h / 2 - 4, S / 2 + Math.sin(a) * rr); world.add(hill); }
  buildLoot();
  for (const v of MAP.vehicles) makeVehicleMesh(v);
  initSkids();
  zoneWall = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 128, 1, true), new THREE.MeshBasicMaterial({ color: 0x8a4cff, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false, fog: false }));
  world.add(zoneWall);
  nextRing = new THREE.Mesh(new THREE.RingGeometry(0.99, 1, 160), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false }));
  nextRing.rotation.x = -Math.PI / 2; nextRing.position.y = 0.1; world.add(nextRing);
  planeMesh = makePlane(); world.add(planeMesh);
}

// ---- grass blades (instanced, swaying in the wind, placed around the camera) ----
const GRASS = { mesh: null, map: null, cx: 1e9, cz: 1e9, time: { value: 0 }, n: 0 };
function grassGeo() {
  // one clump: 9 tapered blades leaning outwards, darker at the root
  const P = [], C = [], N = [], R = mulberry(7);
  for (let i = 0; i < 9; i++) {
    const a = R() * TAU, r = R() * 0.16, h = 0.2 + R() * 0.26, w = 0.014 + R() * 0.012, lean = 0.06 + R() * 0.14, x = Math.cos(a) * r, z = Math.sin(a) * r;
    const fa = R() * TAU, fx = Math.cos(fa) * w, fz = Math.sin(fa) * w, tx = x + Math.cos(a) * lean, tz = z + Math.sin(a) * lean;
    P.push(x - fx, 0, z - fz, x + fx, 0, z + fz, tx, h, tz);
    const tip = 0.85 + R() * 0.3; C.push(0.05, 0.085, 0.02, 0.05, 0.085, 0.02, 0.17 * tip, 0.25 * tip, 0.06 * tip);
    N.push(0, 1, 0, 0, 1, 0, 0, 1, 0);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(P, 3)); g.setAttribute("color", new THREE.Float32BufferAttribute(C, 3)); g.setAttribute("normal", new THREE.Float32BufferAttribute(N, 3));
  return g;
}
function mulberry(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function grassMake(max) {
  const m = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = GRASS.time;
    sh.vertexShader = "uniform float uTime;\n" + sh.vertexShader.replace("#include <begin_vertex>", `#include <begin_vertex>
      vec3 ip = vec3(instanceMatrix[3][0], 0.0, instanceMatrix[3][2]);
      float wv = sin(uTime * 1.7 + ip.x * 0.21 + ip.z * 0.17) * 0.6 + sin(uTime * 3.1 + ip.x * 0.7) * 0.25;
      transformed.x += wv * 0.11 * position.y * 2.0; transformed.z += wv * 0.05 * position.y * 2.0;`);
  };
  const im = new THREE.InstancedMesh(grassGeo(), m, max); im.frustumCulled = false; im.count = 0; im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);
  scene.add(im); return im;
}
const _gm = new THREE.Matrix4(), _gq = new THREE.Quaternion(), _gp = new THREE.Vector3(), _gs = new THREE.Vector3(), _gc = new THREE.Color();
function grassOk(x, y) {
  if (x < 1 || y < 1 || x > S - 1 || y > S - 1) return false;
  if (onRoad(x, y) || insideBuilding(x, y)) return false;
  for (const f of MAP.fields) if (!f.c && x > f.x && x < f.x + f.w && y > f.y && y < f.y + f.h) return false;
  return true;
}
function grassTick(cx, cz, camY) {
  const max = Q.grass || 0;
  if (!MAP || MAP.kind === "arena" || !max || camY > 45) { if (GRASS.mesh) GRASS.mesh.visible = false; return; }
  if (!GRASS.mesh || GRASS.max !== max) { if (GRASS.mesh) { scene.remove(GRASS.mesh); GRASS.mesh.geometry.dispose(); } GRASS.mesh = grassMake(max); GRASS.max = max; GRASS.cx = 1e9; }
  const im = GRASS.mesh; im.visible = true; GRASS.time.value = performance.now() / 1000;
  if (GRASS.map === MAP && Math.hypot(cx - GRASS.cx, cz - GRASS.cz) < 3) return;
  GRASS.map = MAP; GRASS.cx = cx; GRASS.cz = cz;
  // fixed world grid, so clumps stay put while you walk (only the far edge changes)
  const R = Q.grassR || 24, cell = Math.sqrt(Math.PI * R * R / max), x0 = Math.floor((cx - R) / cell), x1 = Math.ceil((cx + R) / cell), z0 = Math.floor((cz - R) / cell), z1 = Math.ceil((cz + R) / cell);
  let n = 0;
  for (let gx = x0; gx <= x1 && n < max; gx++) for (let gz = z0; gz <= z1 && n < max; gz++) {
    let h = (gx * 73856093) ^ (gz * 19349663) ^ MAP.seed; h = Math.imul(h ^ (h >>> 13), 0x5bd1e995); const r1 = ((h >>> 8) & 1023) / 1023, r2 = ((h >>> 18) & 1023) / 1023, r3 = (h & 255) / 255;
    const x = (gx + r1) * cell, z = (gz + r2) * cell, d = Math.hypot(x - cx, z - cz); if (d > R) continue;
    // patchy meadow: denser in some spots, bare in others
    const patch = Math.sin(x * 0.11 + MAP.seed) * Math.sin(z * 0.13) + Math.sin(x * 0.031 - z * 0.027) * 0.8;
    if (patch < -0.55 && r3 < 0.7) continue;
    if (!grassOk(x, z)) continue;
    const fade = clamp((R - d) / (R * 0.25), 0, 1), sc = (0.75 + r3 * 0.7) * (patch > 0.6 ? 1.35 : 1) * fade;
    _gq.setFromAxisAngle(_fxUp, r1 * TAU); _gm.compose(_gp.set(x, groundAt(x, z, 0.2), z), _gq, _gs.set(sc, sc * (0.8 + r2 * 0.5), sc)); im.setMatrixAt(n, _gm);
    _gc.setRGB(0.85 + r2 * 0.3, 0.9 + r3 * 0.2, 0.75 + r1 * 0.3); if (patch > 0.9) _gc.multiplyScalar(1.12); im.setColorAt(n, _gc);
    n++;
  }
  im.count = n; im.instanceMatrix.needsUpdate = true; im.instanceColor.needsUpdate = true;
}

let zoneWall = null, nextRing = null, planeMesh = null;
function makePlane() {
  // four-engine military transport: high wing, T-tail, rear ramp; nose points along +x
  const g = new THREE.Group();
  const paint = new THREE.MeshStandardMaterial({ color: 0x6d7462, roughness: 0.75, metalness: 0.25 });
  const belly = new THREE.MeshStandardMaterial({ color: 0x8b9083, roughness: 0.75, metalness: 0.25 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x23262a, roughness: 0.5, metalness: 0.4 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x1b2a36, roughness: 0.08, metalness: 0.9 });
  const add = (geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); m.castShadow = true; g.add(m); return m; };
  // fuselage: round body, rounded nose, tail sweeping up to the ramp
  add(new THREE.CylinderGeometry(2.2, 2.2, 20, 18), paint, 0, 0, 0, 0, 0, Math.PI / 2);
  const nose = add(new THREE.SphereGeometry(2.2, 18, 12, 0, TAU, 0, Math.PI / 2), paint, 10, 0, 0, 0, 0, -Math.PI / 2); nose.scale.set(1, 1.5, 1);
  const tailc = add(new THREE.CylinderGeometry(0.55, 2.2, 10, 18), paint, -14.9, 0.85, 0, 0, 0, Math.PI / 2 - 0.17);
  add(new THREE.BoxGeometry(18, 0.9, 3.2), belly, 0, -1.9, 0);
  // cockpit windows
  for (const z of [-1.05, -0.35, 0.35, 1.05]) add(new THREE.BoxGeometry(0.9, 0.42, 0.6), glass, 11.6, 1.05, z, 0, 0, -0.55);
  // side windows (round portholes) and the paratrooper doors
  for (let i = 0; i < 6; i++) for (const sd of [-1, 1]) add(new THREE.CylinderGeometry(0.16, 0.16, 0.1, 10), glass, 6 - i * 2.2, 0.4, sd * 2.18, Math.PI / 2);
  for (const sd of [-1, 1]) add(new THREE.BoxGeometry(1.1, 2.0, 0.08), dark, -8.2, -0.2, sd * 2.19);
  // high wing with four engines and spinning propellers
  const wing = new THREE.Shape(); wing.moveTo(0, -20); wing.lineTo(2.2, -20); wing.lineTo(3.6, 0); wing.lineTo(2.2, 20); wing.lineTo(0, 20); wing.lineTo(-1.2, 0); wing.lineTo(0, -20);
  const wg = new THREE.ExtrudeGeometry(wing, { depth: 0.38, bevelEnabled: true, bevelThickness: 0.1, bevelSize: 0.08, bevelSegments: 1 }); wg.rotateX(Math.PI / 2);
  add(wg, paint, 0.4, 2.45, 0);
  const props = [];
  for (const z of [-11, -5.5, 5.5, 11]) {
    add(new THREE.CylinderGeometry(0.75, 0.6, 4.8, 12), paint, 3.6, 2.1, z, 0, 0, Math.PI / 2);
    add(new THREE.SphereGeometry(0.35, 10, 8), dark, 6.1, 2.1, z);
    const hub = new THREE.Group(); hub.position.set(6.15, 2.1, z); g.add(hub);
    for (let k = 0; k < 4; k++) { const bl = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.1, 0.32), dark); bl.position.y = 1.05; const arm = new THREE.Group(); arm.rotation.x = k * Math.PI / 2; arm.add(bl); hub.add(arm); }
    // a faint blurred disc, so it reads as spinning even at low frame rates
    const disc = new THREE.Mesh(new THREE.CircleGeometry(2.15, 24), new THREE.MeshBasicMaterial({ color: 0x222222, transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false })); disc.rotation.y = Math.PI / 2; hub.add(disc);
    props.push(hub);
  }
  // T-tail
  const fin = new THREE.Shape(); fin.moveTo(0, 0); fin.lineTo(5.2, 0); fin.lineTo(2.2, 7); fin.lineTo(0.2, 7); fin.lineTo(0, 0);
  const fg = new THREE.ExtrudeGeometry(fin, { depth: 0.3, bevelEnabled: false }); fg.translate(0, 0, -0.15);
  add(fg, paint, -21, 1.8, 0);
  const stab = new THREE.Shape(); stab.moveTo(0, -7); stab.lineTo(1.6, -7); stab.lineTo(3, 0); stab.lineTo(1.6, 7); stab.lineTo(0, 7); stab.lineTo(-0.6, 0); stab.lineTo(0, -7);
  const sg = new THREE.ExtrudeGeometry(stab, { depth: 0.22, bevelEnabled: false }); sg.rotateX(Math.PI / 2);
  add(sg, paint, -20.8, 8.4, 0);
  // landing-gear pods and wing-tip lights
  for (const sd of [-1, 1]) add(new THREE.BoxGeometry(6.5, 1.1, 0.9), belly, -1, -1.7, sd * 2.3);
  const red = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff2020 })); red.position.set(1.8, 2.5, -20.1); g.add(red);
  const grn = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 6), new THREE.MeshBasicMaterial({ color: 0x20ff40 })); grn.position.set(1.8, 2.5, 20.1); g.add(grn);
  const bcn = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff })); bcn.position.set(-19.5, 8.7, 0); g.add(bcn);
  g.userData = { props, lights: [red, grn, bcn] };
  g.scale.setScalar(0.9);
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
  itemsProtos();
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
  e.w.slice(0, 2).forEach((w) => { if (w >= 0) items.push({ k: "w", v: w }); });
  for (const t of ["l", "h", "s"]) if (e.ammo[t] > 0) items.push({ k: "a", v: t, n: e.ammo[t] });
  ensureKit(e);
  for (const k of HEAL_ORDER) if (e.heals[k] > 0) items.push({ k: "md", v: k, n: e.heals[k] });
  for (const k of THR_ORDER) if (e.thr[k] > 0) items.push({ k: "th", v: k, n: e.thr[k] });
  for (let sl = 0; sl < 2; sl++) for (const q in e.att[sl]) if (e.att[sl][q]) items.push({ k: "at", v: e.att[sl][q] });
  for (const q in e.spare) for (let i = 0; i < e.spare[q]; i++) items.push({ k: "at", v: q });
  if (e.armor > 0) items.push({ k: "v", v: e.armor });
  if (e.helm > 0) items.push({ k: "hm", v: e.helm });
  if (e.pack > 0) items.push({ k: "bp", v: e.pack });
  if (e.pan) items.push({ k: "w", v: 7 });
  if (!items.length) return;
  // wooden crate where they fell, with their gear laid out around it
  const box = new THREE.Group();
  const body = new THREE.Mesh(boxAt(0.9, 0.55, 0.6, 0, 0.275, 0), M_BOX); body.castShadow = true; box.add(body);
  const lid = new THREE.Mesh(boxAt(0.95, 0.08, 0.65, 0, 0.59, 0), M_BOX2); lid.castShadow = true; box.add(lid);
  for (const sx of [-0.3, 0, 0.3]) { const sl = new THREE.Mesh(boxAt(0.05, 0.5, 0.62, sx, 0.27, 0), M_BOX2); box.add(sl); }
  box.position.set(e.x, e.z || 0, e.y); box.rotation.y = e.a; world.add(box); deathBoxes.push(box);
  items.forEach((it, i) => {
    const a = e.a + i / items.length * TAU, r = 1.15;
    let x = e.x + Math.cos(a) * r, y = e.y + Math.sin(a) * r;
    if (solidAt(x, y, (e.z || 0) + 0.3)) { x = e.x + Math.cos(a) * 0.5; y = e.y + Math.sin(a) * 0.5; }
    it.x = x; it.y = y; it.z = groundAt(x, y, (e.z || 0) + 0.3); it.rot = a; it.id = MAP.loot.length; MAP.loot.push(it); makeLootMesh(it); it.mesh.visible = true;
  });
}
// loot models are built from many little parts: bake each into one mesh per material (far fewer draw calls)
const LOOT_MERGED = {};
function mergedProto(key) {
  if (LOOT_MERGED[key]) return LOOT_MERGED[key];
  const src = LOOT_PROTO[key]; let out = src;
  try {
    src.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(src.matrixWorld).invert(), byMat = new Map();
    src.traverse((o) => { if (!o.isMesh || o.isSkinnedMesh) return; const g = o.geometry.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld)); for (const k of Object.keys(g.attributes)) if (k !== "position" && k !== "normal" && k !== "uv") g.deleteAttribute(k); if (!g.attributes.uv) g.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2)); if (!g.attributes.normal) g.computeVertexNormals(); (byMat.get(o.material) || byMat.set(o.material, []).get(o.material)).push(g.index ? g.toNonIndexed() : g); });
    const grp = new THREE.Group();
    for (const [mat, gs] of byMat) { const mm = new THREE.Mesh(mergeGeometries(gs), mat); mm.castShadow = false; grp.add(mm); }
    if (grp.children.length) out = grp;
  } catch (e) { out = src; }
  return (LOOT_MERGED[key] = out);
}
function makeLootMesh(it) {
  {
    if (it.k === "b" || it.k === "m") { it.v = it.k; it.k = "md"; }
    const key = it.k === "w" || it.k === "a" || it.k === "v" || it.k === "md" || it.k === "th" || it.k === "at" || it.k === "hm" || it.k === "bp" ? it.k + it.v : it.k;
    const m = mergedProto(key).clone();
    m.position.set(it.x, (it.z || 0) + 0.02, it.y); m.rotation.y = it.rot || 0;
    m.scale.setScalar(it.k === "w" ? (it.v >= 5 ? 1.0 : 1.6) : it.k === "hm" || it.k === "bp" ? 1.15 : 1.4);
    // soft ground glow so items are easy to spot
    const glow = new THREE.Mesh(new THREE.CircleGeometry(0.55, 16), new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, depthWrite: false, opacity: 0.55, color: it.k === "w" ? 0xffb347 : it.k === "v" || it.k === "hm" || it.k === "bp" ? 0x7fb8ff : it.k === "a" ? 0xe9d38a : it.k === "at" ? 0xd9a0ff : it.k === "th" ? 0xff7a5a : 0x8de39a }));
    glow.rotation.x = -Math.PI / 2; glow.position.y = 0.015; m.add(glow);
    m.visible = false; world.add(m); it.mesh = m;
  }
}
// ---- stance, jump, footsteps ----
const nearGround = (e) => e.onGround || (e.z || 0) - groundAt(e.x, e.y, (e.z || 0) + 0.3) < 0.25;
function setStance(e, s) {
  if (!e.alive || e.ph !== "ground" || !nearGround(e) || e.veh || e.climb || e.knocked) return;
  e.stance = e.stance === s ? "stand" : s;
  if (e === me) { updateStanceUi(); tone(e.stance === "stand" ? 520 : 360, 0.05, "triangle", 0.03); }
}
function doJump(e) {
  if (!e.alive || e.ph !== "ground" || !nearGround(e) || e.healT > 0 || e.veh || e.climb || e.knocked || e.vz > 0.5) return;
  const vt = vaultTarget(e, e === me ? (Math.hypot(e.vx, e.vy) > 0.2 ? Math.atan2(e.vy, e.vx) : camYaw) : e.a);
  if (vt) { startClimb(e, vt); return; }
  if (e.stance !== "stand") { e.stance = "stand"; if (e === me) updateStanceUi(); return; }
  e.vz = 4.8; e.onGround = false; e.peak = e.z; if (e === me) noise(0.04, 0.06, 900, 300);
}
function updateStanceUi() { $("crouchBtn").classList.toggle("on", me.stance === "crouch"); $("proneBtn").classList.toggle("on", me.stance === "prone"); }
const stepEls = [];
function footsteps(e, moved) {
  if (e.stance === "prone" || e.onGround === false || e.veh || moved <= 0) return;
  e.stepAcc += moved;
  const stride = e.stance === "crouch" ? 0.9 : 1.55;
  if (e.stepAcc < stride) return;
  e.stepAcc = 0;
  // a little dust kicked up by running boots (outdoors, close to the camera)
  if (e.stance === "stand" && (e.z || 0) < 0.3 && Math.hypot(e.x - camera.position.x, e.y - camera.position.z) < 30 && !insideBuilding(e.x, e.y)) {
    const sd = (e.stepSide = -(e.stepSide || 1)) * 0.12;
    puff(new THREE.Vector3(e.x - Math.sin(e.a) * sd - Math.cos(e.a) * 0.15, 0.08, e.y + Math.cos(e.a) * sd - Math.sin(e.a) * 0.15), 0xb9a882, 0.35, 0.5);
  }
  if (e === me) { noise(0.018, 0.05, 700, 180); return; }
  const dx = e.x - me.x, dy = e.y - me.y, d = Math.hypot(dx, dy) + Math.abs(e.z - me.z) * 1.5, hear = e.stance === "crouch" ? 14 : 34;
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

// ---------------- character rig: a procedural layer on top of the animation clips ----------------
// The clips only give us walk / run / idle. Everything a soldier does with a rifle is added here, every frame,
// after the mixer: two-hand IK onto the weapon, aim pitch through the spine, lean, crouch with bent knees,
// prone and crawl, freefall and parachute, sitting in vehicles, hit flinches and a real fall when killed.
// It works on any Mixamo-rigged character (bones are found by name), so a new model drops straight in.
const RV = Array.from({ length: 14 }, () => new THREE.Vector3());
const RQ = Array.from({ length: 6 }, () => new THREE.Quaternion());
const RM = new THREE.Matrix4(), RM2 = new THREE.Matrix4();
const smooth = (cur, to, k, dt) => cur + (to - cur) * (1 - Math.exp(-k * dt));

// put every bone in its bind (T) pose, correctly even when the model sits inside rotated / scaled parents
// (skeleton.pose() assumes the mesh is at the world origin, which breaks for characters placed in the world)
function bindPose(root) {
  root.updateMatrixWorld(true);
  const want = new Map(), meshes = [];
  root.traverse((o) => { if (o.isSkinnedMesh) meshes.push(o); });
  meshes.sort((a, b) => b.skeleton.bones.length - a.skeleton.bones.length);
  const m = new THREE.Matrix4(), ib = new THREE.Matrix4();
  for (const mesh of meshes) {
    ib.copy(mesh.bindMatrix).invert();
    mesh.skeleton.bones.forEach((b, i) => { if (!want.has(b)) want.set(b, new THREE.Matrix4().copy(mesh.matrixWorld).multiply(ib).multiply(m.copy(mesh.skeleton.boneInverses[i]).invert())); });
  }
  root.traverse((o) => {
    if (!o.isBone || !want.has(o)) return;
    o.parent.updateMatrixWorld(true);
    m.copy(o.parent.matrixWorld).invert().multiply(want.get(o));
    m.decompose(o.position, o.quaternion, o.scale);
    o.updateMatrixWorld(true);
  });
}
function findBone(root, n) {
  let hit = null;
  root.traverse((o) => { if (!hit && o.isBone && o.name.replace(/^mixamorig\d*[:_]?/i, "") === n) hit = o; });
  return hit;
}
// rotate a bone by a world-space rotation q (pre-multiplied), keeping it in its parent's space
function rotWorld(bone, q) {
  bone.getWorldQuaternion(RQ[0]);
  RQ[0].premultiply(q);
  bone.parent.getWorldQuaternion(RQ[1]).invert();
  bone.quaternion.copy(RQ[1].multiply(RQ[0]));
}
function setWorldQuat(bone, qw) {
  bone.parent.getWorldQuaternion(RQ[1]).invert();
  bone.quaternion.copy(RQ[1]).multiply(qw);
}
// analytic two-bone IK: a = upper (shoulder / hip), b = middle (elbow / knee), c = end (hand / foot)
function ik2(a, b, c, target, pole, weight = 1) {
  if (weight <= 0.001) return;
  const pa = a.getWorldPosition(RV[0]), pb = b.getWorldPosition(RV[1]), pc = c.getWorldPosition(RV[2]);
  const lab = pa.distanceTo(pb), lbc = pb.distanceTo(pc);
  const tgt = RV[3].copy(pc).lerp(target, weight);
  const t = RV[4].subVectors(tgt, pa); let d = t.length();
  d = clamp(d, Math.abs(lab - lbc) + 1e-3, lab + lbc - 1e-3); t.normalize();
  const cosA = clamp((lab * lab + d * d - lbc * lbc) / (2 * lab * d), -1, 1), sinA = Math.sqrt(1 - cosA * cosA);
  const pv = RV[5].subVectors(pole, pa); pv.addScaledVector(t, -pv.dot(t));
  if (pv.lengthSq() < 1e-8) pv.set(0, -1, 0).addScaledVector(t, -t.y);
  pv.normalize();
  const nb = RV[6].copy(pa).addScaledVector(t, lab * cosA).addScaledVector(pv, lab * sinA);
  // swing the upper bone so the middle joint lands on nb
  RQ[2].setFromUnitVectors(RV[7].subVectors(pb, pa).normalize(), RV[8].subVectors(nb, pa).normalize());
  rotWorld(a, RQ[2]);
  // then the middle bone so the end lands on the target
  const pb2 = b.getWorldPosition(RV[1]), pc2 = c.getWorldPosition(RV[2]);
  const end = RV[9].copy(pa).addScaledVector(t, d);
  RQ[2].setFromUnitVectors(RV[7].subVectors(pc2, pb2).normalize(), RV[8].subVectors(end, pb2).normalize());
  rotWorld(b, RQ[2]);
}
// a world rotation that maps a local (dir, side) pair onto a world (dir, side) pair
function frameQuat(out, ld, ls, wd, ws) {
  const lz = RV[10].copy(ld).normalize(), lx = RV[11].copy(ls).addScaledVector(lz, -ls.dot(lz)).normalize();
  RM.makeBasis(lx, RV[12].crossVectors(lz, lx), lz);
  const wz = RV[10].copy(wd).normalize(), wx = RV[11].copy(ws).addScaledVector(wz, -ws.dot(wz)).normalize();
  RM2.makeBasis(wx, RV[12].crossVectors(wz, wx), wz);
  RM2.multiply(RM.transpose());
  return out.setFromRotationMatrix(RM2);
}

const FINGERS = ["Index", "Middle", "Ring", "Pinky"];
function makeRig(root, holder) {
  const B = {};
  for (const n of ["Hips", "Spine", "Spine1", "Spine2", "Neck", "Head", "HeadTop_End", "LeftShoulder", "LeftArm", "LeftForeArm", "LeftHand", "RightShoulder", "RightArm", "RightForeArm", "RightHand",
    "LeftUpLeg", "LeftLeg", "LeftFoot", "LeftToeBase", "RightUpLeg", "RightLeg", "RightFoot", "RightToeBase", "LeftHandMiddle1", "RightHandMiddle1", "LeftHandThumb1", "RightHandThumb1"]) B[n] = findBone(root, n);
  if (!B.Hips || !B.RightHand || !B.LeftHand || !B.RightUpLeg) return null;
  if (!B.Spine2) B.Spine2 = B.Spine1 || B.Spine; // some rigs have only two spine bones
  // some characters carry the head on its own little chain (Spine2_1 > Neck_1 > Neck1 > Head): use the bone right above the head as the neck
  if (B.Head && B.Head.parent && B.Head.parent.isBone && B.Head.parent !== B.Neck) B.Neck = B.Head.parent;
  // measure the bind (T) pose once: body axes, hand axes, finger curl axes
  holder.updateMatrixWorld(true);
  bindPose(root);
  const W = (b) => b.getWorldPosition(new THREE.Vector3());
  const hq = holder.getWorldQuaternion(new THREE.Quaternion()), hqi = hq.clone().invert();
  const up = W(B.Head).sub(W(B.Hips)).normalize(), right = W(B.RightArm).sub(W(B.LeftArm)).normalize();
  const fwd = new THREE.Vector3().crossVectors(up, right).normalize(); right.crossVectors(fwd, up).normalize();
  const rig = {
    B, root, holder,
    F0: fwd.clone().applyQuaternion(hqi), U0: up.clone().applyQuaternion(hqi), R0: right.clone().applyQuaternion(hqi),
    rest: new Map(), hand: {}, fingers: { L: [], R: [] },
    hipsH: W(B.Hips).y - W(root).y, armLen: W(B.RightArm).distanceTo(W(B.RightForeArm)) + W(B.RightForeArm).distanceTo(W(B.RightHand)),
    headR: Math.max(0.09, W(B.Head).distanceTo(W(B.HeadTop_End || B.Head)) * 0.55),
    shoulderW: W(B.LeftArm).distanceTo(W(B.RightArm)),
    ck: 0, pk: 0, sk: 0, ak: 0, rk: 0, lean: 0, breath: 0, bank: 0, lookY: 0, lookP: 0, handToGun: null, legYaw: 0, ffk: 0, pak: 0, vk: 0, airK: 0, crawl: 0, flinch: 0, flinchAx: new THREE.Vector3(), fallS: 0, deadDir: 1,
    gunPos: new THREE.Vector3(), gunQ: new THREE.Quaternion(), gunInit: false, gunDrop: null
  };
  // characters that already wear a helmet and vest in their textures get a different fit for our gear
  let baked = false, op = false; root.traverse((o) => { if (o.isMesh && /Soldier_head|Soldier_body|Ch15/.test(o.name + (o.parent ? o.parent.name : ""))) baked = true; if (o.isMesh && /^Op_/.test(o.name)) op = true; });
  // the operator already wears a plate carrier and a helmet with night vision: no extra vest or helmet on top
  rig.kit = op ? { noVest: true, noHelm: true } : baked ? { noVest: true, helmR: 0.14, helmY: 0.092, helmZ: 0.005 } : {};
  for (const side of ["Left", "Right"]) {
    const h = B[side + "Hand"], hwq = h.getWorldQuaternion(new THREE.Quaternion()).invert();
    const fingersW = W(B[side + "HandMiddle1"] || h).sub(W(h)).normalize();
    // T-pose: fingers point out along the arm, thumbs point forward, palms face down
    rig.hand[side] = { dir: fingersW.clone().applyQuaternion(hwq), side: fwd.clone().applyQuaternion(hwq), palm: W(B[side + "HandMiddle1"] || h).distanceTo(W(h)) * 0.72 };
    const curlAxisW = new THREE.Vector3().crossVectors(fingersW, up.clone().negate()).normalize();
    for (const f of FINGERS) for (let i = 1; i <= 3; i++) {
      const b = findBone(root, side + "Hand" + f + i); if (!b) continue;
      const bq = b.getWorldQuaternion(new THREE.Quaternion()).invert();
      rig.fingers[side[0]].push({ b, rest: b.quaternion.clone(), ax: curlAxisW.clone().applyQuaternion(bq).normalize(), f, i });
    }
    for (let i = 1; i <= 3; i++) {
      const b = findBone(root, side + "HandThumb" + i); if (!b) continue;
      const bq = b.getWorldQuaternion(new THREE.Quaternion()).invert();
      const ax = new THREE.Vector3().crossVectors(fwd, up.clone().negate()).normalize().applyQuaternion(bq);
      rig.fingers[side[0]].push({ b, rest: b.quaternion.clone(), ax, f: "Thumb", i });
    }
  }
  rig.bones = []; root.traverse((o) => { if (o.isBone) rig.bones.push([o, o.position.clone(), o.quaternion.clone()]); });
  // feet: how the sole sits relative to the body in the bind pose
  for (const s of ["Left", "Right"]) rig.hand[s + "Foot"] = { q: B[s + "Foot"].getWorldQuaternion(new THREE.Quaternion()).premultiply(hqi) };
  rig.bind = { spine2: W(B.Spine2).applyMatrix4(new THREE.Matrix4().copy(holder.matrixWorld).invert()), head: W(B.Head).applyMatrix4(new THREE.Matrix4().copy(holder.matrixWorld).invert()) };
  return rig;
}

// call before mixer.update: puts every bone back to its last animated pose (the mixer only rewrites values that
// changed, so this keeps static tracks right and stops the procedural edits from piling up frame after frame)
function rigPre(rig) { if (rig.snapped) for (const [b, p, q] of rig.bones) { b.position.copy(p); b.quaternion.copy(q); } }
function rigSnap(rig) { for (const r of rig.bones) { r[1].copy(r[0].position); r[2].copy(r[0].quaternion); } rig.snapped = true; }

// attach gear (helmet, vest, backpack) to bones so it moves with the body
function attachToBone(rig, boneName, obj, anchorLocalToHolder) {
  const bone = rig.B[boneName]; if (!bone) return;
  const holder = rig.holder; holder.updateMatrixWorld(true);
  const wrap = new THREE.Group();
  const bwq = bone.getWorldQuaternion(new THREE.Quaternion()), bws = bone.getWorldScale(new THREE.Vector3());
  const hq = holder.getWorldQuaternion(new THREE.Quaternion());
  const F = rig.F0.clone().applyQuaternion(hq), U = rig.U0.clone().applyQuaternion(hq), L = rig.R0.clone().applyQuaternion(hq).negate();
  const want = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(L, U, F));
  wrap.quaternion.copy(bwq.invert().multiply(want));
  wrap.scale.set(1 / bws.x, 1 / bws.y, 1 / bws.z);
  const p = anchorLocalToHolder.clone().applyMatrix4(holder.matrixWorld);
  wrap.position.copy(bone.worldToLocal(p));
  wrap.add(obj); bone.add(wrap);
  return wrap;
}

// st: { ph, stance, moving, sprint, speed, moveAng, aimPitch, aiming, firedAt, hitAt, reloadP, wclass, lean, alive, deadT, driver, now }
function rigUpdate(rig, st, dt, gun) {
  const { B, root, holder } = rig;
  rigSnap(rig);
  const k = (v, to, s) => smooth(v, to, s, dt);
  const ground = st.ph === "ground" && !st.veh;
  rig.ck = k(rig.ck, ground && st.stance === "crouch" ? 1 : 0, 9);
  rig.pk = k(rig.pk, ground && st.stance === "prone" ? 1 : 0, 6);
  rig.sk = k(rig.sk, ground && st.sprint && !st.aiming && st.stance === "stand" ? 1 : 0, 8);
  rig.ak = k(rig.ak, st.aiming || st.now - st.firedAt < 1.2 ? 1 : 0, st.aiming ? 14 : 6);
  rig.lean = k(rig.lean, ground && st.stance !== "prone" ? st.lean : 0, 10);
  rig.ffk = k(rig.ffk, st.ph === "air" && st.freefall ? 1 : 0, 3);
  rig.pak = k(rig.pak, st.ph === "para" ? 1 : 0, 4);
  rig.vk = k(rig.vk, st.veh ? 1 : 0, 10);
  rig.airK = k(rig.airK, st.ph === "ground" && st.airborne && !st.veh ? 1 : 0, 10);
  rig.flinch = Math.max(0, rig.flinch - dt * 5);
  if (st.hitAt && st.now - st.hitAt < 0.05 && rig.flinch < 0.3) { rig.flinch = 1; rig.flinchAx.set(Math.random() - 0.5, 0, Math.random() - 0.5).normalize(); }

  holder.updateWorldMatrix(true, false);
  const hq = holder.getWorldQuaternion(RQ[3]);
  const F = rig.F0.clone().applyQuaternion(hq), U = rig.U0.clone().applyQuaternion(hq), R = rig.R0.clone().applyQuaternion(hq);
  const qa = new THREE.Quaternion();

  // ---------- dead: knees give way, then the body falls and stays down ----------
  if (!st.alive) return rigDeath(rig, st, dt, gun, F, U, R);
  rig.fallS = 0; root.position.set(0, 0, 0); root.quaternion.copy(rig.baseQ || (rig.baseQ = root.quaternion.clone()));
  if (rig.gunDrop) { rig.gunDrop = null; }

  // ---------- whole-body placement: prone and freefall lie the body flat ----------
  const flat = Math.max(rig.pk, rig.ffk * 0.92);
  if (flat > 0.001) {
    const hipsLift = rig.hipsH, ang = -flat * Math.PI / 2; // tip forward around the body's right axis: head goes forwards, chest down
    root.quaternion.premultiply(RQ[2].setFromAxisAngle(rig.R0, ang));
    // pivot around the hips so the body stays over its spot
    const piv = RV[13].set(0, hipsLift, 0);
    root.position.copy(piv).sub(piv.clone().applyAxisAngle(rig.R0, ang));
    root.position.y += -hipsLift * flat + (0.16 + rig.ffk * 0.0) * flat;
  }
  root.position.y -= rig.vk * rig.hipsH * 0.47;
  

  // ---------- legs ----------
  const hipsW = B.Hips.getWorldPosition(new THREE.Vector3());
  // strafing / backpedal: twist the hips toward the way we are moving, the chest keeps facing the aim
  let legTo = 0;
  if (ground && st.moving && st.stance !== "prone") { let a = st.moveAng; if (Math.abs(a) > 1.9) a = a > 0 ? a - Math.PI : a + Math.PI; legTo = clamp(a, -1.2, 1.2) * 0.75; }
  rig.legYaw = k(rig.legYaw, legTo, 8);
  if (Math.abs(rig.legYaw) > 0.01) { rotWorld(B.Hips, qa.setFromAxisAngle(U, rig.legYaw)); rotWorld(B.Spine, qa.setFromAxisAngle(U, -rig.legYaw)); }

  if (rig.vk > 0.02) { // sitting: thighs forward, shins down, feet on the floor
    for (const [s, sg] of [["Left", -1], ["Right", 1]]) {
      const hp = B[s + "UpLeg"].getWorldPosition(new THREE.Vector3());
      const tgt = hp.clone().addScaledVector(F, 0.5).addScaledVector(U, -rig.hipsH * 0.47 + 0.08).addScaledVector(R, sg * 0.06);
      const ft = B[s + "Foot"].getWorldPosition(new THREE.Vector3()).lerp(tgt, rig.vk);
      ik2(B[s + "UpLeg"], B[s + "Leg"], B[s + "Foot"], ft, hp.clone().addScaledVector(F, 1).addScaledVector(U, 0.3), 1);
    }
  } else if (rig.pk > 0.02 || rig.ffk > 0.02) { // prone: legs back along the ground; crawling pulls one knee up at a time
    rig.crawl += dt * (st.moving && rig.pk > 0.5 ? 5 : 0);
    for (const [s, sg] of [["Left", -1], ["Right", 1]]) {
      const hp = B[s + "UpLeg"].getWorldPosition(new THREE.Vector3());
      const ph = Math.sin(rig.crawl + (sg > 0 ? 0 : Math.PI)), pull = st.moving ? Math.max(0, ph) : 0;
      const tgt = hp.clone().addScaledVector(F, -0.82 + pull * 0.35).addScaledVector(R, sg * (0.16 + pull * 0.16 + rig.ffk * 0.12)).addScaledVector(U, rig.ffk * 0.12);
      if (rig.pk > 0.5) tgt.y = Math.min(tgt.y, hipsW.y - 0.02);
      const ft = B[s + "Foot"].getWorldPosition(new THREE.Vector3()).lerp(tgt, Math.max(rig.pk, rig.ffk));
      ik2(B[s + "UpLeg"], B[s + "Leg"], B[s + "Foot"], ft, hp.clone().addScaledVector(R, sg * 0.6).addScaledVector(U, rig.ffk > 0.5 ? 0.4 : -0.3), 1);
    }
  } else if (st.mocapReload) { // kneeling reload clip drives the legs
  } else if (rig.ck > 0.01 || rig.airK > 0.01) { // crouch: drop the hips and bend the knees to keep the feet planted
    const feet = ["Left", "Right"].map((s) => [s, B[s + "Foot"].getWorldPosition(new THREE.Vector3()), B[s + "Foot"].getWorldQuaternion(new THREE.Quaternion())]);
    const drop = rig.ck * rig.hipsH * 0.4;
    root.position.y -= drop; root.position.addScaledVector(rig.F0, -rig.ck * 0.04);
    
    for (const [s, p, q] of feet) {
      const t = p.clone(); t.y += rig.airK * 0.22; t.addScaledVector(R, (s === "Left" ? -1 : 1) * rig.ck * 0.05);
      const hp = B[s + "UpLeg"].getWorldPosition(new THREE.Vector3());
      ik2(B[s + "UpLeg"], B[s + "Leg"], B[s + "Foot"], t, hp.clone().addScaledVector(F, 1).addScaledVector(R, (s === "Left" ? -1 : 1) * 0.25), 1);
      setWorldQuat(B[s + "Foot"], q);
    }
  }

  // feet find the floor: on stairs, kerbs and slopes each foot stands on its own step
  if (st.ground && rig.pk < 0.05 && rig.ffk < 0.05 && rig.vk < 0.05 && !st.airborne && st.ph === "ground" && !st.mocapReload) {
    const fl = B.LeftFoot.getWorldPosition(new THREE.Vector3()), fr = B.RightFoot.getWorldPosition(new THREE.Vector3());
    const gl = clamp(st.ground(fl.x, fl.z) - st.baseZ, -0.5, 0.5), gr = clamp(st.ground(fr.x, fr.z) - st.baseZ, -0.5, 0.5);
    if (Math.abs(gl) > 0.03 || Math.abs(gr) > 0.03) {
      const ql = B.LeftFoot.getWorldQuaternion(new THREE.Quaternion()), qr = B.RightFoot.getWorldQuaternion(new THREE.Quaternion());
      const shift = Math.min(0, gl, gr);
      root.position.y += shift; 
      for (const [s, f, g, q] of [["Left", fl, gl, ql], ["Right", fr, gr, qr]]) {
        const hp = B[s + "UpLeg"].getWorldPosition(new THREE.Vector3());
        ik2(B[s + "UpLeg"], B[s + "Leg"], B[s + "Foot"], f.clone().setY(f.y + g), hp.clone().addScaledVector(F, 1), 1); setWorldQuat(B[s + "Foot"], q);
      }
    }
  }
  // lean into turns when running (like a real body fighting momentum)
  const bankTo = st.ph === "ground" && st.moving && rig.pk < 0.5 ? clamp(-(st.yawRate || 0) * (st.speed || 0) * 0.018, -0.28, 0.28) : 0;
  rig.bank = k(rig.bank, bankTo, 6);
  if (Math.abs(rig.bank) > 0.005) rotWorld(B.Hips, qa.setFromAxisAngle(F, rig.bank));
  // breathing: heavier after running
  rig.breath = clamp(rig.breath + dt * (st.moving && rig.sk > 0.5 ? 0.18 : -0.06), 0, 1);
  rig.bt = (rig.bt || Math.random() * 6) + dt * (1.3 + rig.breath * 1.6);
  const br = Math.sin(rig.bt * 2) * (0.012 + rig.breath * 0.03) * (st.moving ? 0.4 : 1);
  if (B.Spine1) rotWorld(B.Spine1, qa.setFromAxisAngle(R, br));
  // ---------- upper body: aim pitch, lean, crouch hunch, flinch ----------
  const pitch = clamp(st.aimPitch || 0, -1.2, 1.2);
  const spines = [B.Spine, B.Spine1, B.Spine2];
  const pr = rig.pk > 0.5 ? 0.42 * rig.pk : 0; // in prone, lift the chest a little to look forward
  for (const b of spines) {
    if (!b) continue;
    let ang = -pitch * 0.22 * (1 - rig.sk) + rig.ck * 0.07 + pr / 3 + rig.sk * 0.06;
    if (rig.ffk > 0.01) ang += -0.25 * rig.ffk / 3;
    rotWorld(b, qa.setFromAxisAngle(R, ang));
    if (Math.abs(rig.lean) > 0.001) rotWorld(b, qa.setFromAxisAngle(F, rig.lean * 0.16));
    // rifle stance: blade the chest a little to the right when shouldering
    if (st.wclass !== "none" && st.wclass !== "pistol") rotWorld(b, qa.setFromAxisAngle(U, -0.06 * rig.ak * (1 - rig.pk)));
    if (rig.flinch > 0) rotWorld(b, qa.setFromAxisAngle(rig.flinchAx, rig.flinch * rig.flinch * 0.12));
  }
  if (B.Neck) rotWorld(B.Neck, qa.setFromAxisAngle(R, -pitch * 0.18 + (rig.pk > 0.5 ? 0.45 * rig.pk : 0) - rig.ffk * 0.3));
  if (B.Head) rotWorld(B.Head, qa.setFromAxisAngle(R, -pitch * 0.15 - rig.lean * 0));
  if (B.Head && (st.lookAt || Math.abs(rig.lookY) > 0.01)) {
    let ty = 0, tp = 0;
    if (st.lookAt) {
      const hp = B.Head.getWorldPosition(new THREE.Vector3()), d = new THREE.Vector3(st.lookAt[0] - hp.x, st.lookAt[1] - hp.y, st.lookAt[2] - hp.z);
      const fwd = d.dot(F), side = d.dot(R); ty = clamp(Math.atan2(-side, Math.max(0.01, fwd)), -1.1, 1.1); tp = clamp(Math.atan2(d.dot(U), Math.hypot(fwd, side)), -0.6, 0.6);
      if (fwd < -0.3) ty = 0;
    }
    rig.lookY = k(rig.lookY, ty, 5); rig.lookP = k(rig.lookP, tp, 5);
    rotWorld(B.Head, qa.setFromAxisAngle(U, rig.lookY * 0.8)); rotWorld(B.Head, qa.setFromAxisAngle(R, rig.lookP * 0.5));
  }

  // ---------- arms ----------
  const rArm = B.RightArm.getWorldPosition(new THREE.Vector3()), lArm = B.LeftArm.getWorldPosition(new THREE.Vector3());
  if (gun && (rig.pak > 0.02 || rig.ffk > 0.02 || (st.veh && st.driver))) gun.visible = false;
  if (rig.pak > 0.02) armsUp(rig, F, U, R, rArm, lArm);
  else if (rig.ffk > 0.02) armsSpread(rig, F, U, R, rArm, lArm);
  else if (st.veh && st.driver) {
    for (const [s, sg, sh] of [["Right", 1, rArm], ["Left", -1, lArm]]) {
      const c = sh.clone().addScaledVector(R, -sg * rig.shoulderW * 0.5).addScaledVector(F, rig.armLen * 0.72).addScaledVector(U, -0.22);
      const t = c.clone().addScaledVector(R, sg * 0.17);
      ik2(B[s + "Arm"], B[s + "ForeArm"], B[s + "Hand"], t, sh.clone().addScaledVector(U, -0.6).addScaledVector(R, sg * 0.4), 1);
      handPose(rig, s, F, U.clone().multiplyScalar(-1).addScaledVector(R, -sg * 0.3), 0.9);
    }
  } else if (gun && st.mocapReload && rig.handToGun) {
    gun.visible = true; B.RightHand.updateWorldMatrix(true, false);
    const hw = B.RightHand.matrixWorld.clone().multiply(rig.handToGun);
    RM2.copy(rig.holder.matrixWorld).invert().multiply(hw); RM2.decompose(gun.position, gun.quaternion, gun.scale); gun.updateMatrixWorld(true);
    rig.gunInit = false;
  } else if (gun && st.wclass === "pan") holdPan(rig, st, F, U, R, rArm, gun, dt);
  else if (gun && st.wclass !== "none") holdWeapon(rig, st, F, U, R, rArm, lArm, gun, dt, pitch);
  else if (gun) gun.visible = false;
}

function armsUp(rig, F, U, R, rArm, lArm) {
  const { B } = rig, w = Math.max(rig.pak, rig.ffk);
  for (const [s, sg, sh] of [["Right", 1, rArm], ["Left", -1, lArm]]) {
    const t = sh.clone().addScaledVector(U, rig.armLen * 0.8).addScaledVector(R, sg * 0.12).addScaledVector(F, 0.08);
    ik2(B[s + "Arm"], B[s + "ForeArm"], B[s + "Hand"], t, sh.clone().addScaledVector(R, sg * 1).addScaledVector(F, -0.2), w);
    handPose(rig, s, U, F.clone().negate(), 1.1 * w);
  }
}
function armsSpread(rig, F, U, R, rArm, lArm) {
  const { B } = rig, w = rig.ffk;
  for (const [s, sg, sh] of [["Right", 1, rArm], ["Left", -1, lArm]]) {
    const t = sh.clone().addScaledVector(R, sg * rig.armLen * 0.75).addScaledVector(F, rig.armLen * 0.45).addScaledVector(U, 0.18);
    ik2(B[s + "Arm"], B[s + "ForeArm"], B[s + "Hand"], t, sh.clone().addScaledVector(U, 1).addScaledVector(F, -0.5), w);
    handPose(rig, s, R.clone().multiplyScalar(sg).addScaledVector(F, 0.6), F, 0.2 * w);
  }
}
// curl the fingers: amt 0 = open hand, 1 = fist around a grip
function curl(rig, side, amt, trigger) {
  for (const f of rig.fingers[side[0]]) {
    let a = amt * (f.f === "Thumb" ? 0.45 : f.i === 1 ? 1.15 : 1.0);
    if (trigger && f.f === "Index") a *= 0.55;
    f.b.quaternion.copy(f.rest).multiply(RQ[5].setFromAxisAngle(f.ax, a));
  }
}
function handPose(rig, side, fingersDir, thumbDir, curlAmt, trigger) {
  const h = rig.hand[side], bone = rig.B[side + "Hand"];
  frameQuat(RQ[4], h.dir, h.side, fingersDir, thumbDir);
  setWorldQuat(bone, RQ[4]);
  curl(rig, side, curlAmt, trigger);
}

// put the palm (not the wrist bone) on a point, with the hand oriented by (fingersDir, thumbDir)
function palmTo(rig, side, point, pole, fingersDir, thumbDir, curlAmt, trigger, w = 1) {
  const B = rig.B, h = rig.hand[side];
  frameQuat(RQ[4], h.dir, h.side, fingersDir, thumbDir);
  const fd = RV[13].copy(h.dir).applyQuaternion(RQ[4]).normalize();
  const wrist = point.clone().addScaledVector(fd, -h.palm);
  ik2(B[side + "Arm"], B[side + "ForeArm"], B[side + "Hand"], wrist, pole, w);
  if (w >= 0.999) handPose(rig, side, fingersDir, thumbDir, curlAmt, trigger);
  else { curl(rig, side, curlAmt * w, trigger); }
}
function holdWeapon(rig, st, F, U, R, rArm, lArm, gun, dt, pitch) {
  const { B } = rig; gun.visible = true;
  const G = gun.userData, now = st.now;
  const pistol = st.wclass === "pistol";
  // the barrel direction for each carry: aimed, low ready, and sprint (across the chest)
  const aimDir = F.clone().applyAxisAngle(R, -pitch);
  const readyDir = F.clone().applyAxisAngle(R, -pitch * 0.6 - 0.42).applyAxisAngle(U, 0.16);
  const sprintDir = F.clone().multiplyScalar(0.5).addScaledVector(R, -0.62).addScaledVector(U, 0.58).normalize();
  const ak = rig.ak * (1 - rig.sk), sk = rig.sk, rk = Math.max(0, 1 - ak - sk);
  const dir = new THREE.Vector3().addScaledVector(aimDir, ak + 1e-4).addScaledVector(readyDir, rk).addScaledVector(sprintDir, sk).normalize();
  // where the gun's origin (stock butt / back of a pistol) sits
  const pocket = rArm.clone().addScaledVector(R, -rig.shoulderW * 0.2).addScaledVector(F, 0.07);
  const pos = new THREE.Vector3();
  if (pistol) {
    const chest = rArm.clone().lerp(lArm, 0.5);
    const out = chest.clone().addScaledVector(U, -0.03).addScaledVector(aimDir, rig.armLen * 0.86);
    const low = chest.clone().addScaledVector(U, -0.3).addScaledVector(F, rig.armLen * 0.55).addScaledVector(R, 0.04);
    pos.copy(low).lerp(out, ak);
    dir.copy(readyDir).lerp(aimDir, ak).normalize();
  } else {
    pos.copy(pocket).addScaledVector(U, -0.03).multiplyScalar(ak);
    pos.addScaledVector(pocket.clone().addScaledVector(U, -0.1).addScaledVector(R, 0.03), rk);
    pos.addScaledVector(rArm.clone().addScaledVector(U, -0.42).addScaledVector(F, 0.16).addScaledVector(R, 0.02), sk);
    if (rig.pk > 0.5) pos.copy(pocket).addScaledVector(U, -0.02);
  }
  // recoil kick and a little breathing sway
  const since = now - st.firedAt, kick = since >= 0 && since < 0.25 ? Math.exp(-since * 22) * (G.kick || 0.05) : 0;
  pos.addScaledVector(dir, -kick);
  dir.applyAxisAngle(R, kick * 1.6).normalize();
  dir.applyAxisAngle(U, -clamp((st.yawRate || 0) * 0.025, -0.14, 0.14) * (1 - ak * 0.7)).normalize();
  const sway = (1 - ak * 0.8) * 0.006;
  pos.addScaledVector(U, Math.sin(now * 1.7) * sway).addScaledVector(R, Math.sin(now * 1.1) * sway);
  // reload: tilt the gun in and drop it a little
  let rp = st.reloadP;
  if (rp >= 0) { const s = Math.sin(Math.PI * clamp(rp, 0, 1)); dir.applyAxisAngle(F, 0).applyAxisAngle(R, -0.35 * s).normalize(); pos.addScaledVector(U, -0.05 * s); }
  // gun up vector, rolled for the lean and the reload
  const gup = U.clone().addScaledVector(dir, -U.dot(dir)).normalize();
  gup.applyAxisAngle(dir, rig.lean * 0.25 + (rp >= 0 ? 0.6 * Math.sin(Math.PI * clamp(rp, 0, 1)) : 0) + sk * -0.9);
  const qn = new THREE.Quaternion().setFromRotationMatrix(RM.makeBasis(new THREE.Vector3().crossVectors(gup, dir), gup, dir));
  // smooth the gun a touch so carries blend, but keep it locked while aiming
  if (!rig.gunInit) { rig.gunPos.copy(pos); rig.gunQ.copy(qn); rig.gunInit = true; }
  const s = 1 - Math.exp(-dt * (ak > 0.5 ? 40 : 18));
  rig.gunPos.lerp(pos, s); rig.gunQ.slerp(qn, s);
  // place the gun (it is a child of the holder)
  RM.compose(rig.gunPos, rig.gunQ, RV[13].set(1, 1, 1));
  RM2.copy(rig.holder.matrixWorld).invert().multiply(RM);
  RM2.decompose(gun.position, gun.quaternion, gun.scale);
  gun.updateMatrixWorld(true);
  // hands onto the gun
  const grip = gun.localToWorld(G.grip.clone());
  let fore = gun.localToWorld(G.fore.clone());
  if (rp >= 0) { // left hand: to the magazine, down to the vest for a fresh one, back
    const mag = gun.localToWorld(G.mag.clone()), pouch = rArm.clone().lerp(lArm, 0.7).addScaledVector(U, -0.3).addScaledVector(F, 0.15);
    const p = clamp(rp, 0, 1);
    fore = p < 0.25 ? fore.lerp(mag, p / 0.25) : p < 0.5 ? mag.clone().lerp(pouch, (p - 0.25) / 0.25) : p < 0.75 ? pouch.clone().lerp(mag, (p - 0.5) / 0.25) : mag.clone().lerp(fore, (p - 0.75) / 0.25);
  }
  const gR = new THREE.Vector3(1, 0, 0).applyQuaternion(rig.gunQ).negate(); // gun's right side
  const gF = dir, gU = gup;
  palmTo(rig, "Right", grip, rArm.clone().addScaledVector(R, 0.5).addScaledVector(U, -0.7).addScaledVector(F, -0.25 * (1 - rig.pk)),
    gF.clone().multiplyScalar(0.55).addScaledVector(gU, -0.8).addScaledVector(gR, -0.15), gF.clone().addScaledVector(gU, 0.5), 0.95, true);
  B.RightHand.updateWorldMatrix(true, false);
  rig.handToGun = (rig.handToGun || new THREE.Matrix4()).copy(B.RightHand.matrixWorld).invert().multiply(gun.matrixWorld);
  if (pistol) {
    const lt = grip.clone().addScaledVector(gR, -0.03).addScaledVector(gU, -0.01);
    palmTo(rig, "Left", lt, lArm.clone().addScaledVector(R, -0.4).addScaledVector(U, -0.8),
      gF.clone().multiplyScalar(0.4).addScaledVector(gU, -0.8).addScaledVector(gR, 0.4), gF.clone().addScaledVector(gU, 0.3), 0.85);
  } else {
    const lp = lArm.clone().addScaledVector(R, -0.12).addScaledVector(U, -0.9).addScaledVector(F, 0.3);
    if (rp >= 0 && rp < 0.95) palmTo(rig, "Left", fore, lp, gU.clone().multiplyScalar(-1).addScaledVector(gF, 0.3), gF.clone(), 0.6);
    else palmTo(rig, "Left", fore.addScaledVector(gU, -0.035), lp, gF.clone().multiplyScalar(0.55).addScaledVector(gR, 0.75).addScaledVector(gU, 0.15), gF.clone().addScaledVector(gU, 0.4), 0.8);
  }
}

function holdPan(rig, st, F, U, R, rArm, gun, dt) {
  gun.visible = true;
  const since = st.now - st.firedAt, sw = since >= 0 && since < 0.45 ? since / 0.45 : -1;
  // rest: pan held low at the right side; swing: from up and back on the right, across to the front left
  let hand = rArm.clone().addScaledVector(U, -0.45).addScaledVector(F, 0.22).addScaledVector(R, 0.12), dir = F.clone().addScaledVector(U, 0.4).normalize();
  if (sw >= 0) {
    const a = sw < 0.35 ? sw / 0.35 : 1 - (sw - 0.35) / 0.65, ease = Math.sin(a * Math.PI / 2);
    const back = rArm.clone().addScaledVector(U, 0.12).addScaledVector(R, 0.25).addScaledVector(F, -0.1), front = rArm.clone().addScaledVector(U, -0.1).addScaledVector(F, 0.5).addScaledVector(R, -0.3);
    const t = sw < 0.35 ? 0 : 1 - ease;
    hand = sw < 0.35 ? hand.clone().lerp(back, ease) : back.clone().lerp(front, Math.min(1, (sw - 0.35) / 0.25)).lerp(hand, Math.max(0, (sw - 0.6) / 0.4));
    dir = sw < 0.35 ? U.clone().addScaledVector(R, 0.3).normalize() : F.clone().addScaledVector(R, -0.6 * (1 - t)).addScaledVector(U, 0.2).normalize();
  }
  const gup = R.clone().negate().addScaledVector(dir, R.dot(dir)).normalize();
  const q = new THREE.Quaternion().setFromRotationMatrix(RM.makeBasis(new THREE.Vector3().crossVectors(gup, dir), gup, dir));
  const pos = hand.clone().addScaledVector(dir, -gun.userData.grip.z);
  RM.compose(pos, q, RV[13].set(1, 1, 1)); RM2.copy(rig.holder.matrixWorld).invert().multiply(RM); RM2.decompose(gun.position, gun.quaternion, gun.scale); gun.updateMatrixWorld(true);
  palmTo(rig, "Right", gun.localToWorld(gun.userData.grip.clone()), rArm.clone().addScaledVector(R, 0.6).addScaledVector(U, -0.5), dir, gup.clone().negate().addScaledVector(U, 0.2), 1.0);
}
function rigDeath(rig, st, dt, gun, F, U, R) {
  const { B, root, holder } = rig, t = st.deadT;
  if (rig.fallS === 0) { rig.deadDir = st.deadDir || (Math.random() < 0.5 ? 1 : -1); rig.baseQ = rig.baseQ || root.quaternion.clone(); }
  // fall angle: the body pivots on the feet, speeding up like it really drops, with a small bounce
  const tf = clamp((t - 0.18) / 0.62, 0, 1), fall = tf * tf, bounce = tf >= 1 ? Math.exp(-(t - 0.8) * 9) * Math.sin((t - 0.8) * 28) * 0.05 : 0;
  rig.fallS = Math.min(1, fall + bounce);
  const buck = clamp(t / 0.25, 0, 1) * (1 - fall * 0.8); // knees buckle first
  const ang = rig.fallS * Math.PI / 2 * 0.97 * rig.deadDir;
  root.quaternion.copy(rig.baseQ).premultiply(new THREE.Quaternion().setFromAxisAngle(rig.R0, ang));
  root.position.set(0, 0, 0).addScaledVector(rig.U0, -buck * 0.35 + rig.fallS * 0.12).addScaledVector(rig.F0, -rig.deadDir * rig.fallS * 0.25);
  holder.updateWorldMatrix(true, false);
  // legs: the knees fold as the body drops, then lie straight out along the ground
  const hipsP = B.Hips.getWorldPosition(new THREE.Vector3()), chestP = B.Spine2.getWorldPosition(new THREE.Vector3());
  const legDir = hipsP.clone().sub(chestP).normalize();
  for (const [s, sg] of [["Left", -1], ["Right", 1]]) {
    const hp = B[s + "UpLeg"].getWorldPosition(new THREE.Vector3());
    const ft = B[s + "Foot"].getWorldPosition(new THREE.Vector3());
    const legLen = hp.distanceTo(B[s + "Leg"].getWorldPosition(new THREE.Vector3())) + B[s + "Leg"].getWorldPosition(new THREE.Vector3()).distanceTo(ft);
    const lie = hp.clone().addScaledVector(legDir, legLen * 0.96).addScaledVector(R, sg * (0.1 + (sg * rig.deadDir > 0 ? 0.08 : 0))); lie.y = Math.min(lie.y, 0.1);
    const tgt = ft.clone().lerp(hp, buck * 0.35).lerp(lie, rig.fallS * rig.fallS);
    ik2(B[s + "UpLeg"], B[s + "Leg"], B[s + "Foot"], tgt, hp.clone().addScaledVector(F, rig.deadDir).addScaledVector(U, rig.fallS).addScaledVector(R, sg * 0.3), Math.max(buck, rig.fallS));
  }
  // limp arms flung out by the fall
  for (const [s, sg] of [["Left", -1], ["Right", 1]]) {
    const sh = B[s + "Arm"].getWorldPosition(new THREE.Vector3());
    const t2 = sh.clone().addScaledVector(R, sg * rig.armLen * 0.75).addScaledVector(U, -0.2).addScaledVector(F, rig.deadDir * -0.3);
    t2.y = Math.max(0.06, Math.min(t2.y, sh.y));
    ik2(B[s + "Arm"], B[s + "ForeArm"], B[s + "Hand"], t2, sh.clone().addScaledVector(U, -1), rig.fallS);
    curl(rig, s, 0.4);
  }
  if (B.Head) rotWorld(B.Head, RQ[5].setFromAxisAngle(R, -rig.deadDir * 0.25 * rig.fallS));
  // the weapon slips out of the hands and lands beside the body
  if (gun) {
    if (!rig.gunDrop) { gun.updateMatrixWorld(true); rig.gunDrop = { p: gun.position.clone(), q: gun.quaternion.clone(), v: 0, side: Math.random() < 0.5 ? -1 : 1 }; }
    const g = rig.gunDrop; g.v += dt * 9.8; g.p.y = Math.max(0.05, g.p.y - g.v * dt); if (g.p.y > 0.05) g.p.x += g.side * dt * 0.25;
    gun.position.copy(g.p);
    const flatQ = RQ[5].setFromEuler(new THREE.Euler(0, g.side * 0.6, Math.PI / 2 * g.side));
    gun.quaternion.slerp(flatQ, 1 - Math.exp(-dt * 5));
  }
}

// ---------------- held weapons: proper rifles, built once per type and shared ----------------
const GUN_MAT = {
  metal: new THREE.MeshStandardMaterial({ color: 0x2a2b2d, roughness: 0.42, metalness: 0.75 }),
  poly: new THREE.MeshStandardMaterial({ color: 0x1b1c1e, roughness: 0.78, metalness: 0.05 }),
  wood: new THREE.MeshStandardMaterial({ color: 0x6a4325, roughness: 0.7, metalness: 0 }),
  tan: new THREE.MeshStandardMaterial({ color: 0x8f7a58, roughness: 0.8, metalness: 0.05 }),
  glass: new THREE.MeshStandardMaterial({ color: 0x223344, roughness: 0.1, metalness: 0.9 })
};
const GUN_CACHE = {};
function gunPart(list, mat, geo, x, y, z, rx = 0, ry = 0, rz = 0) {
  geo.rotateX(rx); geo.rotateY(ry); geo.rotateZ(rz); geo.translate(x, y, z);
  (list[mat] = list[mat] || []).push(geo.index ? geo.toNonIndexed() : geo);
}
const gBox = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const gCyl = (r, l, n = 10) => new THREE.CylinderGeometry(r, r, l, n).rotateX(Math.PI / 2); // along Z
// all weapons: +Z = muzzle direction, +Y = up, origin at the shoulder end of the stock
function buildGunGeo(type) {
  const L = {}; let grip, fore, mag, kick = 0.05, muzzle, rail = null;
  if (type === "pan") {
    // a cast-iron frying pan: the handle is the "grip", +Z runs from the handle to the pan
    gunPart(L, "metal", new THREE.CylinderGeometry(0.15, 0.13, 0.04, 20), 0, 0, 0.36);
    gunPart(L, "poly", new THREE.CylinderGeometry(0.135, 0.135, 0.005, 20), 0, 0.019, 0.36);
    gunPart(L, "wood", gCyl(0.017, 0.22), 0, 0.01, 0.1);
    gunPart(L, "metal", gBox(0.03, 0.02, 0.06), 0, 0.01, 0.22);
    grip = new THREE.Vector3(0, 0.01, 0.08); fore = grip.clone(); mag = grip.clone(); kick = 0; muzzle = new THREE.Vector3(0, 0, 0.5);
  } else if (type === "pistol") {
    gunPart(L, "metal", gBox(0.032, 0.035, 0.19), 0, 0.07, 0.095);
    gunPart(L, "poly", gBox(0.03, 0.03, 0.14), 0, 0.04, 0.085);
    gunPart(L, "poly", gBox(0.03, 0.11, 0.045), 0, -0.01, 0.02, -0.28);
    gunPart(L, "metal", gCyl(0.007, 0.02), 0, 0.075, 0.195);
    gunPart(L, "metal", gBox(0.006, 0.012, 0.01), 0, 0.092, 0.18);
    gunPart(L, "poly", gBox(0.006, 0.02, 0.03), 0, 0.015, 0.06);
    grip = new THREE.Vector3(0, 0.0, 0.03); fore = grip.clone(); mag = new THREE.Vector3(0, -0.06, 0.01); kick = 0.03; muzzle = new THREE.Vector3(0, 0.07, 0.2);
  } else {
    const smg = type === "smg", sg = type === "shotgun", sr = type === "sniper", dmr = type === "dmr", lmg = type === "lmg";
    const len = sr ? 1.12 : sg ? 0.98 : smg ? 0.62 : dmr ? 1.02 : lmg ? 1.0 : 0.86;
    const stockL = smg ? 0.16 : 0.24, recvL = smg ? 0.2 : 0.26;
    const z0 = stockL, z1 = z0 + recvL;
    // stock
    if (sr || sg) {
      gunPart(L, "wood", gBox(0.04, 0.09, stockL + 0.06), 0, 0.02, stockL / 2);
      gunPart(L, "wood", gBox(0.038, 0.05, 0.12), 0, -0.04, z0 + 0.02, 0.5);
    } else {
      gunPart(L, "poly", gBox(0.035, 0.1, 0.03), 0, 0.03, 0.015);           // butt plate
      gunPart(L, "poly", gBox(0.03, 0.035, stockL), 0, 0.06, stockL / 2);   // top of stock
      gunPart(L, "poly", gBox(0.025, 0.025, stockL * 0.9), 0, 0.0, stockL / 2, 0.22);
      gunPart(L, "metal", gCyl(0.012, stockL * 0.6), 0, 0.045, stockL * 0.75); // buffer tube
    }
    // receiver
    gunPart(L, "metal", gBox(0.05, 0.07, recvL), 0, 0.06, z0 + recvL / 2);
    gunPart(L, "metal", gBox(0.046, 0.03, recvL * 0.95), 0, 0.105, z0 + recvL / 2);
    gunPart(L, "metal", gBox(0.012, 0.022, 0.05), 0.027, 0.07, z0 + recvL * 0.55); // ejection port
    // rail
    for (let i = 0; i < 7; i++) gunPart(L, "metal", gBox(0.024, 0.008, 0.012), 0, 0.124, z0 + 0.02 + i * (recvL * 0.9 / 7));
    // pistol grip and trigger guard
    gunPart(L, sr || sg ? "wood" : "poly", gBox(0.032, 0.11, 0.045), 0, -0.02, z0 + 0.03, -0.32);
    gunPart(L, "metal", gBox(0.006, 0.006, 0.07), 0, 0.012, z0 + 0.08);
    gunPart(L, "metal", gBox(0.004, 0.022, 0.006), 0, 0.022, z0 + 0.075);
    // magazine
    if (lmg) {
      gunPart(L, "poly", gBox(0.09, 0.12, 0.1), 0.0, -0.02, z0 + recvL * 0.6);           // box magazine
      gunPart(L, "metal", gBox(0.03, 0.03, 0.12), 0, 0.15, z0 + recvL * 0.6);            // carry handle
      for (const sx of [-1, 1]) gunPart(L, "metal", gCyl(0.006, 0.2).rotateX(Math.PI / 2).rotateZ(sx * 0.35), sx * 0.03, -0.03, len - 0.3); // bipod legs
    } else if (!sg) {
      const ml = sr ? 0.08 : smg ? 0.17 : dmr ? 0.12 : 0.2;
      gunPart(L, "poly", gBox(0.03, ml, 0.06), 0, 0.03 - ml / 2, z0 + recvL * 0.72, sr || dmr ? 0 : 0.18);
    } else gunPart(L, "metal", gCyl(0.016, 0.5), 0, 0.03, z1 + 0.22); // tube under the barrel
    // handguard
    const hgL = len - z1 - (sr ? 0.32 : sg ? 0.28 : smg ? 0.1 : dmr ? 0.3 : lmg ? 0.3 : 0.22);
    if (sr || sg) gunPart(L, "wood", gBox(0.048, 0.055, hgL), 0, 0.05, z1 + hgL / 2);
    else if (dmr) gunPart(L, "tan", gBox(0.05, 0.06, hgL), 0, 0.065, z1 + hgL / 2);
    else {
      gunPart(L, "poly", gCyl(0.03, hgL, 8), 0, 0.075, z1 + hgL / 2);
      for (let i = 0; i < 4; i++) gunPart(L, "metal", gBox(0.064, 0.008, 0.012), 0, 0.075, z1 + 0.03 + i * hgL / 4);
    }
    // barrel, front sight, muzzle
    const bl = len - z1;
    gunPart(L, "metal", gCyl(sg ? 0.014 : lmg ? 0.015 : 0.011, bl), 0, 0.075, z1 + bl / 2);
    gunPart(L, "metal", gCyl(sg ? 0.018 : 0.016, 0.06), 0, 0.075, len - 0.02);
    if (!sr) gunPart(L, "metal", gBox(0.008, 0.035, 0.012), 0, 0.105, z1 + hgL - 0.01);
    // optic
    if (sr) {
      gunPart(L, "metal", gCyl(0.02, 0.32), 0, 0.165, z0 + recvL * 0.5);
      gunPart(L, "metal", gCyl(0.027, 0.06), 0, 0.165, z0 + recvL * 0.5 + 0.17);
      gunPart(L, "metal", gCyl(0.024, 0.05), 0, 0.165, z0 + recvL * 0.5 - 0.16);
      gunPart(L, "glass", gCyl(0.022, 0.005), 0, 0.165, z0 + recvL * 0.5 + 0.2);
      gunPart(L, "metal", gBox(0.012, 0.03, 0.02), 0, 0.14, z0 + recvL * 0.3);
      gunPart(L, "metal", gBox(0.012, 0.03, 0.02), 0, 0.14, z0 + recvL * 0.75);
      gunPart(L, "metal", gBox(0.03, 0.006, 0.006), 0.03, 0.06, z0 + recvL * 0.6); // bolt handle
    } else if (!sg && !dmr && !lmg) {
      gunPart(L, "metal", gBox(0.03, 0.035, 0.05), 0, 0.145, z0 + recvL * 0.55); // red dot housing
      gunPart(L, "glass", gBox(0.024, 0.024, 0.004), 0, 0.15, z0 + recvL * 0.55 + 0.026);
      gunPart(L, "metal", gBox(0.012, 0.025, 0.012), 0, 0.14, z0 + 0.012);
    }
    if (sg) gunPart(L, "wood", gBox(0.05, 0.05, 0.14), 0, 0.04, z1 + 0.24); // pump
    grip = new THREE.Vector3(0, -0.02, z0 + 0.025);
    fore = new THREE.Vector3(0, 0.035, sg ? z1 + 0.2 : z1 + Math.min(hgL * 0.4, 0.09));
    mag = new THREE.Vector3(0, -0.05, z0 + recvL * 0.72);
    kick = sr ? 0.09 : sg ? 0.1 : smg ? 0.035 : dmr ? 0.07 : lmg ? 0.045 : 0.05;
    muzzle = new THREE.Vector3(0, 0.075, len);
    rail = new THREE.Vector3(0, 0.15, z0 + recvL * 0.5);
  }
  const meshes = Object.entries(L).map(([m, gs]) => [mergeGeometries(gs), m]);
  return { meshes, grip, fore, mag, kick, muzzle, rail };
}
function makeHeldGun(type, tintColor) {
  const c = GUN_CACHE[type] || (GUN_CACHE[type] = buildGunGeo(type));
  const g = new THREE.Group();
  for (const [geo, m] of c.meshes) {
    let mat = GUN_MAT[m];
    if (tintColor != null && (m === "poly" || m === "tan")) { mat = g.userData.tintMat || (g.userData.tintMat = mat.clone()); mat.color.set(tintColor); }
    const mesh = new THREE.Mesh(geo, mat); mesh.castShadow = true; g.add(mesh);
  }
  Object.assign(g.userData, { grip: c.grip, fore: c.fore, mag: c.mag, kick: c.kick, muzzle: c.muzzle, rail: c.rail, type });
  return g;
}
// scopes, suppressors, grips and long mags shown on the weapon in your hands
const ATT_GEO = {};
function attGeo(k) {
  if (ATT_GEO[k]) return ATT_GEO[k];
  const L = {};
  if (k === "s2" || k === "s4" || k === "s8") {
    const len = k === "s2" ? 0.15 : k === "s4" ? 0.21 : 0.28, r = k === "s2" ? 0.018 : k === "s4" ? 0.021 : 0.025;
    gunPart(L, "metal", gCyl(r, len), 0, 0.03, 0); gunPart(L, "metal", gCyl(r * 1.35, 0.05), 0, 0.03, len / 2); gunPart(L, "metal", gCyl(r * 1.2, 0.04), 0, 0.03, -len / 2 + 0.02);
    gunPart(L, "glass", gCyl(r * 1.25, 0.004), 0, 0.03, len / 2 + 0.026); gunPart(L, "metal", gBox(0.014, 0.03, 0.03), 0, 0.0, len * 0.25); gunPart(L, "metal", gBox(0.014, 0.03, 0.03), 0, 0.0, -len * 0.25);
  } else if (k === "sp") gunPart(L, "poly", gCyl(0.022, 0.19), 0, 0, 0.095);
  else if (k === "cp") { gunPart(L, "metal", gCyl(0.017, 0.07), 0, 0, 0.035); gunPart(L, "poly", gBox(0.026, 0.005, 0.03), 0, 0.017, 0.04); }
  else if (k === "gr") gunPart(L, "poly", gBox(0.03, 0.09, 0.035), 0, -0.045, 0);
  else if (k === "xm") gunPart(L, "poly", gBox(0.032, 0.12, 0.062), 0, -0.06, 0, 0.15);
  return (ATT_GEO[k] = Object.entries(L).map(([m, gs]) => [mergeGeometries(gs), m]));
}
function fitAttachments(gun, att) {
  const key = att ? [att.s, att.m, att.x, att.g].join(",") : "";
  if (gun.userData.attKey === key) return; gun.userData.attKey = key;
  if (gun.userData.attG) gun.remove(gun.userData.attG);
  const G = new THREE.Group(); gun.userData.attG = G; gun.add(G);
  if (!att) return;
  const U = gun.userData, put = (k, pos) => { for (const [geo, m] of attGeo(k)) { const mesh = new THREE.Mesh(geo, GUN_MAT[m]); mesh.position.copy(pos); mesh.castShadow = true; G.add(mesh); } };
  if (att.s && att.s !== "rd" && U.rail) put(att.s, U.rail.clone().add(new THREE.Vector3(0, 0.02, 0)));
  if (att.m && U.muzzle) put(att.m, U.muzzle);
  if (att.g && U.fore) put("gr", U.fore.clone().add(new THREE.Vector3(0, 0.0, 0.08)));
  if (att.x && U.mag) put("xm", U.mag.clone().add(new THREE.Vector3(0, 0.02, 0)));
}
const WCLASS = ["pistol", "smg", "rifle", "shotgun", "sniper", "dmr", "lmg", "pan"];

// ---------------- wearable gear ----------------
const GEAR_MAT = {
  helm: [null, new THREE.MeshStandardMaterial({ color: 0x5d6448, roughness: 0.8 }), new THREE.MeshStandardMaterial({ color: 0x3f4a33, roughness: 0.6, metalness: 0.1 }), new THREE.MeshStandardMaterial({ color: 0x2b2f2a, roughness: 0.45, metalness: 0.25 })],
  vest: [null, new THREE.MeshStandardMaterial({ color: 0x7d7f63, roughness: 0.9 }), new THREE.MeshStandardMaterial({ color: 0x3e4f63, roughness: 0.85 }), new THREE.MeshStandardMaterial({ color: 0x22262b, roughness: 0.8 })],
  strap: new THREE.MeshStandardMaterial({ color: 0x232319, roughness: 0.95 }),
  pack: [null, new THREE.MeshStandardMaterial({ color: 0x6b5d3e, roughness: 0.95 }), new THREE.MeshStandardMaterial({ color: 0x4d5a3a, roughness: 0.9 }), new THREE.MeshStandardMaterial({ color: 0x2f3a2e, roughness: 0.9 })]
};
function mergeByMaterial(g) {
  g.updateMatrixWorld(true);
  const byMat = new Map();
  g.traverse((o) => { if (!o.isMesh) return; const geo = o.geometry.clone().applyMatrix4(o.matrixWorld); const gg = geo.index ? geo.toNonIndexed() : geo; for (const k of Object.keys(gg.attributes)) if (!["position", "normal", "uv"].includes(k)) gg.deleteAttribute(k); if (!gg.attributes.uv) gg.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(gg.attributes.position.count * 2), 2)); (byMat.get(o.material) || byMat.set(o.material, []).get(o.material)).push(gg); });
  const out = new THREE.Group();
  for (const [m, list] of byMat) { const mesh = new THREE.Mesh(mergeGeometries(list), m); mesh.castShadow = true; out.add(mesh); }
  return out;
}
const GEAR_CACHE = {};
function gearMesh(key, make) { const c = GEAR_CACHE[key] || (GEAR_CACHE[key] = mergeByMaterial(make())); return c.clone(); }
function makeHelmet(lv, r) {
  const g = new THREE.Group(), m = GEAR_MAT.helm[lv];
  const shell = new THREE.Mesh(new THREE.SphereGeometry(r, 18, 10, 0, TAU, 0, Math.PI * (lv === 1 ? 0.48 : 0.56)), m);
  shell.scale.set(1.0, 0.92, 1.1); g.add(shell);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(r * 1.0, r * 0.07, 6, 24), m); rim.rotation.x = Math.PI / 2; rim.scale.set(1, 1.1, 1); rim.position.y = r * (lv === 1 ? 0.05 : -0.16); g.add(rim);
  if (lv === 3) { const visor = new THREE.Mesh(new THREE.BoxGeometry(r * 1.2, r * 0.25, r * 0.12), GUN_MAT.metal); visor.position.set(0, r * 0.55, r * 1.0); g.add(visor); }
  if (lv >= 2) for (const s of [-1, 1]) { const rail = new THREE.Mesh(new THREE.BoxGeometry(r * 0.1, r * 0.3, r * 0.7), GEAR_MAT.strap); rail.position.set(s * r * 1.0, r * 0.05, 0); g.add(rail); }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}
function makeVest(lv, w) {
  const g = new THREE.Group(), m = GEAR_MAT.vest[lv];
  const front = new THREE.Mesh(new THREE.BoxGeometry(w * 0.86, w * 0.95, 0.06), m); front.position.set(0, 0, w * 0.34); g.add(front);
  const back = new THREE.Mesh(new THREE.BoxGeometry(w * 0.86, w * 1.0, 0.06), m); back.position.set(0, 0.02, -w * 0.33); g.add(back);
  for (const s of [-1, 1]) {
    const side = new THREE.Mesh(new THREE.BoxGeometry(0.05, w * 0.6, w * 0.62), m); side.position.set(s * w * 0.43, -w * 0.15, 0); g.add(side);
    const strap = new THREE.Mesh(new THREE.BoxGeometry(w * 0.16, 0.03, w * 0.7), GEAR_MAT.strap); strap.position.set(s * w * 0.26, w * 0.5, 0); g.add(strap);
  }
  const np = lv + 1;
  for (let i = 0; i < np; i++) { const p = new THREE.Mesh(new THREE.BoxGeometry(w * 0.2, w * 0.24, 0.06), GEAR_MAT.strap); p.position.set((i - (np - 1) / 2) * w * 0.23, -w * 0.28, w * 0.39); g.add(p); }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}
function makePack(lv, w) {
  const g = new THREE.Group(), m = GEAR_MAT.pack[lv], h = w * (0.7 + lv * 0.18), d = w * (0.28 + lv * 0.06);
  const body = new THREE.Mesh(new THREE.BoxGeometry(w * 0.7, h, d), m); body.position.set(0, -h * 0.2, -d / 2); g.add(body);
  const top = new THREE.Mesh(new THREE.CylinderGeometry(d * 0.5, d * 0.5, w * 0.7, 10).rotateZ(Math.PI / 2), m); top.position.set(0, h * 0.3, -d / 2); g.add(top);
  const pocket = new THREE.Mesh(new THREE.BoxGeometry(w * 0.5, h * 0.4, d * 0.4), m); pocket.position.set(0, -h * 0.4, -d - d * 0.18); g.add(pocket);
  if (lv === 3) { const roll = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, w * 0.75, 10).rotateZ(Math.PI / 2), GEAR_MAT.strap); roll.position.set(0, -h * 0.75, -d / 2); g.add(roll); }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}
// put on / swap / take off gear for a character visual
function dressGear(v, helm, vest, pack, panBack) {
  const rig = v.rig; if (!rig) return;
  rig.gear = rig.gear || {};
  const want = { helm, vest, pack, panb: panBack ? 1 : 0 };
  for (const k of ["helm", "vest", "pack", "panb"]) {
    const lv = want[k] | 0;
    if ((rig.gear[k + "Lv"] | 0) === lv) continue;
    if (rig.gear[k]) { rig.gear[k].parent.remove(rig.gear[k]); rig.gear[k] = null; }
    rig.gear[k + "Lv"] = lv;
    if (!lv) continue;
    // attach in the bind pose so offsets are measured on a straight body
    const b = rig.bind;
    const K = rig.kit || {};
    if (k === "helm" && !K.noHelm) rig.gear.helm = withBindPose(rig, () => attachToBone(rig, "Head", gearMesh("h" + lv + ":" + (K.helmR || rig.headR * 1.12).toFixed(3), () => makeHelmet(lv, K.helmR || rig.headR * 1.12)), b.head.clone().add(new THREE.Vector3(0, K.helmY || rig.headR * 0.95, K.helmZ !== undefined ? K.helmZ : rig.headR * 0.1))));
    if (k === "vest" && !K.noVest) rig.gear.vest = withBindPose(rig, () => attachToBone(rig, "Spine2", gearMesh("v" + lv + ":" + rig.shoulderW.toFixed(3), () => makeVest(lv, rig.shoulderW * 0.82)), b.spine2.clone().add(new THREE.Vector3(0, -0.02, 0.02))));
    if (k === "panb") { const pg = makeHeldGun("pan"); pg.rotation.set(Math.PI / 2 + 0.2, 0, Math.PI); pg.position.set(0, 0.28, -rig.shoulderW * (want.pack ? 0.75 : 0.42)); const w = new THREE.Group(); w.add(pg); rig.gear.panb = withBindPose(rig, () => attachToBone(rig, "Spine2", w, b.spine2.clone())); }
    if (k === "pack") rig.gear.pack = withBindPose(rig, () => attachToBone(rig, "Spine2", gearMesh("p" + lv + ":" + rig.shoulderW.toFixed(3), () => makePack(lv, rig.shoulderW * 0.8)), b.spine2.clone().add(new THREE.Vector3(0, 0.0, -rig.shoulderW * 0.3))));
  }
}
function withBindPose(rig, fn) {
  const saved = [];
  rig.root.traverse((o) => { if (o.isBone) saved.push([o, o.position.clone(), o.quaternion.clone(), o.scale.clone()]); });
  const rq = rig.root.quaternion.clone(), rp = rig.root.position.clone();
  rig.root.quaternion.copy(rig.baseQ || rq); rig.root.position.set(0, 0, 0);
  const hp = rig.holder.position.clone(), hq = rig.holder.quaternion.clone();
  rig.holder.updateMatrixWorld(true);
  bindPose(rig.root);
  const r = fn();
  for (const [o, p, q, s] of saved) { o.position.copy(p); o.quaternion.copy(q); o.scale.copy(s); }
  rig.root.quaternion.copy(rq); rig.root.position.copy(rp);
  rig.holder.position.copy(hp); rig.holder.quaternion.copy(hq);
  rig.holder.updateMatrixWorld(true);
  return r;
}

// ================= items: gear, healing, boosters, attachments, throwables, the bag =================
// Everything a battle-royale soldier carries. Designed and named for this game.
const HEAL = {
  b: { n: "ضماد", w: 2, t: 4, max: 75, add: 10 },
  f: { n: "إسعافات أولية", w: 10, t: 6, max: 75, set: 75 },
  m: { n: "حقيبة طبية", w: 20, t: 8, max: 100, set: 100 },
  d: { n: "مشروب طاقة", w: 4, t: 4, boost: 40 },
  p: { n: "مسكّن", w: 10, t: 6, boost: 60 },
  x: { n: "حقنة أدرينالين", w: 20, t: 8, boost: 100 }
};
const HEAL_ORDER = ["b", "f", "m", "d", "p", "x"];
const THROW = { g: { n: "قنبلة", w: 12, fuse: 4.2 }, s: { n: "دخانية", w: 10, fuse: 2.0 }, o: { n: "مولوتوف", w: 18, fuse: 0 }, z: { n: "صاعقة", w: 10, fuse: 2.3 } };
const THR_ORDER = ["g", "s", "o", "z"];
const ATT = {
  rd: { n: "ريد دوت", slot: "s", zoom: 1.3, lv: 1 }, s2: { n: "سكوب 2x", slot: "s", zoom: 2, lv: 2 }, s4: { n: "سكوب 4x", slot: "s", zoom: 4, lv: 3 }, s8: { n: "سكوب 8x", slot: "s", zoom: 8, lv: 4 },
  cp: { n: "معوّض ارتداد", slot: "m", lv: 1 }, sp: { n: "كاتم صوت", slot: "m", lv: 2 }, xm: { n: "مخزن موسّع", slot: "x", lv: 1 }, gr: { n: "قبضة أمامية", slot: "g", lv: 1 }
};
// which attachments fit each weapon (index into WEAP)
const ATT_OK = {
  0: ["rd", "sp", "xm"], 1: ["rd", "s2", "cp", "sp", "xm", "gr"], 2: ["rd", "s2", "s4", "s8", "cp", "sp", "xm", "gr"], 3: ["rd"],
  4: ["s2", "s4", "s8", "sp", "xm"], 5: ["rd", "s2", "s4", "s8", "cp", "sp", "xm"], 6: ["rd", "s2", "s4", "cp", "gr"], 7: []
};
const AMMO_W = { l: 0.4, h: 0.5, s: 1.25 };
const HELM = [0, 0.3, 0.4, 0.55];        // head damage soaked by helmet level
const PACK_CAP = [0, 150, 200, 250];     // extra capacity per backpack level
const GEAR_N = { hm: "خوذة", v: "درع", bp: "شنطة" };

function unlimited(e) { return MAP && MAP.kind === "arena"; }
function bagCap(e) { return 60 + PACK_CAP[e.pack | 0] + (e.armor ? 50 : 0); }
function bagUsed(e) {
  let w = 0;
  for (const t in AMMO_W) w += (e.ammo[t] || 0) * AMMO_W[t];
  for (const k in HEAL) w += (e.heals[k] || 0) * HEAL[k].w;
  for (const k in THROW) w += ((e.thr && e.thr[k]) || 0) * THROW[k].w;
  for (const k in (e.spare || {})) w += (e.spare[k] || 0) * 5;
  return w;
}
function bagRoom(e) { return unlimited(e) ? 1e9 : bagCap(e) - bagUsed(e); }
function ensureKit(e) {
  if (!e.heals || e.heals.f === undefined) e.heals = Object.assign({ b: 0, f: 0, m: 0, d: 0, p: 0, x: 0 }, e.heals || {});
  if (!e.thr) e.thr = { g: 0, s: 0, o: 0, z: 0 };
  if (!e.spare) e.spare = {};
  if (!e.att) e.att = [{}, {}, {}];
  if (!e.fm) e.fm = ["auto", "auto", "auto"];
  if (e.boost === undefined) e.boost = 0;
  if (!e.thrSel) e.thrSel = "g";
  if (e.w.length < 3) { e.w[2] = -1; e.mag[2] = 0; }
  return e;
}

// ---------- attachments ----------
function attachable(wi, id) { return wi >= 0 && (ATT_OK[wi] || []).includes(id); }
function attOf(e, slot) { return (e.att && e.att[slot]) || {}; }
function attachTo(e, slot, id) {
  const a = e.att[slot], s = ATT[id].slot, old = a[s];
  if (old) e.spare[old] = (e.spare[old] || 0) + 1;
  a[s] = id;
  if (s === "x") e.mag[slot] = Math.min(e.mag[slot], magOf(e, e.w[slot]));
}
// put an attachment where it does the most good; returns false when it only fits in the bag
function autoAttach(e, id) {
  const order = [e.cur, 1 - e.cur].filter((s) => s >= 0 && s < 2);
  for (const s of order) {
    const wi = e.w[s]; if (!attachable(wi, id)) continue;
    const cur = e.att[s][ATT[id].slot];
    if (!cur || (ATT[cur].lv || 0) < (ATT[id].lv || 0) && ATT[id].slot !== "m") { attachTo(e, s, id); return true; }
  }
  return false;
}
// a new weapon in a slot: move the old attachments to the bag, then fit what we carry
function refitSlot(e, slot) {
  const a = e.att[slot];
  for (const k in a) { const id = a[k]; if (id && !attachable(e.w[slot], id)) { e.spare[id] = (e.spare[id] || 0) + 1; delete a[k]; } }
  for (const id of Object.keys(e.spare)) {
    if (!(e.spare[id] > 0) || !attachable(e.w[slot], id)) continue;
    const cur = a[ATT[id].slot];
    if (!cur || (ATT[cur].lv || 0) < (ATT[id].lv || 0) && ATT[id].slot !== "m") { e.spare[id]--; attachTo(e, slot, id); }
  }
}
function attMods(e, slot) {
  const a = attOf(e, slot);
  return { rec: (a.m === "cp" ? 0.62 : a.m === "sp" ? 0.9 : 1) * (a.g ? 0.75 : 1), spr: (a.g ? 0.82 : 1) * (a.m === "cp" ? 0.92 : 1), quiet: a.m === "sp", ext: !!a.x };
}
// how far the current sight zooms (1 = iron sights)
function sightZoom(e) {
  const wi = e.w[e.cur]; if (wi < 0) return 1;
  const s = attOf(e, e.cur).s;
  if (s) return ATT[s].zoom;
  return wi === 4 ? 4 : 1; // the bolt rifle comes with its own scope
}

// ---------- healing and boost ----------
function useHeal(e, kind) {
  ensureKit(e);
  const H = HEAL[kind];
  if (!H || !e.alive || e.knocked || e.reviving || e.ph !== "ground" || e.healT > 0 || !(e.heals[kind] > 0)) return false;
  if (H.max && e.hp >= H.max) { if (e === me) hint(H.max === 75 ? H.n + " يعالج لين ٧٥ بس. استخدم الحقيبة الطبية" : "صحتك كاملة"); return false; }
  if (H.boost && e.boost >= 100) { if (e === me) hint("البوست مليان"); return false; }
  e.reloadT = 0; e.healKind = kind; e.healT = H.t; e.healTot = H.t;
  if (e === me) { closeMenus(); tone(520, 0.08, "sine", 0.04); }
  return true;
}
function finishUse(e) {
  const k = e.healKind, H = HEAL[k]; if (!H) { e.healKind = null; return; }
  e.heals[k]--;
  if (H.boost) e.boost = Math.min(100, (e.boost || 0) + H.boost);
  else if (H.add) e.hp = Math.min(H.max, e.hp + H.add);
  else e.hp = Math.max(e.hp, H.set);
  e.healKind = null;
  if (e === me) { tone(660, 0.12, "sine", 0.06); tone(990, 0.12, "sine", 0.05); updateHud(); }
}
// boost drains slowly and heals you while it lasts; above 60 you also move a little faster
function boostTick(e, dt) {
  if (!(e.boost > 0) || !e.alive) return;
  e.boost = Math.max(0, e.boost - dt * 0.55);
  const rate = e.boost >= 90 ? 1.0 : e.boost >= 60 ? 0.75 : e.boost >= 20 ? 0.5 : 0.25;
  if (e.hp < 100) e.hp = Math.min(100, e.hp + rate * dt);
}
function boostSpeed(e) { return e.boost >= 60 ? 1.06 : 1; }
function bestHeal(e) {
  ensureKit(e);
  if (e.hp < 75) for (const k of ["f", "b", "m"]) if (e.heals[k] > 0) return k;
  if (e.hp < 100 && e.heals.m > 0) return "m";
  for (const k of ["d", "p", "x"]) if (e.heals[k] > 0 && e.boost < 100) return k;
  return null;
}

// ---------- pan: melee, and it stops bullets on your back ----------
function meleeSwing(e) {
  if (!e.alive || e.ph !== "ground" || e.fireT > 0 || e.veh) return;
  e.fireT = WEAP[7].rate; e.shotT = 2; e.swingAt = performance.now() / 1000; if (e === me && typeof vm !== "undefined") vm.kick = 1.4;
  tone(260, 0.08, "triangle", 0.04, -120);
  setTimeout(() => {
    if (!e.alive) return;
    let best = null, bd = 2.2;
    for (const t of ents) {
      if (t === e || !t.alive || t.ph !== "ground" || (MAP.kind === "arena" && t.team === e.team)) continue;
      const d = Math.hypot(t.x - e.x, t.y - e.y); if (d > bd || Math.abs((t.z || 0) - (e.z || 0)) > 1.3) continue;
      let da = Math.atan2(t.y - e.y, t.x - e.x) - e.a; da = Math.atan2(Math.sin(da), Math.cos(da));
      if (Math.abs(da) < 0.8) { bd = d; best = t; }
    }
    if (best) { dealHit(e, best, WEAP[7].dmg, 7, false); tone(900, 0.15, "square", 0.06, -500); if (e === me) { hitMarker(); dmgNum(best, WEAP[7].dmg, false, !best.alive); } }
  }, 180);
}
// bullets from behind ring off a pan carried on the back
function panBlocks(src, target, wi, head) {
  if (!target.pan || target.cur === 2 || !src || head || wi < 0 || wi === 7) return false;
  const dx = src.x - target.x, dy = src.y - target.y, l = Math.hypot(dx, dy) || 1;
  const dot = (Math.cos(target.a) * dx + Math.sin(target.a) * dy) / l;
  if (dot > -0.55 || Math.random() > 0.85) return false;
  tone(1700, 0.12, "triangle", 0.05, -900); puff(new THREE.Vector3(target.x - Math.cos(target.a) * 0.25, (target.z || 0) + 1.25, target.y - Math.sin(target.a) * 0.25), 0xffe7a0, 0.3, 0.15);
  return true;
}

// ---------- throwables ----------
const projs = [], smokes = [], fires = [];
const PROJ_MAT = { g: new THREE.MeshStandardMaterial({ color: 0x48552f, roughness: 0.6, metalness: 0.2 }), s: new THREE.MeshStandardMaterial({ color: 0x8a8d86, roughness: 0.6, metalness: 0.3 }), o: new THREE.MeshStandardMaterial({ color: 0x5b8a3a, roughness: 0.1, metalness: 0.1, transparent: true, opacity: 0.85 }), z: new THREE.MeshStandardMaterial({ color: 0x2b2d30, roughness: 0.5, metalness: 0.4 }) };
function projMesh(k) {
  const g = new THREE.Group();
  if (k === "g") { g.add(new THREE.Mesh(new THREE.SphereGeometry(0.055, 10, 8), PROJ_MAT.g)); const lv = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.07, 0.02), GUN_MAT.metal); lv.position.set(0.03, 0.05, 0); g.add(lv); }
  else if (k === "o") { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.16, 10), PROJ_MAT.o); g.add(b); const n = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.02, 0.07, 8), PROJ_MAT.o); n.position.y = 0.11; g.add(n); const r = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.06, 6), new THREE.MeshBasicMaterial({ color: 0xffa040 })); r.position.y = 0.17; g.add(r); }
  else { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.14, 10), PROJ_MAT[k]); g.add(c); const t = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.03, 8), GUN_MAT.metal); t.position.y = 0.085; g.add(t); }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}
function throwItem(e, k, vel) {
  ensureKit(e);
  if (!THROW[k] || !(e.thr[k] > 0) || !e.alive || e.ph !== "ground" || e.veh || e.healT > 0 || (e.throwT || 0) > 0) return false;
  e.thr[k]--; e.throwT = 0.9; e.shotT = 2;
  const m = projMesh(k), p = new THREE.Vector3(e.x + Math.cos(e.a) * 0.35, (e.z || 0) + (e.stance === "prone" ? 0.4 : e.stance === "crouch" ? 1.1 : 1.6), e.y + Math.sin(e.a) * 0.35);
  m.position.copy(p); scene.add(m);
  projs.push({ k, m, p, v: vel, t: 0, fuse: THROW[k].fuse, owner: e, rest: 0, spin: new THREE.Vector3(Math.random() * 8, Math.random() * 8, Math.random() * 8) });
  if (online) netThrow(k, p, vel);
  if (e === me) { tone(380, 0.06, "triangle", 0.04, 200); updateHud(); }
  return true;
}
// aim the throw: you throw where you look; bots lob it onto a spot
function playerThrow() {
  const k = me.thrSel; if (!(me.thr[k] > 0)) { const any = THR_ORDER.find((q) => me.thr[q] > 0); if (!any) { hint("ما عندك شي ترميه"); return; } me.thrSel = any; }
  camera.getWorldDirection(tmpV);
  const v = tmpV.clone().multiplyScalar(me.stance === "prone" ? 11 : 17); v.y += 3.2;
  throwItem(me, me.thrSel, v);
}
function lobVelocity(from, to, T = 1.25) {
  const v = new THREE.Vector3((to.x - from.x) / T, 0, (to.z - from.z) / T);
  v.y = (to.y - from.y + 0.5 * 9.8 * T * T) / T;
  return v;
}
function stepProjs(dt) {
  for (let i = projs.length - 1; i >= 0; i--) {
    const q = projs[i]; q.t += dt;
    if (q.rest < 1) {
      q.v.y -= 9.8 * dt;
      const nx = q.p.x + q.v.x * dt, ny = q.p.y + q.v.y * dt, nz = q.p.z + q.v.z * dt;
      let hit = false;
      if (solidAt(nx, q.p.z, q.p.y)) { q.v.x *= -0.4; hit = true; } else q.p.x = nx;
      if (solidAt(q.p.x, nz, q.p.y)) { q.v.z *= -0.4; hit = true; } else q.p.z = nz;
      const g = groundAt(q.p.x, q.p.z, q.p.y + 0.3) + 0.05;
      if (ny < g) { q.p.y = g; if (q.v.y < -1.5) hit = true; q.v.y = -q.v.y * 0.32; q.v.x *= 0.62; q.v.z *= 0.62; if (Math.hypot(q.v.x, q.v.y, q.v.z) < 0.6) q.rest = 1; }
      else q.p.y = ny;
      if (hit && q.k === "o") { detonate(q); projs.splice(i, 1); continue; }
      if (hit && q.t > 0.1) tone(1200 + Math.random() * 300, 0.03, "triangle", 0.015 * clamp(1 - q.p.distanceTo(camera.position) / 30, 0, 1));
      q.m.rotation.x += q.spin.x * dt * (1 - q.rest); q.m.rotation.z += q.spin.z * dt * (1 - q.rest);
    }
    q.m.position.copy(q.p);
    if (q.k !== "o" && q.t >= q.fuse) { detonate(q); projs.splice(i, 1); }
    else if (q.k === "o" && q.t > 6) { detonate(q); projs.splice(i, 1); }
  }
  for (let i = smokes.length - 1; i >= 0; i--) {
    const s = smokes[i]; s.t += dt;
    const grow = clamp(s.t / 3, 0.15, 1), fade = clamp((s.life - s.t) / 4, 0, 1);
    for (const sp of s.sprites) { sp.material.opacity = 0.82 * fade; sp.scale.setScalar(sp.userData.sz * grow); sp.position.y = sp.userData.y + Math.sin(s.t * 0.3 + sp.userData.ph) * 0.3; }
    s.r = 6.2 * grow;
    if (s.t > s.life) { for (const sp of s.sprites) world.remove(sp); smokes.splice(i, 1); }
  }
  for (let i = fires.length - 1; i >= 0; i--) {
    const f = fires[i]; f.t += dt;
    const k = clamp((f.life - f.t) / 2, 0, 1);
    for (const sp of f.sprites) { sp.material.opacity = (0.6 + Math.random() * 0.4) * k; sp.scale.setScalar(sp.userData.sz * (0.8 + Math.random() * 0.4)); }
    f.light.intensity = (6 + Math.random() * 4) * k;
    f.acc += dt;
    if (f.acc >= 0.5 && !f.remote) {
      f.acc = 0;
      for (const e of ents) {
        if (!e.alive || e.ph !== "ground") continue;
        if (Math.hypot(e.x - f.x, e.y - f.y) < f.r && Math.abs((e.z || 0) - f.z) < 1.6) dealHit(f.owner && f.owner.alive !== undefined ? f.owner : null, e, 6, -6, false);
      }
    }
    if (f.t > f.life) { for (const sp of f.sprites) world.remove(sp); world.remove(f.light); fires.splice(i, 1); }
  }
  if (flashFx > 0) { flashFx = Math.max(0, flashFx - dt * 0.4); const el = $("flashFx"); el.style.opacity = Math.min(1, flashFx).toFixed(3); el.hidden = flashFx <= 0; }
  for (const e of ents) { if (e.throwT > 0) e.throwT -= dt; if (e.stunT > 0) e.stunT -= dt; }
}
let flashFx = 0;
function detonate(q) {
  scene.remove(q.m);
  const p = q.p, src = q.owner, dm = Math.hypot(p.x - me.x, p.z - me.y);
  const fx = !q.remote;
  if (q.k === "g") {
    for (let i = 0; i < 7; i++) puff(p.clone().add(new THREE.Vector3((Math.random() - 0.5) * 2.2, Math.random() * 1.6, (Math.random() - 0.5) * 2.2)), i < 3 ? 0xffa23a : 0x3a342c, 2.4 + Math.random() * 2, 0.7 + Math.random() * 0.6);
    muzzleLight.position.copy(p); muzzleLight.intensity = 60; setTimeout(() => { muzzleLight.intensity = 0; }, 90);
    noise(0.55 * clamp(1 - dm / 140, 0, 1) + 0.01, 0.8, 1100, 50);
    if (dm < 25) { shake = Math.max(shake, 1.2 * (1 - dm / 25)); buzz(160); }
    const R = 9;
    if (fx) for (const e of ents) {
      if (!e.alive || e.ph !== "ground") continue;
      const d = Math.hypot(e.x - p.x, e.y - p.z, ((e.z || 0) + 0.9) - p.y); if (d > R) continue;
      if (!los(p.x, p.z, e.x, e.y, p.y - 1.3, e.z || 0)) continue;
      dealHit(src, e, 135 * Math.pow(1 - d / R, 1.3), -7, false);
    }
    if (fx) for (const v of MAP.vehicles) { const d = Math.hypot(v.x - p.x, v.y - p.z); if (d < 7) vehDamage(v, 120 * (1 - d / 7), src); }
    alertBots(p.x, p.z, src, 90, p.y);
  } else if (q.k === "s") {
    noise(0.12 * clamp(1 - dm / 60, 0, 1) + 0.005, 1.6, 2400, 600);
    const s = { x: p.x, y: p.z, z: p.y, r: 1, t: 0, life: 28, sprites: [] };
    for (let i = 0; i < 26; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: puffTex, color: 0xcfd2cc, transparent: true, depthWrite: false, opacity: 0 }));
      const a = Math.random() * TAU, r = Math.random() * 5;
      sp.userData = { sz: 4 + Math.random() * 4, y: p.y + 0.8 + Math.random() * 3.2, ph: Math.random() * 6 };
      sp.position.set(p.x + Math.cos(a) * r, sp.userData.y, p.z + Math.sin(a) * r); world.add(sp); s.sprites.push(sp);
    }
    smokes.push(s);
  } else if (q.k === "o") {
    noise(0.2 * clamp(1 - dm / 70, 0, 1) + 0.005, 0.5, 1800, 300);
    const f = { x: p.x, y: p.z, z: groundAt(p.x, p.z, p.y + 0.3), r: 3.6, t: 0, life: 10, acc: 0, owner: src, sprites: [], light: new THREE.PointLight(0xff7a2a, 8, 14, 2) };
    f.light.position.set(p.x, f.z + 1, p.z); world.add(f.light);
    for (let i = 0; i < 14; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: flashTex, color: 0xff8a30, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      const a = Math.random() * TAU, r = Math.sqrt(Math.random()) * f.r;
      sp.userData = { sz: 0.9 + Math.random() * 1.1 }; sp.position.set(p.x + Math.cos(a) * r, f.z + 0.4 + Math.random() * 0.5, p.z + Math.sin(a) * r); world.add(sp); f.sprites.push(sp);
    }
    f.remote = !fx; fires.push(f);
  } else if (q.k === "z") {
    noise(0.4 * clamp(1 - dm / 90, 0, 1) + 0.01, 0.4, 3000, 2000);
    puff(p.clone(), 0xffffff, 3, 0.25);
    for (const e of ents) {
      if (!e.alive || e.ph !== "ground") continue;
      const d = Math.hypot(e.x - p.x, e.y - p.z); if (d > 15 || !los(p.x, p.z, e.x, e.y, p.y - 1.3, e.z || 0)) continue;
      let face = Math.cos(e.a) * (p.x - e.x) + Math.sin(e.a) * (p.z - e.y); face = face / (d || 1);
      const k = (1 - d / 15) * (face > 0 ? 1 : 0.35);
      if (e === me) { flashFx = Math.max(flashFx, 1.6 * k + 0.2); tone(3800, 1.6 * k + 0.2, "sine", 0.03); }
      else if (e.kind === "bot") e.stunT = 3.5 * k + 0.5;
    }
  }
}
// does a sight line between two points pass through a smoke cloud?
function smokeBlocks(x1, y1, x2, y2) {
  for (const s of smokes) {
    if (s.t < 1.2) continue;
    const dx = x2 - x1, dy = y2 - y1, l2 = dx * dx + dy * dy || 1;
    const t = clamp(((s.x - x1) * dx + (s.y - y1) * dy) / l2, 0, 1);
    if (Math.hypot(x1 + dx * t - s.x, y1 + dy * t - s.y) < s.r * 0.85) return true;
  }
  return false;
}
function clearThrowables() {
  for (const q of projs) scene.remove(q.m); projs.length = 0;
  for (const s of smokes) for (const sp of s.sprites) world.remove(sp); smokes.length = 0;
  for (const f of fires) { for (const sp of f.sprites) world.remove(sp); world.remove(f.light); } fires.length = 0;
  flashFx = 0;
}

// ---------- dropping things from the bag ----------
function dropItem(e, it) {
  const a = e.a + Math.PI + (Math.random() - 0.5) * 1.2, r = 0.9;
  it.x = e.x + Math.cos(a) * r; it.y = e.y + Math.sin(a) * r; it.z = groundAt(it.x, it.y, (e.z || 0) + 0.3); it.rot = Math.random() * TAU;
  it.id = MAP.loot.length; it.dropAt = performance.now(); MAP.loot.push(it); makeLootMesh(it); it.mesh.visible = true;
}

// ---------- loot meshes for the new items ----------
function itemsProtos() {
  const P = LOOT_PROTO, M = (c, r = 0.7, m = 0) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m });
  const helm = (lv) => { const g = makeHelmet(lv, 0.12); g.rotation.x = -0.2; const w = new THREE.Group(); g.position.y = 0.0; w.add(g); return w; };
  P.hm1 = helm(1); P.hm2 = helm(2); P.hm3 = helm(3);
  const pack = (lv) => { const g = makePack(lv, 0.42); g.rotation.x = -Math.PI / 2; g.position.y = 0.1; const w = new THREE.Group(); w.add(g); return w; };
  P.bp1 = pack(1); P.bp2 = pack(2); P.bp3 = pack(3);
  P.mdb = P.b; P.mdm = P.m;
  P.mdf = group([[boxAt(0.26, 0.09, 0.18, 0, 0.045, 0), M(0xe8e4dc)], [boxAt(0.12, 0.012, 0.035, 0, 0.096, 0), M(0xc42020)], [boxAt(0.035, 0.012, 0.12, 0, 0.096, 0), M(0xc42020)]]);
  P.mdd = group([[cyl(0.04, 0.15, 0, 0.075, 0, "y"), M(0xe0b020, 0.3, 0.6)], [cyl(0.041, 0.02, 0, 0.1, 0, "y"), M(0x2050c0, 0.4, 0.3)]]);
  P.mdp = group([[cyl(0.035, 0.1, 0, 0.05, 0, "y"), M(0xd8781f, 0.4)], [cyl(0.038, 0.035, 0, 0.115, 0, "y"), M(0xf0f0f0)]]);
  P.mdx = group([[cyl(0.015, 0.18, 0, 0.02, 0, "x"), M(0xe8f4ff, 0.2)], [cyl(0.004, 0.06, 0.12, 0.02, 0, "x"), GUN_MAT.metal], [boxAt(0.02, 0.05, 0.05, -0.1, 0.02, 0), M(0xd03030)]]);
  for (const k of THR_ORDER) { const g = projMesh(k); g.rotation.z = k === "g" ? 0 : Math.PI / 2; g.position.y = 0.05; const w = new THREE.Group(); w.add(g); P["th" + k] = w; }
  const scope = (len, r) => group([[cyl(r, len, 0, 0.06, 0, "x"), GUN_MAT.metal], [cyl(r * 1.3, 0.05, len / 2 - 0.02, 0.06, 0, "x"), GUN_MAT.metal], [cyl(r * 1.2, 0.04, -len / 2 + 0.02, 0.06, 0, "x"), GUN_MAT.metal], [boxAt(0.05, 0.03, 0.03, 0, 0.02, 0), GUN_MAT.metal]]);
  P.atrd = group([[boxAt(0.06, 0.05, 0.04, 0, 0.03, 0), GUN_MAT.metal], [boxAt(0.004, 0.035, 0.03, 0.032, 0.035, 0), GUN_MAT.glass]]);
  P.ats2 = scope(0.16, 0.02); P.ats4 = scope(0.22, 0.024); P.ats8 = scope(0.3, 0.028);
  P.atcp = group([[cyl(0.02, 0.09, 0, 0.02, 0, "x"), GUN_MAT.metal], [boxAt(0.03, 0.006, 0.025, 0, 0.042, 0), GUN_MAT.poly]]);
  P.atsp = group([[cyl(0.025, 0.2, 0, 0.025, 0, "x"), GUN_MAT.poly]]);
  P.atxm = group([[boxAt(0.05, 0.26, 0.04, 0, 0.02, 0), GUN_MAT.poly]]); P.atxm.children[0].rotation.z = Math.PI / 2;
  P.atgr = group([[boxAt(0.035, 0.1, 0.035, 0, 0.05, 0), GUN_MAT.poly], [boxAt(0.07, 0.02, 0.035, 0, 0.1, 0), GUN_MAT.poly]]);
  // new weapons on the ground: reuse the held models, lying on their side
  for (const [wi, cls] of [[5, "dmr"], [6, "lmg"], [7, "pan"]]) { const g = makeHeldGun(cls); g.rotation.set(0, Math.PI / 2, Math.PI / 2); g.position.set(-0.45, 0.04, 0); const w = new THREE.Group(); w.add(g); w.scale.setScalar(0.65); P["w" + wi] = w; }
}

// ---------- labels ----------
function itemName(it) {
  if (it.k === "md") return HEAL[it.v].n + (it.n > 1 ? " ×" + ar(it.n) : "");
  if (it.k === "th") return THROW[it.v].n + (it.n > 1 ? " ×" + ar(it.n) : "");
  if (it.k === "at") return ATT[it.v].n;
  if (it.k === "hm" || it.k === "bp") return GEAR_N[it.k] + " مستوى " + ar(it.v);
  return null;
}

// ---------- the bag screen and quick menus ----------
function closeMenus() { for (const id of ["healMenu", "thrMenu"]) $(id).hidden = true; }
function openHealMenu() {
  ensureKit(me); const box = $("healMenu");
  if (!box.hidden) { box.hidden = true; return; }
  closeMenus();
  const rows = HEAL_ORDER.filter((k) => me.heals[k] > 0);
  box.innerHTML = rows.length ? rows.map((k) => `<button type="button" data-h="${k}"><span>${HEAL[k].n}</span><b>${ar(me.heals[k])}</b></button>`).join("") : `<p>ما عندك علاج. دوّر في البيوت.</p>`;
  box.hidden = false;
}
function openThrowMenu() {
  ensureKit(me); const box = $("thrMenu");
  if (!box.hidden) { box.hidden = true; return; }
  closeMenus();
  const rows = THR_ORDER.filter((k) => me.thr[k] > 0);
  box.innerHTML = rows.length ? rows.map((k) => `<button type="button" data-t="${k}" class="${me.thrSel === k ? "on" : ""}"><span>${THROW[k].n}</span><b>${ar(me.thr[k])}</b></button>`).join("") : `<p>ما عندك قنابل.</p>`;
  box.hidden = false;
}
function bagHtml() {
  ensureKit(me);
  const used = Math.round(bagUsed(me)), cap = bagCap(me), un = unlimited(me);
  const lv = (n) => n ? "مستوى " + ar(n) : "—";
  const gear = `<div class="bag-gear"><div><span>خوذة</span><b>${lv(me.helm)}</b></div><div><span>درع</span><b>${lv(me.armor)}</b></div><div><span>شنطة</span><b>${lv(me.pack)}</b></div></div>`;
  const guns = [0, 1, 2].map((s) => {
    const wi = me.w[s]; if (wi < 0) return s === 2 ? "" : `<div class="bag-gun empty"><b>فاضي</b></div>`;
    const a = attOf(me, s), chips = ["s", "m", "x", "g"].filter((k) => ATT_OK[wi].some((id) => ATT[id].slot === k)).map((k) => `<i class="${a[k] ? "on" : ""}">${a[k] ? ATT[a[k]].n : { s: "منظار", m: "فوهة", x: "مخزن", g: "قبضة" }[k]}</i>`).join("");
    return `<div class="bag-gun"><b>${WEAP[wi].name}</b>${s < 2 && (wi === 1 || wi === 2 || wi === 6) ? `<span class="fm">${me.fm[s] === "single" ? "فردي" : "أوتو"}</span>` : ""}<div class="chips">${chips}</div>${s < 2 ? `<button type="button" data-dropw="${s}">ارمِ</button>` : ""}</div>`;
  }).join("");
  const rows = [];
  for (const t of ["l", "h", "s"]) if (me.ammo[t] > 0 && !un) rows.push(["a", t, "ذخيرة " + AMMO_NAME[t], me.ammo[t]]);
  for (const k of HEAL_ORDER) if (me.heals[k] > 0) rows.push(["md", k, HEAL[k].n, me.heals[k], true]);
  for (const k of THR_ORDER) if (me.thr[k] > 0) rows.push(["th", k, THROW[k].n, me.thr[k]]);
  for (const k in me.spare) if (me.spare[k] > 0) rows.push(["at", k, ATT[k].n, me.spare[k]]);
  const list = rows.length ? rows.map(([k, v, n, c, use]) => `<div class="bag-row"><span>${n}</span><b>${ar(c)}</b>${use ? `<button type="button" data-use="${v}">استخدم</button>` : ""}<button type="button" data-drop="${k}:${v}">ارمِ</button></div>`).join("") : `<p class="note">الشنطة فاضية.</p>`;
  const bar = un ? "" : `<div class="cap"><span>الحمولة</span><b><i style="width:${Math.min(100, used / cap * 100)}%"></i></b><em>${ar(used)} / ${ar(cap)}</em></div>`;
  return `<h2>الشنطة</h2>${gear}${bar}<div class="bag-guns">${guns}</div><div class="bag-list">${list}</div><button class="btn" id="bagClose" type="button">رجوع</button>`;
}
function openBag() { $("bag").innerHTML = `<div class="panel bagpanel">${bagHtml()}</div>`; $("bag").hidden = false; }
function bagClick(ev) {
  const b = ev.target.closest("button"); if (!b) return;
  if (b.id === "bagClose") { $("bag").hidden = true; return; }
  if (b.dataset.use) { useHeal(me, b.dataset.use); $("bag").hidden = true; return; }
  if (b.dataset.dropw) {
    const s = +b.dataset.dropw, wi = me.w[s]; if (wi < 0) return;
    for (const k in me.att[s]) { const id = me.att[s][k]; if (id) me.spare[id] = (me.spare[id] || 0) + 1; }
    me.att[s] = {}; me.w[s] = -1; me.mag[s] = 0; dropItem(me, { k: "w", v: wi });
    if (me.cur === s) me.cur = me.w[1 - s] >= 0 ? 1 - s : s;
  } else if (b.dataset.drop) {
    const [k, v] = b.dataset.drop.split(":");
    if (k === "a") { const n = me.ammo[v]; me.ammo[v] = 0; dropItem(me, { k: "a", v, n }); }
    else if (k === "md") { const n = me.heals[v]; me.heals[v] = 0; dropItem(me, { k: "md", v, n }); }
    else if (k === "th") { const n = me.thr[v]; me.thr[v] = 0; dropItem(me, { k: "th", v, n }); }
    else if (k === "at") { me.spare[v]--; dropItem(me, { k: "at", v }); }
  }
  updateHud(); openBag();
}
function gearChip() {
  const parts = [];
  if (me.helm) parts.push("خوذة " + ar(me.helm));
  if (me.armor) parts.push("درع " + ar(me.armor));
  if (me.pack) parts.push("شنطة " + ar(me.pack));
  return parts.length ? parts.join(" · ") : "بدون عتاد";
}
function itemsHud() {
  ensureKit(me);
  $("armorChip").textContent = gearChip();
  $("boostbar").hidden = !(me.boost > 0); $("boostfill").style.width = Math.min(100, me.boost || 0) + "%";
  const hk = bestHeal(me), nh = HEAL_ORDER.reduce((s, k) => s + (me.heals[k] || 0), 0);
  $("healN").textContent = ar(nh); $("healBtn").classList.toggle("dim", !nh);
  const nt = me.thr[me.thrSel] || 0, tot = THR_ORDER.reduce((s, k) => s + (me.thr[k] || 0), 0);
  $("thrName").textContent = tot ? THROW[nt ? me.thrSel : THR_ORDER.find((k) => me.thr[k] > 0)].n : "رمي"; $("thrN").textContent = ar(nt || tot); $("thrBtn").classList.toggle("dim", !tot);
  const wi = me.w[me.cur], auto = wi === 1 || wi === 2 || wi === 6;
  $("fmBtn").hidden = !auto; if (auto) $("fmBtn").innerHTML = (me.fm[me.cur] === "single" ? "فردي" : "أوتو") + "<b>وضع</b>";
  $("slot2").hidden = !me.pan; $("slot2").classList.toggle("on", me.cur === 2);
  void hk;
}
function itemsInit() {
  $("healBtn").addEventListener("click", () => { if (me && me.alive) openHealMenu(); });
  $("healMenu").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b && b.dataset.h) useHeal(me, b.dataset.h); });
  let lp = null, longDone = false;
  $("thrBtn").addEventListener("pointerdown", () => { longDone = false; lp = setTimeout(() => { longDone = true; openThrowMenu(); }, 450); });
  $("thrBtn").addEventListener("pointerup", () => { clearTimeout(lp); if (!longDone && me && me.alive) { closeMenus(); playerThrow(); } });
  $("thrBtn").addEventListener("pointerleave", () => clearTimeout(lp));
  $("thrMenu").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b && b.dataset.t) { me.thrSel = b.dataset.t; closeMenus(); updateHud(); } });
  $("bagBtn").addEventListener("click", () => { if (me) openBag(); });
  $("bag").addEventListener("click", bagClick);
  $("fmBtn").addEventListener("click", () => { if (!me) return; me.fm[me.cur] = me.fm[me.cur] === "single" ? "auto" : "single"; tone(700, 0.04, "square", 0.03); updateHud(); });
  $("slot2").addEventListener("click", () => switchSlot(2));
  window.addEventListener("keydown", (e) => {
    if (e.target.tagName === "INPUT" || mode !== "play" || !me) return;
    const k = e.key.toLowerCase();
    if (k === "g") playerThrow();
    if (k === "t") { const i = THR_ORDER.indexOf(me.thrSel); for (let j = 1; j <= 4; j++) { const q = THR_ORDER[(i + j) % 4]; if (me.thr[q] > 0) { me.thrSel = q; break; } } updateHud(); }
    if (k === "b") $("fmBtn").click();
    if (k === "tab" || k === "i") { e.preventDefault(); if ($("bag").hidden) openBag(); else $("bag").hidden = true; }
    if (k === "3") switchSlot(2);
    if (k === "6") { const q = ["d", "p", "x"].find((x) => me.heals[x] > 0); if (q) useHeal(me, q); }
    if (k === "h") { const q = bestHeal(me); if (q) useHeal(me, q); }
  });
}

// ================= match events: supply drops, red zone, map markers, compass =================
const DROP_TIMES = [100, 255, 360], RED_TIMES = [135, 290];
const drops = [], redz = { on: false, x: 0, y: 0, r: 0, t: 0, warnT: 0, next: 0, acc: 0 };
let dropPlane = null, marker = null, markerMesh = null;
const CRATE_M = [new THREE.MeshStandardMaterial({ color: 0x2f5ea8, roughness: 0.6, metalness: 0.2 }), new THREE.MeshStandardMaterial({ color: 0xd9d9d0, roughness: 0.7 }), new THREE.MeshStandardMaterial({ color: 0xe0452a, roughness: 0.6 })];
function makeCrate() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.0, 1.4), CRATE_M[0]); body.position.y = 0.5; body.castShadow = true; g.add(body);
  for (const [x, z] of [[-0.7, -0.7], [0.7, -0.7], [-0.7, 0.7], [0.7, 0.7]]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.04, 0.12), CRATE_M[1]); p.position.set(x, 0.5, z); g.add(p); }
  const band = new THREE.Mesh(new THREE.BoxGeometry(1.44, 0.14, 1.44), CRATE_M[2]); band.position.y = 0.72; g.add(band);
  const chute = new THREE.Group();
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(3.2, 16, 8, 0, TAU, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xe0452a, side: THREE.DoubleSide, roughness: 0.8 }));
  canopy.scale.y = 0.5; canopy.position.y = 6.5; chute.add(canopy);
  chute.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints([[-3, 6.5, 0], [0, 1, 0], [3, 6.5, 0], [0, 1, 0], [0, 6.5, -3], [0, 1, 0], [0, 6.5, 3], [0, 1, 0]].map((a) => new THREE.Vector3(...a))), new THREE.LineBasicMaterial({ color: 0x333333 })));
  g.add(chute); g.userData.chute = chute;
  return g;
}
function dropLoot(rng) {
  const pick = (a) => a[Math.floor(rng() * a.length)];
  const items = [{ k: "w", v: pick([4, 5, 6]) }, { k: "a", v: "h", n: 60 }, { k: pick(["hm", "v"]), v: 3 }, { k: "at", v: pick(["s8", "s4", "sp"]) }, { k: "md", v: pick(["x", "m"]), n: 1 }];
  if (rng() < 0.5) items.push({ k: "bp", v: 3 });
  return items;
}
function matchEventsReset() {
  for (const d of drops) { if (d.mesh.parent) d.mesh.parent.remove(d.mesh); for (const s of d.smoke) if (s.parent) s.parent.remove(s); }
  drops.length = 0; redz.on = false; redz.warnT = 0; redz.next = 0;
  // the world is rebuilt for every match, so anything we added to it is gone
  dropPlane = null; markerMesh = null; marker = null;
}
function startDrop(i) {
  const zone = zoneAt(matchT), R = Math.random;
  const a = R() * TAU, r = Math.sqrt(R()) * zone.nr * 0.8, x = clamp(zone.nx + Math.cos(a) * r, 30, S - 30), y = clamp(zone.ny + Math.sin(a) * r, 30, S - 30);
  const dir = R() * TAU, len = 900;
  const d = { i, x, y, z: 110, vz: 0, state: "plane", t: 0, x1: x - Math.cos(dir) * len / 2, y1: y - Math.sin(dir) * len / 2, x2: x + Math.cos(dir) * len / 2, y2: y + Math.sin(dir) * len / 2, mesh: makeCrate(), smoke: [], items: dropLoot(R), opened: false };
  d.mesh.visible = false; world.add(d.mesh); drops.push(d);
  if (!dropPlane) { dropPlane = makePlane(); world.add(dropPlane); }
  dropPlane.visible = true;
  if (mode === "play") { hint("✈️ إمداد جوي نازل! شوف الخريطة", 3600); tone(520, 0.2, "triangle", 0.05); setTimeout(() => tone(780, 0.25, "triangle", 0.05), 220); }
  // some bots go for it
  for (const b of ents) if (b.kind === "bot" && b.alive && Math.hypot(b.x - x, b.y - y) < 180 && Math.random() < 0.35) { b.goal = { x, y, z: 0 }; b.dropGoal = d; }
}
function stepDrops(dt) {
  if (!MAP || MAP.kind === "arena" || online && !isHost) return stepDropVisuals(dt);
  DROP_TIMES.forEach((t, i) => { if (matchT >= t && !drops.some((d) => d.i === i)) startDrop(i); });
  stepDropVisuals(dt);
}
function stepDropVisuals(dt) {
  let planeBusy = false;
  for (const d of drops) {
    d.t += dt;
    if (d.state === "plane") {
      const k = clamp(d.t / 14, 0, 1.2); planeBusy = true;
      dropPlane.position.set(lerp(d.x1, d.x2, k), 120, lerp(d.y1, d.y2, k)); dropPlane.rotation.y = -Math.atan2(d.y2 - d.y1, d.x2 - d.x1);
      if (k >= 0.5) { d.state = "fall"; d.mesh.visible = true; d.mesh.position.set(d.x, d.z, d.y); }
    } else if (d.state === "fall") {
      if (d.t < 22) planeBusy = true;
      d.z -= dt * 5.5; const g = groundAt(d.x, d.y, d.z + 0.5);
      d.mesh.position.set(d.x, Math.max(g, d.z), d.y); d.mesh.rotation.y += dt * 0.3; d.mesh.position.x += Math.sin(d.t * 0.7) * 0.02;
      if (d.z <= g) { d.state = "landed"; d.z = g; d.mesh.userData.chute.visible = false; landDrop(d); }
    } else if (d.state === "landed" && d.smoke.length) {
      for (const s of d.smoke) { s.position.y += dt * (1.2 + s.userData.k); s.material.opacity = Math.max(0, s.material.opacity - dt * 0.12); if (s.position.y > d.z + 26) { s.position.y = d.z + 0.6; s.material.opacity = 0.8; } }
      if (d.t > 120) { for (const s of d.smoke) world.remove(s); d.smoke.length = 0; }
    }
  }
  if (dropPlane && !planeBusy) dropPlane.visible = false;
}
function landDrop(d) {
  noise(0.15 * clamp(1 - Math.hypot(d.x - me.x, d.y - me.y) / 80, 0, 1) + 0.005, 0.4, 300, 80);
  for (let i = 0; i < 18; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: puffTex, color: 0xe03a2a, transparent: true, depthWrite: false, opacity: 0.8 }));
    s.userData.k = Math.random(); s.position.set(d.x + (Math.random() - 0.5), d.z + 0.6 + Math.random() * 25, d.y + (Math.random() - 0.5)); s.scale.setScalar(2.4 + Math.random() * 2); world.add(s); d.smoke.push(s);
  }
  d.items.forEach((it, j) => {
    const a = j / d.items.length * TAU, r = 1.4;
    it.x = d.x + Math.cos(a) * r; it.y = d.y + Math.sin(a) * r;
    if (solidAt(it.x, it.y, d.z + 0.3)) { it.x = d.x + Math.cos(a) * 0.9; it.y = d.y + Math.sin(a) * 0.9; }
    it.z = groundAt(it.x, it.y, d.z + 0.3); it.rot = a; it.id = MAP.loot.length; MAP.loot.push(it); makeLootMesh(it); it.mesh.visible = true;
  });
}
// ---------- red zone: a bombing run somewhere inside the safe area ----------
function stepRedZone(dt) {
  if (!MAP || MAP.kind === "arena" || online) return;
  const zone = zoneAt(matchT);
  for (const t of RED_TIMES) if (matchT >= t && redz.next <= t && zone.r > 120) {
    redz.next = t + 1; redz.on = true; redz.warnT = 8; redz.t = 18; redz.acc = 0;
    const a = Math.random() * TAU, r = Math.random() * zone.r * 0.6;
    redz.x = clamp(zone.x + Math.cos(a) * r, 60, S - 60); redz.y = clamp(zone.y + Math.sin(a) * r, 60, S - 60); redz.r = 60 + Math.random() * 25;
    if (mode === "play") { hint("🔴 منطقة حمراء! إذا كنت داخلها ادخل مبنى", 4000); tone(300, 0.3, "sawtooth", 0.04); }
  }
  if (!redz.on) return;
  if (redz.warnT > 0) { redz.warnT -= dt; return; }
  redz.t -= dt; redz.acc += dt;
  while (redz.acc > 0.3) {
    redz.acc -= 0.3;
    const a = Math.random() * TAU, r = Math.sqrt(Math.random()) * redz.r, x = redz.x + Math.cos(a) * r, y = redz.y + Math.sin(a) * r, g = groundAt(x, y, 60);
    const p = new THREE.Vector3(x, g + 0.5, y);
    for (let i = 0; i < 3; i++) puff(p.clone().add(new THREE.Vector3((Math.random() - 0.5) * 2, Math.random() * 2, (Math.random() - 0.5) * 2)), i ? 0x3a342c : 0xffa23a, 2.5 + Math.random() * 2, 0.7);
    const dm = Math.hypot(x - me.x, y - me.y);
    if (dm < 220) noise(0.35 * clamp(1 - dm / 220, 0, 1) + 0.005, 0.6, 900, 40);
    if (dm < 30) shake = Math.max(shake, 0.8 * (1 - dm / 30));
    for (const e of ents) {
      if (!e.alive || e.ph !== "ground") continue;
      const d = Math.hypot(e.x - x, e.y - y); if (d > 6 || (insideBuilding(e.x, e.y) && (e.z || 0) < 3)) continue;
      applyDamage(e, 75 * (1 - d / 6), null, null, -5, false);
    }
  }
  if (redz.t <= 0) redz.on = false;
}
// ---------- map marker ----------
function setMarker(p) {
  marker = p;
  if (!markerMesh && p && world) {
    markerMesh = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 60, 6), new THREE.MeshBasicMaterial({ color: 0xf2c641, transparent: true, opacity: 0.35, depthWrite: false }));
    pole.position.y = 30; markerMesh.add(pole); world.add(markerMesh);
  }
  if (markerMesh) { markerMesh.visible = !!p; if (p) markerMesh.position.set(p.x, 0, p.y); }
}
function bigMapOpen() {
  if (!MAP || MAP.kind === "arena") return;
  $("bigmap").hidden = false; drawBigMap();
}
function drawBigMap() {
  const c = $("bigmapCv"), g = c.getContext("2d"), M = c.width, k = M / S;
  g.setTransform(1, 0, 0, 1, 0, 0); g.drawImage(groundMini, 0, 0, M, M);
  const zone = zoneAt(Math.max(0, matchT));
  g.save(); g.beginPath(); g.rect(0, 0, M, M); g.arc(zone.x * k, zone.y * k, Math.max(0, zone.r * k), 0, TAU, true); g.fillStyle = "rgba(120,60,220,0.4)"; g.fill("evenodd"); g.restore();
  g.strokeStyle = "#fff"; g.lineWidth = 2; g.setLineDash([8, 6]); g.beginPath(); g.arc(zone.nx * k, zone.ny * k, zone.nr * k, 0, TAU); g.stroke(); g.setLineDash([]);
  drawMapExtras(g, k, 1.8);
  g.fillStyle = "#fff"; g.beginPath(); g.arc(me.x * k, me.y * k, 6, 0, TAU); g.fill(); g.strokeStyle = "#000"; g.lineWidth = 2; g.stroke();
}
function drawMapExtras(g, k, sc) {
  if (redz.on) { g.fillStyle = "rgba(230,40,30,0.35)"; g.beginPath(); g.arc(redz.x * k, redz.y * k, redz.r * k, 0, TAU); g.fill(); }
  for (const d of drops) if (d.state !== "plane") { g.fillStyle = "#e0452a"; g.fillRect(d.x * k - 3 * sc, d.y * k - 3 * sc, 6 * sc, 6 * sc); g.strokeStyle = "#fff"; g.lineWidth = 1; g.strokeRect(d.x * k - 3 * sc, d.y * k - 3 * sc, 6 * sc, 6 * sc); }
  if (marker) { g.fillStyle = "#f2c641"; g.beginPath(); g.moveTo(marker.x * k, marker.y * k); g.lineTo(marker.x * k - 5 * sc, marker.y * k - 11 * sc); g.lineTo(marker.x * k + 5 * sc, marker.y * k - 11 * sc); g.closePath(); g.fill(); }
}
// ---------- compass along the top, with the marker on it ----------
const COMPASS_N = { 0: "ش", 90: "ق", 180: "ج", 270: "غ" };
function drawCompass() {
  const c = $("compass"); if (!c || c.hidden) return;
  const g = c.getContext("2d"), W = c.width, H = c.height;
  g.clearRect(0, 0, W, H);
  // camYaw: 0 = +x (east). bearing: 0 = north (-y), clockwise
  const bear = ((camYaw * 180 / Math.PI) + 90 + 360) % 360, span = 120, px = W / span;
  g.fillStyle = "rgba(232,220,181,0.9)"; g.strokeStyle = "rgba(232,220,181,0.7)"; g.textAlign = "center"; g.font = "600 13px sans-serif";
  for (let d = Math.floor((bear - span / 2) / 5) * 5; d <= bear + span / 2; d += 5) {
    const x = W / 2 + (d - bear) * px, dd = ((d % 360) + 360) % 360;
    g.beginPath(); g.moveTo(x, H - 2); g.lineTo(x, H - (dd % 15 === 0 ? 10 : 5)); g.stroke();
    if (dd % 15 === 0) g.fillText(COMPASS_N[dd] || String(dd), x, 13);
  }
  if (marker) {
    const mb = ((Math.atan2(marker.y - me.y, marker.x - me.x) * 180 / Math.PI) + 90 + 360) % 360;
    let dlt = mb - bear; dlt = ((dlt + 540) % 360) - 180;
    const x = clamp(W / 2 + dlt * px, 6, W - 6);
    g.fillStyle = "#f2c641"; g.beginPath(); g.moveTo(x, H - 12); g.lineTo(x - 6, H - 22); g.lineTo(x + 6, H - 22); g.closePath(); g.fill();
    $("markDist").textContent = ar(Math.round(Math.hypot(marker.x - me.x, marker.y - me.y))) + "م"; $("markDist").hidden = false;
  } else $("markDist").hidden = true;
  g.fillStyle = "#f2a541"; g.fillRect(W / 2 - 1, H - 14, 2, 14);
}
function matchInit() {
  $("mini").addEventListener("click", () => { if (mode === "play") bigMapOpen(); });
  $("bigmapCv").addEventListener("click", (ev) => {
    const r = ev.target.getBoundingClientRect(), x = (ev.clientX - r.left) / r.width * S, y = (ev.clientY - r.top) / r.height * S;
    if (marker && Math.hypot(marker.x - x, marker.y - y) < 20) setMarker(null); else setMarker({ x, y });
    drawBigMap();
  });
  $("bigmapClose").addEventListener("click", () => { $("bigmap").hidden = true; });
  window.addEventListener("keydown", (e) => { if (e.target.tagName === "INPUT" || mode !== "play") return; if (e.key.toLowerCase() === "m") { if ($("bigmap").hidden) bigMapOpen(); else $("bigmap").hidden = true; } });
}

// ================= squads: teams in the battle royale, knock-downs, revives, spectating, servers =================
let TS = 1;                       // team size this match: 1 solo, 2 duo, 4 squad
let specEnt = null;               // the teammate we watch after we die
const TS_NAME = { 1: "فردي", 2: "ثنائي", 4: "فرقة" };
function friends(a, b) { return !!a && !!b && a !== b && a.team === b.team && (MAP.kind === "arena" || TS > 1); }
function teamOf(e) { return ents.filter((o) => o.team === e.team); }
function standing(e) { return e.alive && !e.knocked; }
function teamUp(e) { return teamOf(e).some((o) => o !== e && standing(o)); }

// give everyone a team. Humans first (online: from the host's list), bots fill the empty seats, then form their own squads.
function assignTeams(opts) {
  TS = MAP.kind === "arena" ? 1 : (opts.ts || 1);
  if (MAP.kind === "arena") return;
  const seats = new Map();
  const humans = ents.filter((e) => e.kind !== "bot");
  for (const h of humans) {
    const key = h === me ? (opts.myId || "me") : h.id;
    h.team = opts.teams && opts.teams[key] !== undefined ? opts.teams[key] : (h === me ? 0 : 100 + humans.indexOf(h));
    seats.set(h.team, (seats.get(h.team) || 0) + 1);
  }
  let next = Math.max(0, ...[...seats.keys()].filter((t) => t < 100)) + 1;
  const bots = ents.filter((e) => e.kind === "bot");
  let bi = 0;
  if (opts.fill !== false) for (const [t, n] of [...seats.entries()].sort((a, b) => a[0] - b[0])) for (let k = n; k < TS && bi < bots.length; k++) { bots[bi++].team = t; seats.set(t, k + 1); }
  for (; bi < bots.length; bi++) { const t = next + Math.floor((bi) / TS); bots[bi].team = t; }
  // teammates get blue name tags so you can tell friend from foe
  if (TS > 1) for (const e of ents) if (e !== me && e.team === me.team && e.vis && !e.vis.tag) { const t = nameTag(e.name, "#8ec5ff"); t.position.y = 2.15; t.scale.set(0.9, 0.22, 1); e.vis.holder.add(t); e.vis.tag = t; }
}

// ---------- knocked down ----------
function knock(t, killerId, killerName, wi, head) {
  if (t.veh) exitVehicle(t, true);
  t.knocked = true; t.knocks = (t.knocks || 0) + 1; t.hp = 100; t.stance = "prone"; t.healT = 0; t.reloadT = 0; t.reviving = null; t.knockBy = killerId; t.knockName = killerName;
  const how = HOW[wi] || (WEAP[wi] ? WEAP[wi].name : "");
  addFeed(killerName && killerId !== t.id ? killerName : null, t.name, "أسقطه " + how, t === me || killerId === "me", head);
  if (killerId === "me") { tone(700, 0.1, "triangle", 0.05); hint("أسقطته! كمّل عليه قبل لا يسعفونه", 1800); }
  if (t === me) { hint("أُسقطت! ازحف لمكان آمن وانتظر زميلك يسعفك", 4000); buzz([60, 30, 60]); }
  checkTeamWipe(t.team, killerId, killerName, wi);
}
// a team with nobody standing is out: the knocked ones bleed out on the spot
function checkTeamWipe(team, killerId, killerName, wi) {
  if (TS <= 1) return;
  const mates = ents.filter((o) => o.team === team);
  if (mates.some(standing)) return;
  for (const o of mates) if (o.alive && o.knocked) { o.knocked = false; kill(o, o.knockBy || killerId, o.knockName || killerName, wi, false); }
}
function knockTick(e, dt) {
  if (!e.knocked || !e.alive) return;
  e.hp -= dt * (3.5 + 2.5 * (e.knocks - 1));
  if (e.stance !== "prone") e.stance = "prone";
  if (e.hp <= 0) { e.knocked = false; kill(e, e.knockBy, e.knockName, -2, false); }
}
// ---------- reviving a teammate ----------
const REVIVE_T = 6;
function nearKnockedMate(e) {
  let best = null, bd = 1.8;
  for (const o of ents) if (friends(e, o) && o.alive && o.knocked) { const d = Math.hypot(o.x - e.x, o.y - e.y); if (d < bd && Math.abs((o.z || 0) - (e.z || 0)) < 1.2) { bd = d; best = o; } }
  return best;
}
function startRevive(e, o) {
  if (!o || e.knocked || !e.alive || e.healT > 0 || e.reviving) return;
  e.reviving = { o, t: REVIVE_T, x: e.x, y: e.y }; e.reloadT = 0; e.stance = "crouch";
  if (e === me) tone(500, 0.1, "sine", 0.04);
}
function reviveTick(e, dt) {
  const r = e.reviving; if (!r) return;
  if (!e.alive || e.knocked || !r.o.alive || !r.o.knocked || Math.hypot(e.x - r.x, e.y - r.y) > 0.6 || (e.lastHurtT || -99) > matchT - 0.05) { e.reviving = null; return; }
  r.t -= dt;
  if (r.t <= 0) {
    const o = r.o; e.reviving = null;
    if (online && o.kind === "remote") netRevive(o.id);
    else { o.knocked = false; o.hp = 15; o.stance = "crouch"; }
    if (e === me) { tone(660, 0.12, "sine", 0.06); hint("أسعفت " + o.name, 1600); }
    if (o === me) hint("زميلك أسعفك! عالج نفسك", 2400);
  }
}
// bots look after their team: run to a knocked friend when nobody is shooting at them
function botTeamCare(b) {
  if (TS <= 1 || b.knocked || b.seen || b.reviving) return false;
  // stay with the human player in the squad
  if (friends(b, me) && me.alive && me.ph === "ground" && b.ph === "ground" && !b.urgent) {
    const d = Math.hypot(me.x - b.x, me.y - b.y);
    if (d > 22 && (!b.goal || !b.goal.follow || Math.hypot(b.goal.x - me.x, b.goal.y - me.y) > 10)) b.goal = { x: me.x + (Math.random() - 0.5) * 10, y: me.y + (Math.random() - 0.5) * 10, z: me.z || 0, follow: true };
  }
  let best = null, bd = 45;
  for (const o of ents) if (friends(b, o) && o.alive && o.knocked && !ents.some((q) => q !== b && q.reviving && q.reviving.o === o)) { const d = Math.hypot(o.x - b.x, o.y - b.y); if (d < bd) { bd = d; best = o; } }
  if (!best) return false;
  if (bd < 1.4) { b.vx = b.vy = 0; startRevive(b, best); return true; }
  b.goal = { x: best.x, y: best.y, z: best.z || 0 }; b.urgent = true;
  return false;
}
// ---------- spectating your squad after you die ----------
function nextSpec() {
  const mates = ents.filter((o) => friends(me, o) && o.alive);
  if (!mates.length) { specEnt = null; return null; }
  const i = mates.indexOf(specEnt);
  specEnt = mates[(i + 1) % mates.length];
  $("specName").textContent = "تتابع: " + specEnt.name;
  return specEnt;
}
function aliveTeams() { const s = new Set(); for (const e of ents) if (e.alive) s.add(e.team); return s; }

// ---------- servers (match-making) ----------
const REGIONS = [{ id: "me", n: "الشرق الأوسط" }, { id: "eu", n: "أوروبا" }, { id: "as", n: "آسيا" }, { id: "am", n: "أمريكا" }];
const MM_MAX = 12, MM_WAIT = 25000, ROOM_WAIT = 8000;
let mm = null; // { room, region, ts, t0, timer }
let autoRoom = null; // { expect, ts, at }
function prefTs() { return [1, 2, 4].includes(+store.get("ls3.ts", 1)) ? +store.get("ls3.ts", 1) : 1; }
function prefRegion() { return store.get("ls3.region", "me"); }
function serversUi() {
  $("regionList").innerHTML = REGIONS.map((r) => `<button type="button" data-r="${r.id}" class="${prefRegion() === r.id ? "on" : ""}">${r.n}</button>`).join("");
  for (const b of document.querySelectorAll("#tsList button, #tsMenu button, #tsSolo button")) b.classList.toggle("on", +b.dataset.ts === prefTs());
}
async function startSearch() {
  if (!roomApi) { $("lobbyStatus").textContent = "الأونلاين مو متاح."; return; }
  const region = prefRegion(), ts = prefTs();
  $("mmBox").hidden = false; $("lobbyJoin").hidden = true; $("lobbyBack").hidden = true;
  $("mmTitle").textContent = "جاري البحث عن مباراة… (" + REGIONS.find((r) => r.id === region).n + " · " + TS_NAME[ts] + ")";
  let r;
  try { r = await roomApi.join("ls3-mm-" + region + "-" + ts); } catch (e) { $("mmInfo").textContent = "ما قدرنا نوصل للسيرفر. جرّب مرة ثانية."; return; }
  mm = { room: r, region, ts, t0: Date.now(), j: Date.now(), done: false };
  r.presence({ n: ($("nick").value.trim() || "لاعب").slice(0, 14), j: mm.j, st: "mm" }).catch(() => {});
  r.onPeers(mmPeers, () => { $("mmInfo").textContent = "انقطع الاتصال بالسيرفر."; });
  mm.timer = setInterval(mmTick, 500);
}
function mmPeers() { if (mm) mmTick(); }
function mmTick() {
  if (!mm || mm.done) return;
  const peers = mm.room.peers().filter((p) => p.presence && p.presence.j && p.presence.st === "mm");
  const meP = peers.find((p) => p.isMe && p.sameTab);
  const lead = computeHost(peers), amLead = lead && meP && lead.peer === meP.peer;
  const waited = Date.now() - (lead ? lead.presence.j : mm.j), left = Math.max(0, Math.ceil((MM_WAIT - waited) / 1000));
  $("mmInfo").textContent = "لاعبين في السيرفر: " + ar(peers.length) + " · المباراة تبدأ بعد " + ar(left) + " ثانية (الباقي بوتات)";
  // someone (the first in line) opened a match for us?
  for (const p of mm.room.peers()) {
    const go = p.presence && p.presence.mmGo;
    if (go && meP && Array.isArray(go.ids) && go.ids.includes(meP.peer) && go.at > Date.now() - 15000) { mmJoin(go); return; }
  }
  if (amLead && (peers.length >= MM_MAX || waited >= MM_WAIT)) {
    const ids = peers.sort((a, b) => a.presence.j - b.presence.j).slice(0, MM_MAX).map((p) => p.peer);
    const code = "M" + Array.from({ length: 5 }, () => "ABCDEFGHJKMNPQRSTUVWXYZ23456789"[Math.floor(Math.random() * 31)]).join("");
    const go = { code, ids, ts: mm.ts, at: Date.now() };
    mm.room.presence({ mmGo: go }).catch(() => {});
    setTimeout(() => mmJoin(go), 400);
  }
}
function mmJoin(go) {
  if (!mm || mm.done) return; mm.done = true; clearInterval(mm.timer);
  const r = mm.room; setTimeout(() => { try { r.leave(); } catch (e) {} }, 1500);
  autoRoom = { expect: go.ids.length, ts: go.ts, at: Date.now() };
  mm = null; $("mmBox").hidden = true;
  enterRoom(go.code, true);
}
function cancelSearch() {
  if (mm) { clearInterval(mm.timer); try { mm.room.leave(); } catch (e) {} mm = null; }
  $("mmBox").hidden = true; $("lobbyJoin").hidden = false; $("lobbyBack").hidden = false;
}
// in an auto room the host starts by itself once everybody arrived (or after a short wait)
function autoStartCheck() {
  if (!autoRoom || !room || !isHost || mode !== "lobby") return;
  const humans = room.peers().filter((p) => p.presence && p.presence.st === "lobby");
  if (humans.length >= autoRoom.expect || Date.now() - autoRoom.at > ROOM_WAIT) { const ts = autoRoom.ts; autoRoom = null; hostGo(ts); }
}
function prefTsFor(auto) { return auto && autoRoom ? autoRoom.ts : roomTs; }
let roomTs = 1;
function hostGo(ts) {
  const humans = room.peers().filter((p) => p.presence && p.presence.st === "lobby" && p.presence.j).sort((a, b) => a.presence.j - b.presence.j);
  const teams = {}; humans.forEach((p, i) => { teams[p.peer] = Math.floor(i / ts); });
  room.presence({ go: { seed: (Math.random() * 1e9) >>> 0, t0: Date.now() + 4000, nb: Math.max(0, Math.min(15, 16 - humans.length)), ts, teams }, hn: Date.now() }).catch(() => {});
}
function teamInit() {
  $("searchBtn").addEventListener("click", startSearch);
  $("mmCancel").addEventListener("click", cancelSearch);
  $("regionList").addEventListener("click", (e) => { const b = e.target.closest("button"); if (!b) return; store.set("ls3.region", b.dataset.r); serversUi(); });
  for (const id of ["tsList", "tsMenu", "tsSolo"]) $(id).addEventListener("click", (e) => { const b = e.target.closest("button"); if (!b) return; store.set("ls3.ts", +b.dataset.ts); roomTs = +b.dataset.ts; serversUi(); });
  $("specNext").addEventListener("click", () => nextSpec());
  $("specLeave").addEventListener("click", () => { specEnt = null; $("spec").hidden = true; if (!ended) { ended = true; showEnd(false, deathRank, ""); } });
  $("reviveBtn").addEventListener("click", () => { const o = nearKnockedMate(me); if (o) startRevive(me, o); });
  setInterval(autoStartCheck, 500);
  serversUi();
}

// ---------------- soldier model ----------------
let soldierGltf = null;
const SUITS = [{ id: "op", name: "عمليات", url: window.OP_URL || "models/op.glb", gltf: null }, { id: "swat", name: "قوات خاصة", url: window.SOLDIER_URL || "models/swat.glb", gltf: null }, { id: "camo", name: "مموّه", url: window.CAMO_URL || "models/camo.glb", gltf: null }];
function prepModel(g) {
  // a generous bounding sphere per body part, so characters off screen are skipped by the renderer
  g.scene.updateMatrixWorld(true);
  g.scene.traverse((o) => { if (o.isSkinnedMesh) { try { o.computeBoundingSphere(); o.boundingSphere.radius *= 1.8; } catch (e) { o.boundingSphere = null; } } });
  return g;
}
function suitOf(id) { const s = SUITS.find((x) => x.id === id && x.gltf); return s ? s.gltf : soldierGltf; }
function suitPick(pr) { pr = pr || {}; return (pr.suitV | 0) >= 2 && SUITS.some((x) => x.id === pr.suit) ? pr.suit : "op"; } // everyone starts in the new operator once
function mySuit() { return suitPick(PROFILE); }
const loadModel = new Promise((resolve, reject) => {
  // load the suit you wear first, the other one right after
  const want = suitPick(store.get("ls3.profile", {})), first = SUITS.find((x) => x.id === want) || SUITS[0], rest = SUITS.filter((x) => x !== first);
  new GLTFLoader().load(first.url, (g) => { first.gltf = prepModel(g); soldierGltf = g; resolve(g);
    // the other suits load one after another in the background
    const next = () => { const s2 = rest.shift(); if (!s2) return; new GLTFLoader().load(s2.url, (g2) => { s2.gltf = prepModel(g2); next(); }, undefined, next); }; next();
  }, (ev) => {
    if (ev.total) $("loadPct").textContent = ar(Math.round(ev.loaded / ev.total * 100)) + "٪";
  }, reject);
});
loadModel.then(() => { $("loading").hidden = true; $("menuBtns").hidden = false; setupLobbyModel(); }).catch((err) => { console.error("load", err && (err.stack || err.message || err)); loadFailed(); });
function loadFailed() {
  const l = $("loading"); l.textContent = "ما قدرنا نحمّل الجندي. تأكد من النت واضغط «حاول مرة ثانية». ";
  const b = document.createElement("button"); b.className = "btn"; b.type = "button"; b.textContent = "حاول مرة ثانية"; b.style.marginTop = "8px";
  b.addEventListener("click", () => location.reload()); l.append(b);
}
setTimeout(() => { if (!soldierGltf) loadFailed(); }, 30000);

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
  const G = suitOf(e.suit || "swat");
  const root = SkeletonUtils.clone(G.scene);
  const tint = new THREE.Color(e.tint || "#ffffff");
  root.traverse((o) => {
    if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; o.frustumCulled = false; if (e.tint && e.tint !== "#ffffff" && o.material && !/visor|head/i.test(o.material.name)) { o.material = o.material.clone(); o.material.color.multiply(tint); } }
  });
  const holder = new THREE.Group(); holder.add(root); root.rotation.y = FACE;
  // light copies of the body for soldiers far away
  const lodHi = [], lodLo = [];
  root.traverse((o) => { if (!o.isSkinnedMesh) return; if (/_LOD$/.test(o.parent && o.parent.name) || /_LOD$/.test(o.name)) { lodLo.push(o); o.visible = false; } else lodHi.push(o); });
  const rig = makeRig(root, holder);
  const guns = {}, gunTint = e.kind === "me" ? GUNSKINS[PROFILE.gun].c : null;
  const gunFor = (cls) => { if (!guns[cls]) { guns[cls] = makeHeldGun(cls, gunTint); guns[cls].visible = false; holder.add(guns[cls]); } return guns[cls]; };
  const gun = gunFor("rifle");
  const mixer = new THREE.AnimationMixer(root);
  const clip = (n) => G.animations.find((a) => a.name === n);
  // motion-captured clips: tactical walk / run (gun up), relaxed walk and sprint, kneeling reload
  const acts = {};
  for (const [k, n, alt] of [["idle", "Idle"], ["walk", "Walk"], ["run", "Run"], ["walkup", "WalkUp", "Walk"], ["sprint", "Sprint", "Run"], ["strafe", "Strafe", "Walk"], ["kneel", "ReloadKneel", null]]) {
    const c = clip(n) || (alt && clip(alt)); if (c) acts[k] = mixer.clipAction(c);
  }
  for (const k in acts) { acts[k].play(); acts[k].setEffectiveWeight(k === "idle" ? 1 : 0); }
  const chute = new THREE.Group();
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(2.4, 16, 8, 0, TAU, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: e.kind === "me" ? CHUTES[PROFILE.chute].c : e.kind === "remote" ? e.color : 0xd9d2bb, side: THREE.DoubleSide, roughness: 0.8 }));
  canopy.scale.y = 0.55; canopy.position.y = 5.2; chute.add(canopy);
  const lines = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-2.2, 5.2, 0), new THREE.Vector3(0, 1.5, 0), new THREE.Vector3(2.2, 5.2, 0), new THREE.Vector3(0, 1.5, 0), new THREE.Vector3(0, 5.2, -2.2), new THREE.Vector3(0, 1.5, 0), new THREE.Vector3(0, 5.2, 2.2), new THREE.Vector3(0, 1.5, 0)]), new THREE.LineBasicMaterial({ color: 0x333333 }));
  chute.add(lines); chute.visible = false; holder.add(chute);
  holder.visible = false;
  scene.add(holder);
  let tag = null;
  if (e.kind === "remote") { tag = nameTag(e.name, e.color); tag.position.y = 2.25; holder.add(tag); }
  return { holder, root, mixer, acts, cur: "idle", chute, gun, guns, gunFor, rig, tag, lx: e.x, ly: e.y, vx: 0, vy: 0, lodHi, lodLo, far: false };
}
function nameTag(text, color) {
  const c = document.createElement("canvas"); c.width = 256; c.height = 64; const g = c.getContext("2d");
  g.font = "700 30px sans-serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillStyle = "rgba(0,0,0,0.5)"; g.fillRect(20, 10, 216, 44); g.fillStyle = color; g.fillText(text, 128, 33);
  const t = new THREE.CanvasTexture(c); const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true })); s.scale.set(1.6, 0.4, 1); return s;
}
function setAnim(v, name) {
  if (!v.acts[name]) name = name === "kneel" ? "idle" : name === "sprint" || name === "strafe" ? "run" : name === "walkup" ? "walk" : "idle";
  if (v.cur === name) return;
  const from = v.acts[v.cur], to = v.acts[name];
  const LOCO = { walk: 1, run: 1, sprint: 1, walkup: 1, strafe: 1 };
  to.enabled = true; to.setEffectiveTimeScale(1); to.setEffectiveWeight(1);
  to.time = LOCO[v.cur] && LOCO[name] ? (from.time / from.getClip().duration) * to.getClip().duration : 0;
  from.crossFadeTo(to, LOCO[v.cur] && LOCO[name] ? 0.3 : 0.22, false);
  v.cur = name;
}
function disposeVisual(v) { if (!v) return; scene.remove(v.holder); v.mixer.stopAllAction(); }

// ---------------- game state ----------------
let mode = "menu", online = false, isHost = false;
let ents = [], me = null, feedEl = $("feed"), matchT = 0, matchStartWall = 0, ended = false, deathRank = 0, aliveCache = -1;
let camColl = 3.4;
let camYaw = 0, camPitch = 0.12, camYawT = 0, camPitchT = 0.12, camDist = 3.4, aimZoom = false, camH = 1.55, shadowsOff = false;
let lastZoneHurt = 0, zoneWarned = -1, tutorial = null;

function newEnt(id, name, kind) {
  return { id, name, kind, color: "#f2a541", tint: "#ffffff", x: 0, y: 0, z: 110, a: 0, hp: 100, armor: 0, alive: true, ph: "plane", paraT: 0,
    w: [-1, -1, -1], mag: [0, 0, 0], cur: 0, ammo: { l: 0, h: 0, s: 0 }, heals: { b: 0, f: 0, m: 0, d: 0, p: 0, x: 0 }, thr: { g: 0, s: 0, o: 0, z: 0 }, spare: {}, att: [{}, {}, {}], fm: ["auto", "auto", "auto"], boost: 0, helm: 0, pack: 0, pan: false, thrSel: "g", fireT: 0, reloadT: 0, healT: 0, healKind: null, kills: 0,
    vx: 0, vy: 0, moving: false, jumpAt: 0, think: 0, target: null, goal: null, react: 0, strafe: 1, stuckT: 0, lx: 0, ly: 0, aimErr: 0, skill: 0.7,
    tx: 0, ty: 0, ta: 0, deadT: 0, vis: null, zoneAcc: 0, stance: "stand", vz: 0, stepAcc: 0, mode: "roam", memory: 0, underFire: 0,
    onGround: true, gz: 0, peak: 0, climb: null, veh: null, runT: 0, path: null, pathT: 0, streak: 0, lastKillT: -99 };
}
let teamScore = [0, 0], lastKind = "arena";
function hpTick() { $("hpfill").style.width = clamp(me.hp, 0, 100) + "%"; $("hpbar").classList.toggle("low", me.hp < 35); }
function startMatch(seed, opts) {
  for (const e of ents) disposeVisual(e.vis);
  clearThrowables(); bullets.length = 0; matchEventsReset();
  const arena = opts.kind === "arena"; lastKind = arena ? "arena" : "br";
  MAP = arena ? genArena(seed) : genMap(seed); buildWorld(); groundMini = renderMiniGround();
  ents = []; feedEl.innerHTML = ""; ended = false; deathRank = 0; zoneWarned = -1; aliveCache = -1; fxReset(); teamScore = [0, 0];
  const nick = ($("nick").value.trim() || "لاعب").slice(0, 14);
  me = newEnt("me", nick, "me"); me.color = opts.color || NET_COLORS[0]; me.tint = myOutfit().c; me.suit = mySuit(); me.team = 0; ents.push(me); awarded = false;
  const names = BOT_NAMES.slice().sort(() => MAP.R() - 0.5);
  for (let i = 0; i < opts.bots; i++) {
    const b = newEnt("b" + i, names[i % names.length], "bot"); b.tint = TINTS[1 + (i % (TINTS.length - 1))]; { const r = MAP.R(); b.suit = r < 0.55 ? "op" : r < 0.8 ? "camo" : "swat"; }
    b.jumpAt = MAP.plane.dur * (0.08 + MAP.R() * 0.84); b.skill = 0.5 + MAP.R() * 0.4; ents.push(b);
    if (arena) { b.team = i < ARENA.team - 1 ? 0 : 1; b.tint = b.team === 0 ? "#9fb4d8" : "#d89a8a"; b.skill = 0.45 + MAP.R() * 0.35; }
  }
  for (const r of opts.remotes || []) ents.push(r);
  for (const e of ents) e.vis = makeVisual(e);
  assignTeams(opts); specEnt = null; $("spec").hidden = true;
  if (arena) for (const e of ents) { if (e.kind === "bot" && e.team === 0) { const t = nameTag(e.name, "#8ec5ff"); t.position.y = 2.15; t.scale.set(0.9, 0.22, 1); e.vis.holder.add(t); } arenaSpawn(e); }
  const P = MAP.plane; camYaw = camYawT = arena ? 0 : Math.atan2(P.y2 - P.y1, P.x2 - P.x1); camPitch = camPitchT = arena ? 0.02 : 0.35;
  for (const b of deathBoxes) world.remove(b); deathBoxes.length = 0;
  engineOn(false); document.body.classList.remove("driving"); document.body.classList.toggle("arena", arena); swinging.clear(); vm.cur = -2;
  matchStartWall = opts.t0; matchT = 0; mode = "play";
  tutorial = { step: arena || store.get("ls3.tut", 0) >= 3 ? 99 : 0, t: 0 };
  showHud(true); updateHud(true); keepAwake();
  if (arena) hint("اقتل الفريق الأحمر! أول فريق يوصل " + ar(ARENA.target) + " قتلة يفوز", 4500);
  else hint(IS_TOUCH ? "اضغط زر «اقفز» لما تكون فوق مكان يعجبك" : "اضغط مسافة (Space) عشان تقفز من الطيارة");
}
const PRIMS = [1, 2, 2, 3, 4, 2, 1];
function arenaSpawn(e) {
  const sp = MAP.spawns[e.team || 0];
  let best = sp[0], bd = -1;
  for (const s of sp) { let md = 1e9; for (const o of ents) if (o.alive && o.team !== e.team && o.ph === "ground") md = Math.min(md, Math.hypot(o.x - s.x, o.y - s.y)); md += Math.random() * 6; if (md > bd) { bd = md; best = s; } }
  e.x = best.x + (Math.random() - 0.5); e.y = best.y + (Math.random() - 0.5); e.z = 0; e.a = best.a; e.onGround = true; e.peak = 0; e.vz = 0; e.vx = e.vy = 0;
  e.ph = "ground"; e.alive = true; e.hp = 100; e.armor = 1; e.deadT = 0; e.stance = "stand"; e.climb = null; e.veh = null; e.target = null; e.goal = null; e.heard = null; e.path = null; e.mode = "roam";
  e.reloadT = 0; e.healT = 0; e.fireT = 0.4; e.spawnProt = 2.2; e.lastHurtT = -99;
  const prim = e === me ? (PROFILE.primary || 2) : PRIMS[Math.floor(Math.random() * PRIMS.length)];
  e.att = [{}, {}, {}]; e.w = [prim, 0, -1]; e.cur = 0; e.mag = [magOf(e, prim), magOf(e, 0), 0]; e.ammo = { l: 999, h: 999, s: 999 };
  e.heals = { b: 0, f: 0, m: 0, d: 0, p: 0, x: 0 }; e.thr = { g: 1, s: 1, o: 0, z: 0 }; e.spare = {}; e.helm = 1; e.boost = 0; e.pan = false;
  if (prim === 2 || prim === 1) e.att[0] = { s: "rd" };
  if (e.vis) { e.vis.root.rotation.x = 0; e.vis.root.position.y = 0; }
  if (e === me) { camYaw = camYawT = best.a; camPitch = camPitchT = 0.02; $("respawn").hidden = true; updateHud(); updateStanceUi(); vm.cur = -2; }
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
const _lo = new THREE.Vector3(), _ld = new THREE.Vector3();
function castShot(o, d, range, shooter) {
  // nearest obstacle
  let best = range, hitEnt = null, head = false, limb = false;
  const seen = new Set();
  for (let s = 0; s <= range; s += 9) {
    const px = o.x + d.x * s, pz = o.z + d.z * s;
    for (const ob of near(px, pz, 7)) {
      if (seen.has(ob)) continue; seen.add(ob);
      if (ob.kind === "door" && ob.open) continue;
      let t;
      if (ob.t === "r") t = rayBox(o, d, ob.x, ob.z0 || 0, ob.y, ob.x + ob.w, ob.h3, ob.y + ob.h);
      else if (ob.kind === "tree") t = rayCyl(o, d, ob.x, ob.y, 0.3 * ob.s, 0, 6);
      else t = rayCyl(o, d, ob.x, ob.y, ob.r * 0.85, ob.z0 || 0, ob.h3);
      if (t < best) best = t;
    }
    if (best < s) break;
  }
  if (o.y + d.y * best < 0 && d.y < 0) best = Math.min(best, -o.y / d.y); // ground
  // vehicles: test the ray in the car's own frame
  let hitVeh = null;
  for (const v of MAP.vehicles) {
    const dx = v.x - o.x, dz = v.y - o.z; if (dx * dx + dz * dz > (best + 4) * (best + 4)) continue;
    const P = VSPEC[v.type], c = Math.cos(v.a), s = Math.sin(v.a), ox = o.x - v.x, oz = o.z - v.y;
    _lo.set(ox * c + oz * s, o.y, -ox * s + oz * c); _ld.set(d.x * c + d.z * s, d.y, -d.x * s + d.z * c);
    const t = rayBox(_lo, _ld, -P.len / 2, 0.25, -P.wid / 2, P.len / 2, P.hgt, P.wid / 2);
    if (t < best) { best = t; hitVeh = v; }
  }
  for (const e of ents) {
    if (e === shooter || !e.alive || e.ph !== "ground") continue;
    const hh = e.veh ? 1.45 : e.stance === "prone" ? 0.55 : e.stance === "crouch" ? 1.25 : 1.85, z0 = (e.z || 0) + (e.veh ? VSPEC[e.veh.type].seat[1] : 0);
    const ex = e.veh ? vehWorld(e.veh, VSPEC[e.veh.type].seat[0], VSPEC[e.veh.type].seat[2]) : e;
    const t = rayCyl(o, d, ex.x, ex.y, e.stance === "prone" ? 0.6 : 0.36, e.veh ? z0 + VSPEC[e.veh.type].belt - 0.1 : z0, z0 + hh);
    if (t < best) { best = t; hitEnt = e; hitVeh = null; const hy = o.y + d.y * t; head = hy > z0 + hh * 0.82; limb = !head && e.stance !== "prone" && !e.veh && hy < z0 + hh * 0.45; }
  }
  return { t: best, ent: hitEnt, head, limb, veh: hitVeh };
}
function canShoot(e) { return e.alive && !e.knocked && !e.reviving && e.ph === "ground" && e.healT <= 0 && e.reloadT <= 0 && e.fireT <= 0; }
function totalAmmo(e) { const wi = e.w[e.cur]; return wi < 0 ? 0 : e.ammo[WEAP[wi].ammo]; }
function startReload(e) {
  const wi = e.w[e.cur]; if (wi < 0 || e.reloadT > 0 || e.healT > 0) return;
  const W = WEAP[wi]; if (e.mag[e.cur] >= magOf(e, wi) || e.ammo[W.ammo] <= 0) { if (e === me && e.ammo[W.ammo] <= 0) hint("خلصت الذخيرة! دوّر على ذخيرة " + AMMO_NAME[W.ammo]); return; }
  e.reloadT = W.reload * relK(e, wi); if (e === me) tone(520, 0.05, "square", 0.03);
}
function finishReload(e) { const wi = e.w[e.cur]; if (wi < 0) return; const W = WEAP[wi], take = Math.min(magOf(e, wi) - e.mag[e.cur], e.ammo[W.ammo]); e.mag[e.cur] += take; e.ammo[W.ammo] -= take; if (e === me) { tone(760, 0.05, "square", 0.03); updateHud(); } }
function startHeal(e, kind) { return useHeal(e, kind); }
function finishHeal(e) { finishUse(e); }

const tmpV = new THREE.Vector3(), tmpV2 = new THREE.Vector3();
function muzzlePos(e, out) { const h = e.stance === "prone" ? 0.35 : e.stance === "crouch" ? 0.95 : 1.32; return out.set(e.x + Math.cos(e.a) * 0.6 + Math.cos(e.a + Math.PI / 2) * 0.22, (e.z || 0) + h, e.y + Math.sin(e.a) * 0.6 + Math.sin(e.a + Math.PI / 2) * 0.22); }

function playerFire() {
  const e = me, wi = e.w[e.cur];
  if (!canShoot(e) || e.veh || e.climb) return;
  if (wi < 0) { hint("ما عندك سلاح! امشِ فوق سلاح عشان تلتقطه"); e.fireT = 0.6; return; }
  const W = WEAP[wi];
  if (W.melee) { meleeSwing(e); return; }
  if (e.mag[e.cur] <= 0) { startReload(e); return; }
  e.mag[e.cur]--; e.fireT = W.rate;
  const AM = attMods(e, e.cur);
  camera.getWorldDirection(ray.d); ray.o.copy(camera.position);
  // skip past the player so walls behind the shoulder don't block
  const skip = camera.position.distanceTo(tmpV.set(e.x, e.z + 1.5, e.y)) + 0.3;
  const moving = (e.moving ? 1.6 : 1) * (!e.onGround ? 2 : 1) * (e.stance === "prone" ? 0.5 : e.stance === "crouch" ? 0.7 : 1), zoomK = aimZoom ? 0.45 : 1;
  let anyHit = false; const dealt = new Map(); const fpsNow = fpsActive() && !e.veh; e.shotT = 2;
  for (let p = 0; p < W.pel; p++) {
    const d = tmpV2.copy(ray.d);
    const sk = W.spread * 2 * moving * zoomK * AM.spr;
    d.x += (Math.random() - 0.5) * sk; d.y += (Math.random() - 0.5) * sk; d.z += (Math.random() - 0.5) * sk; d.normalize();
    const o = tmpV.copy(ray.o).addScaledVector(d, skip);
    if (W.pel === 1 && MUZZLE_V[wi]) { fireBullet(e, wi, o, d, fpsNow ? vmMuzzleWorld(new THREE.Vector3()) : muzzlePos(e, new THREE.Vector3())); continue; }
    const r = castShot(o, d, W.range, e);
    const end = o.clone().addScaledVector(d, r.t);
    addTracer(fpsNow ? vmMuzzleWorld(new THREE.Vector3()) : muzzlePos(e, new THREE.Vector3()), end, wi === 4);
    if (r.ent) {
      anyHit = true;
      const fall = wi === 3 ? clamp(1 - r.t / W.range * 0.7, 0.3, 1) : 1;
      const dm = W.dmg * dmgK(e, wi) * fall * (r.head ? 1.8 : r.limb ? 0.7 : 1), dd = dealt.get(r.ent) || { d: 0, head: false, p: end };
      dd.d += dm * (r.head ? 1 - (HELM[r.ent.helm | 0] || 0) : 1 - (ARMOR[r.ent.armor] || 0)); dd.head = dd.head || r.head; dealt.set(r.ent, dd);
      dealHit(e, r.ent, dm, wi, r.head);
      blood(end);
    } else if (r.veh) { vehDamage(r.veh, W.dmg * 0.6, e); puff(end, 0xffd27a, 0.25, 0.15); anyHit = anyHit || !!r.veh.driver; }
    else if (r.t < W.range - 0.5) dust(end);
  }
  for (const [t, dd] of dealt) dmgNum(t, dd.d, dd.head, !t.alive);
  if (anyHit) hitMarker();
  alertBots(e.x, e.y, e, (wi === 4 ? 140 : 80) * (AM.quiet ? 0.35 : 1), e.z);
  if (online) netShot(e, wi);
  recoil += (wi === 4 ? 0.05 : wi === 3 ? 0.04 : wi === 5 ? 0.028 : wi === 6 ? 0.016 : 0.012) * AM.rec;
  shotSfx(wi, AM.quiet ? 0.35 : 1); if (fpsNow) vmFire(wi); else flash(e);
  if (e.mag[e.cur] === 0 && totalAmmo(e) > 0) startReload(e);
  updateHud();
}
// ---- real bullets: they take time to fly and drop with distance ----
const MUZZLE_V = { 0: 360, 1: 400, 2: 880, 4: 940, 5: 860, 6: 860 };
const bullets = [];
function fireBullet(e, wi, o, d, from) {
  const b = { e, wi, p: o.clone(), v: d.clone().multiplyScalar(MUZZLE_V[wi]), dist: 0, from: from.clone(), first: true };
  bullets.push(b); stepBullet(b, 1 / 60);
}
function stepBullet(b, dt) {
  const W = WEAP[b.wi], g = 9.8;
  const np = b.p.clone().addScaledVector(b.v, dt); np.y -= 0.5 * g * dt * dt;
  const seg = np.clone().sub(b.p), len = seg.length(); seg.divideScalar(len || 1);
  const r = castShot(b.p, seg, len, b.e);
  const hit = r.t < len - 1e-3, end = b.p.clone().addScaledVector(seg, hit ? r.t : len);
  addTracer(b.first ? b.from : b.p, end, b.wi === 4 || b.wi === 5); b.first = false;
  b.dist += hit ? r.t : len; b.v.y -= g * dt; b.p.copy(np);
  if (hit) {
    if (r.ent) {
      const dm = W.dmg * dmgK(b.e, b.wi) * (r.head ? 1.8 : r.limb ? 0.7 : 1) * (b.dist > W.range ? 0.6 : 1);
      dealHit(b.e, r.ent, dm, b.wi, r.head); blood(end);
      if (b.e === me) { hitMarker(); dmgNum(r.ent, dm * (r.head ? 1 - (HELM[r.ent.helm | 0] || 0) : 1 - (ARMOR[r.ent.armor] || 0)), r.head, !r.ent.alive); }
    } else if (r.veh) { vehDamage(r.veh, W.dmg * 0.6, b.e); puff(end, 0xffd27a, 0.25, 0.15); }
    else dust(end);
    return false;
  }
  return b.dist < W.range * 1.6 && b.p.y > -2;
}
function stepBullets(dt) { for (let i = bullets.length - 1; i >= 0; i--) if (!stepBullet(bullets[i], dt)) bullets.splice(i, 1); }
function botFire(b, t) {
  const wi = b.w[b.cur]; if (!canShoot(b) || wi < 0 || b.veh || b.climb || b.stunT > 0 || WEAP[wi].melee) return;
  const W = WEAP[wi]; if (b.mag[b.cur] <= 0) { startReload(b); return; }
  b.mag[b.cur]--; b.fireT = W.rate * (1.25 + (1 - b.skill) * 0.6); b.shotT = 2;
  const d = Math.hypot(t.x - b.x, t.y - b.y);
  b.aimP = Math.atan2(((b.z || 0) + 1.45) - ((t.z || 0) + (t.stance === "prone" ? 0.3 : t.stance === "crouch" ? 1.0 : 1.3)), Math.max(1, d));
  if (b.stance !== "prone" && Math.random() < 0.04) b.leanT = Math.random() < 0.6 ? (Math.random() < 0.5 ? -1 : 1) : 0;
  const mv = (t.moving ? 0.65 : 1) * (t.stance === "prone" ? 0.55 : t.stance === "crouch" ? 0.8 : 1), base = b.skill * clamp(1 - d / (W.range * 1.05), 0.05, 1) * mv * (t === me && me.ph === "ground" && insideBuilding(me.x, me.y) ? 0.8 : 1);
  const from = muzzlePos(b, new THREE.Vector3());
  let hits = 0;
  for (let p = 0; p < W.pel; p++) if (Math.random() < clamp(base * 0.6, 0.03, 0.7)) hits++;
  const to = new THREE.Vector3(t.x + (hits ? 0 : (Math.random() - 0.5) * 1.6), (t.z || 0) + 0.9 + Math.random() * 0.8, t.y + (hits ? 0 : (Math.random() - 0.5) * 1.6));
  addTracer(from, to, wi === 4);
  if (online) netShot(b, wi);
  alertBots(b.x, b.y, b, 60, b.z);
  const dm = Math.hypot(b.x - me.x, b.y - me.y);
  shotSfx(wi, clamp(1 - dm / 180, 0, 1));
  flash(b);
  if (hits && t.veh) { vehDamage(t.veh, W.dmg * hits * 0.5, b); if (Math.random() < 0.5) hits = 0; }
  if (hits) dealHit(b, t, W.dmg * hits * (t === me || t.kind === "remote" ? 0.75 : 1), wi, false);
  if (t === me && !hits && dm < 25) { whizz(); }
}
function dealHit(src, target, dmg, wi, head) {
  if (panBlocks(src, target, wi, head)) return;
  if (friends(src, target)) return;
  if (target.spawnProt > 0) return;
  if (online) {
    if (target.kind === "remote") { netDamage(target.id, dmg, wi); return; }
    if (target.kind === "bot" && !isHost) { netDamage(target.id, dmg, wi); return; }
  }
  applyDamage(target, dmg, src ? src.id : null, src ? src.name : "", wi, head);
}
function applyDamage(t, dmg, killerId, killerName, wi, head) {
  if (!t.alive) return;
  if (t.kind === "bot") { t.underFire = 2.5; const src = ents.find((x) => x.id === killerId); if (src && src.alive && src !== t && !t.seen) { t.target = src; t.memory = 6; t.react = 0.3; } }
  t.hp -= t.knocked ? dmg : dmg * (head ? 1 - (HELM[t.helm | 0] || 0) : 1 - (ARMOR[t.armor] || 0)); t.lastHurtT = matchT; t.hitAt = performance.now() / 1000;
  if (t === me) {
    hurt = 1; buzz(30); tone(140, 0.12, "sawtooth", 0.05, -40);
    if (t.healT > 0) { t.healT = 0; t.healKind = null; }
    const src = ents.find((x) => x.id === killerId); if (src) showDamageDir(src);
    updateHud();
  }
  if (t.hp <= 0) {
    if (TS > 1 && !t.knocked && t.ph === "ground" && MAP.kind !== "arena" && teamUp(t) && !(online && t.kind === "remote")) knock(t, killerId, killerName, wi, head);
    else { t.knocked = false; kill(t, killerId, killerName, wi, head); }
  }
}
function kill(t, killerId, killerName, wi, head) {
  if (t.veh) exitVehicle(t, true);
  t.climb = null; t.alive = false; t.hp = 0; t.deadT = 0; t.deaths = (t.deaths || 0) + 1;
  { const k = ents.find((x) => x.id === killerId); t.deadDir = k && k !== t ? (Math.cos(t.a) * (k.x - t.x) + Math.sin(t.a) * (k.y - t.y) > 0 ? 1 : -1) : (Math.random() < 0.5 ? 1 : -1); }
  const arenaK = MAP.kind === "arena";
  if (!online && !arenaK) dropDeathBox(t);
  const killer = ents.find((e) => e.id === killerId);
  const how = HOW[wi] || (WEAP[wi] ? WEAP[wi].name : "");
  if (killer && killer !== t) { killer.kills++; if (killer === me) { tone(880, 0.1, "triangle", 0.06); tone(1320, 0.14, "triangle", 0.05); buzz(40); killBanner(t.name, head, how, Math.hypot(t.x - me.x, t.y - me.y)); } }
  addFeed(killerName && killerId !== t.id ? killerName : null, t.name, how, t === me || killer === me, head);
  if (online && isHost && t.kind === "bot") netBotDeath(t, killerId);
  if (arenaK) { const kr = ents.find((e) => e.id === killerId); if (kr && kr.team !== t.team) teamScore[kr.team]++; else if (!kr) teamScore[1 - (t.team || 0)]++; if (t === me) { $("respawn").hidden = false; $("respawnBy").textContent = killerName && killerId !== t.id ? "قتلك " + killerName + (how ? " بـ" + how : "") : ""; buzz([60, 30, 120]); } }
  else if (t === me) onMyDeath(killerName, how);
  updateHud();
}

// effects (pooled: no new materials or geometry while shooting, so no stutter)
const tracers = [], flashes = [], puffs = [], sparks = [];
const _fxUp = new THREE.Vector3(0, 1, 0), _fxD = new THREE.Vector3(), _fxM = new THREE.Vector3();
const trGeo = (() => { const g = new THREE.CylinderGeometry(1, 1, 1, 6, 1, true); g.translate(0, 0.5, 0); return g; })();
function poolGet(arr, cap, make) { for (const x of arr) if (x.life <= 0) return x; if (arr.length < cap) { const x = make(); arr.push(x); return x; } let o = arr[0]; for (const x of arr) if (x.life < o.life) o = x; return o; }
function addTracer(a, b, sniper) {
  _fxD.subVectors(b, a); const len = _fxD.length(); if (len < 0.05) return;
  const t = poolGet(tracers, 90, () => { const m = new THREE.Mesh(trGeo, new THREE.MeshBasicMaterial({ color: 0xffc860, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false })); m.frustumCulled = false; m.renderOrder = 3; scene.add(m); return { l: m, life: 0, max: 1 }; });
  // keep far tracers at least ~1.5 px wide so you can still see where shots come from
  _fxM.copy(a).add(b).multiplyScalar(0.5); const cd = Math.max(1, camera.position.distanceTo(_fxM));
  const w = (sniper ? 0.018 : 0.011) * Math.max(1, cd / 18);
  t.l.position.copy(a); t.l.quaternion.setFromUnitVectors(_fxUp, _fxD.divideScalar(len)); t.l.scale.set(w, len, w);
  t.l.material.color.setHex(sniper ? 0xfff0c8 : 0xffb84a); t.l.material.opacity = 1; t.l.visible = true; t.life = t.max = sniper ? 0.2 : 0.055;
}
const flashTex = canvasTex(64, 64, (g) => {
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, "rgba(255,250,220,1)"); gr.addColorStop(0.25, "rgba(255,200,90,0.95)"); gr.addColorStop(1, "rgba(255,120,0,0)"); g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  g.globalCompositeOperation = "lighter"; g.fillStyle = "rgba(255,220,140,0.8)"; for (let i = 0; i < 4; i++) { g.save(); g.translate(32, 32); g.rotate(i * Math.PI / 2 + 0.3); g.beginPath(); g.moveTo(0, -3); g.lineTo(30, 0); g.lineTo(0, 3); g.fill(); g.restore(); }
});
function flash(e) {
  const f = poolGet(flashes, 24, () => { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: flashTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false })); scene.add(sp); return { s: sp, life: 0 }; });
  muzzlePos(e, f.s.position); const sc = 0.55 + Math.random() * 0.35; f.s.scale.set(sc, sc, 1); f.s.material.rotation = Math.random() * TAU; f.s.visible = true; f.life = 0.05;
}
const puffTex = canvasTex(64, 64, (g) => {
  // soft, slightly lumpy smoke
  for (let i = 0; i < 7; i++) { const x = 32 + (Math.random() - 0.5) * 18, y = 32 + (Math.random() - 0.5) * 18, r = 14 + Math.random() * 10; const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, "rgba(255,255,255,0.55)"); gr.addColorStop(1, "rgba(255,255,255,0)"); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); }
});
function puff(p, color, size, life, rise = 0) {
  const q = poolGet(puffs, 140, () => { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: puffTex, transparent: true, depthWrite: false })); scene.add(sp); return { s: sp, life: 0, max: 1, grow: 1, rise: 0 }; });
  q.s.position.copy(p); q.s.scale.set(size, size, 1); q.s.material.color.setHex(color); q.s.material.rotation = Math.random() * TAU; q.s.material.opacity = 1; q.s.visible = true;
  q.life = q.max = life; q.grow = size * 1.5; q.rise = rise;
}
const sparkTex = canvasTex(16, 16, (g) => { const gr = g.createRadialGradient(8, 8, 0, 8, 8, 8); gr.addColorStop(0, "rgba(255,255,230,1)"); gr.addColorStop(0.4, "rgba(255,190,80,0.9)"); gr.addColorStop(1, "rgba(255,120,0,0)"); g.fillStyle = gr; g.fillRect(0, 0, 16, 16); });
function spark(p, n, col = 0xffffff) {
  for (let i = 0; i < n; i++) {
    const q = poolGet(sparks, 60, () => { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: sparkTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); scene.add(sp); return { s: sp, life: 0, v: new THREE.Vector3() }; });
    q.s.position.copy(p); q.s.material.color.setHex(col); const sc = 0.05 + Math.random() * 0.06; q.s.scale.set(sc, sc, 1); q.s.visible = true;
    q.v.set((Math.random() - 0.5) * 6, 1.5 + Math.random() * 4, (Math.random() - 0.5) * 6); q.life = 0.18 + Math.random() * 0.2;
  }
}
// bullet hitting the ground or a wall: a puff of dirt, a fine dust cloud, and sparks off hard surfaces
function dust(p) {
  const onGround = p.y < 0.12, col = onGround ? (onRoad(p.x, p.z) ? 0x9a978c : 0x8c7a58) : 0xc7bea8;
  puff(p, col, 0.35, 0.3, 0.6); puff(p, col, 0.7, 0.9, 0.35);
  if (!onGround && Math.random() < 0.8) spark(p, 3 + (Math.random() * 3 | 0));
  else if (onGround && camera.position.distanceToSquared(p) < 900) spark(p, 3, 0x6b5a3c);
}
function blood(p) { puff(p, 0x8f1010, 0.45, 0.3, 0.1); puff(p, 0xa31414, 0.8, 0.45, -0.3); }
function fxTick(dt) {
  for (const t of tracers) if (t.life > 0) { t.life -= dt; t.l.material.opacity = Math.max(0, t.life / t.max); if (t.life <= 0) t.l.visible = false; }
  for (const f of flashes) if (f.life > 0) { f.life -= dt; if (f.life <= 0) f.s.visible = false; }
  for (const q of puffs) if (q.life > 0) { q.life -= dt; const k = q.life / q.max; q.s.material.opacity = Math.max(0, k) * 0.85; const sc = q.grow * (1.5 - k); q.s.scale.set(sc, sc, 1); q.s.position.y += q.rise * dt; if (q.life <= 0) q.s.visible = false; }
  for (const q of sparks) if (q.life > 0) { q.life -= dt; q.v.y -= 14 * dt; q.s.position.addScaledVector(q.v, dt); if (q.life <= 0) q.s.visible = false; }
}
function fxReset() { for (const arr of [tracers, flashes, puffs, sparks]) for (const x of arr) { x.life = 0; (x.l || x.s).visible = false; } }

let hurt = 0, recoil = 0, hitT = 0, shake = 0;
function hitMarker() { hitT = 0.15; tone(1400, 0.03, "square", 0.03); }
function whizz() { tone(2200, 0.08, "sine", 0.02, -1500); }
const STREAK = ["", "", "قتلتين!", "ثلاث قتلات!", "أربع قتلات!", "خمس قتلات! وحش", "مجزرة!"];
function killBanner(name, head, how, dist) {
  const k = $("killBanner");
  k.innerHTML = ""; const top = document.createElement("b"); top.textContent = (head ? "طلقة راس – " : "") + "قتلت " + name; k.append(top);
  if (how) { const sub = document.createElement("span"); sub.textContent = how + (dist ? " – " + ar(Math.round(dist)) + " م" : ""); k.append(sub); }
  k.hidden = false; k.classList.remove("pop"); void k.offsetWidth; k.classList.add("pop");
  clearTimeout(killBanner.t); killBanner.t = setTimeout(() => (k.hidden = true), 2200);
  const now = matchT; me.streak = now - me.lastKillT < 12 ? me.streak + 1 : 1; me.lastKillT = now;
  if (me.streak >= 2) { const s = $("streak"); s.textContent = STREAK[Math.min(me.streak, STREAK.length - 1)]; s.hidden = false; s.classList.remove("pop"); void s.offsetWidth; s.classList.add("pop"); clearTimeout(s.t); s.t = setTimeout(() => (s.hidden = true), 2000); tone(1560, 0.12, "triangle", 0.05); }
  const kc = $("kills"); kc.parentElement.classList.remove("bump"); void kc.offsetWidth; kc.parentElement.classList.add("bump");
}
function addFeed(killer, victim, how, mine, head) {
  const d = document.createElement("div");
  const a = document.createElement("b"), w = document.createElement("i"), v = document.createElement("span");
  if (killer) { a.textContent = killer; d.append(a); }
  w.textContent = (how || "قتل") + (head ? " – راس" : ""); d.append(w);
  v.textContent = victim; d.append(v);
  if (mine) d.className = "me"; feedEl.prepend(d); while (feedEl.children.length > 5) feedEl.lastChild.remove();
}
// floating damage numbers over the target
const _np = new THREE.Vector3();
function dmgNum(t, amount, head, killed) {
  if (amount < 0.5) return;
  _np.set(t.x, (t.z || 0) + (t.stance === "prone" ? 0.6 : t.stance === "crouch" ? 1.4 : 2.0), t.y).project(camera);
  if (_np.z > 1) return;
  const el = document.createElement("div"); el.className = "dnum" + (head ? " head" : "") + (killed ? " kill" : "");
  el.textContent = Math.round(amount);
  el.style.left = ((_np.x + 1) / 2 * 100 + (Math.random() - 0.5) * 3) + "%"; el.style.top = ((1 - _np.y) / 2 * 100) + "%";
  $("dnums").append(el); setTimeout(() => el.remove(), 900);
}
let hintTimer = null;
function hint(t, ms = 3200) { const h = $("hint"); h.textContent = t; h.hidden = false; clearTimeout(hintTimer); hintTimer = setTimeout(() => (h.hidden = true), ms); }
function showDamageDir(src) {
  const ang = Math.atan2(src.y - me.y, src.x - me.x) - camYaw; const el = $("dmgDir");
  el.style.transform = `translate(-50%,-50%) rotate(${ang + Math.PI / 2}rad)`; el.hidden = false; clearTimeout(showDamageDir.t); showDamageDir.t = setTimeout(() => (el.hidden = true), 700);
}

// ---------------- loot ----------------
function itemLabel(it) {
  { const n = itemName(it); if (n) return n; }
  if (it.k === "w") return WEAP[it.v].name; if (it.k === "a") return "ذخيرة " + AMMO_NAME[it.v] + " ×" + ar(it.n);
  if (it.k === "b") return "ضماد ×" + ar(it.n); if (it.k === "m") return "حقيبة إسعاف"; if (it.k === "v") return "درع مستوى " + ar(it.v); return "";
}
function takeLoot(e, it, force) {
  ensureKit(e);
  const room = bagRoom(e);
  if (it.k === "a") {
    const cap = it.v === "s" ? 120 : 400, fit = Math.min(it.n, Math.floor(room / AMMO_W[it.v]), Math.max(0, cap - e.ammo[it.v]));
    if (fit <= 0) { if (e === me && force) hint("الشنطة مليانة"); return false; }
    e.ammo[it.v] += fit; if (fit < it.n) { it.n -= fit; if (e === me) { hint("أخذت " + ar(fit) + " بس، الشنطة مليانة", 1600); updateHud(); } return true; }
  }
  else if (it.k === "md" || it.k === "th") {
    const W = it.k === "md" ? HEAL[it.v].w : THROW[it.v].w, fit = Math.min(it.n || 1, Math.floor(room / W));
    if (fit <= 0) { if (e === me && force) hint("الشنطة مليانة"); return false; }
    const bag = it.k === "md" ? e.heals : e.thr; bag[it.v] = (bag[it.v] || 0) + fit;
    if (it.k === "th" && !(e.thr[e.thrSel] > 0)) e.thrSel = it.v;
    if (fit < (it.n || 1)) { it.n -= fit; if (e === me) updateHud(); return true; }
  }
  else if (it.k === "v") { if (it.v <= e.armor) return false; if (e.armor) dropItem(e, { k: "v", v: e.armor }); e.armor = it.v; }
  else if (it.k === "hm") { if (it.v <= (e.helm | 0)) return false; if (e.helm) dropItem(e, { k: "hm", v: e.helm }); e.helm = it.v; }
  else if (it.k === "bp") { if (it.v <= (e.pack | 0)) return false; if (e.pack) dropItem(e, { k: "bp", v: e.pack }); e.pack = it.v; }
  else if (it.k === "at") {
    if (!autoAttach(e, it.v)) { if (room < 5 || (!force && e !== me)) { if (e === me && force) hint("الشنطة مليانة"); return false; } e.spare[it.v] = (e.spare[it.v] || 0) + 1; }
  }
  else if (it.k === "w" && it.v === 7) { if (e.pan) return false; e.pan = true; e.w[2] = 7; }
  else if (it.k === "w") {
    if (e.w.slice(0, 2).includes(it.v) && !force) { const t = WEAP[it.v].ammo; e.ammo[t] += Math.min(15, Math.floor(bagRoom(e) / AMMO_W[t])); }
    else {
      let slot = e.w[0] < 0 ? 0 : e.w[1] < 0 ? 1 : -1;
      if (slot < 0) { if (!force) return false; slot = e.cur < 2 ? e.cur : 0; dropItem(e, { k: "w", v: e.w[slot] }); }
      for (const k in e.att[slot]) { const id = e.att[slot][k]; if (id) e.spare[id] = (e.spare[id] || 0) + 1; }
      e.att[slot] = {};
      e.w[slot] = it.v; e.mag[slot] = Math.ceil(WEAP[it.v].mag / 2); e.cur = slot; e.ammo[WEAP[it.v].ammo] += WEAP[it.v].ammo === "s" ? 5 : 15;
      refitSlot(e, slot);
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
    const dx = it.x - e.x, dy = it.y - e.y, d2 = dx * dx + dy * dy; if (d2 > 2.2 * 2.2 || Math.abs((it.z || 0) - e.z) > 1.4) continue;
    if (it.dropAt && performance.now() - it.dropAt < 3000) continue;
    const auto = it.k === "w" ? (it.v === 7 ? !e.pan : e.w[0] < 0 || e.w[1] < 0 || e.w.slice(0, 2).includes(it.v)) : it.k === "v" ? it.v > e.armor : it.k === "hm" ? it.v > (e.helm | 0) : it.k === "bp" ? it.v > (e.pack | 0) : it.k === "at" ? (attachable(e.w[0], it.v) || attachable(e.w[1], it.v)) : true;
    if (auto) { if (takeLoot(e, it, false)) continue; }
    if (d2 < bd) { bd = d2; best = it; }
  }
  return best;
}
function nearestWeapon(x, y) {
  let best = null, bd = 1e9;
  for (const it of MAP.loot) { if (it.taken || it.k !== "w") continue; const d = Math.hypot(it.x - x, it.y - y); if (d < bd) { bd = d; best = it; } }
  return best;
}

// ---------------- vehicles ----------------
const VSPEC = {
  sport:  { len: 4.4, wid: 1.9, hgt: 1.25, belt: 0.86, wr: 0.36, wx: 1.38, wz: 0.84, max: 40, acc: 12, grip: 7.5, off: 0.55, hp: 220, seat: [-0.35, 0.05, -0.38] },
  jeep:   { len: 4.0, wid: 1.9, hgt: 1.8,  belt: 1.08, wr: 0.46, wx: 1.28, wz: 0.88, max: 31, acc: 9.5, grip: 6.5, off: 0.9, hp: 320, seat: [-0.2, 0.42, -0.4] },
  pickup: { len: 4.8, wid: 2.0, hgt: 1.8,  belt: 1.1,  wr: 0.45, wx: 1.58, wz: 0.9, max: 32, acc: 8.5, grip: 6.2, off: 0.82, hp: 300, seat: [0.55, 0.42, -0.4] }
};
const VGEO = {};
function extrudeSide(pts, depth, bevel) {
  const sh = new THREE.Shape(); sh.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) sh.lineTo(pts[i][0], pts[i][1]); sh.closePath();
  const g = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: !!bevel, bevelThickness: bevel || 0, bevelSize: bevel || 0, bevelSegments: 2, curveSegments: 4 });
  g.translate(0, 0, -depth / 2); return g;
}
function vehGeos(type) {
  if (VGEO[type]) return VGEO[type];
  const P = VSPEC[type], W = P.wid, out = { body: [], glass: [], dark: [], light: [], tail: [], chrome: [] };
  if (type === "sport") {
    out.body.push(extrudeSide([[-2.2, 0.3], [2.1, 0.3], [2.24, 0.45], [2.2, 0.66], [1.15, 0.84], [-1.85, 0.92], [-2.2, 0.86], [-2.24, 0.52]], W - 0.1, 0.05));
    out.glass.push(extrudeSide([[0.95, 0.84], [0.12, 1.2], [-1.0, 1.22], [-1.72, 0.92]], W - 0.34, 0.02));
    out.body.push(boxAt(0.95, 0.04, W - 0.42, -0.45, 1.22, 0));
    out.body.push(boxAt(0.25, 0.05, W - 0.1, -2.05, 1.12, 0), boxAt(0.12, 0.2, 0.1, -2.05, 1.0, 0.6), boxAt(0.12, 0.2, 0.1, -2.05, 1.0, -0.6)); // spoiler
    out.dark.push(boxAt(0.3, 0.16, W - 0.2, 2.12, 0.36, 0), boxAt(0.3, 0.16, W - 0.2, -2.12, 0.36, 0), boxAt(3.2, 0.1, W + 0.02, 0, 0.36, 0));
    out.light.push(boxAt(0.12, 0.08, 0.42, 2.17, 0.6, 0.6), boxAt(0.12, 0.08, 0.42, 2.17, 0.6, -0.6));
    out.tail.push(boxAt(0.08, 0.08, 0.5, -2.23, 0.74, 0.58), boxAt(0.08, 0.08, 0.5, -2.23, 0.74, -0.58));
  } else if (type === "jeep") {
    out.body.push(extrudeSide([[-1.95, 0.48], [1.95, 0.48], [2.02, 0.72], [1.94, 1.04], [0.9, 1.1], [-1.95, 1.1]], W - 0.06, 0.05));
    out.glass.push(extrudeSide([[0.82, 1.1], [0.58, 1.72], [-1.62, 1.72], [-1.62, 1.1]], W - 0.18, 0.02));
    out.body.push(boxAt(2.3, 0.06, W - 0.12, -0.52, 1.77, 0));
    out.dark.push(boxAt(0.25, 0.25, W + 0.06, 2.04, 0.55, 0), boxAt(0.2, 0.22, W, -2.0, 0.55, 0), boxAt(0.15, 0.45, 0.75, -2.08, 1.15, 0));
    for (const s of [-1, 1]) out.dark.push(boxAt(1.2, 0.08, 0.2, 1.35, 0.95, s * (W / 2 + 0.06)), boxAt(1.3, 0.08, 0.2, -1.25, 0.95, s * (W / 2 + 0.06)));
    out.chrome.push(boxAt(0.05, 0.38, W - 0.5, 2.03, 0.86, 0));
    out.light.push(boxAt(0.08, 0.16, 0.22, 2.03, 0.86, 0.68), boxAt(0.08, 0.16, 0.22, 2.03, 0.86, -0.68));
    out.tail.push(boxAt(0.06, 0.12, 0.16, -1.99, 0.95, 0.8), boxAt(0.06, 0.12, 0.16, -1.99, 0.95, -0.8));
  } else {
    out.body.push(extrudeSide([[-2.4, 0.48], [2.4, 0.48], [2.46, 0.76], [2.32, 1.04], [1.3, 1.12], [-0.55, 1.12], [-0.55, 0.92], [-2.4, 0.92]], W - 0.06, 0.05));
    out.glass.push(extrudeSide([[1.22, 1.12], [0.78, 1.72], [-0.48, 1.74], [-0.48, 1.12]], W - 0.16, 0.02));
    out.body.push(boxAt(1.25, 0.06, W - 0.12, 0.15, 1.77, 0));
    for (const s of [-1, 1]) out.body.push(boxAt(1.85, 0.42, 0.08, -1.48, 1.12, s * (W / 2 - 0.06)));
    out.body.push(boxAt(0.08, 0.42, W - 0.1, -2.38, 1.12, 0));
    out.dark.push(boxAt(1.8, 0.05, W - 0.2, -1.48, 0.94, 0), boxAt(0.22, 0.24, W + 0.06, 2.45, 0.56, 0), boxAt(0.2, 0.22, W, -2.42, 0.56, 0));
    out.chrome.push(boxAt(0.05, 0.3, W - 0.6, 2.47, 0.84, 0));
    out.light.push(boxAt(0.08, 0.14, 0.32, 2.45, 0.86, 0.68), boxAt(0.08, 0.14, 0.32, 2.45, 0.86, -0.68));
    out.tail.push(boxAt(0.06, 0.26, 0.14, -2.42, 1.05, 0.85), boxAt(0.06, 0.26, 0.14, -2.42, 1.05, -0.85));
  }
  const m = {};
  for (const k in out) m[k] = out[k].length ? mergeAll(out[k]) : null;
  const tire = new THREE.CylinderGeometry(P.wr, P.wr, 0.3, 18); tire.rotateX(Math.PI / 2);
  const rim = new THREE.CylinderGeometry(P.wr * 0.6, P.wr * 0.6, 0.32, 10); rim.rotateX(Math.PI / 2);
  const spoke = mergeGeometries([boxAt(P.wr * 1.1, 0.06, 0.33, 0, 0, 0), boxAt(0.06, P.wr * 1.1, 0.33, 0, 0, 0)]);
  m.tire = tire; m.rim = rim; m.spoke = spoke;
  return (VGEO[type] = m);
}
const VMAT = { glass: new THREE.MeshStandardMaterial({ color: 0x1a2630, roughness: 0.05, metalness: 0.8 }), dark: new THREE.MeshStandardMaterial({ color: 0x1b1b1b, roughness: 0.8 }),
  light: new THREE.MeshStandardMaterial({ color: 0xfff6d8, emissive: 0xfff0c0, emissiveIntensity: 0.9 }), tail: new THREE.MeshStandardMaterial({ color: 0xa01010, emissive: 0xc01818, emissiveIntensity: 0.7 }),
  chrome: new THREE.MeshStandardMaterial({ color: 0xc8c8c8, roughness: 0.25, metalness: 0.9 }), tire: new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.92 }), rim: new THREE.MeshStandardMaterial({ color: 0xb9bcc0, roughness: 0.3, metalness: 0.8 }),
  burnt: new THREE.MeshStandardMaterial({ color: 0x1d1b19, roughness: 1 }) };
function makeVehicleMesh(v) {
  const P = VSPEC[v.type], G = vehGeos(v.type), g = new THREE.Group();
  v.bodyMat = new THREE.MeshStandardMaterial({ color: v.c, roughness: 0.32, metalness: 0.35 });
  const add = (geo, mat) => { if (!geo) return; const m = new THREE.Mesh(geo, mat); m.castShadow = true; m.receiveShadow = true; g.add(m); return m; };
  v.bodyMesh = add(G.body, v.bodyMat); add(G.glass, VMAT.glass); add(G.dark, VMAT.dark); add(G.light, VMAT.light); add(G.tail, VMAT.tail); add(G.chrome, VMAT.chrome);
  v.wheels = [];
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const steerG = new THREE.Group(); steerG.position.set(sx * P.wx, P.wr, sz * P.wz); g.add(steerG);
    const spin = new THREE.Group(); steerG.add(spin);
    const t = new THREE.Mesh(G.tire, VMAT.tire); t.castShadow = true; spin.add(t); spin.add(new THREE.Mesh(G.rim, VMAT.rim)); spin.add(new THREE.Mesh(G.spoke, VMAT.rim));
    v.wheels.push({ steerG, spin, front: sx > 0 });
  }
  g.position.set(v.x, 0, v.y); g.rotation.y = -v.a; g.visible = false;
  world.add(g); v.mesh = g;
}
function vehLocal(v, x, y) { const dx = x - v.x, dy = y - v.y, c = Math.cos(v.a), s = Math.sin(v.a); return { lx: dx * c + dy * s, lz: -dx * s + dy * c }; }
function vehWorld(v, lx, lz) { const c = Math.cos(v.a), s = Math.sin(v.a); return { x: v.x + lx * c - lz * s, y: v.y + lx * s + lz * c }; }
// keep people out of a car's body
function vehPush(v, e) {
  const P = VSPEC[v.type], hl = P.len / 2 + PR, hw = P.wid / 2 + PR, L = vehLocal(v, e.x, e.y);
  if (Math.abs(L.lx) >= hl || Math.abs(L.lz) >= hw) return false;
  const px = hl - Math.abs(L.lx), pz = hw - Math.abs(L.lz);
  const p = px < pz ? vehWorld(v, Math.sign(L.lx) * hl, L.lz) : vehWorld(v, L.lx, Math.sign(L.lz || 1) * hw);
  e.x = p.x; e.y = p.y; return true;
}
let roadSegs = null;
function onRoad(x, y) {
  for (const r of MAP.roads) {
    const dx = r[2] - r[0], dy = r[3] - r[1], l2 = dx * dx + dy * dy, t = clamp(((x - r[0]) * dx + (y - r[1]) * dy) / l2, 0, 1);
    const qx = r[0] + dx * t - x, qy = r[1] + dy * t - y; if (qx * qx + qy * qy < 4.6 * 4.6) return true;
  }
  return false;
}
function vehCircles(v) { const P = VSPEC[v.type], o = P.len / 2 - P.wid / 2; return [vehWorld(v, o, 0), vehWorld(v, -o, 0)]; }
function vehDamage(v, dmg, src) {
  if (v.dead || online) return;
  v.hp -= dmg; if (src) v.lastHit = src;
  if (v.hp <= 0) vehExplode(v);
}
function vehExplode(v) {
  v.dead = true; v.hp = 0; v.vx = v.vy = 0; v.smokeT = 40;
  const p = new THREE.Vector3(v.x, 1, v.y);
  for (let i = 0; i < 6; i++) puff(p.clone().add(new THREE.Vector3((Math.random() - 0.5) * 2, Math.random() * 1.5, (Math.random() - 0.5) * 2)), i < 3 ? 0xff8a2a : 0x2a2622, 3 + Math.random() * 2, 0.9 + Math.random() * 0.6);
  const dm = Math.hypot(v.x - me.x, v.y - me.y); noise(0.5 * clamp(1 - dm / 160, 0, 1) + 0.01, 0.9, 900, 40); if (dm < 30) { hurt = Math.max(hurt, 0.6); buzz(200); }
  v.bodyMesh.material = VMAT.burnt;
  const src = v.lastHit;
  for (const e of ents) {
    if (!e.alive || e.ph !== "ground") continue;
    const d = Math.hypot(e.x - v.x, e.y - v.y);
    if (e.veh === v) { exitVehicle(e, true); applyDamage(e, 200, src ? src.id : null, src ? src.name : "", -5, false); }
    else if (d < 6) applyDamage(e, (1 - d / 6) * 110, src ? src.id : null, src ? src.name : "", -5, false);
  }
}
function vehStep(v, dt, thr, steer, hb) {
  const P = VSPEC[v.type], ca = Math.cos(v.a), sa = Math.sin(v.a);
  let vf = v.vx * ca + v.vy * sa, vr = -v.vx * sa + v.vy * ca;
  const road = onRoad(v.x, v.y), maxF = P.max * (road ? 1 : P.off), grip = P.grip * (road ? 1 : 0.8);
  if (v.dead) { thr = 0; steer = 0; }
  if (thr > 0) vf += thr * P.acc * (vf < -0.5 ? 2.4 : 1) * clamp(1.05 - vf / maxF, 0, 1) * dt;
  else if (thr < 0) { if (vf > 0.6) vf += thr * 24 * dt; else vf += thr * 7 * clamp(1 + vf / 10, 0, 1) * dt; }
  vf -= vf * (road ? 0.1 : 0.35) * dt;
  if (!thr) vf -= Math.sign(vf) * Math.min(Math.abs(vf), 2.2 * dt);
  if (vf > maxF) vf = lerp(vf, maxF, 1 - Math.exp(-dt * 2));
  if (hb) vf -= Math.sign(vf) * Math.min(Math.abs(vf), 6.5 * dt);
  vr *= Math.exp(-(hb ? 1.1 : grip) * dt);
  v.steer = lerp(v.steer, steer, 1 - Math.exp(-dt * 9));
  const sp = Math.abs(vf), turn = v.steer * Math.min(1, sp / 4) * (2.0 - Math.min(sp / 42, 1) * 1.05) * Math.sign(vf) * (hb ? 1.45 : 1);
  v.a += turn * dt;
  // velocity keeps its old direction a moment after the body turns: that's the drift
  v.vx = vf * ca - vr * sa; v.vy = vf * sa + vr * ca;
  v.x += v.vx * dt; v.y += v.vy * dt;
  v.fwd = vf; v.slip = Math.abs(vr) + (hb && sp > 5 ? 3 : 0) + (thr > 0.6 && sp < 9 && sp > 1 ? 2.2 : 0);
  v.spin += vf * dt / P.wr;
  vehCollide(v, dt);
}
function vehCollide(v, dt) {
  const P = VSPEC[v.type], r = P.wid / 2 + 0.05;
  let impact = 0;
  for (let pass = 0; pass < 2; pass++) for (const c of vehCircles(v)) {
    for (const o of near(c.x, c.y, r + 1)) {
      if ((o.z0 || 0) > 1.1 || o.h3 < 0.35 || o.kind === "fence" || (o.kind === "door" && o.open)) continue;
      let nx = 0, ny = 0, pen = 0;
      if (o.t === "c") { const rr = o.kind === "tree" ? 0.35 * (o.s || 1) : o.r; const dx = c.x - o.x, dy = c.y - o.y, d = Math.hypot(dx, dy); if (d < rr + r && d > 1e-4) { nx = dx / d; ny = dy / d; pen = rr + r - d; } }
      else { const cx = clamp(c.x, o.x, o.x + o.w), cy = clamp(c.y, o.y, o.y + o.h), dx = c.x - cx, dy = c.y - cy, d = Math.hypot(dx, dy); if (d < r) { if (d > 1e-4) { nx = dx / d; ny = dy / d; pen = r - d; } else { nx = -Math.cos(v.a); ny = -Math.sin(v.a); pen = r; } } }
      if (pen <= 0) continue;
      v.x += nx * pen; v.y += ny * pen; c.x += nx * pen; c.y += ny * pen;
      const vn = v.vx * nx + v.vy * ny;
      if (vn < 0) { impact = Math.max(impact, -vn); v.vx -= 1.3 * vn * nx; v.vy -= 1.3 * vn * ny; v.vx *= 0.82; v.vy *= 0.82; }
    }
  }
  for (const u of MAP.vehicles) {
    if (u === v || Math.abs(u.x - v.x) > 6 || Math.abs(u.y - v.y) > 6) continue;
    for (const a of vehCircles(v)) for (const b of vehCircles(u)) {
      const dx = a.x - b.x, dy = a.y - b.y, d = Math.hypot(dx, dy), m = P.wid / 2 + VSPEC[u.type].wid / 2;
      if (d < m && d > 1e-4) {
        const nx = dx / d, ny = dy / d, pen = (m - d) / 2; v.x += nx * pen; v.y += ny * pen; u.x -= nx * pen; u.y -= ny * pen;
        const rel = (v.vx - u.vx) * nx + (v.vy - u.vy) * ny;
        if (rel < 0) { impact = Math.max(impact, -rel * 0.7); v.vx -= rel * nx * 0.6; v.vy -= rel * ny * 0.6; u.vx += rel * nx * 0.6; u.vy += rel * ny * 0.6; if (!u.driver) u.idle = 3; }
      }
    }
  }
  v.x = clamp(v.x, 4, S - 4); v.y = clamp(v.y, 4, S - 4);
  if (impact > 6) {
    vehDamage(v, (impact - 6) * 7, v.driver);
    const dm = Math.hypot(v.x - me.x, v.y - me.y); noise(clamp(impact / 30, 0.05, 0.4) * clamp(1 - dm / 90, 0, 1) + 0.005, 0.25, 700, 80);
    if (v.driver === me) { buzz(Math.min(120, impact * 6)); shake = Math.min(1, impact / 18); }
    if (v.driver && impact > 13) applyDamage(v.driver, (impact - 13) * 3, null, null, -4, false);
  }
  // running people over
  const sp = Math.hypot(v.vx, v.vy);
  if (sp > 3.5) for (const e of ents) {
    if (!e.alive || e.ph !== "ground" || e.veh || e.z > 1.2 || Math.abs(e.x - v.x) > 4 || Math.abs(e.y - v.y) > 4) continue;
    const L = vehLocal(v, e.x, e.y);
    if (Math.abs(L.lx) < P.len / 2 + 0.25 && Math.abs(L.lz) < P.wid / 2 + 0.25 && !(e.runT > 0)) {
      e.runT = 0.7;
      if (v.driver && (v.driver === me || !online || (isHost && v.driver.kind === "bot"))) dealHit(v.driver, e, sp * 3.4, -3, false);
      else if (!v.driver && !online) applyDamage(e, sp * 3.4, null, null, -3, false);
      const p = vehWorld(v, L.lx, Math.sign(L.lz || 1) * (P.wid / 2 + 0.9)); e.x = p.x; e.y = p.y;
      blood(new THREE.Vector3(e.x, 1, e.y));
    }
  }
}
function nearVehicle(e, r = 3.2) {
  let best = null, bd = r;
  for (const v of MAP.vehicles) { if (v.dead || v.driver) continue; const d = Math.hypot(v.x - e.x, v.y - e.y); if (d < bd && Math.abs(e.z) < 1.2) { bd = d; best = v; } }
  return best;
}
function enterVehicle(e, v) {
  if (!v || v.driver || v.dead || e.veh || !e.alive || e.ph !== "ground" || e.climb) return;
  e.veh = v; v.driver = e; e.stance = "stand"; e.healT = 0; e.healKind = null; e.reloadT = 0; v.idle = 0;
  if (e === me) { aimZoom = false; $("aimBtn").classList.remove("on"); engineOn(true); document.body.classList.add("driving"); updateStanceUi(); camYawT = v.a; hint(IS_TOUCH ? "العصا لفوق للبنزين، لتحت للفرامل والرجوع، ويمين ويسار للتوجيه. اضغط «فرامل يد» عشان تفحّط" : "W بنزين، S فرامل ورجوع، A و D توجيه، Space فرامل يد للتفحيط، F تنزل", 5000); tone(220, 0.08, "square", 0.04); }
}
function exitVehicle(e, force) {
  const v = e.veh; if (!v) return;
  const P = VSPEC[v.type], sp = Math.hypot(v.vx, v.vy);
  const spots = [[0, -(P.wid / 2 + 0.8)], [0, P.wid / 2 + 0.8], [P.len / 2 + 0.9, 0], [-P.len / 2 - 0.9, 0]];
  let spot = null;
  for (const [lx, lz] of spots) { const p = vehWorld(v, lx, lz); if (!solidAt(p.x, p.y, 0.6) && !solidAt(p.x, p.y, 1.2)) { spot = p; break; } }
  if (!spot && !force) { if (e === me) hint("ما فيه مكان تنزل منه هنا"); return; }
  spot = spot || vehWorld(v, 0, -(P.wid / 2 + 0.8));
  e.veh = null; v.driver = null; e.x = spot.x; e.y = spot.y; e.z = groundAt(e.x, e.y, 0.5); e.onGround = true; e.peak = e.z; e.vx = e.vy = 0;
  if (e === me) { engineOn(false); document.body.classList.remove("driving"); }
  collide(e);
  if (sp > 9 && !force) applyDamage(e, (sp - 9) * 3.2, null, null, -4, false);
}
// skid marks (ring buffer) and tyre smoke
let skidIm = null, skidN = 0, skidAcc = 0;
const SKID_MAX = 400;
function initSkids() {
  const g = new THREE.PlaneGeometry(0.26, 0.6); g.rotateX(-Math.PI / 2);
  skidIm = new THREE.InstancedMesh(g, new THREE.MeshBasicMaterial({ color: 0x111111, transparent: true, opacity: 0.55, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }), SKID_MAX);
  const m = new THREE.Matrix4().makeScale(0, 0, 0); for (let i = 0; i < SKID_MAX; i++) skidIm.setMatrixAt(i, m);
  skidIm.frustumCulled = false; world.add(skidIm); skidN = 0;
}
const _sq = new THREE.Quaternion(), _sm = new THREE.Matrix4(), _sv = new THREE.Vector3(), _ss = new THREE.Vector3(1, 1, 1), _sup = new THREE.Vector3(0, 1, 0);
function vehFx(v, dt) {
  if (!(v.slip > 2.6) || v.dead) return;
  const P = VSPEC[v.type], sp = Math.hypot(v.vx, v.vy);
  skidAcc += sp * dt; if (skidAcc < 0.45) return; skidAcc = 0;
  _sq.setFromAxisAngle(_sup, -v.a + Math.PI / 2);
  for (const sz of [1, -1]) {
    const p = vehWorld(v, -P.wx, sz * P.wz);
    _sm.compose(_sv.set(p.x, 0.035, p.y), _sq, _ss); skidIm.setMatrixAt(skidN, _sm); skidN = (skidN + 1) % SKID_MAX;
    if (Math.random() < 0.5) puff(new THREE.Vector3(p.x, 0.4, p.y), onRoad(v.x, v.y) ? 0xe8e8e8 : 0xc9b48a, 0.9 + Math.random() * 0.6, 0.7);
  }
  skidIm.instanceMatrix.needsUpdate = true;
}
// engine sound for the car you drive
let engine = null;
function engineOn(on) {
  if (!ac || !SETTINGS.sound) { if (!on && engine) { try { engine.o.stop(); engine.o2.stop(); } catch (e) {} engine = null; } return; }
  if (on && !engine) {
    const o = ac.createOscillator(), o2 = ac.createOscillator(), f = ac.createBiquadFilter(), g = ac.createGain();
    o.type = "sawtooth"; o2.type = "square"; f.type = "lowpass"; f.frequency.value = 600; g.gain.value = 0.0;
    o.connect(f); o2.connect(f); f.connect(g); g.connect(ac.destination); o.start(); o2.start(); engine = { o, o2, f, g };
  } else if (!on && engine) { try { engine.g.gain.setTargetAtTime(0, ac.currentTime, 0.05); engine.o.stop(ac.currentTime + 0.3); engine.o2.stop(ac.currentTime + 0.3); } catch (e) {} engine = null; }
}
function engineTick(v, thr) {
  if (!engine || !ac) return;
  const sp = Math.abs(v.fwd || 0), gear = Math.min(4, Math.floor(sp / 10)), rpm = (sp - gear * 10) / 10;
  const f = 48 + gear * 8 + rpm * 70 + Math.abs(thr) * 12;
  engine.o.frequency.setTargetAtTime(f, ac.currentTime, 0.05); engine.o2.frequency.setTargetAtTime(f * 0.5, ac.currentTime, 0.05);
  engine.g.gain.setTargetAtTime(0.03 + Math.abs(thr) * 0.03, ac.currentTime, 0.08);
  if (v.slip > 3.5 && Math.random() < 0.25) noise(0.03, 0.12, 2600, 1200);
}
// bots: drive toward a goal, back up when stuck
function botDrive(b, v, dt, gx, gy) {
  const a = Math.atan2(gy - v.y, gx - v.x); let da = a - v.a; da = Math.atan2(Math.sin(da), Math.cos(da));
  let thr = Math.abs(da) > 1.4 ? 0.45 : 0.9, steer = clamp(da * 1.6, -1, 1);
  if (Math.abs(v.fwd || 0) < 1.2 && thr > 0) b.vStuck = (b.vStuck || 0) + dt; else b.vStuck = 0;
  if (b.vStuck > 1.3) { b.revT = 1.1; b.vStuck = 0; b.revN = (b.revN || 0) + 1; }
  if (b.revT > 0) { b.revT -= dt; thr = -0.8; steer = -steer; }
  vehStep(v, dt, thr, steer, false);
}

// ---------------- climbing, vaulting, floors, doors ----------------
// look for something in front you can climb on or jump over (fences, walls, containers, window sills)
function vaultTarget(e, dirA) {
  if (!e.onGround || e.veh || e.climb || e.ph !== "ground" || e.stance === "prone") return null;
  const ca = Math.cos(dirA), sa = Math.sin(dirA);
  for (let d = 0.45; d <= 1.25; d += 0.2) {
    const px = e.x + ca * d, py = e.y + sa * d;
    let topH = -1, tall = false, ob = null;
    for (const o of near(px, py, 0.6)) {
      if (o.kind === "tree" || o.kind === "pole" || (o.kind === "door" && o.open)) continue;
      const z0 = o.z0 || 0; if (z0 > e.z + EH || o.h3 < e.z + 0.1) continue;
      if (!obsHit(o, px, py)) continue;
      if (o.kind === "door" || o.h3 > e.z + 2.7 || (z0 > e.z + 0.3 && z0 < e.z + EH)) { tall = true; break; }
      if (o.walk && o.h3 <= e.z + 0.45) continue;
      if (o.h3 > topH) { topH = o.h3; ob = o; }
    }
    if (tall) return null;
    if (!ob) continue;
    const top = topH;
    if (solidAt(px, py, top + 0.5) || solidAt(px, py, top + 1.0)) return null; // no room above (window too small)
    // climb up on top of it
    if (ob.walk) {
      const tx = px + ca * 0.45, ty = py + sa * 0.45;
      if (obsHit(ob, tx, ty) && !solidAt(tx, ty, top + 0.5) && !solidAt(tx, ty, top + 1.2)) return { x: tx, y: ty, z: top, top, over: false, h: top - e.z };
    }
    // or go over to the other side
    for (let k = 0.2; k <= 2.2; k += 0.2) {
      const qx = px + ca * k, qy = py + sa * k;
      if (obsHit(ob, qx, qy)) continue;
      const lx = qx + ca * 0.42, ly = qy + sa * 0.42;
      if (solidAt(lx, ly, top + 0.35) || solidAt(lx, ly, top + 1.0)) return null;
      return { x: lx, y: ly, z: groundAt(lx, ly, top + 0.2), top, over: true, h: top - e.z };
    }
    return null;
  }
  return null;
}
function startClimb(e, t) {
  e.climb = { sx: e.x, sy: e.y, sz: e.z, t: 0, dur: 0.42 + t.h * 0.2, ...t };
  e.stance = "stand"; e.reloadT = 0; e.healT = 0; e.healKind = null; e.vx = e.vy = 0;
  if (e === me) { noise(0.05, 0.12, 700, 200); updateStanceUi(); }
}
function climbStep(e, dt) {
  const c = e.climb; c.t += dt;
  const k = clamp(c.t / c.dur, 0, 1), up = clamp(k / 0.55, 0, 1), fw = clamp((k - 0.25) / 0.75, 0, 1);
  const ease = (x) => 1 - (1 - x) * (1 - x);
  e.z = lerp(c.sz, c.top + 0.12, ease(up));
  e.x = lerp(c.sx, c.x, ease(fw)); e.y = lerp(c.sy, c.y, ease(fw));
  if (k >= 1) {
    e.climb = null; e.x = c.x; e.y = c.y;
    if (c.over && c.z < c.top - 0.1) { e.onGround = false; e.vz = 0; e.peak = c.top; }
    else { e.z = c.z; e.onGround = true; e.peak = e.z; }
    collide(e);
  }
}
// gravity, stairs, landing and fall damage
function groundPhysics(e, dt) {
  const g = groundAt(e.x, e.y, e.z);
  if (e.onGround && e.vz <= 0) {
    if (g >= e.z - 0.5) { e.z = g; e.peak = g; }       // walking, stepping up or down stairs
    else { e.onGround = false; e.vz = 0; e.peak = e.z; } // walked off an edge
  }
  if (!e.onGround) {
    e.vz -= 13 * dt; e.z += e.vz * dt; if (e.z > e.peak) e.peak = e.z;
    const g2 = groundAt(e.x, e.y, Math.max(e.z, g));
    if (e.z <= g2 && e.vz <= 0) {
      const drop = e.peak - g2; e.z = g2; e.vz = 0; e.onGround = true; e.peak = g2;
      if (e === me) noise(Math.min(0.12, 0.03 + drop * 0.012), 0.09, 500, 110);
      if (drop > 4.2) applyDamage(e, (drop - 4.2) * 9, null, null, -4, false);
    }
  }
  e.gz = e.onGround ? e.z : g;
}
function doorNear(e, r = 1.7) {
  let best = null, bd = r;
  for (const o of near(e.x, e.y, r)) {
    if (o.kind !== "door" || Math.abs(o.z0 - e.z) > 1.2) continue;
    const d = Math.hypot(o.x + o.w / 2 - e.x, o.y + o.h / 2 - e.y);
    if (d < bd) { bd = d; best = o; }
  }
  return best;
}
// bots open closed doors in their way
function botDoors(b) {
  for (const o of near(b.x, b.y, 1.4)) if (o.kind === "door" && !o.open && Math.abs(o.z0 - b.z) < 1.2 && Math.hypot(o.x + o.w / 2 - b.x, o.y + o.h / 2 - b.y) < 1.4) setDoor(o, true);
}
function botGo(b, gx, gy, gz) {
  const key = Math.round(gx / 2) + "," + Math.round(gy / 2) + "," + Math.round(gz / 2);
  if (b.pathKey !== key || !(b.pathT > 0) || !b.path || !b.path.length) { b.path = navPath({ x: b.x, y: b.y, z: b.z }, { x: gx, y: gy, z: gz }); b.pathKey = key; b.pathT = 3.5; }
  while (b.path.length > 1) { const w = b.path[0]; if (Math.hypot(w.x - b.x, w.y - b.y) < 0.65 && Math.abs(w.z - b.z) < 1.4) b.path.shift(); else break; }
  return b.path[0];
}

// ---------------- profile: levels, XP, outfits ----------------
const OUTFITS = [
  { id: "classic", name: "كلاسيك", c: "#ffffff", lv: 1 }, { id: "desert", name: "صحراوي", c: "#d8c9a3", lv: 1 }, { id: "forest", name: "غابة", c: "#8fa07a", lv: 1 },
  { id: "night", name: "ليلي", c: "#6f7480", lv: 2 }, { id: "red", name: "النخبة", c: "#c25a4a", lv: 3 }, { id: "blue", name: "البحرية", c: "#5a7fc0", lv: 5 },
  { id: "purple", name: "الملكي", c: "#9a6fc0", lv: 8 }, { id: "gold", name: "الذهبي", c: "#e0b84a", lv: 10 }
];
const CHUTES = [{ c: "#f2a541", lv: 1 }, { c: "#d9d2bb", lv: 1 }, { c: "#4f9be0", lv: 2 }, { c: "#7bd389", lv: 3 }, { c: "#e5533d", lv: 4 }, { c: "#c3a6ff", lv: 6 }, { c: "#222222", lv: 7 }, { c: "#f5e663", lv: 9 }];
const GUNSKINS = [{ c: "#4a4f55", lv: 1 }, { c: "#9a8458", lv: 1 }, { c: "#55603a", lv: 2 }, { c: "#a0302a", lv: 4 }, { c: "#3b5c8a", lv: 5 }, { c: "#d4af37", lv: 7 }];
const PROFILE = Object.assign({ xp: 0, matches: 0, wins: 0, kills: 0, best: 0, maxKills: 0, time: 0, deaths: 0, outfit: "classic", chute: 0, gun: 0, stars: 400, guns: {}, primary: 2 }, store.get("ls3.profile", {}));
if (!PROFILE.guns) PROFILE.guns = {};
function saveProfile() { store.set("ls3.profile", PROFILE); }
const xpFor = (lv) => 250 * lv * (lv + 1); // total XP needed to reach the next level
function levelOf2(xp) { let lv = 1; while (xp >= xpFor(lv) && lv < 50) lv++; return lv; }
function myOutfit() { return OUTFITS.find((o) => o.id === PROFILE.outfit) || OUTFITS[0]; }
function profileUi() {
  const lv = levelOf2(PROFILE.xp), lo = lv > 1 ? xpFor(lv - 1) : 0, hi = xpFor(lv);
  $("lvlBadge").textContent = ar(lv);
  $("xpFill").style.width = clamp((PROFILE.xp - lo) / (hi - lo) * 100, 0, 100) + "%";
  $("xpTxt").textContent = "خبرة " + ar(PROFILE.xp - lo) + " من " + ar(hi - lo);
  $("ptsTxt").textContent = ar(PROFILE.stars);
  const sw = (list, el, sel, onPick, named) => {
    el.innerHTML = "";
    list.forEach((o, i) => {
      const b = document.createElement("button"); b.type = "button"; b.className = "sw" + (sel(o, i) ? " on" : "") + (lv < o.lv ? " locked" : "");
      const dot = document.createElement("i"); dot.style.background = o.c; b.append(dot);
      if (named) b.append(document.createTextNode(o.name));
      b.setAttribute("aria-label", (o.name || "لون") + (lv < o.lv ? " يفتح في المستوى " + o.lv : ""));
      if (lv < o.lv) { const s = document.createElement("small"); s.textContent = "مستوى " + ar(o.lv); b.append(s); }
      b.addEventListener("click", () => { if (lv < o.lv) { lobbyToast("يفتح لما توصل المستوى " + ar(o.lv)); return; } onPick(o, i); saveProfile(); profileUi(); dressLobby(); });
      el.append(b);
    });
  };
  sw(SUITS.map((x) => ({ id: x.id, name: x.name, c: x.id === "camo" ? "#7d8466" : x.id === "op" ? "#8a7d5c" : "#3d5a78", lv: 1 })), $("suitList"), (o) => o.id === mySuit(), (o) => { PROFILE.suit = o.id; PROFILE.suitV = 2; setTimeout(setupLobbyModel, 0); }, true);
  sw(OUTFITS, $("outfitList"), (o) => o.id === PROFILE.outfit, (o) => (PROFILE.outfit = o.id), true);
  sw(CHUTES, $("chuteList"), (o, i) => i === PROFILE.chute, (o, i) => (PROFILE.chute = i));
  sw(GUNSKINS, $("gunList"), (o, i) => i === PROFILE.gun, (o, i) => (PROFILE.gun = i));
  armUi();
  const sg = $("statGrid"); sg.innerHTML = "";
  const kd = PROFILE.deaths ? PROFILE.kills / PROFILE.deaths : PROFILE.kills;
  for (const [k, v] of [["المباريات", ar(PROFILE.matches)], ["مرات الفوز", ar(PROFILE.wins)], ["القتلات", ar(PROFILE.kills)], ["أفضل ترتيب", PROFILE.best ? "#" + ar(PROFILE.best) : "—"], ["أكثر قتلات بمباراة", ar(PROFILE.maxKills)], ["نسبة القتل", kd.toFixed(1).replace(/\d/g, (x) => "٠١٢٣٤٥٦٧٨٩"[x])], ["وقت اللعب", ar(Math.round(PROFILE.time / 60)) + " د"], ["المستوى", ar(lv)]]) {
    const c = document.createElement("div"), s = document.createElement("span"), st = document.createElement("strong"); s.textContent = k; st.textContent = v; c.append(s, st); sg.append(c);
  }
}
let toastT = null;
function lobbyToast(t) { const n = $("onlineNote"); n.textContent = t; clearTimeout(toastT); toastT = setTimeout(() => (n.textContent = playMode === "arena" ? "البلدة القديمة – أول فريق يوصل ٣٠ قتلة يفوز" : playMode === "solo" ? "خريطة كبيرة – ٥٠ لاعب" : "العب مع أصحابك بكود غرفة"), 2600); }
// ----- armory: pick a weapon, level it up -----
let armSel = PROFILE.primary || 2;
const ARM_LIST = [1, 2, 3, 4, 0];
const upCost = (lv) => 150 * lv;
function armUi() {
  const wi = armSel, W = WEAP[wi], lv = gunLevel(wi);
  $("armName").textContent = W.name; $("armLv").textContent = "المستوى " + ar(lv) + (lv >= 5 ? " (الأعلى)" : "");
  const gs = $("gunStats"); gs.innerHTML = "";
  const d = document.createElement("div"); d.className = "gun";
  const n = document.createElement("b"); n.textContent = ""; d.append(n);
  const bar = (label, k, k2) => { const l = document.createElement("label"); l.append(document.createTextNode(label)); const b = document.createElement("span"); b.className = "bar"; b.style.position = "relative"; if (k2 > k) { const u = document.createElement("i"); u.className = "up"; u.style.width = clamp(k2, 0.05, 1) * 100 + "%"; u.style.position = "absolute"; u.style.inset = "0 auto 0 0"; b.append(u); } const i = document.createElement("i"); i.style.width = clamp(k, 0.05, 1) * 100 + "%"; i.style.position = "relative"; b.append(i); l.append(b); d.append(l); };
  const st = (L) => ({ dmg: W.dmg * W.pel * (1 + 0.07 * (L - 1)) / 110, mag: (W.mag + (wi !== 3 && wi !== 4 ? Math.floor((L - 1) * W.mag * 0.1) : 0)) / 42, rel: (1 / (W.reload * (1 - 0.06 * (L - 1)))) / 0.9 });
  const s1 = st(lv), s2 = st(Math.min(5, lv + 1));
  bar("الضرر", s1.dmg, s2.dmg); bar("المخزن", s1.mag, s2.mag); bar("التعبئة", s1.rel, s2.rel); bar("المدى", W.range / 400, W.range / 400);
  gs.append(d);
  const eq = $("equipBtn"), up = $("upBtn"), isPrim = wi !== 0;
  eq.hidden = !isPrim; eq.textContent = PROFILE.primary === wi ? "مجهّز ✓" : "جهّز"; eq.classList.toggle("on", PROFILE.primary === wi);
  up.disabled = lv >= 5; up.textContent = lv >= 5 ? "مكتمل" : "رقّي – " + ar(upCost(lv)) + " ★";
  armPreview();
}
$("gunPrev").addEventListener("click", () => { armSel = ARM_LIST[(ARM_LIST.indexOf(armSel) + ARM_LIST.length - 1) % ARM_LIST.length]; armUi(); tone(600, 0.04, "triangle", 0.03); });
$("gunNext").addEventListener("click", () => { armSel = ARM_LIST[(ARM_LIST.indexOf(armSel) + 1) % ARM_LIST.length]; armUi(); tone(600, 0.04, "triangle", 0.03); });
$("equipBtn").addEventListener("click", () => { if (armSel === 0) return; PROFILE.primary = armSel; saveProfile(); armUi(); tone(880, 0.06, "triangle", 0.04); });
$("upBtn").addEventListener("click", () => {
  const lv = gunLevel(armSel); if (lv >= 5) return;
  const c = upCost(lv); if (PROFILE.stars < c) { lobbyToast("تحتاج " + ar(c) + " ★، العب وجمّع نجوم"); return; }
  PROFILE.stars -= c; PROFILE.guns[armSel] = lv + 1; saveProfile(); profileUi();
  tone(660, 0.1, "triangle", 0.06); setTimeout(() => tone(990, 0.12, "triangle", 0.06), 90); setTimeout(() => tone(1320, 0.2, "triangle", 0.06), 180);
  lobby.flashT = 0.6;
});
function armPreview() {
  if (!lobby.gunShow) { lobby.gunShow = new THREE.Group(); lobby.gunShow.position.set(0.6, 1.05, 0.4); lobby.scene.add(lobby.gunShow); }
  const g = lobby.gunShow; while (g.children.length) g.remove(g.children[0]);
  const P = gunParts(armSel, GUNSKINS[PROFILE.gun].c, gunLevel(armSel)); P.g.scale.setScalar(armSel === 0 ? 3.4 : 2.5); P.g.position.z = armSel === 0 ? 0.25 : 0.6; P.g.rotation.x = -0.12; g.add(P.g); lobby.gunGlow = P.glow;
}
// XP after a match
let lastStars = 0;
function awardMatch(win, rank, kills, secs) {
  const before = levelOf2(PROFILE.xp);
  const gain = kills * 100 + Math.max(0, 51 - rank) * 12 + (win ? 600 : 0) + Math.round(secs / 3);
  const stars = kills * 15 + (win ? 120 : 40); PROFILE.stars = (PROFILE.stars || 0) + stars; lastStars = stars;
  PROFILE.xp += gain; PROFILE.matches++; PROFILE.kills += kills; PROFILE.time += secs; if (win) PROFILE.wins++; else PROFILE.deaths++;
  PROFILE.best = PROFILE.best ? Math.min(PROFILE.best, rank) : rank; PROFILE.maxKills = Math.max(PROFILE.maxKills, kills);
  saveProfile(); const after = levelOf2(PROFILE.xp);
  return { gain, up: after > before, lv: after };
}

// ---------------- lobby 3D showroom ----------------
const lobby = { scene: new THREE.Scene(), cam: new THREE.PerspectiveCamera(38, 1, 0.1, 300), model: null, mixer: null, rot: 0, rotT: 0, drag: null, gunMat: null, car: null, t: 0 };
(function buildLobby() {
  const s = lobby.scene;
  s.background = new THREE.Color(0x1a1f16); s.fog = new THREE.Fog(0x1a1f16, 18, 60);
  s.add(new THREE.HemisphereLight(0xdfe8ff, 0x4a4030, 1.25));
  const key = new THREE.DirectionalLight(0xfff1d6, 3.2); key.position.set(4, 7, 5); key.castShadow = true; key.shadow.mapSize.set(1024, 1024);
  const kc = key.shadow.camera; kc.left = -6; kc.right = 6; kc.top = 6; kc.bottom = -6; s.add(key);
  const rim = new THREE.DirectionalLight(0xf2a541, 2.2); rim.position.set(-5, 3, -4); s.add(rim);
  const fill = new THREE.PointLight(0x6cb4ee, 6, 12); fill.position.set(-3, 2, 3); s.add(fill);
  // floor: concrete pad with a glowing ring
  const floor = new THREE.Mesh(new THREE.CircleGeometry(30, 48), new THREE.MeshStandardMaterial({ color: 0x2b2e26, roughness: 0.95 })); floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; s.add(floor);
  const pad = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.75, 0.16, 48), new THREE.MeshStandardMaterial({ color: 0x4a4d44, roughness: 0.7, metalness: 0.3 })); pad.position.y = 0.08; pad.receiveShadow = true; s.add(pad);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.68, 0.03, 8, 64), new THREE.MeshBasicMaterial({ color: 0xf2a541 })); ring.rotation.x = Math.PI / 2; ring.position.y = 0.17; s.add(ring);
  // a hangar back wall with stripes, crates and sandbags around
  const wall = new THREE.Mesh(new THREE.BoxGeometry(30, 9, 0.4), new THREE.MeshStandardMaterial({ color: 0x3a3f35, roughness: 0.9 })); wall.position.set(0, 4.5, -7); wall.receiveShadow = true; s.add(wall);
  for (let i = -3; i <= 3; i++) { const st = new THREE.Mesh(new THREE.BoxGeometry(0.25, 9, 0.5), new THREE.MeshStandardMaterial({ color: 0x2a2e26, roughness: 0.8, metalness: 0.4 })); st.position.set(i * 4, 4.5, -6.8); s.add(st); }
  const lamp = new THREE.Mesh(new THREE.BoxGeometry(6, 0.12, 0.5), new THREE.MeshBasicMaterial({ color: 0xfff3d0 })); lamp.position.set(0, 7.5, -6.6); s.add(lamp);
  const crateM = new THREE.MeshStandardMaterial({ color: 0x6b5233, roughness: 0.9 });
  for (const [x, z, sz, r] of [[-3.2, -3.5, 1.1, 0.3], [-3.0, -3.4, 0.7, 0.9], [3.6, -4.2, 1.3, -0.2], [4.2, -2.6, 0.8, 0.5]]) { const c = new THREE.Mesh(new THREE.BoxGeometry(sz, sz, sz), crateM); c.position.set(x, sz / 2 + (sz < 0.8 ? 1.1 : 0), z); c.rotation.y = r; c.castShadow = true; c.receiveShadow = true; s.add(c); }
  const bagM = new THREE.MeshStandardMaterial({ color: 0x8a7a55, roughness: 1 });
  for (let i = 0; i < 7; i++) { const b = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.5, 4, 8), bagM); b.rotation.z = Math.PI / 2; b.position.set(-1.7 + i * 0.55, 0.22 + (i % 2) * 0.0, -2.6); b.castShadow = true; s.add(b); }
  // a sports car parked behind you
  const v = { type: "sport", c: 0x1f6fe0, x: 0, y: 0, a: 0 };
  const G = vehGeos("sport"), g = new THREE.Group(), bm = new THREE.MeshStandardMaterial({ color: 0x1f6fe0, roughness: 0.28, metalness: 0.4 });
  for (const [geo, mat] of [[G.body, bm], [G.glass, VMAT.glass], [G.dark, VMAT.dark], [G.light, VMAT.light], [G.tail, VMAT.tail]]) if (geo) { const m = new THREE.Mesh(geo, mat); m.castShadow = true; g.add(m); }
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) { const P = VSPEC.sport; const w = new THREE.Group(); w.position.set(sx * P.wx, P.wr, sz * P.wz); w.add(new THREE.Mesh(G.tire, VMAT.tire), new THREE.Mesh(G.rim, VMAT.rim)); g.add(w); }
  g.position.set(3.4, 0, -3.2); g.rotation.y = 2.5; s.add(g); lobby.car = g;
  void v;
})();
function dressLobby() {
  if (!lobby.model) return;
  const tint = new THREE.Color(myOutfit().c);
  lobby.model.traverse((o) => { if (o.isMesh && o.material && o.userData.base) { o.material.color.copy(o.userData.base).multiply(tint); } });
  if (lobby.gunMat) lobby.gunMat.color.set(GUNSKINS[PROFILE.gun].c);
}
function setupLobbyModel() {
  if (lobby.model) { lobby.scene.remove(lobby.model); lobby.model = null; }
  const LG = suitOf(mySuit());
  const root = SkeletonUtils.clone(LG.scene);
  root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; if (o.material && !/visor|head/i.test(o.material.name)) { o.material = o.material.clone(); o.userData.base = o.material.color.clone(); } } });
  const holder = new THREE.Group(); holder.add(root); root.rotation.y = FACE; holder.position.y = 0.16;
  const gun = makeHeldGun("rifle", GUNSKINS[PROFILE.gun].c); lobby.gunMat = gun.userData.tintMat; holder.add(gun); lobby.gun = gun;
  lobby.rig = makeRig(root, holder);
  lobby.mixer = new THREE.AnimationMixer(root);
  const idle = LG.animations.find((a) => a.name === "Idle"); if (idle) lobby.mixer.clipAction(idle).play();
  lobby.scene.add(holder); lobby.model = holder; lobby.rot = lobby.rotT = Math.PI * 0.1 - Math.PI / 2;
  dressLobby();
}
function renderLobby3D(dt) {
  const w = canvas.clientWidth, h = canvas.clientHeight, portrait = h > w;
  lobby.cam.aspect = w / h; lobby.cam.fov = portrait ? 50 : 34; lobby.cam.updateProjectionMatrix();
  lobby.t += dt;
  const gunTab = !$("tab-guns").hidden;
  if (lobby.gunShow) { lobby.gunShow.visible = gunTab; if (gunTab) { if (!lobby.drag) lobby.gunShow.rotation.y += dt * 0.5; else lobby.gunShow.rotation.y = lobby.rotT; if (lobby.gunGlow) lobby.gunGlow.emissiveIntensity = 1.2 + Math.sin(performance.now() / 260) * 0.6; const fs = 1 + Math.max(0, (lobby.flashT || 0)) * 0.4; lobby.gunShow.scale.setScalar(fs); lobby.flashT = Math.max(0, (lobby.flashT || 0) - dt); } }
  if (lobby.model) lobby.model.visible = !gunTab;
  if (lobby.model) {
    if (!lobby.drag) lobby.rotT += dt * 0.12;
    lobby.rot += (lobby.rotT - lobby.rot) * (1 - Math.exp(-dt * 8)); lobby.model.rotation.y = lobby.rot;
    if (lobby.rig) rigPre(lobby.rig);
    lobby.mixer.update(dt);
    if (lobby.rig) { dressGear({ rig: lobby.rig }, 0, 0, 0); rigUpdate(lobby.rig, { ph: "ground", stance: "stand", moving: false, sprint: false, moveAng: 0, aimPitch: 0.05, aiming: false, firedAt: -9, hitAt: 0, reloadP: -1, wclass: "rifle", lean: 0, alive: true, deadT: 0, now: lobby.t }, dt, lobby.gun); }
  }
  if (portrait) { lobby.cam.position.set(Math.sin(lobby.t * 0.2) * 0.15, 1.7, 7.4); lobby.cam.lookAt(0, 0.15, 0); }
  else { lobby.cam.position.set(Math.sin(lobby.t * 0.2) * 0.15, 1.5, 5.6); lobby.cam.lookAt(0, 1.05, 0); }
  renderer.render(lobby.scene, lobby.cam);
}
// tabs, mode, start
document.querySelectorAll(".ltabs button").forEach((b) => b.addEventListener("click", () => {
  document.querySelectorAll(".ltabs button").forEach((x) => x.classList.toggle("on", x === b));
  for (const t of ["play", "outfit", "guns", "stats", "help"]) $("tab-" + t).hidden = t !== b.dataset.tab;
  tone(700, 0.04, "triangle", 0.03);
}));
let playMode = "arena";
document.querySelectorAll(".modes button").forEach((b) => b.addEventListener("click", () => {
  $("tsSolo").hidden = b.dataset.mode !== "solo";
  playMode = b.dataset.mode; lobbyToast(playMode === "arena" ? "البلدة القديمة – أول فريق يوصل ٣٠ قتلة يفوز" : playMode === "solo" ? "خريطة كبيرة – ٥٠ لاعب – آخر واحد يفوز" : "العب مع أصحابك بكود غرفة"); document.querySelectorAll(".modes button").forEach((x) => { x.classList.toggle("on", x === b); x.setAttribute("aria-checked", x === b ? "true" : "false"); });
}));
$("startBtn").addEventListener("click", async () => {
  audio();
  if (playMode === "arena") { goFullscreen(); store.set("ls3.nick", $("nick").value.trim()); await loadModel; online = false; isHost = false; show(null); startMatch((Math.random() * 1e9) >>> 0, { kind: "arena", bots: ARENA.team * 2 - 1, t0: Date.now() + 3000 }); return; }
  (playMode === "online" ? $("onlineBtn") : $("soloBtn")).click();
});
canvas.addEventListener("pointerdown", (e) => { if (mode === "play") return; lobby.drag = { x: e.clientX }; });
window.addEventListener("pointermove", (e) => { if (!lobby.drag || mode === "play") return; lobby.rotT += (e.clientX - lobby.drag.x) * 0.012; lobby.drag.x = e.clientX; });
window.addEventListener("pointerup", () => (lobby.drag = null));
profileUi();

// ================= STREET WAR (arena) mode: small old town, first person, teams, respawns =================
const AS = 160; // arena size (metres)
const ARENA = { time: 300, target: 30, team: 5 };
function genArena(seed) {
  const R = rng(seed); doorSeq = 0; S = AS;
  const obs = [], blds = [], doors = [], props = [], poles = [];
  const loot = [];
  const addLoot = () => {}; // no ground loot: everybody spawns armed
  const box = (x, y, w, h, z0, z1, kind, extra) => { const o = Object.assign({ t: "r", kind, x, y, w, h, z0, h3: z1 }, extra || {}); obs.push(o); return o; };
  // town wall all around
  const WH = 7;
  box(0, 0, AS, 1.2, 0, WH, "awall"); box(0, AS - 1.2, AS, 1.2, 0, WH, "awall"); box(0, 1.2, 1.2, AS - 2.4, 0, WH, "awall"); box(AS - 1.2, 1.2, 1.2, AS - 2.4, 0, WH, "awall");
  // 3 x 3 blocks with streets between; the middle block is the market square
  const cols = [[6, 48], [57, 103], [112, 154]];
  const types = ["house", "house2", "house2", "flat"];
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
    const [x0, x1] = cols[i], [y0, y1] = cols[j];
    if (i === 1 && j === 1) { plaza(x0, y0, x1, y1); continue; }
    // two buildings in opposite corners, a courtyard between them
    const flip = R() < 0.5, corners = flip ? [[0, 0], [1, 1]] : [[1, 0], [0, 1]];
    for (const [cx, cy] of corners) {
      const type = types[Math.floor(R() * types.length)];
      let w = 15 + Math.floor(R() * 6), h = 11 + Math.floor(R() * 4); if (R() < 0.5) { const q = w; w = h; h = q; }
      const bw = x1 - x0, bh = y1 - y0; w = Math.min(w, bw * 0.62); h = Math.min(h, bh * 0.62);
      const x = cx ? x1 - 1 - w : x0 + 1, y = cy ? y1 - 1 - h : y0 + 1;
      const b = { x, y, w, h, type, st: type === "house" ? 1 : 2, wallH: FH, tex: R() < 0.5 ? "sand" : "cream", roofKind: type === "flat" ? "flat" : "gable", roof: [0xa4482c, 0x8f3d26, 0xb5562f][Math.floor(R() * 3)], arena: true };
      genBuilding(b, R, obs, addLoot, doors); blds.push(b);
    }
    // courtyard cover: barrels, crates, a low wall, sometimes a raised terrace with steps
    const mx = (x0 + x1) / 2, my = (y0 + y1) / 2, otherCorner = flip ? [[1, 0], [0, 1]] : [[0, 0], [1, 1]];
    for (const [cx, cy] of otherCorner) {
      const px = cx ? x1 - 9 : x0 + 3, py = cy ? y1 - 9 : y0 + 3;
      if (R() < 0.55) terrace(px, py, 6, 5); else { crateStack(px + 1, py + 1); barrels(px + 4.5, py + 3.5, 3); }
    }
    lowWall(mx - 2 + (R() - 0.5) * 6, my + (R() - 0.5) * 6, R() < 0.5);
  }
  // street cover and old carts
  for (let k = 0; k < 10; k++) {
    const along = R() < 0.5, line = [51.5, 107.5][Math.floor(R() * 2)], t = 10 + R() * (AS - 20);
    const x = along ? t : line + (R() - 0.5) * 3, y = along ? line + (R() - 0.5) * 3 : t;
    if (Math.abs(x - 80) < 26 && Math.abs(y - 80) < 26) continue;
    const r = R(); if (r < 0.35) barrels(x, y, 2); else if (r < 0.7) { box(x - 0.6, y - 0.6, 1.2, 1.2, 0, 1.2, "crate2", { walk: true }); } else lowWall(x, y, along);
  }
  // power poles along the streets
  for (const line of [51.5, 107.5]) for (let t = 12; t < AS - 8; t += 22) { poles.push({ x: line + 3.6, y: t, a: Math.PI / 2 }); obs.push({ t: "c", kind: "pole", x: line + 3.6, y: t, r: 0.16, h3: 8 }); poles.push({ x: t, y: line - 3.6, a: 0 }); obs.push({ t: "c", kind: "pole", x: t, y: line - 3.6, r: 0.16, h3: 8 }); }

  function plaza(x0, y0, x1, y1) {
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    obs.push({ t: "c", kind: "fountain", x: cx, y: cy, r: 3.0, h3: 0.9 }); obs.push({ t: "c", kind: "fcol", x: cx, y: cy, r: 0.5, h3: 2.6 });
    // market stalls around the square
    for (const [dx, dy, horiz] of [[-13, -13, 1], [13, -13, 1], [-13, 13, 1], [13, 13, 1], [0, -18, 1], [0, 18, 1]]) {
      const w = horiz ? 4 : 1.6, h = horiz ? 1.6 : 4; box(cx + dx - w / 2, cy + dy - h / 2, w, h, 0, 1.05, "stall", { walk: true, c: [0xb5562f, 0x3f6b8a, 0x6b8a3f, 0xc9a24a][Math.floor(R() * 4)] });
    }
    barrels(cx - 8, cy + 3, 3); barrels(cx + 8, cy - 3, 2); crateStack(cx + 7, cy + 7); crateStack(cx - 8, cy - 9);
    lowWall(cx - 18, cy, false); lowWall(cx + 18, cy, false);
  }
  function barrels(x, y, n) { for (let i = 0; i < n; i++) { const a = i * 2.1, r = i ? 0.9 : 0; obs.push({ t: "c", kind: "barrel", x: x + Math.cos(a) * r, y: y + Math.sin(a) * r, r: 0.42, h3: 1.0 }); } }
  function crateStack(x, y) { box(x, y, 1.3, 1.3, 0, 1.3, "crate2", { walk: true }); box(x + 1.4, y, 1.3, 1.3, 0, 1.3, "crate2", { walk: true }); if (R() < 0.6) box(x + 0.6, y + 0.1, 1.1, 1.1, 1.3, 2.4, "crate2", { walk: true }); }
  function lowWall(x, y, horiz) { const L = 3.5 + R() * 2; if (horiz) box(x - L / 2, y - 0.25, L, 0.5, 0, 1.1, "lwall"); else box(x - 0.25, y - L / 2, 0.5, L, 0, 1.1, "lwall"); }
  function terrace(x, y, w, h) {
    box(x, y, w, h, 0, 1.6, "terrace", { walk: true });
    for (let i = 0; i < 4; i++) box(x - 0.45 * (4 - i), y + 1, 0.45, 1.6, 0, 0.32 * (i + 1), "tstep", { walk: true });
    box(x + w - 0.2, y, 0.2, h, 1.6, 2.6, "lwall"); box(x, y + h - 0.2, w, 0.2, 1.6, 2.6, "lwall");
  }
  // spawn points for both teams
  const spawns = [[], []];
  for (let k = 0; k < 6; k++) { spawns[0].push({ x: 4 + (k % 2) * 1.5, y: 51.5 + (k - 2.5) * 1.6, a: 0 }); spawns[0].push({ x: 4 + (k % 2) * 1.5, y: 107.5 + (k - 2.5) * 1.6, a: 0 }); spawns[1].push({ x: AS - 4 - (k % 2) * 1.5, y: 51.5 + (k - 2.5) * 1.6, a: Math.PI }); spawns[1].push({ x: AS - 4 - (k % 2) * 1.5, y: 107.5 + (k - 2.5) * 1.6, a: Math.PI }); }
  const CELL = 10, GN = Math.ceil(AS / CELL) + 1, grid = new Array(GN * GN);
  for (let i = 0; i < grid.length; i++) grid[i] = [];
  for (const o of obs) {
    const x0 = o.t === "c" ? o.x - o.r : o.x, y0 = o.t === "c" ? o.y - o.r : o.y, x1 = o.t === "c" ? o.x + o.r : o.x + o.w, y1 = o.t === "c" ? o.y + o.r : o.y + o.h;
    for (let gx = Math.max(0, Math.floor(x0 / CELL)); gx <= Math.min(GN - 1, Math.floor(x1 / CELL)); gx++)
      for (let gy = Math.max(0, Math.floor(y0 / CELL)); gy <= Math.min(GN - 1, Math.floor(y1 / CELL)); gy++) grid[gy * GN + gx].push(o);
  }
  const zones = [{ x: AS / 2, y: AS / 2, r: 999 }];
  return { kind: "arena", seed, obs, blds, loot, roads: [], towns: [], zones, plane: { x1: 0, y1: 0, x2: 1, y2: 0, len: 1, dur: 1 }, grid, CELL, GN, R, fields: [], cars: [], poles, doors, vehicles: [], spawns };
}
function arenaTextures() {
  if (TEX.flag) return;
  TEX.flag = canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = "#8f8270"; g.fillRect(0, 0, w, h);
    // irregular flagstones: jittered grid of polygons with grout between
    const N = 6, cs = w / N, pts = [];
    for (let i = 0; i <= N; i++) { pts.push([]); for (let j = 0; j <= N; j++) { const edge = i === 0 || j === 0 || i === N || j === N; pts[i].push([i * cs + (edge ? 0 : (Math.random() - 0.5) * cs * 0.45), j * cs + (edge ? 0 : (Math.random() - 0.5) * cs * 0.45)]); } }
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
      const q = [pts[i][j], pts[i + 1][j], pts[i + 1][j + 1], pts[i][j + 1]];
      const l = 66 + Math.random() * 14; g.fillStyle = `hsl(${32 + Math.random() * 10},${18 + Math.random() * 12}%,${l}%)`;
      g.beginPath(); const c = q.reduce((a, p) => [a[0] + p[0] / 4, a[1] + p[1] / 4], [0, 0]);
      q.forEach((p, k) => { const x = c[0] + (p[0] - c[0]) * 0.93, y = c[1] + (p[1] - c[1]) * 0.93; k ? g.lineTo(x, y) : g.moveTo(x, y); }); g.closePath(); g.fill();
      for (let s = 0; s < 120; s++) { g.fillStyle = `rgba(${Math.random() < 0.5 ? 0 : 255},${Math.random() < 0.5 ? 0 : 255},${Math.random() < 0.5 ? 0 : 200},0.05)`; g.fillRect(c[0] + (Math.random() - 0.5) * cs * 0.8, c[1] + (Math.random() - 0.5) * cs * 0.8, 3, 3); }
      // a crack now and then
      if (Math.random() < 0.25) { g.strokeStyle = "rgba(60,50,40,0.35)"; g.lineWidth = 1; g.beginPath(); g.moveTo(c[0] - cs * 0.3, c[1]); g.lineTo(c[0], c[1] + cs * 0.1); g.lineTo(c[0] + cs * 0.25, c[1] - cs * 0.15); g.stroke(); }
    }
  }, 1);
  TEX.cobble = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = "#5e574d"; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 16) for (let x = (y / 16) % 2 ? -8 : 0; x < w; x += 16) { const l = 38 + Math.random() * 18; g.fillStyle = `hsl(${28 + Math.random() * 12},${10 + Math.random() * 10}%,${l}%)`; g.beginPath(); g.ellipse(x + 8, y + 8, 7, 6.5, 0, 0, TAU); g.fill(); g.fillStyle = "rgba(255,255,255,0.08)"; g.beginPath(); g.ellipse(x + 6, y + 6, 3, 2, 0, 0, TAU); g.fill(); }
  });
  TEX.sand = canvasTex(256, 320, (g, w, h) => {
    noiseFill(g, w, h, "#d7b98f", 4000, 0.07);
    g.strokeStyle = "rgba(120,90,50,0.16)"; g.lineWidth = 2;
    for (let y = 0; y < h; y += 40) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); for (let x = (y / 40) % 2 ? 0 : 40; x < w; x += 80) { g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 40); g.stroke(); } }
    for (let i = 0; i < 14; i++) { g.fillStyle = "rgba(150,110,70,0.12)"; g.beginPath(); g.ellipse(Math.random() * w, Math.random() * h, 10 + Math.random() * 30, 6 + Math.random() * 18, 0, 0, TAU); g.fill(); }
    g.fillStyle = "rgba(90,70,40,0.22)"; g.fillRect(0, h - 18, w, 18);
  });
  TEX.cream = canvasTex(256, 320, (g, w, h) => {
    noiseFill(g, w, h, "#eadcc2", 3000, 0.06);
    for (let i = 0; i < 10; i++) { g.fillStyle = "rgba(170,140,100,0.12)"; g.beginPath(); g.ellipse(Math.random() * w, Math.random() * h, 12 + Math.random() * 30, 8 + Math.random() * 20, 0, 0, TAU); g.fill(); }
    g.fillStyle = "rgba(120,95,60,0.2)"; g.fillRect(0, h - 16, w, 16);
  });
  TEX.wood = canvasTex(128, 256, (g, w, h) => { for (let x = 0; x < w; x += 16) { g.fillStyle = `hsl(${26 + Math.random() * 8},${38 + Math.random() * 12}%,${40 + Math.random() * 10}%)`; g.fillRect(x, 0, 16, h); g.fillStyle = "rgba(0,0,0,0.35)"; g.fillRect(x, 0, 2, h); } g.fillStyle = "rgba(0,0,0,0.25)"; g.fillRect(0, 30, w, 8); g.fillRect(0, h - 40, w, 8); });
  for (const k of ["flag", "cobble", "sand", "cream", "wood"]) TEX[k].wrapS = TEX[k].wrapT = THREE.RepeatWrapping;
}
// props, ground and walls of the town (buildings use the normal building renderer)
function buildArenaWorld() {
  arenaTextures();
  const G = {}, add = (k, g) => (G[k] || (G[k] = [])).push(g);
  // ground: flagstone square, cobbled streets
  const fl = TEX.flag.clone(); fl.needsUpdate = true; fl.repeat.set(AS / 7, AS / 7);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(AS, AS), new THREE.MeshStandardMaterial({ map: fl, roughness: 0.95 })); ground.rotation.x = -Math.PI / 2; ground.position.set(AS / 2, 0, AS / 2); ground.receiveShadow = true; world.add(ground);
  for (const line of [51.5, 107.5]) for (const horiz of [true, false]) {
    const t = TEX.cobble.clone(); t.needsUpdate = true; t.repeat.set(horiz ? AS / 4 : 9 / 4, horiz ? 9 / 4 : AS / 4);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(horiz ? AS - 2 : 9, horiz ? 9 : AS - 2), new THREE.MeshStandardMaterial({ map: t, roughness: 1 }));
    m.rotation.x = -Math.PI / 2; m.position.set(horiz ? AS / 2 : line, 0.012 + (horiz ? 0.002 : 0), horiz ? line : AS / 2); m.receiveShadow = true; world.add(m);
  }
  for (const o of MAP.obs) {
    if (o.b) continue;
    const z0 = o.z0 || 0, hh = o.h3 - z0;
    if (o.kind === "awall") { add("awall", planarUV(boxAt(o.w, hh, o.h, o.x + o.w / 2, z0 + hh / 2, o.y + o.h / 2), 2.6, 3.2)); add("cap", boxAt(o.w + 0.3, 0.3, o.h + 0.3, o.x + o.w / 2, o.h3 + 0.15, o.y + o.h / 2)); }
    else if (o.kind === "lwall") { add("lwall", planarUV(boxAt(o.w, hh, o.h, o.x + o.w / 2, z0 + hh / 2, o.y + o.h / 2), 2.6, 3.2)); add("cap", boxAt(o.w + 0.12, 0.1, o.h + 0.12, o.x + o.w / 2, o.h3 + 0.05, o.y + o.h / 2)); }
    else if (o.kind === "terrace" || o.kind === "tstep") add("lwall", planarUV(boxAt(o.w, hh, o.h, o.x + o.w / 2, z0 + hh / 2, o.y + o.h / 2), 2.6, 3.2));
    else if (o.kind === "crate2") { add("crate", planarUV(boxAt(o.w - 0.02, hh - 0.02, o.h - 0.02, o.x + o.w / 2, z0 + hh / 2, o.y + o.h / 2), o.w, hh)); for (const s of [-1, 1]) add("dark", boxAt(o.w + 0.02, 0.08, 0.08, o.x + o.w / 2, z0 + hh / 2, o.y + o.h / 2 + s * (o.h / 2 - 0.02))); }
    else if (o.kind === "barrel") { const g = new THREE.CylinderGeometry(o.r, o.r * 0.92, hh, 14); g.translate(o.x, hh / 2, o.y); add("barrel", g); for (const yy of [0.18, 0.82]) { const r = new THREE.CylinderGeometry(o.r + 0.02, o.r + 0.02, 0.05, 14); r.translate(o.x, yy * hh, o.y); add("dark", r); } }
    else if (o.kind === "stall") { add("crate", planarUV(boxAt(o.w, hh, o.h, o.x + o.w / 2, hh / 2, o.y + o.h / 2), 1, 1)); for (const [sx, sy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) add("dark", boxAt(0.08, 2.4, 0.08, o.x + sx * o.w, 1.2, o.y + sy * o.h)); const cl = boxAt(o.w + 0.4, 0.05, o.h + 0.6, o.x + o.w / 2, 2.4, o.y + o.h / 2); cl.rotateX(0); add("cloth_" + o.c, cl); }
    else if (o.kind === "fountain") { const g = new THREE.CylinderGeometry(o.r, o.r + 0.15, o.h3, 28); g.translate(o.x, o.h3 / 2, o.y); add("lwall", g); const w = new THREE.CylinderGeometry(o.r - 0.25, o.r - 0.25, 0.05, 28); w.translate(o.x, o.h3 - 0.12, o.y); add("water", w); }
    else if (o.kind === "fcol") { const g = new THREE.CylinderGeometry(o.r * 0.6, o.r, o.h3, 12); g.translate(o.x, o.h3 / 2, o.y); add("cap", g); const bowl = new THREE.CylinderGeometry(1.1, 0.4, 0.35, 16); bowl.translate(o.x, o.h3, o.y); add("cap", bowl); }
  }
  // stone corners, cornices and wooden shutters on the town houses
  for (const b of MAP.blds) {
    if (!b.arena) continue;
    const corners = [[b.x, b.y], [b.x + b.w, b.y], [b.x, b.y + b.h], [b.x + b.w, b.y + b.h]];
    for (const [cx, cy] of corners) for (let z = 0, k = 0; z < b.top - 0.1; z += 0.4, k++) { const L = k % 2 ? 0.7 : 0.42; add("cap", boxAt(cx === b.x ? L : L, 0.36, cy === b.y ? 0.42 : 0.42, cx + (cx === b.x ? L / 2 - 0.04 : -L / 2 + 0.04), z + 0.2, cy + (cy === b.y ? 0.17 : -0.17))); add("cap", boxAt(0.42, 0.36, k % 2 ? 0.42 : 0.7, cx + (cx === b.x ? 0.17 : -0.17), z + 0.2, cy + (cy === b.y ? (k % 2 ? 0.17 : 0.31) : (k % 2 ? -0.17 : -0.31)))); }
    add("cap", boxAt(b.w + 0.3, 0.22, b.h + 0.3, b.x + b.w / 2, b.top - 0.05, b.y + b.h / 2));
    for (const wn of b.wins) {
      if (wn.m !== "ext") continue;
      const outer = wn.fixed < 0.1 ? -0.06 : WT + 0.06, wd = (wn.e - wn.s) / 2 + 0.05;
      for (const [s0, s1] of [[wn.s - wd, wn.s], [wn.e, wn.e + wd]]) { const r = wn.axis === "u" ? bRect(b, s0, wn.fixed + outer - 0.03, s1, wn.fixed + outer + 0.03) : bRect(b, wn.fixed + outer - 0.03, s0, wn.fixed + outer + 0.03, s1); add("shutter", planarUV(boxAt(r.w, wn.z1 - wn.z0, r.h, r.x + r.w / 2, (wn.z0 + wn.z1) / 2, r.y + r.h / 2), 0.5, 1.2)); }
    }
  }
  const MATS = { awall: { map: TEX.sand, roughness: 0.95 }, lwall: { map: TEX.cream, roughness: 0.95 }, cap: { color: 0xe3d2b0, roughness: 0.9 }, crate: { map: TEX.wood, roughness: 0.85 }, dark: { color: 0x2a2622, roughness: 0.6, metalness: 0.4 },
    barrel: { map: TEX.wood, color: 0xa06a3a, roughness: 0.8 }, water: { color: 0x3d7f9a, roughness: 0.1, metalness: 0.3 }, shutter: { color: 0x5f8a6a, roughness: 0.85 } };
  for (const k in G) {
    const spec = k.startsWith("cloth_") ? { color: +k.slice(6), roughness: 0.9, side: THREE.DoubleSide } : MATS[k];
    const m = new THREE.Mesh(mergeAll(G[k]), new THREE.MeshStandardMaterial(spec)); m.castShadow = k !== "water"; m.receiveShadow = true; world.add(m);
  }
  // wires between the poles
  const wpts = [];
  for (let i = 0; i < MAP.poles.length - 2; i += 2) { const a = MAP.poles[i], b = MAP.poles[i + 2]; if (Math.hypot(a.x - b.x, a.y - b.y) > 30) continue; for (let k = 0; k < 8; k++) { const t0 = k / 8, t1 = (k + 1) / 8; const sag = (t) => 7.4 - Math.sin(t * Math.PI) * 0.8; wpts.push(new THREE.Vector3(lerp(a.x, b.x, t0), sag(t0), lerp(a.y, b.y, t0)), new THREE.Vector3(lerp(a.x, b.x, t1), sag(t1), lerp(a.y, b.y, t1))); } }
  if (wpts.length) world.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(wpts), new THREE.LineBasicMaterial({ color: 0x222222 })));
}

// ================= first person: weapon in your hands =================
const vmScene = new THREE.Scene();
const vmCam = new THREE.PerspectiveCamera(54, 1, 0.01, 10);
vmScene.add(new THREE.HemisphereLight(0xfff4e0, 0x6a5a48, 2.2));
const vmSun = new THREE.DirectionalLight(0xfff1d6, 3.0); vmSun.position.set(0.6, 1, 0.4); vmScene.add(vmSun);
const vmFill = new THREE.DirectionalLight(0x9fc4ff, 1.0); vmFill.position.set(-1, 0.2, 0.5); vmScene.add(vmFill);
const SKIN = new THREE.MeshStandardMaterial({ color: 0xc89a78, roughness: 0.7 });
const GLOVE = new THREE.MeshStandardMaterial({ color: 0x2b2b28, roughness: 0.9 });
function gunParts(wi, skin, lv) {
  // returns { g: group, muzzle: Vector3, sightY } ; gun points along -z, origin at the grip
  const body = new THREE.MeshStandardMaterial({ color: new THREE.Color(skin).lerp(new THREE.Color(0x8a8f96), 0.35), roughness: 0.42, metalness: 0.25 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x2c2e31, roughness: 0.55, metalness: 0.2 });
  const poly = new THREE.MeshStandardMaterial({ color: new THREE.Color(skin).lerp(new THREE.Color(0x4a4d50), 0.5), roughness: 0.8 });
  const wood = new THREE.MeshStandardMaterial({ map: TEX.wood || null, color: 0x8a5a32, roughness: 0.75 });
  const glowC = [0, 0, 0x4fd2ff, 0x4fd2ff, 0xffd23f, 0xff7a2a][lv] || 0;
  const glow = new THREE.MeshStandardMaterial({ color: glowC || 0x333333, emissive: glowC || 0x000000, emissiveIntensity: lv >= 3 ? 1.6 : 0.4, roughness: 0.4 });
  const g = new THREE.Group(), add = (geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); g.add(m); return m; };
  const B = (w, h, d) => new THREE.BoxGeometry(w, h, d), C = (r, l, s = 12) => { const c = new THREE.CylinderGeometry(r, r, l, s); c.rotateX(Math.PI / 2); return c; };
  let muzzle, sightY = 0.07;
  if (wi === 0) { // pistol
    add(B(0.032, 0.036, 0.19), body, 0, 0.055, -0.06); add(B(0.03, 0.03, 0.17), dark, 0, 0.03, -0.05);
    add(B(0.03, 0.11, 0.045), poly, 0, -0.01, 0.0, 0.25); add(B(0.008, 0.02, 0.04), dark, 0, 0.012, -0.03);
    add(C(0.008, 0.02), dark, 0, 0.055, -0.16); add(B(0.006, 0.01, 0.01), dark, 0, 0.078, -0.14); add(B(0.02, 0.01, 0.01), dark, 0, 0.078, 0.02);
    muzzle = new THREE.Vector3(0, 0.055, -0.17); sightY = 0.08;
  } else if (wi === 1) { // smg
    add(B(0.048, 0.07, 0.3), body, 0, 0.05, -0.08); add(C(0.012, 0.12), dark, 0, 0.06, -0.29); add(B(0.03, 0.17, 0.045), dark, 0, -0.06, -0.12, -0.12);
    add(B(0.032, 0.1, 0.045), poly, 0, -0.03, 0.03, 0.25); add(B(0.02, 0.035, 0.22), dark, 0, 0.06, 0.16); add(B(0.03, 0.06, 0.02), dark, 0, 0.04, 0.27);
    add(B(0.02, 0.012, 0.2), dark, 0, 0.09, -0.08); add(B(0.004, 0.02, 0.004), dark, 0, 0.105, -0.19);
    if (lv >= 2) add(B(0.05, 0.008, 0.2), glow, 0, 0.088, -0.06);
    muzzle = new THREE.Vector3(0, 0.06, -0.36); sightY = 0.1;
  } else if (wi === 2) { // rifle with red dot
    add(B(0.055, 0.075, 0.36), body, 0, 0.05, -0.08); add(B(0.06, 0.062, 0.24), poly, 0, 0.05, -0.36); add(C(0.011, 0.18), dark, 0, 0.055, -0.56); add(C(0.017, 0.05), dark, 0, 0.055, -0.66);
    const mag = add(B(0.03, 0.15, 0.06), dark, 0, -0.05, -0.15, -0.28); mag.name = "mag";
    add(B(0.032, 0.11, 0.045), poly, 0, -0.035, 0.04, 0.3); add(B(0.045, 0.085, 0.24), poly, 0, 0.035, 0.22); add(B(0.05, 0.11, 0.03), dark, 0, 0.03, 0.34);
    add(B(0.022, 0.014, 0.4), dark, 0, 0.095, -0.12);
    // red dot sight: a hollow frame with tinted glass, so you can look through it
    add(B(0.024, 0.006, 0.04), dark, 0, 0.1, -0.085);
    for (const [w, h, x, y] of [[0.046, 0.006, 0, 0.148], [0.046, 0.006, 0, 0.1], [0.006, 0.052, 0.02, 0.124], [0.006, 0.052, -0.02, 0.124]]) add(B(w, h, 0.05), dark, x, y, -0.085);
    add(B(0.036, 0.042, 0.002), new THREE.MeshStandardMaterial({ color: 0x6fa0c0, roughness: 0.05, metalness: 0.5, transparent: true, opacity: 0.18, depthWrite: false }), 0, 0.124, -0.11);
    add(new THREE.SphereGeometry(0.0014, 6, 6), new THREE.MeshBasicMaterial({ color: 0xff2020 }), 0, 0.124, -0.111);
    if (lv >= 2) { add(B(0.062, 0.01, 0.2), glow, 0, 0.083, -0.36); add(B(0.008, 0.05, 0.2), glow, 0.031, 0.05, -0.36); add(B(0.008, 0.05, 0.2), glow, -0.031, 0.05, -0.36); }
    if (lv >= 4) add(B(0.032, 0.12, 0.004), glow, 0, -0.05, -0.12, -0.28);
    muzzle = new THREE.Vector3(0, 0.055, -0.7); sightY = 0.124;
  } else if (wi === 3) { // pump shotgun
    add(B(0.055, 0.07, 0.3), body, 0, 0.05, -0.06); add(C(0.016, 0.46), dark, 0, 0.065, -0.42); add(C(0.013, 0.38), dark, 0, 0.032, -0.38);
    add(B(0.05, 0.045, 0.16), wood, 0, 0.032, -0.36); add(B(0.035, 0.1, 0.05), wood, 0, -0.03, 0.05, 0.3); add(B(0.045, 0.08, 0.26), wood, 0, 0.03, 0.22, -0.08);
    add(B(0.006, 0.012, 0.006), dark, 0, 0.088, -0.62); if (lv >= 2) add(B(0.058, 0.01, 0.28), glow, 0, 0.088, -0.06);
    muzzle = new THREE.Vector3(0, 0.065, -0.66); sightY = 0.095;
  } else if (wi === 5) { // marksman rifle
    const tan = new THREE.MeshStandardMaterial({ color: 0x8f7a58, roughness: 0.8 });
    add(B(0.055, 0.075, 0.36), body, 0, 0.05, -0.08); add(B(0.058, 0.065, 0.3), tan, 0, 0.05, -0.39); add(C(0.012, 0.3), dark, 0, 0.055, -0.65); add(C(0.018, 0.06), dark, 0, 0.055, -0.8);
    const mag = add(B(0.03, 0.1, 0.06), dark, 0, -0.03, -0.15); mag.name = "mag";
    add(B(0.032, 0.11, 0.045), tan, 0, -0.035, 0.04, 0.3); add(B(0.045, 0.09, 0.26), tan, 0, 0.035, 0.22); add(B(0.022, 0.014, 0.4), dark, 0, 0.095, -0.12);
    add(B(0.006, 0.03, 0.01), dark, 0, 0.1, -0.52); add(B(0.02, 0.025, 0.01), dark, 0, 0.1, 0.0);
    muzzle = new THREE.Vector3(0, 0.055, -0.83); sightY = 0.105;
  } else if (wi === 6) { // light machine gun
    add(B(0.065, 0.085, 0.4), body, 0, 0.05, -0.08); add(B(0.07, 0.07, 0.24), poly, 0, 0.05, -0.38); add(C(0.015, 0.3), dark, 0, 0.055, -0.62); add(C(0.02, 0.06), dark, 0, 0.055, -0.77);
    const mag = add(B(0.09, 0.12, 0.1), poly, -0.01, -0.04, -0.12); mag.name = "mag";
    add(B(0.032, 0.11, 0.045), poly, 0, -0.035, 0.05, 0.3); add(B(0.05, 0.1, 0.26), poly, 0, 0.03, 0.24); add(B(0.03, 0.035, 0.14), dark, 0, 0.12, -0.08);
    for (const sx of [-1, 1]) add(C(0.006, 0.22), dark, sx * 0.025, -0.01, -0.6, Math.PI / 2 - 0.15, 0, sx * 0.3);
    add(B(0.006, 0.03, 0.01), dark, 0, 0.1, -0.5); add(B(0.02, 0.025, 0.01), dark, 0, 0.1, 0.02);
    muzzle = new THREE.Vector3(0, 0.055, -0.8); sightY = 0.105;
  } else if (wi === 7) { // pan
    add(new THREE.CylinderGeometry(0.15, 0.13, 0.04, 22), dark, 0, 0.0, -0.36, Math.PI / 2 - 0.4);
    add(C(0.017, 0.24), new THREE.MeshStandardMaterial({ color: 0x5a3a20, roughness: 0.8 }), 0, -0.03, -0.1, 0.25);
    muzzle = new THREE.Vector3(0, 0, -0.4); sightY = 0.1;
  } else { // sniper
    add(B(0.055, 0.07, 0.34), body, 0, 0.05, -0.05); add(C(0.012, 0.5), dark, 0, 0.055, -0.46); add(C(0.02, 0.06), dark, 0, 0.055, -0.73);
    add(C(0.022, 0.3), dark, 0, 0.125, -0.06); add(C(0.028, 0.05), dark, 0, 0.125, -0.22); add(C(0.026, 0.04), dark, 0, 0.125, 0.1);
    add(B(0.012, 0.05, 0.012), dark, 0, 0.09, -0.12); add(B(0.012, 0.05, 0.012), dark, 0, 0.09, 0.02); add(B(0.03, 0.012, 0.012), dark, 0.035, 0.05, 0.02);
    add(B(0.032, 0.1, 0.045), poly, 0, -0.035, 0.05, 0.3); add(B(0.05, 0.1, 0.26), poly, 0, 0.03, 0.24, -0.05); add(B(0.03, 0.1, 0.05), dark, 0, -0.03, -0.12);
    if (lv >= 2) add(B(0.058, 0.01, 0.3), glow, 0, 0.087, -0.05);
    muzzle = new THREE.Vector3(0, 0.055, -0.77); sightY = 0.125;
  }
  g.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });
  return { g, muzzle, sightY, glow: lv >= 3 ? glow : null };
}
function armMesh(side, sleeveC) {
  const a = new THREE.Group();
  const hand = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.07, 0.1), GLOVE); a.add(hand);
  const fingers = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.03, 0.05), GLOVE); fingers.position.set(-side * 0.02, 0.0, -0.06); a.add(fingers);
  const wrist = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.03, 0.07, 10), SKIN); wrist.rotation.x = Math.PI / 2; wrist.position.z = 0.08; a.add(wrist);
  const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.045, 0.42, 12), new THREE.MeshStandardMaterial({ color: sleeveC, roughness: 0.9 })); sleeve.rotation.x = Math.PI / 2; sleeve.position.z = 0.31; a.add(sleeve);
  const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.052, 0.03, 12), new THREE.MeshStandardMaterial({ color: 0x1f2a1a, roughness: 1 })); cuff.rotation.x = Math.PI / 2; cuff.position.z = 0.12; a.add(cuff);
  a.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });
  return a;
}
const vm = { root: new THREE.Group(), cur: -2, gun: null, muzzle: new THREE.Vector3(), sightY: 0.1, kick: 0, swapT: 0, phase: 0, swayX: 0, swayY: 0, lastYaw: 0, lastPitch: 0, flash: null, flashT: 0, shells: [], glow: null, arms: null };
vmScene.add(vm.root);
(function () {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: flashTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); s.scale.set(0.12, 0.12, 1); s.visible = false; vmScene.add(s); vm.flash = s;
  const sg = new THREE.CylinderGeometry(0.005, 0.005, 0.022, 6), sm = new THREE.MeshStandardMaterial({ color: 0xd9a441, metalness: 0.9, roughness: 0.3 });
  for (let i = 0; i < 10; i++) { const m = new THREE.Mesh(sg, sm); m.visible = false; vmScene.add(m); vm.shells.push({ m, v: new THREE.Vector3(), t: 0 }); }
})();
const muzzleLight = new THREE.PointLight(0xffc070, 0, 9, 2); scene.add(muzzleLight);
function vmBuild(wi) {
  while (vm.root.children.length) vm.root.remove(vm.root.children[0]);
  vm.cur = wi; vm.gun = null; vm.glow = null;
  if (wi < 0) return;
  const lv = me && me.kind === "me" ? gunLevel(wi) : 1;
  const P = gunParts(wi, GUNSKINS[PROFILE.gun].c, lv);
  vm.gun = P.g; vm.muzzle.copy(P.muzzle); vm.sightY = P.sightY; vm.glow = P.glow;
  vm.root.add(P.g);
  const sleeve = myOutfit().c === "#ffffff" ? (mySuit() === "camo" ? 0x6b6e66 : mySuit() === "op" ? 0x7a6f55 : 0x3e5d7c) : new THREE.Color(myOutfit().c).multiplyScalar(0.7);
  const R = armMesh(1, sleeve); R.position.set(0.0, -0.025, 0.04); R.rotation.set(0.25, -0.08, 0.1); P.g.add(R);
  const L = armMesh(-1, sleeve); const lz = wi === 0 ? 0.0 : wi === 1 ? -0.17 : -0.36; L.position.set(-0.035, 0.0, lz); L.rotation.set(0.5, 0.55, -0.6); P.g.add(L);
  vm.swapT = 0.35;
}
const _vq = new THREE.Vector3();
function vmMuzzleWorld(out) { // world position of the barrel tip (for tracers and flashes)
  if (!vm.gun) return muzzlePos(me, out);
  vm.gun.updateMatrixWorld(true); _vq.copy(vm.muzzle).applyMatrix4(vm.gun.matrixWorld); // in viewmodel camera space
  // turn viewmodel camera space into world space using the real camera
  out.copy(_vq).applyMatrix4(camera.matrixWorld); return out;
}
function vmFire(wi) {
  vm.kick = Math.min(1.5, vm.kick + (wi === 4 ? 1.4 : wi === 3 ? 1.2 : wi === 0 ? 0.6 : 0.45));
  vm.flashT = 0.05; vm.flash.material.rotation = Math.random() * TAU;
  const sh = vm.shells.find((s) => s.t <= 0); if (sh && wi !== 3) { sh.t = 0.6; sh.m.visible = true; sh.m.position.set(vm.root.position.x + 0.04, vm.root.position.y + 0.07, vm.root.position.z - 0.1); sh.v.set(0.6 + Math.random() * 0.4, 0.7 + Math.random() * 0.4, 0.15); }
}
function vmUpdate(dt) {
  const wi = me.alive && !me.veh ? me.w[me.cur] : -1;
  if (wi !== vm.cur) vmBuild(wi);
  vm.root.visible = wi >= 0 && me.ph === "ground" && me.alive;
  if (!vm.gun) return;
  const ads = aimZoom && me.reloadT <= 0, k = 1 - Math.exp(-dt * 14);
  // walk bob and look sway
  const sp = Math.hypot(me.vx, me.vy) * (me.onGround ? 1 : 0); vm.phase += dt * sp * (me.stance === "crouch" ? 6 : 9.5);
  let dyaw = camYaw - vm.lastYaw; dyaw = Math.atan2(Math.sin(dyaw), Math.cos(dyaw)); const dp = camPitch - vm.lastPitch; vm.lastYaw = camYaw; vm.lastPitch = camPitch;
  vm.swayX = lerp(vm.swayX, clamp(-dyaw * 0.9, -0.05, 0.05), k); vm.swayY = lerp(vm.swayY, clamp(dp * 0.6, -0.04, 0.04), k);
  const bobK = ads ? 0.15 : 1, bx = Math.sin(vm.phase) * 0.012 * sp * bobK, by = -Math.abs(Math.cos(vm.phase)) * 0.012 * sp * bobK;
  vm.kick = Math.max(0, vm.kick - dt * 9);
  let tx = ads ? 0 : 0.2, ty = ads ? -vm.sightY : -0.215, tz = ads ? (wi === 4 ? -0.2 : -0.3) : (wi === 0 ? -0.42 : -0.52);
  let rx = 0, ry = ads ? 0 : 0.07, rz = 0;
  if (me.reloadT > 0) { const tot = WEAP[wi].reload * relK(me, wi), p = 1 - me.reloadT / tot, s = Math.sin(Math.PI * clamp(p, 0, 1)); rx -= 0.7 * s; ty -= 0.06 * s; rz += 0.4 * s; const mag = vm.gun.getObjectByName("mag"); if (mag) mag.position.y = -0.05 - 0.18 * Math.sin(Math.PI * clamp(p * 1.4, 0, 1)); }
  if (me.healT > 0 || me.climb) { ty -= 0.25; rx -= 0.5; }
  if (vm.swapT > 0) { vm.swapT -= dt; ty -= vm.swapT * 0.6; rx -= vm.swapT * 1.2; }
  if (!me.onGround) ty -= 0.02;
  vm.root.position.x = lerp(vm.root.position.x, tx + bx + vm.swayX, k);
  vm.root.position.y = lerp(vm.root.position.y, ty + by + vm.swayY - vm.kick * 0.006, k);
  vm.root.position.z = lerp(vm.root.position.z, tz + vm.kick * 0.045, 1 - Math.exp(-dt * 22));
  vm.root.rotation.x = lerp(vm.root.rotation.x, rx + vm.kick * 0.07, 1 - Math.exp(-dt * 20));
  vm.root.rotation.y = lerp(vm.root.rotation.y, ry - vm.swayX * 0.6, k); vm.root.rotation.z = lerp(vm.root.rotation.z, rz + vm.swayX * 1.2, k);
  if (vm.glow) vm.glow.emissiveIntensity = 1.2 + Math.sin(performance.now() / 260) * 0.6;
  // flash at the barrel
  vm.flashT -= dt;
  if (vm.flashT > 0) { vm.gun.updateMatrixWorld(true); vm.flash.position.copy(vm.muzzle).applyMatrix4(vm.gun.matrixWorld); vm.flash.visible = true; const s = 0.09 + Math.random() * 0.06; vm.flash.scale.set(s, s, 1); muzzleLight.intensity = 3; vmMuzzleWorld(muzzleLight.position); }
  else { vm.flash.visible = false; muzzleLight.intensity = 0; }
  for (const s of vm.shells) { if (s.t <= 0) continue; s.t -= dt; s.v.y -= 4 * dt; s.m.position.addScaledVector(s.v, dt); s.m.rotation.x += dt * 20; s.m.rotation.z += dt * 14; if (s.t <= 0) s.m.visible = false; }
}
// ----- weapon levels (upgrades from the armory) -----
function gunLevel(wi) { return (PROFILE.guns && PROFILE.guns[wi]) || 1; }
function dmgK(e, wi) { return e === me ? 1 + 0.07 * (gunLevel(wi) - 1) : 1; }
function relK(e, wi) { return e === me ? 1 - 0.06 * (gunLevel(wi) - 1) : 1; }
function magOf(e, wi) {
  if (wi < 0 || !WEAP[wi]) return 0;
  const slot = e.w ? e.w.indexOf(wi) : -1, ext = slot >= 0 && e.att && e.att[slot] && e.att[slot].x;
  return WEAP[wi].mag + (e === me && wi !== 3 && wi !== 4 && wi < 5 ? Math.floor((gunLevel(wi) - 1) * WEAP[wi].mag * 0.1) : 0) + (ext ? Math.ceil(WEAP[wi].mag * 0.5) : 0);
}
function fpsActive() { const v = SETTINGS.view || "auto"; return v === "fps" || (v === "auto" && MAP && MAP.kind === "arena"); }

// ---------------- bots ----------------
// pick a spot behind an obstacle that the enemy cannot see (outdoors)
function findCover(b, t) {
  if (b.z > 0.5 || bldAt(b.x, b.y)) return null;
  let best = null, bd = 26;
  const cands = near(b.x, b.y, 22);
  let n = 0;
  for (const o of cands) {
    if (o.z0 || o.kind === "tree" || o.kind === "pole" || o.kind === "fence" || o.kind === "door" || o.h3 < 1.2) continue;
    if (++n > 28) break;
    let cx, cy, size;
    if (o.t === "c") { cx = o.x; cy = o.y; size = o.r; }
    else { cx = clamp(b.x, o.x, o.x + o.w); cy = clamp(b.y, o.y, o.y + o.h); size = 0.2; }
    const dx = cx - t.x, dy = cy - t.y, dl = Math.hypot(dx, dy) || 1;
    const px = cx + dx / dl * (size + 1.0), py = cy + dy / dl * (size + 1.0);
    if (px < 3 || py < 3 || px > S - 3 || py > S - 3 || pointBlocked(px, py) || bldAt(px, py)) continue;
    const d = Math.hypot(px - b.x, py - b.y);
    if (d < bd && !los(t.x, t.y, px, py, t.z, 0)) { bd = d; best = { x: px, y: py, z: 0 }; }
  }
  return best;
}
// gunshots and footsteps draw nearby bots to the noise
function alertBots(x, y, src, radius, z = 0) {
  for (const b of ents) {
    if (b.kind !== "bot" || !b.alive || b.ph !== "ground" || b === src) continue;
    if (Math.abs(b.x - x) + Math.abs(b.y - y) > radius * 1.4 || Math.hypot(b.x - x, b.y - y) > radius) continue;
    if (!b.target) { b.heard = { x, y, z, t: 6 }; b.a = Math.atan2(y - b.y, x - b.x); }
  }
}
function attackersOf(t) { let n = 0; for (const e of ents) if (e.kind === "bot" && e.alive && e.target === t) n++; return n; }

function botThink(b, dt, zone) {
  if (b.ph === "plane" || b.climb) return;
  if (b.knocked) {
    let m = null, md = 1e9; for (const o of ents) if (friends(b, o) && standing(o)) { const d = Math.hypot(o.x - b.x, o.y - b.y); if (d < md) { md = d; m = o; } }
    if (m && md > 1.5) { const a = Math.atan2(m.y - b.y, m.x - b.x); b.a = a; b.vx = Math.cos(a); b.vy = Math.sin(a); } else b.vx = b.vy = 0;
    return;
  }
  if (b.reviving) { b.vx = b.vy = 0; return; }
  b.think -= dt; b.pathT -= dt;
  if (b.underFire > 0) b.underFire -= dt;
  if (b.heard) { b.heard.t -= dt; if (b.heard.t <= 0) b.heard = null; }
  const hasGun = b.w[b.cur] >= 0;
  if (b.think <= 0) {
    b.think = 0.25 + Math.random() * 0.15;
    if (b.ph === "ground" && !b.veh) botDoors(b);
    // who can I see? (prone targets are hard to spot from far away)
    let tgt = null, td = b.w[b.cur] === 4 ? 150 : 90;
    for (const o of ents) {
      if (o === b || !o.alive || o.ph !== "ground" || friends(o, b)) continue;
      const d = Math.hypot(o.x - b.x, o.y - b.y), range = o.stance === "prone" ? Math.min(td, 40) : o.stance === "crouch" ? td * 0.8 : td;
      if (d < range && d < td && Math.abs(o.z - b.z) < 30 && los(b.x, b.y, o.x, o.y, b.z, o.z) && !smokeBlocks(b.x, b.y, o.x, o.y)) { td = d; tgt = o; }
    }
    b.seen = !!tgt;
    // out of sight but close: lob a grenade at where they were
    if (!tgt && b.target && b.target.alive && b.memory > 0 && b.ph === "ground" && !b.veh && b.thr && Math.random() < 0.06) {
      const t = b.target, d = Math.hypot(t.x - b.x, t.y - b.y), k = b.thr.g > 0 ? "g" : b.thr.o > 0 ? "o" : null;
      if (k && d > 8 && d < 32) { b.a = Math.atan2(t.y - b.y, t.x - b.x); throwItem(b, k, lobVelocity(new THREE.Vector3(b.x, (b.z || 0) + 1.6, b.y), new THREE.Vector3(t.x, (t.z || 0) + 0.2, t.y), 0.9 + d / 30)); }
    }
    if (!tgt && b.target && b.target.alive && b.memory > 0) tgt = b.target; // keep hunting a target we just lost
    if (tgt !== b.target) { b.react = 0.45 + (1 - b.skill) * 0.6; b.target = tgt; b.mode = "fight"; b.memory = 5; }
    if (b.seen) b.memory = 5;
    b.aimErr = (Math.random() - 0.5) * 0.2;
    if (Math.random() < 0.25) b.strafe *= -1;
    // jump out of the car to fight someone close
    if (b.veh && b.seen && tgt && hasGun && td < 45 && !b.urgent) exitVehicle(b);
    // tactics
    if (tgt && hasGun && !b.veh) {
      if ((b.hp < 55 || b.underFire > 0) && b.mode !== "cover" && b.mode !== "peek" && Math.random() < 0.6) {
        const cp = findCover(b, tgt);
        if (cp) { b.mode = "cover"; b.coverPt = cp; b.modeT = 2 + Math.random() * 2.5; }
      } else if (b.mode === "fight" && !b.flanked && attackersOf(tgt) >= 2 && Math.random() < 0.3 && !bldAt(b.x, b.y)) {
        b.mode = "flank"; b.flankSide = Math.random() < 0.5 ? -1 : 1; b.modeT = 5; b.flanked = true;
      }
      b.stance = b.mode === "fight" && b.seen && Math.random() < 0.3 ? "crouch" : b.mode === "cover" ? b.stance : "stand";
    } else b.stance = "stand";
    // where to go when not fighting
    const dz = Math.hypot(b.x - zone.nx, b.y - zone.ny);
    const outside = Math.hypot(b.x - zone.x, b.y - zone.y) > zone.r - 6 || (zone.shrinking && dz > zone.nr * 0.8) || (zone.left < 20 && dz > zone.nr * 0.85);
    if (outside) {
      if (!b.urgent || !b.goal) b.goal = { x: zone.nx + (Math.random() - 0.5) * zone.nr * 0.5, y: zone.ny + (Math.random() - 0.5) * zone.nr * 0.5, z: 0 };
      b.urgent = true;
      // far from the safe zone: grab a car if one is close
      if (!b.veh && !b.wantVeh && dz > zone.nr + 35 && b.z < 0.5 && !b.seen) { const v = nearVehicle(b, 45); if (v) b.wantVeh = v; }
    }
    else if (b.heard && !tgt) { b.goal = { x: b.heard.x + (Math.random() - 0.5) * 6, y: b.heard.y + (Math.random() - 0.5) * 6, z: b.heard.z || 0 }; b.urgent = false; }
    else if (!b.goal || (Math.hypot(b.goal.x - b.x, b.goal.y - b.y) < 1.5 && Math.abs((b.goal.z || 0) - b.z) < 1.5) || Math.random() < 0.02) {
      b.urgent = false;
      let pick = null, pd = b.w[0] < 0 ? 120 : 60;
      for (const it of MAP.loot) {
        if (it.taken || (it.k === "w" && b.w[0] >= 0 && b.w[1] >= 0) || (it.k === "v" && it.v <= b.armor)) continue;
        const d = Math.hypot(it.x - b.x, it.y - b.y) + Math.abs((it.z || 0) - b.z) * 2;
        if (d < pd && Math.hypot(it.x - zone.x, it.y - zone.y) < zone.r) { pd = d; pick = it; }
      }
      if (MAP.kind === "arena" && Math.random() < 0.55) { const foes = ents.filter((o) => o.alive && o.team !== b.team); const f = foes[Math.floor(Math.random() * foes.length)]; if (f) pick = { x: clamp(f.x + (Math.random() - 0.5) * 16, 4, AS - 4), y: clamp(f.y + (Math.random() - 0.5) * 16, 4, AS - 4), z: 0 }; }
      if (pick) b.goal = { x: pick.x, y: pick.y, z: pick.z || 0 };
      else { const a = Math.random() * TAU, r = Math.random() * zone.nr * 0.9; b.goal = { x: clamp(zone.nx + Math.cos(a) * r, 8, S - 8), y: clamp(zone.ny + Math.sin(a) * r, 8, S - 8), z: 0 }; }
    }
    if (b.wantVeh && (b.wantVeh.driver || b.wantVeh.dead)) b.wantVeh = null;
    if (b.veh && (!b.urgent || dz < zone.nr * 0.6 || (b.revN || 0) > 4)) { exitVehicle(b); b.revN = 0; }
    if (!b.veh && Math.hypot(b.x - b.lx, b.y - b.ly) < 0.3 && (b.goal || b.mode === "cover") && b.ph === "ground" && b.healT <= 0 && !(b.mode === "cover" && b.atCover)) { b.stuckT = 0.7; b.stuckA = Math.random() * TAU; b.pathT = 0; }
    b.lx = b.x; b.ly = b.y;
  }
  if (b.memory > 0) b.memory -= dt;
  if (b.veh) { b.vx = b.vy = 0; if (b.goal) botDrive(b, b.veh, dt, b.goal.x, b.goal.y); return; }
  let mx = 0, my = 0;
  const t = b.target;
  const go = (gx, gy, gz = 0) => { const w = b.ph === "ground" ? botGo(b, gx, gy, gz) : { x: gx, y: gy }; const a = Math.atan2(w.y - b.y, w.x - b.x); mx = Math.cos(a); my = Math.sin(a); return a; };
  if (b.ph === "para") { if (b.goal) b.a = go(b.goal.x, b.goal.y); }
  else if (b.wantVeh && !(t && b.seen)) {
    const v = b.wantVeh; b.a = go(v.x, v.y, 0);
    if (Math.hypot(v.x - b.x, v.y - b.y) < 3) { enterVehicle(b, v); b.wantVeh = null; }
  }
  else if (t && t.alive && hasGun && !b.urgent) {
    const d = Math.hypot(t.x - b.x, t.y - b.y), a = Math.atan2(t.y - b.y, t.x - b.x);
    const wi = b.w[b.cur], want = wi === 3 ? 8 : wi === 4 ? (MAP.kind === "arena" ? 35 : 70) : bldAt(b.x, b.y) || MAP.kind === "arena" ? 12 : 28;
    b.react -= dt;
    if (b.mode === "cover" && b.coverPt) {
      const dc = Math.hypot(b.coverPt.x - b.x, b.coverPt.y - b.y);
      b.atCover = dc < 0.8;
      if (!b.atCover) { go(b.coverPt.x, b.coverPt.y, b.coverPt.z || 0); b.stance = "stand"; }
      else {
        b.stance = "crouch"; b.a = a;
        if (b.hp < 75 && b.healT <= 0) { const q = bestHeal(b); if (q) useHeal(b, q); }
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
      go(t.x + Math.cos(back) * want, t.y + Math.sin(back) * want, 0);
      if (b.seen && b.react <= 0 && d < WEAP[wi].range) { b.a = a + b.aimErr * 0.2; botFire(b, t); } else b.a = Math.atan2(my, mx);
      b.modeT -= dt; if (b.modeT <= 0) b.mode = "fight";
    } else {
      b.a = a + b.aimErr * 0.2;
      if (!b.seen) { go(t.x, t.y, t.z || 0); b.a = Math.atan2(my, mx); } // chase the last known position, through doors and stairs
      else {
        const fwd = d > want + 6 ? 1 : d < want - 8 ? -0.7 : 0;
        const strafeK = b.stance === "crouch" ? 0.2 : bldAt(b.x, b.y) ? 0.4 : 0.8;
        mx = Math.cos(a) * fwd + Math.cos(a + Math.PI / 2) * b.strafe * strafeK; my = Math.sin(a) * fwd + Math.sin(a + Math.PI / 2) * b.strafe * strafeK;
        if (b.react <= 0 && d < WEAP[wi].range) botFire(b, t);
      }
    }
    if (b.mag[b.cur] === 0 && totalAmmo(b) === 0 && b.w[1 - b.cur] >= 0) b.cur = 1 - b.cur;
  } else {
    b.mode = "roam";
    if (botTeamCare(b)) return;
    if (b.healT <= 0 && (b.hp < 80 || (b.boost < 40 && b.hp < 100))) { const q = bestHeal(b); if (q) useHeal(b, q); }
    if (b.w[b.cur] >= 0 && b.mag[b.cur] < WEAP[b.w[b.cur]].mag * 0.5) startReload(b);
    if (b.goal) b.a = go(b.goal.x, b.goal.y, b.goal.z || 0);
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
  // squad mates jump with you and land next to you
  if (e === me && TS > 1) ents.forEach((m, i) => { if (m.kind === "bot" && friends(m, me) && m.ph === "plane") m.jumpAt = Math.min(m.jumpAt, matchT + 0.4 + i * 0.25); });
  if (e.kind === "bot" && TS > 1 && friends(e, me) && me.ph !== "plane") e.goal = { x: me.x + (Math.random() - 0.5) * 14, y: me.y + (Math.random() - 0.5) * 14, follow: true };
  if (e === me) { tone(300, 0.3, "sine", 0.06, 300); hint(IS_TOUCH ? "حرّك العصا اليسار عشان توجّه المظلة، ودوّر حول نفسك بالسحب يمين الشاشة" : "وجّه المظلة بـ WASD والماوس", 4200); tutorialEvent("jump"); }
}
let ctxAcc = 0, ctxDoor = null, ctxVeh = null;
// show the right action buttons for what is around you
function ctxTick(dt) {
  ctxAcc -= dt; if (ctxAcc > 0) return; ctxAcc = 0.12;
  const ix = me.inX || 0, iy = me.inY || 0, il = Math.hypot(ix, iy);
  if (me.alive && me.ph === "ground" && !me.veh && il > 0.3) {
    const d = doorNear(me, 1.6);
    if (d && !d.open) { const dx = d.x + d.w / 2 - me.x, dy = d.y + d.h / 2 - me.y, l = Math.hypot(dx, dy) || 1; if ((dx * ix + dy * iy) / l / il > 0.25) { setDoor(d, true); ctxAcc = 0; } }
  }
  const ok = me.alive && me.ph === "ground";
  ctxVeh = ok && !me.veh && !me.climb ? nearVehicle(me) : null;
  ctxDoor = ok && !me.veh && !me.climb && !ctxVeh ? doorNear(me) : null;
  const cb = $("carBtn"), db = $("doorBtn"), hop = $("hopBtn");
  cb.hidden = !(ctxVeh || me.veh); cb.textContent = me.veh ? (IS_TOUCH ? "انزل" : "F – انزل") : (IS_TOUCH ? "اركب" : "F – اركب");
  db.hidden = !ctxDoor; if (ctxDoor) db.textContent = (IS_TOUCH ? "" : "F – ") + (ctxDoor.open ? "سكّر الباب" : "افتح الباب");
  if (ok && !me.veh) { const vt = me.onGround && !me.climb ? vaultTarget(me, Math.hypot(me.vx, me.vy) > 0.2 ? Math.atan2(me.vy, me.vx) : camYaw) : null; hop.textContent = vt ? "تسلق" : "قفز"; hop.classList.toggle("on", !!vt); }
  if (me.veh) { const v = me.veh, sp = Math.abs(v.fwd || 0) * 3.6; $("spd").textContent = ar(Math.round(sp)); $("vhp").style.width = clamp(v.hp / VSPEC[v.type].hp * 100, 0, 100) + "%"; }
  $("speedo").hidden = !me.veh;
  { const kn = ok && !me.knocked && !me.veh && !me.reviving ? nearKnockedMate(me) : null; $("reviveBtn").hidden = !kn; if (kn) $("reviveBtn").textContent = (IS_TOUCH ? "" : "F – ") + "أسعف " + kn.name; }
  $("knockMsg").hidden = !(me.alive && me.knocked);
  if (MAP.kind === "arena") { $("scA").textContent = ar(teamScore[0]); $("scB").textContent = ar(teamScore[1]); $("scT").textContent = fmtTime(Math.max(0, ARENA.time - Math.max(0, matchT))); }
}
function actionKey() {
  if (!me || !me.alive || me.knocked) return;
  { const kn = !me.veh ? nearKnockedMate(me) : null; if (kn) { startRevive(me, kn); return; } }
  if (me.veh) { exitVehicle(me); return; }
  if (ctxVeh) { enterVehicle(me, ctxVeh); return; }
  if (ctxDoor) { setDoor(ctxDoor, !ctxDoor.open); ctxAcc = 0; return; }
  if (nearLoot) takeLoot(me, nearLoot, true);
}
function update(dt) {
  matchT = (nowSync() - matchStartWall) / 1000;
  if (matchT < 0) { $("countdown").hidden = false; $("countdown").textContent = ar(Math.ceil(-matchT)); return; }
  $("countdown").hidden = true;
  stepBullets(dt); stepProjs(dt); stepDrops(dt); stepRedZone(dt);
  const zone = zoneAt(matchT), P = MAP.plane, pk = clamp(matchT / P.dur, 0, 1);
  const px = lerp(P.x1, P.x2, pk), py = lerp(P.y1, P.y2, pk);

  // my input
  if (me.alive) {
    const mv = input.move();
    if (me.veh) {
      const v = me.veh; if (v.driver === me) { const thr = -mv.y, hb = input.hand(); vehStep(v, dt, Math.abs(thr) > 0.15 ? thr : 0, mv.x, hb); engineTick(v, thr); }
      me.vx = me.vy = 0;
      // the camera slowly swings behind the car while you drive
      if (performance.now() - input.lastLook() > 900 && Math.abs(v.fwd || 0) > 2) { let da = (v.fwd > 0 ? v.a : v.a + Math.PI) - camYawT; da = Math.atan2(Math.sin(da), Math.cos(da)); camYawT += da * (1 - Math.exp(-dt * 2.2)); camPitchT = lerp(camPitchT, 0.3, 1 - Math.exp(-dt * 2)); }
    } else {
      const fwdX = Math.cos(camYaw), fwdY = Math.sin(camYaw), rX = -Math.sin(camYaw), rY = Math.cos(camYaw);
      let vx = fwdX * -mv.y + rX * mv.x, vy = fwdY * -mv.y + rY * mv.x; const l = Math.hypot(vx, vy);
      if (l > 1) { vx /= l; vy /= l; }
      const k = 1 - Math.exp(-dt * 10); // ease in/out so movement has a bit of weight
      me.vx = lerp(me.vx, vx, k); me.vy = lerp(me.vy, vy, k); me.inX = vx; me.inY = vy;
      if (me.ph === "ground") {
        const combatFace = input.firing() || aimZoom || me.shotT > 1.3 || fpsActive() || me.veh || me.stance === "prone";
        if (combatFace) me.a = camYaw;
        else if (l > 0.1) { const ta = Math.atan2(vy, vx); let da = ta - me.a; da = Math.atan2(Math.sin(da), Math.cos(da)); me.a += da * Math.min(1, dt * 10); }
      }
      else if (me.ph === "para") me.a = camYaw;
      { const f = input.firing(), single = me.fm[me.cur] === "single"; if (f && (!single || !me.trigWas)) playerFire(); me.trigWas = f; }
      me.leanT = me.ph === "ground" && !me.veh && me.stance !== "prone" && !me.climb ? input.lean() : 0;
    }
  }
  for (const e of ents) {
    if (e.kind === "remote" || (e.kind === "bot" && online && !isHost)) {
      const k = 1 - Math.exp(-dt * 12), ox = e.x, oy = e.y;
      e.x = lerp(e.x, e.tx, k); e.y = lerp(e.y, e.ty, k); e.z = lerp(e.z, e.tz || 0, k);
      let da = e.ta - e.a; da = Math.atan2(Math.sin(da), Math.cos(da)); e.a += da * k;
      const moved = Math.hypot(e.x - ox, e.y - oy);
      e.moving = moved / Math.max(dt, 1e-4) > 1;
      if (e.veh) { const v = e.veh; const ovx = v.x, ovy = v.y; v.x = e.x; v.y = e.y; v.a = e.a; const ca = Math.cos(v.a), sa = Math.sin(v.a); v.fwd = ((v.x - ovx) * ca + (v.y - ovy) * sa) / Math.max(dt, 1e-4); v.vx = (v.x - ovx) / Math.max(dt, 1e-4); v.vy = (v.y - ovy) / Math.max(dt, 1e-4); v.spin += v.fwd * dt / VSPEC[v.type].wr; e.moving = false; }
      else if (e.alive && e.ph === "ground") footsteps(e, moved);
      continue;
    }
    if (e.runT > 0) e.runT -= dt; if (e.shotT > 0) e.shotT -= dt;
    if (e.kind === "bot" && !(e.shotT > 0.8)) { e.leanT = 0; e.aimP = lerp(e.aimP || 0, 0, 1 - Math.exp(-dt * 2)); }
    e.lean = lerp(e.lean || 0, e.alive ? e.leanT || 0 : 0, 1 - Math.exp(-dt * 9));
    if (!e.alive) { e.deadT += dt; if (MAP.kind === "arena" && !ended) { if (e === me) $("respawnT").textContent = ar(Math.max(1, Math.ceil(4 - e.deadT))); if (e.deadT > 4) arenaSpawn(e); } continue; }
    if (e.spawnProt > 0) e.spawnProt -= dt;
    if (MAP.kind === "arena" && e.hp < 100 && matchT - (e.lastHurtT || -99) > 4) { e.hp = Math.min(100, e.hp + 16 * dt); if (e === me) hpTick(); }
    if (e.ph === "plane") { e.x = px; e.y = py; e.z = 110; if (e.kind === "bot" && matchT >= e.jumpAt) jump(e); if (pk >= 1) jump(e); continue; }
    if (e.kind === "bot") botThink(e, dt, zone);
    if (e.ph === "para") {
      e.paraT += dt;
      const fall = e.z > 32 ? 38 : 7; e.z -= fall * dt;
      const steer = e.z > 32 ? 24 : 11; e.x += e.vx * steer * dt; e.y += e.vy * steer * dt;
      e.x = clamp(e.x, 4, S - 4); e.y = clamp(e.y, 4, S - 4);
      if (e.z < 30) collide(e); // slide off pitched roofs and walls
      const g = groundAt(e.x, e.y, e.z);
      if (e.z <= g) { e.z = g; e.vz = 0; e.peak = g; e.onGround = true; e.stance = "stand"; e.ph = "ground"; collide(e); if (e === me) { hint("هبطت! دوّر على سلاح، الأسلحة تلمع بلون برتقالي", 4500); tutorialEvent("land"); updateHud(); } }
      continue;
    }
    if (e.climb) climbStep(e, dt);
    else if (e.veh) {
      if (e.veh.driver !== e) { e.veh = null; }
      else { e.x = e.veh.x; e.y = e.veh.y; e.z = 0; e.a = e.veh.a; e.moving = false; e.onGround = true; }
    } else {
      let sp = e.kind === "bot" ? 6.4 : 7.4;
      if (e.healT > 0) sp *= 0.45; if (e === me && aimZoom) sp *= 0.55;
      sp *= e.stance === "prone" ? 0.28 : e.stance === "crouch" ? 0.55 : 1;
      if (!e.onGround) sp *= 0.9;
      sp *= boostSpeed(e) * (e.knocked ? 0.55 : 1) * (e.reviving ? 0 : 1);
      e.x += e.vx * sp * dt; e.y += e.vy * sp * dt; e.moving = Math.hypot(e.vx, e.vy) > 0.1;
      collide(e);
      groundPhysics(e, dt);
      footsteps(e, sp * Math.hypot(e.vx, e.vy) * dt);
    }
    if (e.fireT > 0) e.fireT -= dt;
    if (e.reloadT > 0) { e.reloadT -= dt; if (e.reloadT <= 0) finishReload(e); }
    if (e.healT > 0) { e.healT -= dt; if (e.healT <= 0) finishHeal(e); }
    boostTick(e, dt); knockTick(e, dt); reviveTick(e, dt);
    if (Math.hypot(e.x - zone.x, e.y - zone.y) > zone.r) {
      e.zoneAcc += zone.dps * dt;
      if (e.zoneAcc >= 1) { const d = Math.floor(e.zoneAcc); e.zoneAcc -= d; e.hp -= d; if (e === me) { hurt = Math.max(hurt, 0.4); updateHud(); } if (e.hp <= 0) kill(e, null, null, -2); }
    }
  }
  // parked cars still roll and settle
  for (const v of MAP.vehicles) {
    if (v.driver && !v.driver.alive) v.driver = null;
    if (v.driver) { vehFx(v, dt); continue; }
    if (Math.abs(v.vx) + Math.abs(v.vy) > 0.05) vehStep(v, dt, 0, 0, false);
    if (v.dead && v.smokeT > 0) { v.smokeT -= dt; if (Math.random() < dt * 6 && Math.hypot(v.x - me.x, v.y - me.y) < 150) puff(new THREE.Vector3(v.x + (Math.random() - 0.5), 1.4, v.y + (Math.random() - 0.5)), 0x2b2724, 1.6, 1.6); }
  }
  ctxTick(dt);
  if (me.alive && me.ph === "ground" && !me.veh && !me.climb) {
    nearLoot = autoLoot(me);
    const pb = $("pickupBtn"); if (nearLoot) { pb.hidden = false; pb.textContent = (IS_TOUCH ? "" : "F – ") + "التقط " + itemLabel(nearLoot); } else pb.hidden = true;
  } else $("pickupBtn").hidden = true;
  $("jumpBtn").hidden = !(me.alive && me.ph === "plane");

  // zone ui
  const outside = me.alive && Math.hypot(me.x - zone.x, me.y - zone.y) > zone.r;
  const zm = $("zoneMsg");
  if (zone.phase < PHASES.length) { zm.textContent = (outside ? "أنت برا المنطقة الآمنة! ارجع داخل الدائرة البيضاء – " : "") + (zone.shrinking ? "العاصفة تضيق – " : "العاصفة تضيق بعد ") + fmtTime(zone.left); zm.classList.toggle("hot", outside); }
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
  if (MAP.kind === "arena") {
    const left = ARENA.time - matchT;
    if (!ended && matchT > 1 && (teamScore[0] >= ARENA.target || teamScore[1] >= ARENA.target || left <= 0)) {
      ended = true; const win = teamScore[0] > teamScore[1];
      if (win) { tone(523, 0.15, "triangle", 0.07); setTimeout(() => tone(659, 0.15, "triangle", 0.07), 150); setTimeout(() => tone(1046, 0.3, "triangle", 0.07), 300); }
      const rank = 1 + ents.filter((e) => e.kills > me.kills).length;
      setTimeout(() => showEnd(win, rank, ""), 1600);
    }
    return;
  }
  const n = aliveCount(); if (n !== aliveCache) { aliveCache = n; $("alive").textContent = ar(n); }
  const teams = aliveTeams();
  if (!ended && matchT > 5 && teams.size <= 1 && teams.has(me.team)) {
    ended = true; if (online) netState(me.alive ? "win" : "dead");
    tone(523, 0.15, "triangle", 0.07); setTimeout(() => tone(659, 0.15, "triangle", 0.07), 150); setTimeout(() => tone(1046, 0.3, "triangle", 0.07), 300);
    $("spec").hidden = true; specEnt = null;
    setTimeout(() => showEnd(true, 1, TS > 1 && !me.alive ? "فريقك فاز!" : ""), 1400);
  } else if (!ended && !me.alive && TS > 1 && !ents.some((o) => o.team === me.team && o.alive)) {
    ended = true; $("spec").hidden = true; specEnt = null;
    const rank = teams.size + 1;
    setTimeout(() => showEnd(false, rank, "انتهى فريقك"), 1200);
  }
}
function onMyDeath(killerName, how) {
  deathRank = aliveCount() + 1; if (online) netState("dead"); buzz([80, 40, 160]);
  if (TS > 1 && ents.some((o) => friends(me, o) && o.alive)) {
    setTimeout(() => { if (ended) return; nextSpec(); $("spec").hidden = false; $("specBy").textContent = killerName ? "قتلك " + killerName + (how ? " بـ" + how : "") : ""; }, 2000);
    return;
  }
  setTimeout(() => { if (!ended) { ended = true; showEnd(false, deathRank, killerName ? "قتلك " + killerName + (how ? " بـ" + how : "") : "قتلتك " + how); } }, 2200);
}

// ---------------- render ----------------
const camTarget = new THREE.Vector3();
let lootTick = 0;
let fpsCam = false, fpsEye = 1.62;
const _frus = new THREE.Frustum(), _pm = new THREE.Matrix4(), _sph = new THREE.Sphere(), _sv2 = new THREE.Vector3();
function render(dt) {
  if (mode === "menu" || mode === "lobby" || !MAP) { renderLobby3D(dt); return; }
  if (mode !== "play") { renderer.render(scene, camera); return; }
  fpsCam = fpsActive() && me.ph === "ground" && !me.veh && me.alive && !me.knocked;
  // visuals (soldiers far away or off screen are animated less often, and only close ones cast shadows)
  _pm.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse); _frus.setFromProjectionMatrix(_pm);
  for (const e of ents) {
    const v = e.vis; if (!v) continue;
    const d = Math.hypot(e.x - me.x, e.y - me.y);
    const show = e.ph !== "plane" && d < (e.ph === "para" ? Q.draw : Q.charDraw || Q.draw) && (e.alive || e.deadT < 6);
    // one sphere test per character instead of per body part (skinned bounds are unreliable across models)
    v.holder.visible = show && (e === me || d < 8 || _frus.intersectsSphere(_sph.set(_sv2.set(e.x, (e.z || 0) + 1, e.y), 2.4))); if (!show) continue;
    if (e === me && fpsCam) { v.holder.visible = false; continue; }
    if (e.veh) { const P = VSPEC[e.veh.type], p = vehWorld(e.veh, P.seat[0], P.seat[2]); v.holder.position.set(p.x, P.seat[1] - 0.1, p.y); v.holder.rotation.y = Math.PI / 2 - e.veh.a; }
    else { v.holder.position.set(e.x, e.z || 0, e.y); v.holder.rotation.y = Math.PI / 2 - e.a; }
    v.chute.visible = e.ph === "para" && e.z < 32;
    // how fast and which way the body is really moving (works the same for me, bots and remote players)
    { const ivx = (e.x - v.lx) / Math.max(dt, 1e-4), ivy = (e.y - v.ly) / Math.max(dt, 1e-4), kv = 1 - Math.exp(-dt * 10); v.vx = lerp(v.vx, clamp(ivx, -30, 30), kv); v.vy = lerp(v.vy, clamp(ivy, -30, 30), kv); v.lx = e.x; v.ly = e.y; }
    const st = e.ph === "ground" ? e.stance : "stand", spd = Math.hypot(v.vx, v.vy);
    if (e.alive) {
      const combat = (e === me && aimZoom) || e.shotT > 0.6 || (e.kind === "bot" && !!e.seen) || e.reloadT > 0;
      const kneelReload = st === "crouch" && e.reloadT > 0 && !e.moving && !!v.acts.kneel;
      const pick = e.climb ? "sprint" : e.ph !== "ground" || e.onGround === false || e.veh || e.knocked ? "idle" : kneelReload ? "kneel"
        : e.moving ? (st !== "stand" || e.healT > 0 || (e === me && aimZoom) ? "walk" : combat ? "run" : "sprint") : "idle";
      setAnim(v, pick);
      // play the legs at the speed the body really moves
      const nominal = { walk: 2.4, run: 4.6, sprint: 5.6, walkup: 1.6, strafe: 2.2 }[v.cur];
      let mva = Math.atan2(v.vy, v.vx) - e.a; mva = Math.atan2(Math.sin(mva), Math.cos(mva));
      const back = spd > 0.4 && Math.abs(mva) > 2.0;
      if (nominal && v.acts[v.cur]) v.acts[v.cur].timeScale = (st === "prone" ? 0.5 : clamp(spd / nominal, 0.55, 1.7)) * (back ? -1 : 1);
      if (v.cur === "kneel" && e.w[e.cur] >= 0) { const kw = e.w[e.cur], tot = WEAP[kw].reload * (e === me ? relK(me, kw) : 1), p = clamp(1 - e.reloadT / tot, 0, 1); v.acts.kneel.time = 0.35 + p * 4.3; v.acts.kneel.timeScale = 0; }
    }
    const wi = e.w[e.cur], wcls = wi >= 0 && (!e.veh || e.veh.driver !== e) ? WCLASS[wi] : "none";
    const g = wcls !== "none" ? v.gunFor(wcls) : null;
    if (e.alive) v.heldGun = g;
    for (const k in v.guns) if (v.guns[k] !== v.heldGun) v.guns[k].visible = false;
    { const sh = d < (Q.shChar || 0) && Q.shadows && !shadowsOff; v.shT = (v.shT || 0) + dt; if (v.sh !== sh || v.shT > 1) { v.sh = sh; v.shT = 0; v.holder.traverse((o) => { if (o.isMesh) o.castShadow = sh; }); } }
    { const far = e !== me && d > (Q.lodDist || 14) && v.lodLo.length > 0; if (far !== v.far) { v.far = far; for (const o of v.lodHi) o.visible = !far; for (const o of v.lodLo) o.visible = far; } }
    const onScreen = e === me || d < 6 || _frus.intersectsSphere(_sph.set(_sv2.set(e.x, (e.z || 0) + 1, e.y), 2.2));
    const step = e === me || (d < 28 && onScreen) ? 0 : !onScreen ? 0.3 : d < 60 ? 1 / 30 : 1 / 12;
    v.racc = (v.racc || 0) + dt;
    if (d < 120 && v.racc >= step) {
      const rdt = Math.min(v.racc, 0.3); v.racc = 0;
      const Q0 = performance.now();
      if (v.rig) rigPre(v.rig);
      v.mixer.update(e.alive ? rdt : 0);
      PERF.mix += performance.now() - Q0;
      if (v.rig && d < Q.rigDist) {
        const now = performance.now() / 1000;
        let ma = Math.atan2(v.vy, v.vx) - e.a; ma = Math.atan2(Math.sin(ma), Math.cos(ma));
        dressGear(v, e.helm | 0, e.armor | 0, e.pack | 0, e.pan && e.cur !== 2);
        if (g && wi >= 0 && wi < 7) fitAttachments(g, e.att && e.att[e.cur]);
        let yr = e.a - (v.la === undefined ? e.a : v.la); yr = Math.atan2(Math.sin(yr), Math.cos(yr)); v.la = e.a; v.yawRate = lerp(v.yawRate || 0, yr / Math.max(dt, 1e-3), 1 - Math.exp(-dt * 8));
        const look = e === me ? null : e.target && e.target.alive && e.seen ? e.target : null;
        rigUpdate(v.rig, {
          yawRate: v.yawRate, speed: spd, mocapReload: v.cur === "kneel", lookAt: look ? [look.x, (look.z || 0) + 1.5, look.y] : null, ground: (x, y) => groundAt(x, y, (e.z || 0) + 0.7), baseZ: e.z || 0,
          ph: e.ph === "para" ? (e.z >= 32 ? "air" : "para") : e.ph, freefall: e.ph === "para" && e.z >= 32, stance: st, moving: e.moving && spd > 0.4, sprint: e.moving && spd > 4.2 && !(e.shotT > 0.6),
          moveAng: -ma, aimPitch: e === me ? (aimZoom || me.shotT > 1.0 || !me.moving ? camPitch : 0.08) : e.aimP || 0, aiming: (e === me && aimZoom) || (e.kind === "bot" && !!e.seen), firedAt: e.shotT > 0 ? now - (2 - e.shotT) : -9, hitAt: e.hitAt || 0,
          reloadP: e.reloadT > 0 && wi >= 0 ? clamp(1 - e.reloadT / (WEAP[wi].reload * (e === me ? relK(me, wi) : 1)), 0, 1) : -1, wclass: wcls, lean: e.lean || 0,
          alive: e.alive, deadT: e.deadT || 0, deadDir: e.deadDir || 1, veh: !!e.veh, driver: !!(e.veh && e.veh.driver === e), airborne: e.onGround === false, now
        }, rdt, v.heldGun);
        PERF.rig += performance.now() - Q0;
      } else if (v.heldGun) v.heldGun.visible = false;
    }
  }
  // only draw building blocks near the camera
  const ccx = camera.position.x, ccz = camera.position.z, lim = (Q.draw + 90) * (Q.draw + 90);
  for (const m of chunks) { const dx = m.userData.cx - ccx, dz = m.userData.cz - ccz; m.visible = dx * dx + dz * dz < lim || me.ph === "plane"; }
  // vehicles
  for (const vh of MAP.vehicles) {
    const m = vh.mesh; if (!m) continue;
    const d = Math.abs(vh.x - me.x) + Math.abs(vh.y - me.y); m.visible = d < Math.min(170, Q.draw); if (!m.visible) continue;
    m.position.set(vh.x, 0, vh.y); m.rotation.y = -vh.a;
    const sp = Math.hypot(vh.vx, vh.vy); m.rotation.z = lerp(m.rotation.z, clamp(-(vh.fwd || 0) * 0.002, -0.03, 0.03), 0.1); m.rotation.x = lerp(m.rotation.x, clamp((vh.steer || 0) * sp * 0.0018, -0.05, 0.05), 0.1);
    for (const w of vh.wheels) { if (w.front) w.steerG.rotation.y = -(vh.steer || 0) * 0.5; w.spin.rotation.z = -vh.spin; }
  }
  // doors swinging
  for (const d of swinging) { d.ang += (d.tAng - d.ang) * Math.min(1, dt * 9); if (Math.abs(d.tAng - d.ang) < 0.01) { d.ang = d.tAng; swinging.delete(d); } setDoorMatrix(d); }
  // loot: only draw what is close (keeps phones fast)
  if ((lootTick = (lootTick + 1) % 6) === 0) for (const it of MAP.loot) { if (!it.mesh) continue; const d = Math.abs(it.x - me.x) + Math.abs(it.y - me.y); it.mesh.visible = !it.taken && d < Q.loot && me.ph === "ground"; }
  // zone
  const zone = zoneAt(Math.max(0, matchT));
  zoneWall.scale.set(Math.max(0.01, zone.r), 90, Math.max(0.01, zone.r)); zoneWall.position.set(zone.x, 44, zone.y);
  nextRing.scale.set(Math.max(0.01, zone.nr), Math.max(0.01, zone.nr), 1); nextRing.position.set(zone.nx, 0.08, zone.ny);
  // plane
  const P = MAP.plane, pk = matchT / P.dur;
  planeMesh.visible = pk < 1.3; planeMesh.position.set(lerp(P.x1, P.x2, pk), 114 + Math.sin(matchT * 0.7) * 0.25, lerp(P.y1, P.y2, pk)); planeMesh.rotation.y = -Math.atan2(P.y2 - P.y1, P.x2 - P.x1); planeMesh.rotation.x = Math.sin(matchT * 0.5) * 0.015;
  if (planeMesh.visible && planeMesh.userData.props) { for (const h of planeMesh.userData.props) h.rotation.x += dt * 38; const bl = (matchT % 1.2) < 0.12; for (const l of planeMesh.userData.lights) l.visible = bl; }
  // camera
  const W = me.w[me.cur] >= 0 ? WEAP[me.w[me.cur]] : null;
  const zm = aimZoom ? sightZoom(me) : 1, targetFov = aimZoom && W ? (zm >= 2 ? 62 / zm : zm > 1 ? 50 : W.fov) : 62; camera.fov = lerp(camera.fov, targetFov, 1 - Math.exp(-dt * 10)); camera.updateProjectionMatrix();
  recoil = Math.max(0, recoil - dt * 0.5); const pitch = camPitch - recoil;
  const ce = !me.alive && specEnt && specEnt.alive ? specEnt : me;
  if (ce !== me) { let da = ce.a - camYawT; da = Math.atan2(Math.sin(da), Math.cos(da)); camYawT += da * Math.min(1, dt * 4); camPitchT = lerp(camPitchT, (ce.aimP || 0) + 0.08, Math.min(1, dt * 3)); }
  const inAir = ce.ph !== "ground";
  const vsp = ce.veh ? Math.hypot(ce.veh.vx, ce.veh.vy) : 0;
  const dist = ce.ph === "plane" ? 44 : ce.ph === "para" ? (ce.z > 32 ? 9 : 6) : ce.veh ? 6.6 + vsp * 0.05 : aimZoom ? 1.6 : camDist;
  const ex = ce.ph === "plane" ? planeMesh.position.x : ce.x, ey = ce.ph === "plane" ? 114 : ce.z, ez = ce.ph === "plane" ? planeMesh.position.z : ce.y;
  camH = lerp(camH, ce.veh ? 2.2 : ce.ph !== "ground" ? 1.55 : ce.stance === "prone" ? 0.75 : ce.stance === "crouch" ? 1.15 : 1.55, 1 - Math.exp(-dt * 8));
  const ky = 1 - Math.exp(-dt * (document.pointerLockElement ? 45 : 26)); // smooth camera turning
  camYaw += (camYawT - camYaw) * ky; camPitch += (camPitchT - camPitch) * ky;
  camTarget.set(ex, (ce.ph === "ground" ? ce.z : ey) + camH, ez);
  const dx = Math.cos(camYaw) * Math.cos(pitch), dy = -Math.sin(pitch), dz = Math.sin(camYaw) * Math.cos(pitch);
  const rx = -Math.sin(camYaw), rz = Math.cos(camYaw), sh = (inAir || ce.veh ? 0 : aimZoom ? 0.45 : 0.6) + (ce.lean || 0) * 0.5;
  let want = dist;
  if (ce.ph === "ground") { // keep the camera out of walls
    const o = tmpV.set(camTarget.x + rx * sh, camTarget.y, camTarget.z + rz * sh), d = tmpV2.set(-dx, -dy, -dz);
    for (const ob of near(ce.x, ce.y, dist + 2)) { if (ob.t !== "r" || ob.kind === "fence" || (ob.kind === "door" && ob.open) || (ce.veh && ob.h3 < 2)) continue; const t = rayBox(o, d, ob.x - 0.1, (ob.z0 || 0) - 0.12, ob.y - 0.1, ob.x + ob.w + 0.1, ob.h3 + 0.12, ob.y + ob.h + 0.1); if (t < want) want = Math.max(0.5, t - 0.25); }
  }
  // walls pull the camera in at once (never clip through), but it eases back out instead of popping
  camColl = want < camColl ? want : lerp(camColl, want, 1 - Math.exp(-dt * 4)); want = camColl;
  shake = Math.max(0, shake - dt * 2.5); const sk = shake * 0.12;
  camera.position.set(camTarget.x + rx * sh - dx * want + (Math.random() - 0.5) * sk, Math.max(0.35, camTarget.y - dy * want) + (Math.random() - 0.5) * sk, camTarget.z + rz * sh - dz * want + (Math.random() - 0.5) * sk);
  camera.lookAt(camera.position.x + dx, camera.position.y + dy, camera.position.z + dz);
  // when a wall pushes the camera right up to your head, hide your own body instead of filling the screen with it
  if (me.vis && ce === me && !fpsCam) { const tooClose = camera.position.distanceTo(_sv2.set(me.x, (me.z || 0) + 1.45, me.y)) < 0.85; if (tooClose) me.vis.holder.visible = false; }
  if (fpsCam) {
    // first person: eyes on the head, small bob while walking
    const eh = !me.alive ? 0.35 : me.climb ? 1.5 : me.stance === "prone" ? 0.42 : me.stance === "crouch" ? 1.12 : 1.62;
    fpsEye = lerp(fpsEye, eh, 1 - Math.exp(-dt * 12));
    const bob = me.onGround && me.alive ? Math.abs(Math.sin(vm.phase)) * 0.025 * Math.hypot(me.vx, me.vy) : 0;
    camera.position.set(me.x + Math.cos(camYaw) * 0.1 - Math.sin(camYaw) * (me.lean || 0) * 0.38, me.z + fpsEye + bob - Math.abs(me.lean || 0) * 0.06 + (Math.random() - 0.5) * shake * 0.05, me.y + Math.sin(camYaw) * 0.1 + Math.cos(camYaw) * (me.lean || 0) * 0.38);
    camera.lookAt(camera.position.x + dx, camera.position.y + dy, camera.position.z + dz); if (me.lean) camera.rotateZ(-me.lean * 0.12);
    if (!me.alive) camera.rotateZ(0.5);
  }
  grassTick(ex, ez, ce.ph === "plane" ? 999 : camera.position.y);
  // sun follows the player
  sun.position.set(ex + 40, 80, ez + 25); sun.target.position.set(ex, 0, ez);
  // effects
  fxTick(dt);
  hurt = Math.max(0, hurt - dt * 2); $("hurt").style.opacity = hurt * 0.6;
  hitT = Math.max(0, hitT - dt); $("hitmark").style.opacity = hitT > 0 ? 1 : 0;
  $("compass").hidden = MAP.kind === "arena"; drawCompass();
  $("cross").classList.toggle("zoom", aimZoom); $("scope").hidden = !(aimZoom && sightZoom(me) >= 2);
  $("cross").classList.toggle("ads", fpsCam && aimZoom && me.w[me.cur] !== 4);
  { const G0 = performance.now(); renderer.render(scene, camera); PERF.gl += performance.now() - G0; }
  if (fpsCam) {
    vmUpdate(dt);
    if (vm.root.visible && !(aimZoom && sightZoom(me) >= 2)) { vmCam.aspect = camera.aspect; vmCam.fov = aimZoom ? 46 : 52; vmCam.updateProjectionMatrix(); renderer.autoClear = false; renderer.clearDepth(); renderer.render(vmScene, vmCam); renderer.autoClear = true; }
  } else muzzleLight.intensity = 0;
}

// minimap
const mini = $("mini"), mctx = mini.getContext("2d");
let groundMini = null;
function renderMiniGround() {
  const c = document.createElement("canvas"); c.width = c.height = 232; const g = c.getContext("2d"), k = 232 / S;
  g.fillStyle = MAP.kind === "arena" ? "#bfae90" : "#5e7a3a"; g.fillRect(0, 0, 232, 232);
  if (MAP.kind === "arena") { g.fillStyle = "#7d7366"; for (const l of [51.5, 107.5]) { g.fillRect(0, (l - 4.5) * k, 232, 9 * k); g.fillRect((l - 4.5) * k, 0, 9 * k, 232); } }
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
  if (MAP.kind === "arena") {
    for (const e of ents) { if (!e.alive || e === me) continue; const foe = e.team !== me.team; if (foe && !(e.shotT > 0)) continue; mctx.fillStyle = foe ? "#ff4d3a" : "#6cb4ee"; mctx.beginPath(); mctx.arc(e.x * k, e.y * k, foe ? 4 : 3.5, 0, TAU); mctx.fill(); }
  } else {
  mctx.save(); mctx.beginPath(); mctx.rect(0, 0, M, M); mctx.arc(zone.x * k, zone.y * k, Math.max(0, zone.r * k), 0, TAU, true); mctx.fillStyle = "rgba(120,60,220,0.45)"; mctx.fill("evenodd"); mctx.restore();
  mctx.strokeStyle = "#fff"; mctx.lineWidth = 2; mctx.setLineDash([5, 4]); mctx.beginPath(); mctx.arc(zone.nx * k, zone.ny * k, zone.nr * k, 0, TAU); mctx.stroke(); mctx.setLineDash([]);
  }
  drawMapExtras(mctx, k, 1);
  const P = MAP.plane; if (me.ph === "plane") { mctx.strokeStyle = "rgba(242,165,65,0.95)"; mctx.lineWidth = 2.5; mctx.beginPath(); mctx.moveTo(P.x1 * k, P.y1 * k); mctx.lineTo(P.x2 * k, P.y2 * k); mctx.stroke(); }
  if (TS > 1 && MAP.kind !== "arena") for (const e of ents) if (e !== me && e.alive && e.team === me.team) { mctx.fillStyle = e.knocked ? "#ff9a3a" : "#6cb4ee"; mctx.beginPath(); mctx.arc(e.x * k, e.y * k, 4, 0, TAU); mctx.fill(); mctx.strokeStyle = "#fff"; mctx.lineWidth = 1; mctx.stroke(); }
  if (online) for (const e of ents) if (e.kind === "remote" && e.alive && e.team !== me.team) { mctx.fillStyle = e.color; mctx.beginPath(); mctx.arc(e.x * k, e.y * k, 4, 0, TAU); mctx.fill(); }
  const mx = (me.ph === "plane" ? planeMesh.position.x : me.x) * k, my = (me.ph === "plane" ? planeMesh.position.z : me.y) * k;
  mctx.save(); mctx.translate(mx, my); mctx.rotate(camYaw); mctx.fillStyle = "#fff"; mctx.beginPath(); mctx.moveTo(8, 0); mctx.lineTo(-5, -5); mctx.lineTo(-2, 0); mctx.lineTo(-5, 5); mctx.closePath(); mctx.fill(); mctx.restore();
}

// ---------------- HUD ----------------
function showHud(on) { $("hud").hidden = !on; document.body.classList.toggle("playing", !!on); }
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
  itemsHud();
}
function progressUi() {
  const p = $("progress");
  if (me && me.alive && me.reviving) { p.hidden = false; p.querySelector("i").style.width = ((1 - me.reviving.t / REVIVE_T) * 100) + "%"; p.querySelector("span").textContent = "تسعف " + me.reviving.o.name + "…"; }
  else if (me && me.alive && me.knocked) { p.hidden = false; p.querySelector("i").style.width = clamp(me.hp, 0, 100) + "%"; p.querySelector("span").textContent = "تنزف…"; }
  else if (me && me.alive && (me.reloadT > 0 || me.healT > 0)) {
    const tot = me.healT > 0 ? (me.healTot || 4) : WEAP[me.w[me.cur]].reload * relK(me, me.w[me.cur]), left = me.healT > 0 ? me.healT : me.reloadT;
    p.hidden = false; p.querySelector("i").style.width = ((1 - left / tot) * 100) + "%"; p.querySelector("span").textContent = me.healT > 0 ? (HEAL[me.healKind] ? HEAL[me.healKind].n + "…" : "علاج…") : "تعبئة…";
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
    if (k === "r") startReload(me); if (k === "f") actionKey();
    if (k === "1" || k === "2") switchSlot(+k - 1); if (k === "4") startHeal(me, "b"); if (k === "5") startHeal(me, "m");
    if (k === " ") { e.preventDefault(); if (me.ph === "plane") jump(me); else if (!me.veh) doJump(me); }
    if (k === "c") setStance(me, "crouch"); if (k === "z" || k === "x") setStance(me, "prone");
  });
  window.addEventListener("keyup", (e) => { keys[e.key.toLowerCase()] = false; });
  let lastLook = 0;
  const look2 = (dx, dy, s) => { lastLook = performance.now(); const k = s * (aimZoom ? 0.45 * SETTINGS.aim * Math.min(1, 1.8 / Math.max(1, sightZoom(me))) : SETTINGS.look); camYawT += dx * k; camPitchT = clamp(camPitchT + dy * k, fpsActive() ? -1.3 : -0.75, fpsActive() ? 1.3 : 0.95); };
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
  api.lastLook = () => lastLook;
  let hbHeld = false; const hbB = $("hbBtn");
  hbB.addEventListener("pointerdown", (e) => { e.preventDefault(); hbHeld = true; }); for (const ev of ["pointerup", "pointercancel", "pointerleave"]) hbB.addEventListener(ev, () => (hbHeld = false));
  api.hand = () => hbHeld || !!keys[" "];
  // lean / peek: hold Q or E on a keyboard, tap the lean buttons on a phone (tap again to stand straight)
  let leanTouch = 0;
  for (const [id, dir] of [["leanL", -1], ["leanR", 1]]) $(id).addEventListener("click", () => { leanTouch = leanTouch === dir ? 0 : dir; $("leanL").classList.toggle("on", leanTouch === -1); $("leanR").classList.toggle("on", leanTouch === 1); });
  api.lean = () => (keys["e"] ? 1 : 0) - (keys["q"] ? 1 : 0) || leanTouch;
  api.resetLean = () => { leanTouch = 0; $("leanL").classList.remove("on"); $("leanR").classList.remove("on"); };
  return api;
})();
function showStick(m, on) {
  const s = $("stick"); s.hidden = !on; if (!on) return;
  const dx = m.x - m.ox, dy = m.y - m.oy, d = Math.hypot(dx, dy), k = d > 55 ? 55 / d : 1;
  s.style.left = m.ox + "px"; s.style.top = m.oy + "px"; s.querySelector("i").style.transform = `translate(${dx * k}px, ${dy * k}px)`;
}
function switchSlot(s) { if (!me || !(me.w[s] >= 0)) return; if (me.cur !== s) { me.cur = s; me.reloadT = 0; me.fireT = Math.max(me.fireT, 0.3); aimZoom = false; $("aimBtn").classList.remove("on"); updateHud(); } }
$("slot0").addEventListener("click", () => switchSlot(0));
$("slot1").addEventListener("click", () => switchSlot(1));
$("reloadBtn").addEventListener("click", () => me && startReload(me));
itemsInit(); matchInit(); teamInit();
(function fastButtons() {
  const hud = $("hud"), skip = new Set(["fireBtn", "thrBtn"]);
  hud.addEventListener("pointerdown", (ev) => {
    const b = ev.target.closest("button"); if (!b || skip.has(b.id) || b.disabled) return;
    if (ev.pointerType === "mouse") return;
    ev.preventDefault(); b._pd = performance.now(); b.click();
  }, true);
  hud.addEventListener("click", (ev) => { const b = ev.target.closest("button"); if (b && ev.isTrusted && b._pd && performance.now() - b._pd < 800) { ev.stopImmediatePropagation(); ev.preventDefault(); } }, true);
})();
$("pickupBtn").addEventListener("click", () => { if (me && nearLoot) takeLoot(me, nearLoot, true); });
$("carBtn").addEventListener("click", () => { if (!me) return; if (me.veh) exitVehicle(me); else if (ctxVeh) enterVehicle(me, ctxVeh); });
$("doorBtn").addEventListener("click", () => { if (ctxDoor) { setDoor(ctxDoor, !ctxDoor.open); ctxAcc = 0; } });
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
  document.querySelectorAll("[data-v]").forEach((b) => b.classList.toggle("on", b.dataset.v === (SETTINGS.view || "auto")));
  $("soundOn").checked = SETTINGS.sound; $("fpsOn").checked = !!SETTINGS.fps; $("settings").hidden = false;
}
$("sensLook").addEventListener("input", (e) => { SETTINGS.look = e.target.value / 100; $("sensLookV").textContent = ar(e.target.value) + "٪"; saveSettings(); });
$("sensAim").addEventListener("input", (e) => { SETTINGS.aim = e.target.value / 100; $("sensAimV").textContent = ar(e.target.value) + "٪"; saveSettings(); });
document.querySelectorAll("[data-q]").forEach((b) => b.addEventListener("click", () => { SETTINGS.quality = b.dataset.q; saveSettings(); applyQuality(); openSettings(); }));
document.querySelectorAll("[data-v]").forEach((b) => b.addEventListener("click", () => { SETTINGS.view = b.dataset.v; saveSettings(); openSettings(); }));
$("soundOn").addEventListener("change", (e) => { SETTINGS.sound = e.target.checked; saveSettings(); });
$("fpsOn").addEventListener("change", (e) => { SETTINGS.fps = e.target.checked; saveSettings(); $("fpsMeter").hidden = !SETTINGS.fps; });
$("fpsMeter").hidden = !SETTINGS.fps;
$("settingsDone").addEventListener("click", () => { $("settings").hidden = true; });
$("gearBtn").addEventListener("click", openSettings);
$("menuGear").addEventListener("click", openSettings);

// ---------------- menus ----------------
function show(id) { for (const o of ["menu", "lobby", "endScreen"]) $(o).hidden = o !== id; }
$("nick").addEventListener("change", () => store.set("ls3.nick", $("nick").value.trim()));
// go full screen and landscape once the player taps play (phones only allow this after a tap)
// the first touch anywhere turns the phone sideways and goes full screen
// (keeps trying on each touch until the phone really is sideways, in case the first try was refused)
const isLandscape = () => (screen.orientation && /landscape/.test(screen.orientation.type)) || innerWidth > innerHeight;
document.addEventListener("pointerdown", () => { if (!isLandscape() || !document.fullscreenElement) goFullscreen(); }, { capture: true });
async function goFullscreen() {
  if (!IS_TOUCH) return;
  try { if (!document.fullscreenElement && document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen({ navigationUI: "hide" }); } catch (e) {}
  try { await screen.orientation?.lock?.("landscape"); } catch (e) {}
}
// installed app: turn sideways straight away, no tap needed
if (IS_TOUCH && matchMedia("(display-mode: fullscreen), (display-mode: standalone)").matches) { try { screen.orientation?.lock?.("landscape").catch(() => {}); } catch (e) {} }
$("soloBtn").addEventListener("click", async () => {
  goFullscreen(); audio(); store.set("ls3.nick", $("nick").value.trim()); await loadModel;
  online = false; isHost = false; show(null); startMatch((Math.random() * 1e9) >>> 0, { bots: 49, t0: Date.now() + 3000, ts: prefTs() });
});
$("toMenuBtn").addEventListener("click", () => { if (online) leaveRoom(); toMenu(); });
$("againBtn").addEventListener("click", () => {
  if (online) { netState("lobby"); mode = "lobby"; showHud(false); show("lobby"); renderLobby(); return; }
  show(null); startMatch((Math.random() * 1e9) >>> 0, lastKind === "arena" ? { kind: "arena", bots: ARENA.team * 2 - 1, t0: Date.now() + 3000 } : { bots: 49, t0: Date.now() + 3000 });
});
function toMenu() { mode = "menu"; showHud(false); show("menu"); profileUi(); engineOn(false); document.body.classList.remove("driving"); if (document.pointerLockElement) document.exitPointerLock(); }
let awarded = false;
function showEnd(win, rank, sub) {
  if (!awarded) { awarded = true; const r = awardMatch(win, rank, me.kills, Math.max(0, matchT)); $("endXp").textContent = "+" + ar(r.gain) + " خبرة – +" + ar(lastStars) + " ★" + (r.up ? " – وصلت المستوى " + ar(r.lv) + "! 🎉" : ""); }
  mode = "end"; showHud(false); if (document.pointerLockElement) document.exitPointerLock();
  if (MAP.kind === "arena") { $("endTag").textContent = "انتهت الجولة"; $("endTitle").textContent = win ? "فاز فريقك!" : teamScore[0] === teamScore[1] ? "تعادل" : "خسر فريقك"; $("endSub").textContent = "النتيجة " + ar(teamScore[0]) + " – " + ar(teamScore[1]) + "، وانقتلت " + ar(me.deaths || 0) + " مرات"; }
  else { $("endTag").textContent = win ? "النصر" : "انتهت المباراة"; $("endTitle").textContent = win ? "أنت آخر الناجين!" : "انقتلت";
  $("endSub").textContent = win ? "فزت على " + ar(ents.length - 1) + " لاعب" : sub; }
  $("endRank").textContent = "#" + ar(rank); $("endKills").textContent = ar(me.kills); $("endTime").textContent = fmtTime(Math.max(0, matchT));
  $("againBtn").textContent = online ? "ارجع للردهة" : "مباراة جديدة"; show("endScreen");
  try { wakeLock && wakeLock.release(); } catch (e) {}
}
let wakeLock = null;
async function keepAwake() { try { wakeLock = await navigator.wakeLock?.request("screen"); } catch (e) {} }

// ============ ONLINE (room capability, or Supabase adapter on the website) ============
let roomApi = null, room = null, myPeer = null, joinedAt = 0, clockOff = 0, hostPeer = null, lastGo = 0, myColor = NET_COLORS[0];
let thrOut = [], seenThr = {};
function netThrow(k, p, v) { thrOut.push([++netSeq, k, +p.x.toFixed(2), +p.y.toFixed(2), +p.z.toFixed(2), +v.x.toFixed(2), +v.y.toFixed(2), +v.z.toFixed(2)]); if (thrOut.length > 6) thrOut.shift(); }
let netSeq = 0, evOut = [], shotsOut = [], tookOut = [], botDeaths = [], seenEv = {}, seenShot = {}, seenTook = {}, seenBD = {}, netAcc = 0, myState = "lobby", doorOut = [], seenDoor = {};
(async () => { try { roomApi = await window.claude?.use?.("room"); } catch (e) { roomApi = null; } if (!roomApi) $("onlineNote").textContent = navigator.onLine ? "الأونلاين مو متاح هنا للحين. الفردي شغال عادي." : "ما فيه إنترنت. تقدر تلعب فردي ضد البوتات."; })();
$("onlineBtn").addEventListener("click", async () => {
  goFullscreen(); audio(); store.set("ls3.nick", $("nick").value.trim());
  if (!roomApi) { $("onlineNote").textContent = "الأونلاين يحتاج إنترنت وتسجيل دخول."; return; }
  await loadModel; mode = "lobby"; show("lobby"); $("lobbyJoin").hidden = false; $("lobbyRoom").hidden = true; $("lobbyBack").hidden = false;
});
$("lobbyBack").addEventListener("click", () => { leaveRoom(); toMenu(); });
$("createBtn").addEventListener("click", () => enterRoom(Array.from({ length: 4 }, () => "ABCDEFGHJKMNPQRSTUVWXYZ23456789"[Math.floor(Math.random() * 31)]).join("")));
$("joinBtn").addEventListener("click", () => { const c = $("codeIn").value.trim().toUpperCase().replace(/[^A-Z0-9]/g, ""); if (c.length >= 3) enterRoom(c); else $("codeIn").focus(); });
$("leaveBtn").addEventListener("click", () => { leaveRoom(); $("lobbyJoin").hidden = false; $("lobbyRoom").hidden = true; $("lobbyBack").hidden = false; });
$("startOnlineBtn").addEventListener("click", () => {
  if (!isHost) return;
  hostGo(roomTs);
});
async function enterRoom(code, auto) {
  if (!auto) autoRoom = null;
  $("lobbyStatus").textContent = "جاري الاتصال…";
  try { room = await roomApi.join("ls3-" + code.toLowerCase()); } catch (e) { $("lobbyStatus").textContent = "ما قدرنا ندخل الغرفة. جرّب مرة ثانية."; room = null; return; }
  joinedAt = Date.now(); myColor = NET_COLORS[Math.floor(Math.random() * NET_COLORS.length)]; myState = "lobby"; lastGo = 0;
  $("codeOut").textContent = auto ? "سيرفر" : code; $("lobbyJoin").hidden = true; $("lobbyRoom").hidden = false; $("lobbyBack").hidden = true; $("tsMenu").hidden = !!auto;
  room.presence({ n: ($("nick").value.trim() || "لاعب").slice(0, 14), c: myColor, j: joinedAt, st: "lobby", tn: myOutfit().c, sm: mySuit() }).catch(() => {});
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
    const tg = document.createElement("i"); tg.textContent = (p.peer === hostPeer ? "المضيف – " : "") + (pr.st === "lobby" ? "جاهز" : pr.st === "play" ? "في مباراة" : "ينتظر");
    row.append(nm, tg); el.append(row);
  }
  const n = peers.filter((p) => p.presence && p.presence.j).length;
  $("startOnlineBtn").hidden = !isHost || !!autoRoom; $("tsMenu").hidden = !isHost || !!autoRoom;
  $("lobbyStatus").textContent = isHost ? "إنت المضيف. اللاعبين: " + ar(n) + "، والباقي بيكون بوتات." : "بانتظار المضيف يبدأ… (اللاعبين: " + ar(n) + ")";
}
function beginOnline(go, peers) {
  online = true; thrOut = []; seenThr = {}; netSeq = 0; evOut = []; shotsOut = []; tookOut = []; botDeaths = []; seenEv = {}; seenShot = {}; seenTook = {}; seenBD = {}; doorOut = []; seenDoor = {};
  const remotes = [];
  for (const p of peers) {
    if (p.isMe && p.sameTab) continue; const pr = p.presence || {}; if (pr.st !== "lobby" && pr.st !== "play") continue;
    const r = newEnt(p.peer, String(pr.n || "لاعب").slice(0, 14), "remote"); r.color = /^#[0-9a-f]{6}$/i.test(pr.c) ? pr.c : "#ccc"; r.tint = /^#[0-9a-f]{6}$/i.test(pr.tn) ? pr.tn : "#c9d6ff"; r.suit = ["op", "camo", "swat"].includes(pr.sm) ? pr.sm : "op"; remotes.push(r);
  }
  show(null); startMatch(go.seed >>> 0, { bots: go.nb, t0: go.t0, color: myColor, ts: go.ts || 1, teams: go.teams || {}, myId: myPeer, remotes });
  myState = "play"; room.presence({ st: "play", go: isHost ? go : null }).catch(() => {});
}
function netShot(e, w) { shotsOut.push([++netSeq, e.id === "me" ? "" : e.id, w]); if (shotsOut.length > 8) shotsOut.shift(); }
function netRevive(target) { evOut.push([++netSeq, target, 0, "rv"]); if (evOut.length > 14) evOut.shift(); }
function netDamage(target, dmg, w) { evOut.push([++netSeq, target, Math.round(dmg * 10) / 10, w]); if (evOut.length > 14) evOut.shift(); }
function netDoor(d) { doorOut.push([++netSeq, d.id, d.open ? 1 : 0]); if (doorOut.length > 16) doorOut.shift(); }
function netTook(id) { tookOut.push(id); if (tookOut.length > 250) tookOut.shift(); }
function netBotDeath(b, killerId) { botDeaths.push([b.id, killerId === "me" ? myPeer : killerId]); if (botDeaths.length > 30) botDeaths.shift(); }
function netState(st) { myState = st; if (room) room.presence({ st, hp: Math.max(0, Math.round(me.hp)), k: me.kills, kb: me.killedBy || null }).catch(() => {}); }
function netTick(dt) {
  netAcc += dt; if (netAcc < 1 / 10 || !room) return; netAcc = 0;
  const p = { st: myState, x: Math.round(me.x * 10) / 10, y: Math.round(me.y * 10) / 10, z: Math.round(me.z * 10) / 10, a: Math.round(me.a * 100) / 100, hp: Math.max(0, Math.round(me.hp)), w: me.w[me.cur], ar: me.armor, ph: me.ph === "plane" ? 0 : me.ph === "para" ? 1 : 2, k: me.kills, s: me.stance === "prone" ? 2 : me.stance === "crouch" ? 1 : 0, ap: Math.round(camPitch * 50) / 50, th: thrOut, kn: me.knocked ? 1 : 0, hg: me.helm | 0, pk: me.pack | 0, pn: me.pan ? 1 : 0, ln: Math.round((me.lean || 0) * 10) / 10, sh: shotsOut, ev: evOut, tk: tookOut, dr: doorOut, vh: me.veh ? me.veh.id : -1, tn: me.tint };
  if (isHost) { p.hn = Date.now(); p.b = ents.filter((e) => e.kind === "bot").map((b) => [Math.round(b.x * 10) / 10, Math.round(b.y * 10) / 10, Math.round(b.a * 10) / 10, Math.max(0, Math.round(b.hp)), b.w[b.cur], b.ph === "plane" ? 0 : b.ph === "para" ? 1 : 2, b.alive ? 1 : 0, b.armor, Math.round(b.z * 10) / 10, b.stance === "prone" ? 2 : b.stance === "crouch" ? 1 : 0, b.veh ? b.veh.id : -1]); p.bd = botDeaths; }
  room.presence(p).catch(() => { tookOut.splice(0, 60); });
}
function syncRemotes(peers) {
  for (const pe of peers) {
    if (pe.isMe && pe.sameTab) continue;
    const pr = pe.presence || {}, r = ents.find((e) => e.id === pe.peer); if (!r) continue;
    if (typeof pr.x === "number") { r.tx = pr.x; r.ty = pr.y; r.tz = pr.z || 0; r.ta = pr.a || 0; if (r.ph === "plane" && pr.ph > 0) { r.x = pr.x; r.y = pr.y; r.z = pr.z || 0; } }
    r.ph = pr.ph === 0 ? "plane" : pr.ph === 1 ? "para" : "ground";
    r.stance = pr.s === 2 ? "prone" : pr.s === 1 ? "crouch" : "stand"; r.aimP = pr.ap || 0; r.leanT = pr.ln || 0; r.helm = pr.hg | 0; r.pack = pr.pk | 0; r.pan = !!pr.pn; r.knocked = !!pr.kn && r.alive;
    { const lastT = seenThr[pe.peer] || 0;
      for (const t of pr.th || []) {
        if (!Array.isArray(t) || t[0] <= lastT || !THROW[t[1]]) continue; seenThr[pe.peer] = Math.max(seenThr[pe.peer] || 0, t[0]);
        const m = projMesh(t[1]), pp = new THREE.Vector3(t[2], t[3], t[4]); m.position.copy(pp); scene.add(m);
        projs.push({ k: t[1], m, p: pp, v: new THREE.Vector3(t[5], t[6], t[7]), t: 0, fuse: THROW[t[1]].fuse, owner: r, rest: 0, remote: true, spin: new THREE.Vector3(5, 5, 5) });
      } }
    if (typeof pr.hp === "number") r.hp = pr.hp; r.armor = pr.ar | 0; r.cur = 0; r.w[0] = typeof pr.w === "number" ? pr.w : -1; r.kills = pr.k | 0;
    if (r.alive && pr.st === "dead") { r.alive = false; r.deadT = 0; const kn = pr.kb ? nameOf(pr.kb) : null; addFeed(kn, r.name, "", pr.kb === myPeer); if (pr.kb === myPeer) { me.kills++; killBanner(r.name, false, "", 0); updateHud(); } }
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
      if (ev[3] === "rv") { if (ev[1] === myPeer && me.knocked) { me.knocked = false; me.hp = 15; me.stance = "crouch"; hint(r.name + " أسعفك! عالج نفسك", 2400); } else if (isHost) { const b = ents.find((e) => e.id === ev[1]); if (b && b.knocked) { b.knocked = false; b.hp = 15; } } continue; }
      const dmg = clamp(+ev[2] || 0, 0, 180);
      if (ev[1] === myPeer && me.alive) { me.killedBy = pe.peer; applyDamage(me, dmg, pe.peer, r.name, ev[3], false); }
      else if (isHost && typeof ev[1] === "string" && ev[1][0] === "b") { const b = ents.find((e) => e.id === ev[1]); if (b) applyDamage(b, dmg, pe.peer, r.name, ev[3], false); }
    }
    const lastD = seenDoor[pe.peer] || 0;
    for (const dv of pr.dr || []) { if (!Array.isArray(dv) || dv[0] <= lastD) continue; seenDoor[pe.peer] = Math.max(seenDoor[pe.peer] || 0, dv[0]); const d = MAP.doors[dv[1]]; if (d) setDoor(d, !!dv[2], false); }
    setRemoteVeh(r, pr.vh);
    for (const id of pr.tk || []) { if (seenTook[id]) continue; seenTook[id] = 1; const it = MAP.loot[id]; if (it) { it.taken = true; if (it.mesh) it.mesh.visible = false; } }
    if (!isHost && pe.peer === hostPeer && Array.isArray(pr.b)) {
      const bots = ents.filter((e) => e.kind === "bot");
      pr.b.forEach((bb, i) => {
        const b = bots[i]; if (!b || !Array.isArray(bb)) return;
        b.tx = bb[0]; b.ty = bb[1]; b.ta = bb[2]; b.hp = bb[3]; b.w[0] = bb[4]; b.cur = 0; b.armor = bb[7] | 0; b.tz = bb[8] || 0; b.stance = bb[9] === 2 ? "prone" : bb[9] === 1 ? "crouch" : "stand";
        const ph = bb[5] === 0 ? "plane" : bb[5] === 1 ? "para" : "ground"; if (b.ph === "plane" && ph !== "plane") { b.x = bb[0]; b.y = bb[1]; b.z = bb[8] || 0; } b.ph = ph;
        setRemoteVeh(b, bb[10]);
        if (b.alive && !bb[6]) { b.alive = false; b.deadT = 0; }
      });
      for (const d of pr.bd || []) { if (!Array.isArray(d) || seenBD[d[0]]) continue; seenBD[d[0]] = 1; const b = ents.find((e) => e.id === d[0]); addFeed(d[1] ? nameOf(d[1]) : null, b ? b.name : "", "", d[1] === myPeer); if (d[1] === myPeer) { me.kills++; if (b) killBanner(b.name, false, "", 0); updateHud(); } }
    }
  }
  for (const e of ents) if (e.kind === "remote" && e.alive && !peers.some((p) => p.peer === e.id)) { e.alive = false; addFeed(null, e.name, "طلع", false); }
}
function setRemoteVeh(r, vid) {
  const v = typeof vid === "number" && vid >= 0 ? MAP.vehicles[vid] : null;
  if (v && r.alive && (!v.driver || v.driver === r)) { if (r.veh && r.veh !== v) r.veh.driver = null; r.veh = v; v.driver = r; }
  else if (!v && r.veh) { r.veh.driver = null; r.veh.vx = r.veh.vy = 0; r.veh = null; }
}
function nameOf(peer) { if (peer === myPeer) return me.name; const e = ents.find((x) => x.id === peer); return e ? e.name : "لاعب"; }

// ---------------- loop ----------------
let last = performance.now(), slow = 0, samples = 0, miniAcc = 0; const fpsAcc = { n: 0, t: 0 };
const PERF = { upd: 0, ren: 0, rig: 0, mix: 0, gl: 0, n: 0 }; window.__perf = PERF;
function frame(now) {
  let dt = (now - last) / 1000; last = now;
  if (mode === "play" && !document.hidden && SETTINGS.quality === "auto") {
    samples++; if (dt > 0.024) slow++;
    if (samples >= 150) {
      if (slow > 45) {
        if (pixelRatio > 1) { pixelRatio = Math.max(1, pixelRatio - 0.25); renderer.setPixelRatio(pixelRatio); resize(); }
        else if (!shadowsOff) { shadowsOff = true; sun.castShadow = false; }
        else if (Q.lodDist > 7) { Q = Object.assign({}, Q, { lodDist: 7, rigDist: 35, charDraw: 120, loot: 35, draw: Math.min(Q.draw, 170), grass: Math.min(Q.grass || 0, 900), grassR: Math.min(Q.grassR || 0, 14) }); scene.fog.far = Math.min(scene.fog.far, 230); }
        else if (pixelRatio > 0.75) { pixelRatio = 0.75; renderer.setPixelRatio(pixelRatio); resize(); }
      }
      samples = 0; slow = 0;
    }
  }
  if (dt > 0.05) dt = 0.05;
  const P0 = performance.now();
  if (mode === "play" && MAP) { const n = window.__fast || 1; for (let i = 0; i < n; i++) if (mode === "play") update(dt); }
  const P1 = performance.now();
  render(dt); progressUi();
  const P2 = performance.now(); PERF.upd += P1 - P0; PERF.ren += P2 - P1; PERF.n++;
  if (SETTINGS.fps) { fpsAcc.n++; fpsAcc.t += dt; if (fpsAcc.t >= 0.5) { $("fpsMeter").textContent = Math.round(fpsAcc.n / fpsAcc.t) + " FPS"; fpsAcc.n = 0; fpsAcc.t = 0; } }
  miniAcc += dt; if (miniAcc > 0.2) { miniAcc = 0; drawMini(); }
  requestAnimationFrame(frame);
}
applyQuality();
camera.position.set(0, 30, 0); camera.lookAt(10, 0, 10);
requestAnimationFrame(frame);
window.__dbg = { dmg: (t, d, k) => applyDamage(t, d, k || null, k ? "x" : "", 2, false), ts: () => TS, revive: (a, b) => startRevive(a, b), startDrop: (i) => startDrop(i), drops: () => drops, redz, setMarker: (p) => setMarker(p) };
window.__scene = scene; window.__ents = () => ents;
window.__game = { rc: (...a) => rayCyl(...a), V: THREE.Vector3, cast(o, d, r) { const res = castShot(new THREE.Vector3(o[0], o[1], o[2]), new THREE.Vector3(d[0], d[1], d[2]).normalize(), r, me); return { t: res.t, ent: res.ent && res.ent.name, veh: res.veh && res.veh.id }; }, fire() { me.fireT = 0; playerFire(); }, get info() { return { calls: renderer.info.render.calls, tris: renderer.info.render.triangles }; }, tp(x, y, z = 0) { me.ph = "ground"; me.x = x; me.y = y; me.z = z; me.onGround = true; me.peak = z; }, enter(v) { enterVehicle(me, v); }, exit() { exitVehicle(me); }, door: setDoor, vault: () => vaultTarget(me, camYaw), path: navPath, get cam() { return camera; }, set pitchT(v) { camPitchT = v; camPitch = v; }, set yawT(v) { camYawT = v; camYaw = v; }, get me() { return me; }, get ents() { return ents; }, get map() { return MAP; }, _kill(i) { kill(ents[i], "me", me.name, 2, false); }, get yaw() { return camYaw; }, set yaw(v) { camYaw = v; }, set pitch(v) { camPitch = v; } };
