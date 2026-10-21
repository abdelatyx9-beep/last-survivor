// ===== محوّل اللعب الأونلاين =====
// اللعبة مكتوبة على نظام "غرف": كل لاعب يرسل حالته (مكانه، صحته، طلقاته) للباقين.
// داخل Claude الغرف جاهزة، وعلى موقعك نستخدم Supabase Realtime بنفس الطريقة.
(function () {
  if (window.claude && window.claude.use) return; // داخل Claude: نستخدم غرفه
  const cfg = window.GAME_CONFIG || {};
  const ready = () => cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY && !/PUT_/.test(cfg.SUPABASE_URL + cfg.SUPABASE_ANON_KEY) && window.supabase && navigator.onLine;
  let client = null;
  window.claude = {
    use: async (name) => {
      if (name !== "room" || !ready()) return null;
      if (!client) client = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, { realtime: { params: { eventsPerSecond: 25 } } });
      const myId = Math.random().toString(36).slice(2, 12);
      return { join: (roomName) => joinRoom(client, roomName, myId) };
    }
  };

  function joinRoom(sb, roomName, myId) {
    return new Promise((resolve, reject) => {
      const ch = sb.channel("ls:" + roomName, { config: { broadcast: { self: false }, presence: { key: myId } } });
      const peers = new Map();
      const handlers = new Set();
      let mine = {}, snapshot = Object.freeze([]), queued = false, connected = false, lastSend = 0, pending = false, done = false;

      function rebuild() {
        peers.set(myId, { peer: myId, isMe: true, sameTab: true, kind: "viewer", by: null, guest: false, presence: Object.freeze({ ...mine }), updatedAt: Date.now() });
        snapshot = Object.freeze(Array.from(peers.values()));
      }
      function changed() {
        if (queued) return; queued = true;
        requestAnimationFrame(() => {
          queued = false; rebuild();
          const c = { peers: snapshot, joined: [], left: [], updated: [] };
          handlers.forEach((h) => { try { h(c); } catch (e) { console.error(e); } });
        });
      }
      function send(force) {
        const now = Date.now();
        if (!force && now - lastSend < 66) {
          if (!pending) { pending = true; setTimeout(() => { pending = false; send(true); }, 66 - (now - lastSend)); }
          return;
        }
        lastSend = now;
        if (connected) ch.send({ type: "broadcast", event: "st", payload: { id: myId, p: mine } });
      }
      ch.on("broadcast", { event: "st" }, ({ payload }) => {
        if (!payload || typeof payload.id !== "string" || payload.id === myId) return;
        peers.set(payload.id, { peer: payload.id, isMe: false, sameTab: false, kind: "viewer", by: null, guest: false, presence: Object.freeze(payload.p || {}), updatedAt: Date.now() });
        changed();
      });
      ch.on("presence", { event: "join" }, () => send(true));
      ch.on("presence", { event: "leave" }, ({ key }) => { if (key && peers.delete(key)) changed(); });
      const prune = setInterval(() => {
        const now = Date.now(); let any = false;
        for (const [id, p] of peers) if (id !== myId && now - p.updatedAt > 6000) { peers.delete(id); any = true; }
        if (any) changed();
      }, 2000);
      const keepalive = setInterval(() => send(true), 1500);

      const room = {
        name: roomName,
        presence: async (patch) => { for (const k in patch) { if (patch[k] === null) delete mine[k]; else mine[k] = patch[k]; } changed(); send(false); },
        peers: () => snapshot,
        onPeers: (h) => { handlers.add(h); setTimeout(() => { rebuild(); h({ peers: snapshot, joined: snapshot, left: [], updated: [] }); }, 0); return () => handlers.delete(h); },
        on: () => () => {}, emit: async () => {},
        connected: () => connected,
        onConnection: (h) => { setTimeout(() => h(connected), 0); return () => {}; },
        leave: async () => { clearInterval(prune); clearInterval(keepalive); try { await ch.untrack(); } catch (e) {} sb.removeChannel(ch); }
      };
      ch.subscribe(async (status) => {
        if (status === "SUBSCRIBED" && !done) { done = true; connected = true; try { await ch.track({ id: myId }); } catch (e) {} rebuild(); resolve(room); send(true); }
        else if ((status === "CHANNEL_ERROR" || status === "TIMED_OUT") && !done) { done = true; reject(new Error(status)); }
      });
      setTimeout(() => { if (!done) { done = true; reject(new Error("timeout")); } }, 10000);
    });
  }
})();
