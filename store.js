// データ保存層。Firestore 版とローカル（お試し）版で同じインターフェースを提供する。
//
// データ構造:
//   events/{eventId}                      { title, createdAt }
//   events/{eventId}/places/{placeId}     { name, url, memo, addedBy, createdAt, comments: [{by, text, at}] }
//   events/{eventId}/votes/{voterName}    { placeId, at }   ← 投票者名をIDにすることで「1人1箇所」を保証
//
// subscribe(eventId, cb) は変更のたびに cb({ event, places, votes }) を呼ぶ。
//   places: [{ id, ...data }], votes: { [voterName]: placeId }

import { firebaseConfig } from "./firebase-config.js";

export function randomId(len = 16) {
  const chars = "abcdefghijkmnpqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  return Array.from(bytes, (b) => chars[b % chars.length]).join("");
}

const now = () => new Date().toISOString();

// ---------- Firestore 版 ----------
async function createFirestoreStore(config) {
  const V = "10.12.2";
  const { initializeApp } = await import(`https://www.gstatic.com/firebasejs/${V}/firebase-app.js`);
  const fs = await import(`https://www.gstatic.com/firebasejs/${V}/firebase-firestore.js`);
  const db = fs.getFirestore(initializeApp(config));
  const eventRef = (e) => fs.doc(db, "events", e);
  const placesCol = (e) => fs.collection(db, "events", e, "places");
  const votesCol = (e) => fs.collection(db, "events", e, "votes");

  return {
    mode: "firebase",
    async createEvent(title) {
      const id = randomId();
      await fs.setDoc(eventRef(id), { title, createdAt: now() });
      return id;
    },
    subscribe(e, cb) {
      const state = { event: undefined, places: [], votes: {} };
      const loaded = { event: false, places: false, votes: false };
      const emit = () => Object.values(loaded).every(Boolean) && cb({ ...state });
      const unsubs = [
        fs.onSnapshot(eventRef(e), (s) => {
          state.event = s.exists() ? s.data() : null;
          loaded.event = true;
          emit();
        }),
        fs.onSnapshot(placesCol(e), (s) => {
          state.places = s.docs.map((d) => ({ id: d.id, ...d.data() }));
          loaded.places = true;
          emit();
        }),
        fs.onSnapshot(votesCol(e), (s) => {
          state.votes = Object.fromEntries(s.docs.map((d) => [d.id, d.data().placeId]));
          loaded.votes = true;
          emit();
        }),
      ];
      return () => unsubs.forEach((u) => u());
    },
    async addPlace(e, { name, url, memo, addedBy }) {
      await fs.setDoc(fs.doc(placesCol(e), randomId(12)), {
        name, url, memo, addedBy, createdAt: now(), comments: [],
      });
    },
    async deletePlace(e, placeId) {
      const batch = fs.writeBatch(db);
      batch.delete(fs.doc(placesCol(e), placeId));
      const s = await fs.getDocs(fs.query(votesCol(e), fs.where("placeId", "==", placeId)));
      s.forEach((d) => batch.delete(d.ref));
      await batch.commit();
    },
    async vote(e, voter, placeId) {
      const ref = fs.doc(votesCol(e), voter);
      if (placeId) await fs.setDoc(ref, { placeId, at: now() });
      else await fs.deleteDoc(ref);
    },
    async addComment(e, placeId, { by, text }) {
      await fs.updateDoc(fs.doc(placesCol(e), placeId), {
        comments: fs.arrayUnion({ by, text, at: now() }),
      });
    },
  };
}

// ---------- ローカル（お試し）版 ----------
function createLocalStore() {
  const KEY = "placeVote:db";
  const load = () => JSON.parse(localStorage.getItem(KEY) || "{}");
  const listeners = new Set();
  const notify = () => listeners.forEach((fn) => fn());
  const save = (db) => {
    localStorage.setItem(KEY, JSON.stringify(db));
    notify();
  };
  window.addEventListener("storage", (ev) => ev.key === KEY && notify());
  const mutate = (e, fn) => {
    const db = load();
    if (!db[e]) throw new Error("イベントが見つかりません");
    fn(db[e]);
    save(db);
  };

  return {
    mode: "local",
    async createEvent(title) {
      const id = randomId();
      const db = load();
      db[id] = { event: { title, createdAt: now() }, places: {}, votes: {} };
      save(db);
      return id;
    },
    subscribe(e, cb) {
      const fn = () => {
        const ev = load()[e];
        if (!ev) return cb({ event: null, places: [], votes: {} });
        cb({
          event: ev.event,
          places: Object.entries(ev.places).map(([id, p]) => ({ id, ...p })),
          votes: Object.fromEntries(Object.entries(ev.votes).map(([k, v]) => [k, v.placeId])),
        });
      };
      listeners.add(fn);
      fn();
      return () => listeners.delete(fn);
    },
    async addPlace(e, { name, url, memo, addedBy }) {
      mutate(e, (ev) => {
        ev.places[randomId(12)] = { name, url, memo, addedBy, createdAt: now(), comments: [] };
      });
    },
    async deletePlace(e, placeId) {
      mutate(e, (ev) => {
        delete ev.places[placeId];
        for (const [voter, v] of Object.entries(ev.votes)) if (v.placeId === placeId) delete ev.votes[voter];
      });
    },
    async vote(e, voter, placeId) {
      mutate(e, (ev) => {
        if (placeId) ev.votes[voter] = { placeId, at: now() };
        else delete ev.votes[voter];
      });
    },
    async addComment(e, placeId, { by, text }) {
      mutate(e, (ev) => ev.places[placeId]?.comments.push({ by, text, at: now() }));
    },
  };
}

export async function createStore() {
  if (firebaseConfig && firebaseConfig.projectId) return createFirestoreStore(firebaseConfig);
  return createLocalStore();
}
