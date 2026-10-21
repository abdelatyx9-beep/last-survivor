// يخلي اللعبة تشتغل بدون إنترنت بعد أول فتح
// لما تعدّل اللعبة، غيّر رقم النسخة هنا عشان الجوالات تاخذ التحديث
const VERSION = "ls3d-v4";
const BASE = self.registration.scope;               // يشتغل على Vercel و GitHub Pages
const u = (p) => new URL(p, BASE).href;
const CORE = ["", "index.html", "game.js", "config.js", "net-supabase.js", "manifest.webmanifest", "vendor/three.module.min.js", "vendor/jsm/loaders/GLTFLoader.js", "vendor/jsm/utils/BufferGeometryUtils.js", "vendor/jsm/utils/SkeletonUtils.js", "models/Soldier.glb", "icons/icon-192.png", "icons/icon-512.png", "icons/apple-touch-icon.png"].map(u);

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(CORE)));
  self.skipWaiting();
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.hostname.endsWith("supabase.co")) return; // الأونلاين دايماً من النت
  if (req.mode === "navigate") {
    e.respondWith(fetch(req).then((r) => { const cp = r.clone(); caches.open(VERSION).then((c) => c.put(u("index.html"), cp)); return r; }).catch(() => caches.match(u("index.html"))));
    return;
  }
  // باقي الملفات: من الكاش على طول، ونحدّثها من النت بالخلفية
  e.respondWith(caches.match(req).then((hit) => {
    const net = fetch(req).then((r) => { if (r && (r.ok || r.type === "opaque")) { const cp = r.clone(); caches.open(VERSION).then((c) => c.put(req, cp)); } return r; }).catch(() => hit);
    return hit || net;
  }));
});
