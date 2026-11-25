import { createStore } from "./store.js";

const $app = document.getElementById("app");
const params = new URLSearchParams(location.search);
const eventId = params.get("e");

const NAME_KEY = "placeVote:name";
const RECENT_KEY = "placeVote:recent";

let store;
let state = null; // { event, places, votes }
const ui = {
  open: new Set(), // 開いているカードの placeId
  drafts: {}, // 入力途中のテキスト（再描画で消えないように）
  showAddForm: false,
};

// ---------- ユーティリティ ----------
const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

function normalizeUrl(raw) {
  const s = raw.trim();
  if (!s) return "";
  if (/^https?:\/\//i.test(s)) return s;
  if (/^[\w-]+(\.[\w-]+)+/.test(s)) return "https://" + s;
  return s;
}
const isSafeUrl = (u) => /^https?:\/\//i.test(u);

function toast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => (t.hidden = true), 2000);
}

const getName = () => localStorage.getItem(NAME_KEY) || "";
const setName = (n) => localStorage.setItem(NAME_KEY, n);

function rememberEvent(id, title) {
  const list = JSON.parse(localStorage.getItem(RECENT_KEY) || "[]").filter((x) => x.id !== id);
  list.unshift({ id, title, at: Date.now() });
  localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, 10)));
}

async function run(fn) {
  try {
    await fn();
  } catch (err) {
    console.error(err);
    toast("エラー: " + (err.message || err));
  }
}

// ---------- トップページ ----------
function renderHome() {
  const recent = JSON.parse(localStorage.getItem(RECENT_KEY) || "[]");
  $app.innerHTML = `
    <section class="panel">
      <h1>行き先をみんなで決めよう</h1>
      <p class="muted">イベントを作ってURLを共有するだけ。ログインは不要です。</p>
      <form id="createForm" class="stack">
        <input name="title" placeholder="例：京都旅行 2027春" maxlength="60" required />
        <button class="btn primary">イベントを作る</button>
      </form>
    </section>
    ${
      recent.length
        ? `<section class="panel">
            <h2>最近ひらいたイベント</h2>
            <ul class="recent">${recent
              .map((r) => `<li><a href="?e=${encodeURIComponent(r.id)}">${esc(r.title)}</a></li>`)
              .join("")}</ul>
          </section>`
        : ""
    }
    ${modeNote()}
  `;
  document.getElementById("createForm").addEventListener("submit", (ev) => {
    ev.preventDefault();
    const title = ev.target.title.value.trim();
    if (!title) return;
    run(async () => {
      const id = await store.createEvent(title);
      location.href = `?e=${id}`;
    });
  });
}

function modeNote() {
  return store.mode === "local"
    ? `<p class="mode-note">⚠ お試しモード：データはこのブラウザ内にだけ保存されます（firebase-config.js を設定すると共有できます）</p>`
    : "";
}

// ---------- イベントページ ----------
function startEvent() {
  store.subscribe(eventId, (s) => {
    state = s;
    if (s.event) rememberEvent(eventId, s.event.title);
    renderEvent();
  });
}

function sortedPlaces() {
  const counts = {};
  for (const pid of Object.values(state.votes)) counts[pid] = (counts[pid] || 0) + 1;
  return state.places
    .map((p) => ({
      ...p,
      voters: Object.entries(state.votes)
        .filter(([, pid]) => pid === p.id)
        .map(([v]) => v)
        .sort(),
    }))
    .sort((a, b) => b.voters.length - a.voters.length || String(a.createdAt).localeCompare(String(b.createdAt)));
}

function renderEvent() {
  // 再描画前にフォーカスと入力中テキストを退避
  const active = document.activeElement;
  const focusKey = active?.dataset?.draft;
  const selStart = active?.selectionStart;

  if (state.event === null) {
    $app.innerHTML = `<section class="panel"><h1>イベントが見つかりません</h1><p><a href="./">トップへ戻る</a></p></section>`;
    return;
  }

  const me = getName();
  if (!me) {
    renderNameForm();
    return;
  }

  const myVote = state.votes[me];
  const places = sortedPlaces();
  const shareUrl = location.href;

  $app.innerHTML = `
    <section class="event-head">
      <h1>${esc(state.event.title)}</h1>
      <div class="share">
        <input readonly value="${esc(shareUrl)}" aria-label="共有URL" />
        <button class="btn" data-action="copy">URLをコピー</button>
      </div>
      <div class="me">あなた：<b>${esc(me)}</b>
        <button class="link" data-action="rename">変更</button>
        <span class="muted">／ 投票は1人1箇所</span>
      </div>
    </section>

    <section class="cards">
      ${places.length ? places.map((p, i) => renderCard(p, i, myVote)).join("") : `<p class="empty muted">まだ候補がありません。下のボタンから追加しましょう。</p>`}
    </section>

    <section class="panel add">
      ${
        ui.showAddForm
          ? `<form id="addForm" class="stack">
              <h2>行きたいところを追加</h2>
              <input name="name" data-draft="add.name" placeholder="場所の名前（必須）" maxlength="80" required />
              <input name="url" data-draft="add.url" placeholder="URL（任意）" inputmode="url" maxlength="500" />
              <textarea name="memo" data-draft="add.memo" placeholder="メモ（任意）" rows="3" maxlength="1000"></textarea>
              <div class="row">
                <button type="button" class="btn" data-action="cancelAdd">キャンセル</button>
                <button class="btn primary">追加する</button>
              </div>
            </form>`
          : `<button class="btn primary wide" data-action="showAdd">＋ 行きたいところを追加</button>`
      }
    </section>
    ${modeNote()}
  `;

  // 入力途中のテキストを復元
  $app.querySelectorAll("[data-draft]").forEach((el) => {
    if (ui.drafts[el.dataset.draft] != null) el.value = ui.drafts[el.dataset.draft];
  });
  if (focusKey) {
    const el = $app.querySelector(`[data-draft="${CSS.escape(focusKey)}"]`);
    if (el) {
      el.focus();
      if (selStart != null) el.setSelectionRange(selStart, selStart);
    }
  }
}

function renderCard(p, i, myVote) {
  const open = ui.open.has(p.id);
  const voted = myVote === p.id;
  const comments = p.comments || [];
  return `
    <article class="card ${open ? "open" : ""} ${voted ? "voted" : ""}" data-id="${esc(p.id)}">
      <div class="card-head" data-action="toggle" role="button" tabindex="0" aria-expanded="${open}">
        <span class="rank">${i + 1}</span>
        <div class="title">
          <div class="name">${esc(p.name)}</div>
          <div class="voters">${p.voters.length ? p.voters.map(esc).join("・") : "<span class='muted'>まだ投票なし</span>"}</div>
        </div>
        <span class="count" aria-label="${p.voters.length}票">${p.voters.length}<small>票</small></span>
        <button class="vote-btn ${voted ? "on" : ""}" data-action="vote">${voted ? "投票済" : "投票"}</button>
      </div>
      ${
        open
          ? `<div class="card-body">
              ${p.url ? `<p class="url">🔗 ${isSafeUrl(p.url) ? `<a href="${esc(p.url)}" target="_blank" rel="noopener noreferrer">${esc(p.url)}</a>` : esc(p.url)}</p>` : ""}
              ${p.memo ? `<p class="memo">📝 ${esc(p.memo)}</p>` : ""}
              <p class="added muted">追加：${esc(p.addedBy || "?")}${comments.length ? `　💬 ${comments.length}` : ""}</p>
              <ul class="comments">
                ${comments.map((c) => `<li><b>${esc(c.by)}</b>${esc(c.text)}</li>`).join("")}
              </ul>
              <form class="comment-form" data-id="${esc(p.id)}">
                <input name="text" data-draft="c.${esc(p.id)}" placeholder="コメントを書く" maxlength="500" />
                <button class="btn">送信</button>
              </form>
              <button class="link danger" data-action="delete">この候補を削除</button>
            </div>`
          : `${comments.length || p.url || p.memo ? `<div class="hint muted">タップで詳細${comments.length ? `（💬 ${comments.length}）` : ""}</div>` : ""}`
      }
    </article>`;
}

function renderNameForm() {
  $app.innerHTML = `
    <section class="panel">
      <h1>${esc(state.event.title)}</h1>
      <p>あなたの名前（ニックネーム）を入力してください。投票やコメントに表示されます。</p>
      <form id="nameForm" class="stack">
        <input name="name" placeholder="例：たろう" maxlength="20" required value="${esc(getName())}" />
        <button class="btn primary">はじめる</button>
      </form>
    </section>`;
  const form = document.getElementById("nameForm");
  form.name.focus();
  form.addEventListener("submit", (ev) => {
    ev.preventDefault();
    const name = form.name.value.trim();
    if (!name) return;
    setName(name);
    renderEvent();
  });
}

// ---------- イベント処理（委譲） ----------
$app.addEventListener("input", (ev) => {
  const key = ev.target.dataset?.draft;
  if (key) ui.drafts[key] = ev.target.value;
});

$app.addEventListener("click", (ev) => {
  const el = ev.target.closest("[data-action]");
  if (!el || !state) return;
  const card = el.closest(".card");
  const pid = card?.dataset.id;
  const me = getName();

  switch (el.dataset.action) {
    case "toggle":
      ui.open.has(pid) ? ui.open.delete(pid) : ui.open.add(pid);
      renderEvent();
      break;
    case "vote":
      ev.stopPropagation();
      run(() => store.vote(eventId, me, state.votes[me] === pid ? null : pid));
      break;
    case "delete":
      if (confirm("この候補を削除しますか？（投票・コメントも消えます）")) run(() => store.deletePlace(eventId, pid));
      break;
    case "copy":
      navigator.clipboard?.writeText(location.href).then(
        () => toast("URLをコピーしました"),
        () => toast("コピーできませんでした")
      );
      break;
    case "rename":
      renameFlow();
      break;
    case "showAdd":
      ui.showAddForm = true;
      renderEvent();
      $app.querySelector("#addForm input[name=name]")?.focus();
      break;
    case "cancelAdd":
      ui.showAddForm = false;
      ["add.name", "add.url", "add.memo"].forEach((k) => delete ui.drafts[k]);
      renderEvent();
      break;
  }
});

$app.addEventListener("keydown", (ev) => {
  if ((ev.key === "Enter" || ev.key === " ") && ev.target.matches(".card-head")) {
    ev.preventDefault();
    ev.target.click();
  }
});

$app.addEventListener("submit", (ev) => {
  const form = ev.target;
  if (form.id === "addForm") {
    ev.preventDefault();
    const name = form.name.value.trim();
    if (!name) return;
    const data = { name, url: normalizeUrl(form.url.value), memo: form.memo.value.trim(), addedBy: getName() };
    ["add.name", "add.url", "add.memo"].forEach((k) => delete ui.drafts[k]);
    ui.showAddForm = false;
    run(() => store.addPlace(eventId, data));
  } else if (form.classList.contains("comment-form")) {
    ev.preventDefault();
    const text = form.text.value.trim();
    if (!text) return;
    const pid = form.dataset.id;
    delete ui.drafts["c." + pid];
    form.text.value = "";
    run(() => store.addComment(eventId, pid, { by: getName(), text }));
  }
});

async function renameFlow() {
  const old = getName();
  const name = prompt("新しい名前", old)?.trim();
  if (!name || name === old) return;
  if (state.votes[name] && !confirm(`「${name}」はすでに投票しています。同じ人として続けますか？`)) return;
  const myVote = state.votes[old];
  await run(async () => {
    // 投票を新しい名前へ引き継ぐ
    if (myVote && !state.votes[name]) await store.vote(eventId, name, myVote);
    if (myVote) await store.vote(eventId, old, null);
  });
  setName(name);
  renderEvent();
}

// ---------- 起動 ----------
(async () => {
  try {
    store = await createStore();
  } catch (err) {
    console.error(err);
    $app.innerHTML = `<section class="panel"><h1>接続できませんでした</h1><p class="muted">${esc(err.message)}</p></section>`;
    return;
  }
  eventId ? startEvent() : renderHome();
})();
