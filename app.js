/* ═══════════════════════════════════════════════════════════
   WEEKY v11.1.0 — Application Logic
   v10系からフォークした次世代版。最大の違い＝テキストデータ(state)の
   永続化を localStorage(5MB上限) から IndexedDB へ全面移行（写真・手書き
   と同じ仕組み）。詳細は Notion Decisions: 2026-06-24-next-gen-in-subfolder
   / 2026-07-17-v11-state-to-indexeddb を参照。
   バージョン番号のルールは Decisions: 2026-07-23-v11-versioning-scheme
   （SemVer：PATCH=バグ修正のみ／MINOR=機能追加／MAJOR=土台の作り直し）。
   v11.1.0：印刷レイアウト改修（週案表の高さ安定化＋詳細メモの田の字4コマ化）。
   v11.1.1：週案表の行事/昼行が崩れるバグ修正（<td>にdisplay:-webkit-box誤指定）。
   v11.1.2：週案表を<table>からCSS Gridへ全面移行。テーブル行はheight指定しても
   内容量次第で伸びてしまうため、実機(iPad/iPhone)で行がずれる・下段が消える等の
   再発があった。Gridなら行の高さが本当に固定される（詳細はMistakes M-11・
   Projects 2026-07-23参照）。
   v11.1.3：「PDFダウンロード」の文字が実機で欠けて見える不具合対策。html2canvasの
   scaleを2→3に、出力形式をJPEG→PNG（可逆圧縮）に変更。小さい日本語文字を
   JPEGの非可逆圧縮にかけると画線ににじみ・欠けが出やすいための対策（Mistakes M-13）。
════════════════════════════════════════════════════════════ */

'use strict';

/* ── Constants ──────────────────────────────────────────── */
/* Single source of truth for the version. Keep in sync with the ?v= query in
   index.html and CACHE_NAME in service-worker.js. Shown in 設定 → このアプリ. */
const APP_VERSION = '11.1.3';
const DAYS = ['月', '火', '水', '木', '金']; /* Mon–Fri only */
const DEFAULT_PERIODS = 6;
const ACTIVATION_CODES = ['SHUAN-2026'];

const SUBJECT_DEFAULTS = [
  { id: 'math',     name: '算数・数学', color: '#4F46E5' },
  { id: 'science',  name: '理科',       color: '#7C3AED' },
  { id: 'english',  name: '英語',       color: '#0D9488' },
  { id: 'japanese', name: '国語',       color: '#D97706' },
  { id: 'social',   name: '社会',       color: '#16A34A' },
  { id: 'pe',       name: '体育',       color: '#DC2626' },
  { id: 'music',    name: '音楽',       color: '#DB2777' },
  { id: 'art',      name: '図工・美術', color: '#EA580C' },
  { id: 'tech',     name: '技術・家庭', color: '#0284C7' },
  { id: 'moral',    name: '道徳',       color: '#65A30D' },
];

const DEFAULT_CLASSES = ['1年A組', '1年B組', '2年A組', '2年B組', '3年A組'];

/* WMO weather code → emoji + text */
const WC = {
  0:  ['☀️','快晴'],  1:  ['🌤','ほぼ晴れ'],  2:  ['⛅','晴れ時々曇り'], 3:  ['☁️','曇り'],
  45: ['🌫','霧'],    48: ['🌫','霧（着氷）'],
  51: ['🌦','小雨'],  53: ['🌧','雨'],         55: ['🌧','強い雨'],
  56: ['🌨','凍雨'],  57: ['🌨','強い凍雨'],
  61: ['🌦','弱い雨'],63: ['🌧','雨'],         65: ['🌧','強い雨'],
  66: ['🌨','凍雨'],  67: ['🌨','強い凍雨'],
  71: ['❄️','弱い雪'],73: ['❄️','雪'],         75: ['❄️','大雪'],
  77: ['🌨','霰'],
  80: ['🌦','にわか雨'],81: ['🌧','にわか雨(強)'],82: ['⛈','激しいにわか雨'],
  85: ['🌨','にわか雪'],86: ['🌨','にわか雪(強)'],
  95: ['⛈','雷雨'],  96: ['⛈','雷雨+霰'],   99: ['⛈','激しい雷雨'],
};

/* 20 themes */
const THEMES = [
  { id: 'indigo',      name: 'インディゴ' },
  { id: 'navy',        name: 'ネイビー'   },
  { id: 'board',       name: 'ボード'     },
  { id: 'mint',        name: 'ミント'     },
  { id: 'sky',         name: 'スカイ'     },
  { id: 'lavender',    name: 'ラベンダー' },
  { id: 'rose',        name: 'ローズ'     },
  { id: 'cafe',        name: 'カフェ'     },
  { id: 'sunset',      name: 'サンセット' },
  { id: 'olive',       name: 'オリーブ'   },
  { id: 'slate',       name: 'スレート'   },
  { id: 'soda',        name: 'ソーダ'     },
  { id: 'ramune',      name: 'ラムネ'     },
  { id: 'cotton',      name: 'コットン'   },
  { id: 'strawberry',  name: 'ストロベリー'},
  { id: 'lemon',       name: 'レモン'     },
  { id: 'chocolate',   name: 'チョコレート'},
  { id: 'caramel',     name: 'キャラメル' },
  { id: 'midnight',    name: 'ミッドナイト'},
  { id: 'peach',       name: 'ピーチ'     },
];

/* Swatch preview colors for theme grid */
const THEME_COLORS = {
  indigo:'#4F46E5', navy:'#1E3A5F',   board:'#1E5631',  mint:'#059669',
  sky:'#0EA5E9',    lavender:'#7C3AED',rose:'#E11D48',   cafe:'#92400E',
  sunset:'#EA580C', olive:'#65A30D',   slate:'#475569',  soda:'#0284C7',
  ramune:'#06B6D4', cotton:'#EC4899',  strawberry:'#DC2626', lemon:'#CA8A04',
  chocolate:'#78350F', caramel:'#B45309', midnight:'#1E1B4B', peach:'#F97316',
};

/* ── State ──────────────────────────────────────────────── */
const state = {
  currentWeekStart: getWeekStart(new Date()),
  lessons: {},
  todos: [],            // { id, text, done, projectId, urgent, date }
  longTodos: [],        // { id, text, done, due }
  projects: [],         // legacy: kept only for migrating old data into todos
  photos: [],
  notes: [],
  events: {},          // { 'YYYY-MM': { '1': 'text', '2': 'text', ... } }
  lunch: {},           // { 'YYYY-MM-DD': '昼休みメモ' }
  schools: [],         // [{ id, name, code }]
  activeSchoolId: null,
  classes: [],         // [{ id, schoolId, year, grade, classNo, name }] 明示的な学級
  students: [],        // [{ id, schoolId, className, number, name, kana, qrId, note }]
  attendance: {},      // { studentId: { 'YYYY-MM-DD': 'present'|'absent'|'late'|'early' } }
  reception: [],       // [{ date, period, className, studentId, name, time, items:[] }]  QR受付
  evaluations: {},     // { studentId: { subjectId: { grade, memo, scores:{colId:value} } } }
  evalColumns: {},     // { "schoolId__class__subjectId": [{ id, name }] }  評価表の列（項目）
  settings: {
    teacherName: '',
    schoolName: '',
    periodsCount: DEFAULT_PERIODS,
    subjects: [...SUBJECT_DEFAULTS],
    classes: [...DEFAULT_CLASSES],
    theme: 'indigo',
    appearance: 'light',     // light|dark|auto（端末に合わせる）— 色テーマとは独立
    viewTransition: 'pop',   // none|fade|slide|pop|zoom|tiles|flip
    periodTimes: ['8:50', '9:45', '10:45', '11:40', '13:25', '14:20', '15:15'], // 各時限の開始時刻
    lessonDuration: 50,      // 1コマの長さ（分）45 or 50
    lunchAfter: 4,           // 昼休みを何限の後に置くか
    hwColors: ['#1a1a1a', '#e11d48', '#2563eb', '#16a34a', '#d97706', '#7c3aed'], // 手書きペン色。先頭4色=通常/全画面共通、5・6色目=全画面のみ
    weatherLat: null,
    weatherLon: null,
    weatherName: '東京',
    lockEnabled: false,      // 画面ロックを使うか
    lockPin: '',             // 設定中のPIN（数字文字列。''=未設定）
    lockDigits: 4,           // 4 | 6
    lockTimeoutMin: 5,       // 無操作タイムアウト（分）1|3|5|10|30
  },
  activeView: 'weekly',
  eventsYear: new Date().getFullYear(),
  eventsMonth: new Date().getMonth() + 1,
  rosterClass: null,        // currently selected class in roster/attendance/eval
  attendanceMonth: new Date().getMonth() + 1,
  attendanceYear: new Date().getFullYear(),
  activeNoteId: null,       // currently open note in 2-pane editor
};

/* ── Persistence ─────────────────────────────────────────────
   v11: テキストデータ(state)は localStorage ではなく IndexedDB
   （weeky_state / store 'kv'、写真・手書きと同じ仕組み＝kvGet/kvSet。
   下記「KV storage」ブロック参照）へ保存する。5MB上限を撤廃し、
   数年分のデータを1つのDBに貯めて横断検索できるようにするための変更。
   save()は各所から同期呼び出しされ続けるため、内部でIndexedDB書き込みを
   非同期に投げるだけ（fire-and-forget）にして呼び出し側は変更不要にした。
   load()は起動時に1回だけ呼ばれる箇所（startApp）をasync化してawaitする。 */
function save() {
  const payload = {
    lessons: state.lessons,
    todos: state.todos,
    longTodos: state.longTodos,
    projects: state.projects,
    photos: state.photos,
    notes: state.notes,
    events: state.events,
    lunch: state.lunch,
    schools: state.schools,
    activeSchoolId: state.activeSchoolId,
    classes: state.classes,
    students: state.students,
    attendance: state.attendance,
    reception: state.reception,
    evaluations: state.evaluations,
    evalColumns: state.evalColumns,
    settings: state.settings,
  };
  kvSet('weeky_v10', payload).then(() => {
    const el = document.getElementById('autosaveStatus');
    if (el) {
      const now = new Date();
      el.textContent = `✓ ${now.getHours()}:${String(now.getMinutes()).padStart(2,'0')} 保存済み · v${APP_VERSION}`;
    }
  }).catch(() => {
    const el = document.getElementById('autosaveStatus');
    if (el) el.textContent = '⚠ 保存失敗';
  });
}

async function load() {
  try {
    let data = await kvGet('weeky_v10');
    if (!data) {
      // 一度きりの移行：同一オリジンの旧WEEKY(v10)が使っていた
      // localStorage['weeky_v10'] が残っていれば取り込んでIndexedDBへ書き込む。
      // （v10とv11は同一originなのでlocalStorageは共有される）
      try {
        const raw = localStorage.getItem('weeky_v10');
        if (raw) { data = JSON.parse(raw); await kvSet('weeky_v10', data); }
      } catch (e) { /* 移行失敗時は新規状態として続行 */ }
    }
    if (!data) { ensureDefaultSchool(); return; }
    Object.assign(state.lessons, data.lessons || {});
    state.todos     = data.todos     || [];
    state.longTodos = data.longTodos || [];
    state.projects  = data.projects  || [];
    state.photos    = data.photos    || [];
    state.notes     = data.notes     || [];
    Object.assign(state.events, data.events || {});
    Object.assign(state.lunch, data.lunch || {});
    state.schools      = data.schools      || [];
    state.activeSchoolId = data.activeSchoolId || null;
    state.classes      = data.classes      || [];
    state.students     = data.students     || [];
    state.attendance   = data.attendance   || {};
    state.reception    = data.reception    || [];
    state.evaluations  = data.evaluations  || {};
    state.evalColumns  = data.evalColumns  || {};
    if (data.settings) Object.assign(state.settings, data.settings);
    if (state.settings.viewTransition === 'warp') state.settings.viewTransition = 'pop';  // 廃止した演出のフォールバック

    // 旧「ミッドナイト」テーマ＝暗い背景。外観モード導入に伴い、
    // 外観未設定の旧ユーザーはダーク外観へ引き継ぐ（アクセント色は維持）。
    if (data.settings && data.settings.appearance === undefined && data.settings.theme === 'midnight') {
      state.settings.appearance = 'dark';
    }

    migrateData();
    ensureDefaultSchool();
  } catch (e) { ensureDefaultSchool(); }
}

/* Migrate legacy event arrays → per-day text maps */
function migrateData() {
  Object.keys(state.events).forEach(monthKey => {
    const val = state.events[monthKey];
    if (Array.isArray(val)) {
      const map = {};
      val.forEach(ev => {
        // ev.date like 'YYYY-MM-DD' or 'D' — extract day number
        const dm = String(ev.date || '').match(/(\d{1,2})\s*$/);
        const day = dm ? parseInt(dm[1], 10) : null;
        if (day) map[day] = (map[day] ? map[day] + ' / ' : '') + (ev.name || '');
      });
      state.events[monthKey] = map;
    }
  });

  // Backfill student ID fields (v10.2 students had random WKY ids + className only)
  const thisYear = new Date().getFullYear();
  state.students.forEach(st => {
    if (st.grade == null || st.classNo == null) {
      const p = parseClassName(st.className);
      if (st.grade == null)   st.grade = p.grade;
      if (st.classNo == null) st.classNo = p.classNo;
    }
    if (st.year == null) st.year = thisYear;
    // recompute deterministic ID only for the old random placeholder format
    if (!st.qrId || /^WKY-/.test(st.qrId)) {
      if (st.grade && st.classNo) st.qrId = makeStudentId(st.schoolId, st.year, st.grade, st.classNo, st.number);
    }
  });

  // Collapse duplicate student records (same school + same deterministic ID).
  // These duplicates doubled roster/attendance counts and broke QR reception
  // (one copy could never be marked present). Merge their attendance / 評価 / 受付
  // into the kept record, then drop the extras — no information is lost.
  {
    const seen = new Map();   // key → kept student
    const remap = {};         // droppedId → keptId
    const kept = [];
    for (const st of state.students) {
      // only dedup records we can identify with certainty
      if (!st.qrId || !st.number) { kept.push(st); continue; }
      const key = st.schoolId + '|' + st.qrId;
      const keep = seen.get(key);
      if (!keep) { seen.set(key, st); kept.push(st); continue; }
      remap[st.id] = keep.id;
      if (!keep.name && st.name) keep.name = st.name;
      if (!keep.kana && st.kana) keep.kana = st.kana;
      if (!keep.note && st.note) keep.note = st.note;
      if (state.attendance && state.attendance[st.id]) {
        const ka = state.attendance[keep.id] = state.attendance[keep.id] || {};
        for (const d in state.attendance[st.id]) if (!(d in ka)) ka[d] = state.attendance[st.id][d];
        delete state.attendance[st.id];
      }
      if (state.evaluations && state.evaluations[st.id]) {
        const ke = state.evaluations[keep.id] = state.evaluations[keep.id] || {};
        for (const k in state.evaluations[st.id]) if (!(k in ke)) ke[k] = state.evaluations[st.id][k];
        delete state.evaluations[st.id];
      }
    }
    if (kept.length !== state.students.length) {
      state.students = kept;
      (state.reception || []).forEach(r => { if (remap[r.studentId]) r.studentId = remap[r.studentId]; });
    }
  }

  // Unify ToDo model: merge longTodos into todos; projectId → tag; ensure tags[]
  const projName = id => (state.projects || []).find(p => p.id === id)?.name || '';
  state.todos.forEach(t => {
    if (!Array.isArray(t.tags)) {
      t.tags = [];
      if (t.projectId) { const n = projName(t.projectId); if (n) t.tags.push(n); }
    }
    delete t.projectId;
    if (!('due' in t)) t.due = '';
  });
  if (Array.isArray(state.longTodos) && state.longTodos.length) {
    state.longTodos.forEach(t => {
      state.todos.push({ id: t.id || uid(), text: t.text, done: !!t.done, due: t.due || '', tags: Array.isArray(t.tags) ? t.tags : [] });
    });
    state.longTodos = [];
  }
}

function ensureDefaultSchool() {
  if (!state.schools.length) {
    const id = uid();
    state.schools.push({ id, name: state.settings.schoolName || '本校', code: '1' });
    state.activeSchoolId = id;
  }
  // backfill code for schools created before the ID structure change
  state.schools.forEach((s, i) => { if (s.code == null || s.code === '') s.code = String(i + 1); });
  if (!state.activeSchoolId || !state.schools.find(s => s.id === state.activeSchoolId)) {
    state.activeSchoolId = state.schools[0].id;
  }
}

/* ── Roster / class helpers ──────────────────────────────── */
function activeSchoolStudents() {
  return state.students.filter(s => s.schoolId === state.activeSchoolId);
}
function activeSchoolClasses() {
  return state.classes.filter(c => c.schoolId === state.activeSchoolId);
}

/* Normalize full-width / kanji digits to ASCII (for class-name parsing) */
function normalizeDigits(s) {
  const z = '０１２３４５６７８９';
  const k = {'一':'1','二':'2','三':'3','四':'4','五':'5','六':'6','七':'7','八':'8','九':'9','〇':'0','零':'0'};
  return String(s || '')
    .replace(/[０-９]/g, ch => z.indexOf(ch))
    .replace(/[一二三四五六七八九〇零]/g, ch => k[ch]);
}
/* Parse "3年2組" / "3-2" / "3ー2" / "3の2" → { grade, classNo } */
function parseClassText(text) {
  const s = normalizeDigits(text).replace(/\s/g, '');
  let m = s.match(/([1-9])年?([1-9]\d?)組?/);
  if (m) return { grade: m[1], classNo: m[2] };
  m = s.match(/([1-9])[-ー−の]([1-9]\d?)/);
  if (m) return { grade: m[1], classNo: m[2] };
  return null;
}
function makeClassName(grade, classNo) { return `${grade}年${classNo}組`; }

/* Class list = explicit classes ∪ classes derived from students (this school) */
function getClassList() {
  const names = new Set();
  activeSchoolClasses().forEach(c => names.add(c.name));
  activeSchoolStudents().forEach(s => { if (s.className) names.add(s.className); });
  const list = [...names];
  list.sort((a, b) => a.localeCompare(b, 'ja', { numeric: true }));
  return list;
}

/* 全学校の学級を学校ごとにまとめて返す（授業モーダルの学級選択は学校横断）。
   複数校あるときは値に「学校名＋学級名」を入れ、resolveLessonClass で
   一意に解決できるようにする（同名学級の他校混同を防ぐ）。
   前置は effectiveClassName() 経由（Mistakes M-10: 名簿の値が万一すでに
   学校名を含んでいても二重に足さない）。 */
function allClassesGrouped() {
  return state.schools.map(sc => {
    const names = new Set();
    state.classes.filter(c => c.schoolId === sc.id).forEach(c => names.add(c.name));
    state.students.filter(s => s.schoolId === sc.id).forEach(s => { if (s.className) names.add(s.className); });
    const list = [...names].sort((a, b) => a.localeCompare(b, 'ja', { numeric: true }));
    return {
      schoolName: sc.name,
      options: list.map(name => ({ value: effectiveClassName(name, sc.id), label: name })),
    };
  }).filter(g => g.options.length);
}

function classByName(name) {
  return activeSchoolClasses().find(c => c.name === name) || null;
}

function studentsInClass(className) {
  // de-duplicate by deterministic ID so a stray duplicate record can't double
  // the roster count or block reception (counts/受付 rely on this list).
  const seen = new Set();
  const uniq = [];
  for (const s of activeSchoolStudents()) {
    if (s.className !== className) continue;
    const key = (s.qrId && s.number) ? (s.schoolId + '|' + s.qrId) : ('id:' + s.id);
    if (seen.has(key)) continue;
    seen.add(key);
    uniq.push(s);
  }
  return uniq
    .sort((a, b) => (a.number || 0) - (b.number || 0));
}

function schoolById(id) { return state.schools.find(s => s.id === id) || null; }
function pad2(n) { return String(n).padStart(2, '0'); }

/* Student ID = 年度 + 学校コード + 学年 + 組 + 出席番号2桁
   （旧「出席・ID管理ツール」と同じ形式。既存QRと互換）
   例: 2026年 / 学校コード1 / 3年2組5番 → 202613205 */
function makeStudentId(schoolId, year, grade, classNo, number) {
  const code = schoolById(schoolId)?.code || '0';
  return `${year || ''}${code}${grade || ''}${classNo || ''}${pad2(number || 0)}`;
}

/* Derived class label from grade + classNo */
function deriveClassName(grade, classNo) {
  if (!grade && !classNo) return '';
  return `${grade || '?'}年${classNo || '?'}組`;
}

/* ── Media storage (IndexedDB) ───────────────────────────────
   Photos & handwriting images are large; storing them as
   dataURLs in localStorage quickly exceeds its ~5MB limit.
   We keep only lightweight references in localStorage and put
   the actual image data in IndexedDB. */
const MEDIA_DB = 'weeky_media';
const MEDIA_STORE = 'photos';
let _mediaDbPromise = null;

function mediaDb() {
  if (_mediaDbPromise) return _mediaDbPromise;
  _mediaDbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(MEDIA_DB, 1);
    req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains(MEDIA_STORE)) req.result.createObjectStore(MEDIA_STORE); };
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
  return _mediaDbPromise;
}
async function mediaPut(id, dataUrl) {
  const db = await mediaDb();
  return new Promise((res, rej) => {
    const tx = db.transaction(MEDIA_STORE, 'readwrite');
    tx.objectStore(MEDIA_STORE).put(dataUrl, id);
    tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error);
  });
}
async function mediaGet(id) {
  const db = await mediaDb();
  return new Promise((res, rej) => {
    const tx = db.transaction(MEDIA_STORE, 'readonly');
    const r = tx.objectStore(MEDIA_STORE).get(id);
    r.onsuccess = () => res(r.result || null); r.onerror = () => rej(r.error);
  });
}
async function mediaDelete(id) {
  const db = await mediaDb();
  return new Promise((res) => {
    const tx = db.transaction(MEDIA_STORE, 'readwrite');
    tx.objectStore(MEDIA_STORE).delete(id);
    tx.oncomplete = () => res(); tx.onerror = () => res();
  });
}
async function mediaAll() {
  const db = await mediaDb();
  return new Promise((res) => {
    const tx = db.transaction(MEDIA_STORE, 'readonly');
    const store = tx.objectStore(MEDIA_STORE);
    const keysReq = store.getAllKeys();
    const valsReq = store.getAll();
    tx.oncomplete = () => {
      const out = {};
      (keysReq.result || []).forEach((k, i) => { out[k] = valsReq.result[i]; });
      res(out);
    };
    tx.onerror = () => res({});
  });
}

/* Set an <img> src from a photo ref (IDB id), with legacy fallback */
function setPhotoSrc(imgEl, photo) {
  if (photo.src) { imgEl.src = photo.src; return; }        // legacy inline dataURL
  mediaGet(photo.id).then(d => { if (d) imgEl.src = d; });
}

/* ── State storage (IndexedDB) ───────────────────────────────
   v11の中核変更点。従来 localStorage(約5MB上限) に入れていたテキスト
   データ(state本体・アクティベーション/オンボーディング/チュートリアル
   /最終バックアップ日時などの小さなフラグも含め全て)を、写真・手書きと
   "同じ仕組み"（薄いラッパー越しのIndexedDB）へ寄せる。
   ここは意図的に MEDIA_DB(weeky_media) とは別の新規DBにしている。
   同じDBのバージョンを上げてしまうと、既存のWEEKY(v10フォルダ、mediaDb()が
   バージョン1決め打ち)がこのDBを開けなくなり写真機能が壊れるため
   （IndexedDBは既存DBより低いバージョンでopenするとエラーになる）。
   新規DBにすることでv10側のコードには一切触れず、写真ストア(weeky_media)
   はv10/v11間で従来通り同一originとして自然に共有される。 */
const STATE_DB = 'weeky_state';
const KV_STORE = 'kv';
let _stateDbPromise = null;

function stateDb() {
  if (_stateDbPromise) return _stateDbPromise;
  _stateDbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(STATE_DB, 1);
    req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains(KV_STORE)) req.result.createObjectStore(KV_STORE); };
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
  return _stateDbPromise;
}
async function kvGet(key) {
  const db = await stateDb();
  return new Promise((res, rej) => {
    const tx = db.transaction(KV_STORE, 'readonly');
    const r = tx.objectStore(KV_STORE).get(key);
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
async function kvSet(key, value) {
  const db = await stateDb();
  return new Promise((res, rej) => {
    const tx = db.transaction(KV_STORE, 'readwrite');
    tx.objectStore(KV_STORE).put(value, key);
    tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error);
  });
}
async function kvDelete(key) {
  const db = await stateDb();
  return new Promise((res) => {
    const tx = db.transaction(KV_STORE, 'readwrite');
    tx.objectStore(KV_STORE).delete(key);
    tx.oncomplete = () => res(); tx.onerror = () => res();
  });
}

/* Ask the browser to keep our data persistent (exempt from automatic eviction
   under storage pressure). Granted automatically for home-screen/installed apps
   and high-engagement sites. Safe no-op where unsupported. Does NOT protect
   against device loss/reset or the user clearing site data — backups still matter. */
let _storagePersisted = false;
async function requestPersistentStorage() {
  try {
    if (!navigator.storage || !navigator.storage.persist) return;
    if (navigator.storage.persisted && await navigator.storage.persisted()) {
      _storagePersisted = true; return;
    }
    _storagePersisted = await navigator.storage.persist();
  } catch (_) { /* ignore */ }
}

/* Move any legacy inline-dataURL photos into IndexedDB, freeing localStorage */
async function migratePhotosToIdb() {
  let changed = false;
  const refs = [...state.photos];
  Object.values(state.lessons).forEach(l => { if (Array.isArray(l.photos)) refs.push(...l.photos); });
  for (const p of refs) {
    if (p && p.src) {
      try { await mediaPut(p.id, p.src); delete p.src; changed = true; } catch (e) { /* keep inline */ }
    }
  }
  if (changed) save();
}

/* ── Utilities ───────────────────────────────────────────── */
function getWeekStart(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function formatDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}

function lessonKey(date, period) {
  return `${formatDate(date)}_${period}`;
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function isToday(date) {
  return formatDate(date) === formatDate(new Date());
}

function getSubjectById(id) {
  return state.settings.subjects.find(s => s.id === id) || null;
}

function getSubjectColor(subjectId) {
  const s = getSubjectById(subjectId);
  return s ? s.color : '#6B7280';
}

function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

/* hex色 → rgba（印刷・PDFの淡い背景ティント用） */
function hexA(hex, a) {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex || '');
  if (!m) return 'transparent';
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

/* ── Security (removed) ──────────────────────────────────── */

/* ── Activation Gate ─────────────────────────────────────── */
async function initActivationGate() {
  // v11: アクティベーション済みフラグもkv(IndexedDB)化。
  // 同一originのv10側localStorageに既存の '1' が残っていれば、それも
  // 一度だけ引き継ぐ（v10で認証済みの端末をv11で再認証させないため）。
  let activated = await kvGet('weeky_v10_activated');
  if (!activated) {
    try {
      if (localStorage.getItem('weeky_v10_activated') === '1') {
        activated = '1';
        await kvSet('weeky_v10_activated', '1');
      }
    } catch (e) {}
  }
  if (activated === '1') return startApp();

  const gate  = document.getElementById('activationGate');
  const input = document.getElementById('activationInput');
  const btn   = document.getElementById('activateBtn');
  const errEl = document.getElementById('activationError');

  // gate is shown by default in HTML; ensure it's visible
  gate.removeAttribute('hidden');

  function tryActivate() {
    const code = input.value.trim().toUpperCase();
    if (ACTIVATION_CODES.includes(code)) {
      kvSet('weeky_v10_activated', '1').catch(() => {});
      gate.setAttribute('hidden', '');
      startApp();
    } else {
      errEl.removeAttribute('hidden');
      input.focus();
    }
  }

  btn.addEventListener('click', tryActivate);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') tryActivate(); });
}

/* ── Screen Lock (PINパスコード＋テンキー) ───────────────── */
const LOCK_TIMEOUT_OPTS = [1, 3, 5, 10, 30];
let _lockIdleTimer = null;
let _lockAnimTimer = null;
let _lockBuf = '';
let _lockMode = 'verify';      // 'verify' | 'set1' | 'set2'
let _lockSetFirst = '';

function lockHasPin() { return !!(state.settings.lockEnabled && state.settings.lockPin); }
function lockTargetLen() {
  if (_lockMode === 'verify') return (state.settings.lockPin || '').length || (state.settings.lockDigits === 6 ? 6 : 4);
  return state.settings.lockDigits === 6 ? 6 : 4;
}
function _lockEl(id) { return document.getElementById(id); }

function renderLockDots() {
  const wrap = _lockEl('lockDots');
  if (!wrap) return;
  const n = lockTargetLen();
  wrap.innerHTML = '';
  for (let i = 0; i < n; i++) {
    const d = document.createElement('span');
    d.className = 'lock-dot' + (i < _lockBuf.length ? ' is-on' : '');
    wrap.appendChild(d);
  }
}
function _lockTitleText() {
  if (_lockMode === 'set1') return '新しいパスコードを入力';
  if (_lockMode === 'set2') return 'もう一度入力して確認';
  return 'パスコードを入力';
}
function showLockScreen(mode) {
  _lockMode = mode || 'verify';
  _lockBuf = '';
  if (_lockMode === 'set1') _lockSetFirst = '';
  const ov = _lockEl('lockOverlay');
  if (!ov) return;
  _lockEl('lockTitle').textContent = _lockTitleText();
  const sub = _lockEl('lockSub'); if (sub) sub.textContent = lockTargetLen() + '桁の数字';
  const err = _lockEl('lockError'); if (err) err.hidden = true;
  const cancel = _lockEl('lockCancel'); if (cancel) cancel.hidden = (_lockMode === 'verify');
  renderLockDots();
  ov.removeAttribute('hidden');
  // 登場アニメ：背景ふわっと＋テンキーが左上→右下へパラパラ
  ov.classList.remove('anim'); void ov.offsetWidth; ov.classList.add('anim');
  ov.querySelectorAll('.lock-key').forEach((k, i) => {
    const r = Math.floor(i / 3), c = i % 3;
    k.style.animationDelay = (0.12 + (r + c) * 0.05) + 's';
  });
  clearTimeout(_lockAnimTimer);
  _lockAnimTimer = setTimeout(() => ov.classList.remove('anim'), 850);
  document.addEventListener('keydown', _lockKeyHandler, true);
}
function hideLockScreen() {
  const ov = _lockEl('lockOverlay');
  if (ov) ov.setAttribute('hidden', '');
  document.removeEventListener('keydown', _lockKeyHandler, true);
}
function _lockShake(msg) {
  const dots = _lockEl('lockDots');
  const err = _lockEl('lockError');
  if (err) { err.textContent = msg || 'パスコードが違います'; err.hidden = false; }
  if (dots) { dots.classList.remove('shake'); void dots.offsetWidth; dots.classList.add('shake'); }
  _lockBuf = '';
  setTimeout(renderLockDots, 220);
}
function _lockPush(dgt) {
  if (_lockBuf.length >= lockTargetLen()) return;
  _lockBuf += dgt;
  renderLockDots();
  if (_lockBuf.length === lockTargetLen()) setTimeout(_lockSubmit, 140);
}
function _lockBackspace() { _lockBuf = _lockBuf.slice(0, -1); renderLockDots(); }
function _lockSubmit() {
  if (_lockBuf.length !== lockTargetLen()) return;
  if (_lockMode === 'verify') {
    if (_lockBuf === state.settings.lockPin) { hideLockScreen(); resetLockIdleTimer(); checkForUpdate(); }
    else _lockShake();
  } else if (_lockMode === 'set1') {
    _lockSetFirst = _lockBuf;
    _lockMode = 'set2'; _lockBuf = '';
    _lockEl('lockTitle').textContent = _lockTitleText();
    _lockEl('lockError').hidden = true;
    _lockEl('lockSub').textContent = lockTargetLen() + '桁の数字';
    renderLockDots();
  } else if (_lockMode === 'set2') {
    if (_lockBuf === _lockSetFirst) {
      state.settings.lockPin = _lockBuf;
      state.settings.lockEnabled = true;
      save();
      hideLockScreen();
      renderLockSettings();
      showToast('パスコードを設定しました');
      resetLockIdleTimer();
    } else {
      _lockMode = 'set1';
      _lockEl('lockTitle').textContent = _lockTitleText();
      _lockShake('一致しません。最初から入力してください');
    }
  }
}
function _lockKeyHandler(e) {
  if (e.key >= '0' && e.key <= '9') { e.preventDefault(); _lockPush(e.key); }
  else if (e.key === 'Backspace') { e.preventDefault(); _lockBackspace(); }
  else if (e.key === 'Enter') { e.preventDefault(); _lockSubmit(); }
  else if (e.key === 'Escape' && _lockMode !== 'verify') { e.preventDefault(); _lockCancelSet(); }
}
function _lockCancelSet() {
  hideLockScreen();
  if (!state.settings.lockPin) { state.settings.lockEnabled = false; save(); }
  renderLockSettings();
}

function lockTimeoutMs() {
  const m = LOCK_TIMEOUT_OPTS.includes(state.settings.lockTimeoutMin) ? state.settings.lockTimeoutMin : 5;
  return m * 60_000;
}
function resetLockIdleTimer() {
  clearTimeout(_lockIdleTimer);
  if (!lockHasPin()) return;
  _lockIdleTimer = setTimeout(() => { if (lockHasPin()) showLockScreen('verify'); }, lockTimeoutMs());
}
function _lockIsShowing() {
  const ov = _lockEl('lockOverlay');
  return ov && !ov.hasAttribute('hidden');
}

function initLock() {
  const pad = _lockEl('lockPad');
  // pointerdown を使う：素早い連打でも押した瞬間に反応する。
  // （click だと preventDoubleTapZoom の touchend preventDefault に2回目以降を消されて反応が悪かった）
  if (pad) pad.addEventListener('pointerdown', e => {
    const btn = e.target.closest('[data-k]');
    if (!btn) return;
    e.preventDefault();   // 合成clickの二重発火・ダブルタップズーム・フォーカス移動を防ぐ
    const k = btn.dataset.k;
    if (k === 'del') _lockBackspace();
    else if (/^[0-9]$/.test(k)) _lockPush(k);
  });
  const cancel = _lockEl('lockCancel');
  if (cancel) cancel.addEventListener('click', _lockCancelSet);

  ['pointerdown', 'keydown', 'touchstart'].forEach(ev =>
    document.addEventListener(ev, () => { if (!_lockIsShowing()) resetLockIdleTimer(); }, { passive: true }));

  // 他のアプリ/タブへ移った瞬間にロックし、戻ってきた時も必ずロック状態にする
  document.addEventListener('visibilitychange', () => {
    if (lockHasPin() && !_lockIsShowing()) showLockScreen('verify');
  });

  initLockSettings();

  if (lockHasPin()) showLockScreen('verify');
  else resetLockIdleTimer();
}

function renderLockSettings() {
  const enabled = !!state.settings.lockEnabled && !!state.settings.lockPin;
  const enSeg = _lockEl('lockEnableSeg');
  if (enSeg) enSeg.querySelectorAll('button').forEach(b => b.classList.toggle('is-on', (b.dataset.on === '1') === enabled));
  const opts = _lockEl('lockOptions');
  if (opts) opts.hidden = !enabled;
  const dg = state.settings.lockDigits === 6 ? 6 : 4;
  const dgSeg = _lockEl('lockDigitsSeg');
  if (dgSeg) dgSeg.querySelectorAll('button').forEach(b => b.classList.toggle('is-on', parseInt(b.dataset.d, 10) === dg));
  const tSel = _lockEl('lockTimeoutSel');
  if (tSel) tSel.value = String(LOCK_TIMEOUT_OPTS.includes(state.settings.lockTimeoutMin) ? state.settings.lockTimeoutMin : 5);
}
function initLockSettings() {
  const enSeg = _lockEl('lockEnableSeg');
  if (enSeg) enSeg.addEventListener('click', e => {
    const b = e.target.closest('button[data-on]'); if (!b) return;
    const wantOn = b.dataset.on === '1';
    if (wantOn) {
      if (state.settings.lockPin) { state.settings.lockEnabled = true; save(); renderLockSettings(); }
      else showLockScreen('set1');
    } else {
      state.settings.lockEnabled = false;
      state.settings.lockPin = '';
      save(); clearTimeout(_lockIdleTimer); renderLockSettings();
      showToast('画面ロックをオフにしました');
    }
  });
  const dgSeg = _lockEl('lockDigitsSeg');
  if (dgSeg) dgSeg.addEventListener('click', e => {
    const b = e.target.closest('button[data-d]'); if (!b) return;
    const d = parseInt(b.dataset.d, 10);
    if (d === state.settings.lockDigits && state.settings.lockPin) return;
    state.settings.lockDigits = d;
    state.settings.lockPin = '';
    save();
    showLockScreen('set1');
  });
  const tSel = _lockEl('lockTimeoutSel');
  if (tSel) tSel.addEventListener('change', () => {
    state.settings.lockTimeoutMin = parseInt(tSel.value, 10) || 5;
    save(); resetLockIdleTimer();
  });
  const chg = _lockEl('changePinBtn');
  if (chg) chg.addEventListener('click', () => showLockScreen('set1'));
  renderLockSettings();
}

/* ── Clock ───────────────────────────────────────────────── */
function updateClock() {
  const el = document.getElementById('clockEl');
  if (!el) return;
  const now = new Date();
  const h = String(now.getHours()).padStart(2,'0');
  const m = String(now.getMinutes()).padStart(2,'0');
  el.textContent = `${h}:${m}`;
}

/* ── Theme ───────────────────────────────────────────────── */
function applyTheme(id) {
  document.documentElement.dataset.theme = id || 'indigo';
  state.settings.theme = id || 'indigo';
}

/* ── 外観モード（ライト / ダーク / 自動） ─────────────────────
   色テーマ(data-theme)とは独立した data-mode で明暗を切替。
   'auto' は端末の prefers-color-scheme に追従する。 */
let _darkMql = null;
function resolveDarkMode(appearance) {
  if (appearance === 'dark') return true;
  if (appearance === 'auto') return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  return false; // 'light'
}
function applyAppearance(appearance) {
  appearance = appearance || 'light';
  state.settings.appearance = appearance;
  document.documentElement.dataset.mode = resolveDarkMode(appearance) ? 'dark' : 'light';

  // 'auto' のときだけ端末設定の変化を購読する
  if (window.matchMedia) {
    if (!_darkMql) _darkMql = window.matchMedia('(prefers-color-scheme: dark)');
    _darkMql.onchange = (state.settings.appearance === 'auto')
      ? () => { document.documentElement.dataset.mode = _darkMql.matches ? 'dark' : 'light'; }
      : null;
  }
}

function renderAppearanceSeg() {
  const seg = document.getElementById('appearanceSeg');
  if (!seg) return;
  const cur = state.settings.appearance || 'light';
  seg.querySelectorAll('.appearance-opt').forEach(btn => {
    const active = btn.dataset.appearance === cur;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-checked', active ? 'true' : 'false');
    btn.onclick = () => {
      applyAppearance(btn.dataset.appearance);
      save();
      renderAppearanceSeg();
    };
  });
}

function renderThemeGrid() {
  const grid = document.getElementById('themeGrid');
  if (!grid) return;
  grid.innerHTML = '';
  THEMES.forEach(t => {
    const btn = document.createElement('button');
    btn.className = 'theme-chip' + (state.settings.theme === t.id ? ' active' : '');
    btn.dataset.themeId = t.id;
    btn.title = t.name;
    btn.setAttribute('aria-label', t.name);
    btn.setAttribute('role', 'radio');
    btn.setAttribute('aria-checked', state.settings.theme === t.id ? 'true' : 'false');
    btn.innerHTML = `<span class="theme-chip-swatch" style="background:${THEME_COLORS[t.id] || 'var(--brand)'}"></span>${t.name}`;
    btn.addEventListener('click', () => {
      applyTheme(t.id);
      save();
      renderThemeGrid();
      showToast(`テーマ「${t.name}」を適用しました`);
    });
    grid.appendChild(btn);
  });
}

const VIEW_TRANSITIONS = [
  { id: 'pop',   name: 'ポップ',     emoji: '🫧', desc: '平面から弾むように飛び出す' },
  { id: 'zoom',  name: 'ズーム',     emoji: '🔍', desc: 'ぼかしながら拡大（Apple風）' },
  { id: 'tiles', name: 'タイル',     emoji: '🃏', desc: '立体的に手前へ起き上がる' },
  { id: 'slide', name: 'スライド',   emoji: '➡️', desc: '下からすっと現れる' },
  { id: 'flip',  name: 'フリップ',   emoji: '📖', desc: 'カードをめくるように' },
  { id: 'fade',  name: 'フェード',   emoji: '🌫', desc: 'ふわっと淡く' },
  { id: 'none',  name: 'なし',       emoji: '⏹', desc: '瞬時に切り替え' },
];

function renderTransitionGrid() {
  const grid = document.getElementById('txGrid');
  if (!grid) return;
  grid.innerHTML = '';
  VIEW_TRANSITIONS.forEach(t => {
    const cur = state.settings.viewTransition || 'pop';
    const btn = document.createElement('button');
    btn.className = 'tx-chip' + (cur === t.id ? ' active' : '');
    btn.setAttribute('role', 'radio');
    btn.setAttribute('aria-checked', cur === t.id ? 'true' : 'false');
    btn.innerHTML = `<span class="tx-chip-emoji">${t.emoji}</span><span class="tx-chip-name">${t.name}</span><span class="tx-chip-desc">${escHtml(t.desc)}</span>`;
    btn.addEventListener('click', () => {
      state.settings.viewTransition = t.id;
      save();
      renderTransitionGrid();
      previewTransition(t.id);
    });
    grid.appendChild(btn);
  });
}

/* Replay the chosen effect on the settings view so the user feels it */
function previewTransition(effect) {
  const main = document.getElementById('mainContent');
  const view = document.getElementById('view-settings');
  if (!main || !view) return;
  main.dataset.tx = effect;
  view.classList.remove('view-entering');
  void view.offsetWidth; // reflow to restart animation
  if (effect !== 'none') {
    view.classList.add('view-entering');
    setTimeout(() => view.classList.remove('view-entering'), 620);
  }
}

/* ── Weather ─────────────────────────────────────────────── */
let _weatherCache = null;
let _weatherCacheTime = 0;

async function fetchWeather(lat, lon) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code&hourly=temperature_2m,weather_code,precipitation_probability&forecast_days=1&timezone=Asia%2FTokyo`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('weather fetch failed');
  return res.json();
}

async function loadWeather() {
  const now = Date.now();
  if (_weatherCache && now - _weatherCacheTime < 30 * 60 * 1000) {
    renderWeatherWidget(_weatherCache);
    return;
  }

  let lat = state.settings.weatherLat;
  let lon = state.settings.weatherLon;

  if (!lat || !lon) {
    // Tokyo default
    lat = 35.6895; lon = 139.6917;
  }

  try {
    const data = await fetchWeather(lat, lon);
    _weatherCache = data;
    _weatherCacheTime = now;
    renderWeatherWidget(data);
  } catch (e) {
    const el = document.getElementById('weatherWidget');
    if (el) el.title = '天気の取得に失敗しました';
  }
}

function renderWeatherWidget(data) {
  const cur = data.current;
  if (!cur) return;
  const code = cur.weather_code;
  const temp = Math.round(cur.temperature_2m);
  const [icon, desc] = WC[code] || ['🌡','--'];

  const iconEl = document.getElementById('weatherIcon');
  const tempEl = document.getElementById('weatherTemp');

  if (iconEl) iconEl.textContent = icon;
  if (tempEl) tempEl.textContent = `${temp}°`;
  // Store desc for modal tooltip
  if (tempEl) tempEl.title = desc;

  // Store for modal
  window._weatherData = data;
}

async function openWeatherModal() {
  const modal = document.getElementById('weatherModalBackdrop');
  const detail = document.getElementById('weatherDetail');
  if (!modal || !detail) return;

  await loadWeather();
  const data = window._weatherData;

  if (!data?.hourly) {
    detail.innerHTML = '<p style="padding:16px;color:var(--gray-500)">天気データを取得中...</p>';
    modal.removeAttribute('hidden');
    return;
  }

  const hours = data.hourly.time.map(t => new Date(t));
  const now = new Date();
  // Show next 12 hours from current hour
  const startIdx = Math.max(0, hours.findIndex(h => h >= now));
  const slice = hours.slice(startIdx, startIdx + 12);

  detail.innerHTML = `
    <div class="weather-location">${escHtml(state.settings.weatherName || '東京')}</div>
    <div class="weather-hourly">
      ${slice.map((h, i) => {
        const idx = startIdx + i;
        const code = data.hourly.weather_code[idx];
        const temp = Math.round(data.hourly.temperature_2m[idx]);
        const rain = data.hourly.precipitation_probability?.[idx] ?? 0;
        const [icon, desc] = WC[code] || ['🌡','--'];
        return `<div class="weather-hour-row">
          <span class="wh-time">${String(h.getHours()).padStart(2,'0')}:00</span>
          <span class="wh-icon">${icon}</span>
          <span class="wh-temp">${temp}°</span>
          <span class="wh-desc">${desc}</span>
          ${rain > 0 ? `<span class="wh-rain">☔${rain}%</span>` : '<span class="wh-rain"></span>'}
        </div>`;
      }).join('')}
    </div>
    <div class="weather-footer">
      <button id="weatherLocBtn" class="weather-loc-btn">📍 現在地を使用</button>
      <button id="weatherCityBtn" class="weather-loc-btn">🔍 都市名で設定</button>
      <button id="weatherTokyoBtn" class="weather-loc-btn">東京に戻す</button>
    </div>
    ${window.isSecureContext ? '' : '<div class="weather-note">※ 現在地の自動取得は https か localhost でのみ使えます。LAN(http)経由では「都市名で設定」をお使いください。</div>'}`;

  modal.removeAttribute('hidden');
  document.getElementById('weatherModalClose')?.focus();
  trapFocus(document.getElementById('weatherModal') || modal);

  document.getElementById('weatherLocBtn')?.addEventListener('click', async () => {
    // Geolocation requires a secure context (https or localhost). On a LAN
    // http:// origin it is unavailable, so guide the user to the city search.
    if (!window.isSecureContext || !navigator.geolocation) {
      showToast('現在地はhttps/localhostのみ。「都市名で設定」をお使いください');
      return;
    }
    navigator.geolocation.getCurrentPosition(async pos => {
      state.settings.weatherLat = pos.coords.latitude;
      state.settings.weatherLon = pos.coords.longitude;
      state.settings.weatherName = '現在地';
      _weatherCache = null;
      save();
      await loadWeather();
      modal.setAttribute('hidden', '');
      showToast('現在地の天気に切り替えました');
    }, err => {
      const msg = err.code === 1 ? '位置情報の利用が許可されていません'
                : err.code === 3 ? '位置情報の取得がタイムアウトしました'
                : '位置情報の取得に失敗しました';
      showToast(msg);
    }, { enableHighAccuracy: false, timeout: 8000, maximumAge: 600000 });
  });

  document.getElementById('weatherCityBtn')?.addEventListener('click', async () => {
    const name = await customPrompt('都市名を入力（例: 札幌、大阪、Naha）', state.settings.weatherName || '');
    if (!name || !name.trim()) return;
    try {
      const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name.trim())}&count=1&language=ja&format=json`;
      const res = await fetch(url);
      const geo = await res.json();
      const hit = geo?.results?.[0];
      if (!hit) { showToast('都市が見つかりませんでした'); return; }
      state.settings.weatherLat = hit.latitude;
      state.settings.weatherLon = hit.longitude;
      state.settings.weatherName = hit.name + (hit.admin1 ? `（${hit.admin1}）` : '');
      _weatherCache = null;
      save();
      await loadWeather();
      modal.setAttribute('hidden', '');
      showToast(`${state.settings.weatherName} の天気に切り替えました`);
    } catch (e) {
      showToast('都市の検索に失敗しました');
    }
  });

  document.getElementById('weatherTokyoBtn')?.addEventListener('click', async () => {
    state.settings.weatherLat = 35.6895;
    state.settings.weatherLon = 139.6917;
    state.settings.weatherName = '東京';
    _weatherCache = null;
    save();
    await loadWeather();
    modal.setAttribute('hidden', '');
    showToast('東京の天気に戻しました');
  });
}

/* ── Week Title ──────────────────────────────────────────── */
function renderWeekTitle() {
  const start = state.currentWeekStart;
  const end = addDays(start, 4); // Mon–Fri: +4 days = Friday
  const fmt = d => `${d.getMonth()+1}/${d.getDate()}`;
  document.getElementById('weekTitle').textContent =
    `${start.getFullYear()}年 ${fmt(start)}（月）〜 ${fmt(end)}（金）`;
}

/* ── In-app calendar popover ─────────────────────────────── */
let _calMonth = null; // first day of the month currently shown in the calendar

function toggleWeekCalendar() {
  const pop = document.getElementById('weekCalPop');
  if (!pop) return;
  if (pop.hidden) openWeekCalendar(); else closeWeekCalendar();
}

function openWeekCalendar() {
  const pop = document.getElementById('weekCalPop');
  if (!pop) return;
  const s = state.currentWeekStart;
  _calMonth = new Date(s.getFullYear(), s.getMonth(), 1);
  renderWeekCalendar();
  pop.hidden = false;
  // close when tapping outside (capture so it runs before other handlers)
  setTimeout(() => document.addEventListener('click', _calOutsideClick, true), 0);
}

function closeWeekCalendar() {
  const pop = document.getElementById('weekCalPop');
  if (pop) pop.hidden = true;
  document.removeEventListener('click', _calOutsideClick, true);
}

function _calOutsideClick(e) {
  const pop = document.getElementById('weekCalPop');
  const title = document.getElementById('weekTitle');
  if (!pop) return;
  if (pop.contains(e.target) || e.target === title) return;
  closeWeekCalendar();
}

function shiftCalMonth(delta) {
  if (!_calMonth) return;
  _calMonth = new Date(_calMonth.getFullYear(), _calMonth.getMonth() + delta, 1);
  renderWeekCalendar();
}

function pickCalendarDate(dateStr) {
  state.currentWeekStart = getWeekStart(new Date(dateStr + 'T00:00:00'));
  renderWeekTitle();
  renderWeekGrid();
  closeWeekCalendar();
}

function renderWeekCalendar() {
  const grid = document.getElementById('weekCalGrid');
  const label = document.getElementById('weekCalMonth');
  if (!grid || !_calMonth) return;
  const y = _calMonth.getFullYear(), m = _calMonth.getMonth();
  if (label) label.textContent = `${y}年${m + 1}月`;

  const selStart = formatDate(state.currentWeekStart);
  const selEnd = formatDate(addDays(state.currentWeekStart, 6)); // highlight whole Mon–Sun week
  const gridStart = getWeekStart(new Date(y, m, 1)); // Monday on/before the 1st
  const dow = ['月', '火', '水', '木', '金', '土', '日'];

  let html = dow.map((d, i) => `<div class="week-cal-dow${i >= 5 ? ' wknd' : ''}">${d}</div>`).join('');
  for (let i = 0; i < 42; i++) {
    const dt = addDays(gridStart, i);
    const ds = formatDate(dt);
    const cls = ['week-cal-day'];
    if (dt.getMonth() !== m) cls.push('other');
    if ((i % 7) >= 5) cls.push('wknd');
    if (ds >= selStart && ds <= selEnd) cls.push('in-week');
    if (isToday(dt)) cls.push('today');
    html += `<button type="button" class="${cls.join(' ')}" data-date="${ds}">${dt.getDate()}</button>`;
  }
  grid.innerHTML = html;
}

/* ── Week Grid ───────────────────────────────────────────── */
/* アイコン群（週案タイル・進度表など複数箇所で使い回すため共有定数にしてある） */
const ICON_CLIP = '<svg viewBox="0 0 16 16" fill="none" width="13" height="13" aria-hidden="true"><path d="M11 5L6 10a1.5 1.5 0 002 2l5-5a3 3 0 00-4-4l-5 5a4.5 4.5 0 006 6l4-4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';

/* Build the inner HTML of a lesson tile */
function lessonTileHtml(lesson) {
  const subjectObj = getSubjectById(lesson.subjectId);
  const subjectName = subjectObj?.name || (lesson.title ? '' : '記録');
  const hasPhoto = !!(lesson.photos?.length);
  const hasHw    = !!(lesson.hwPages?.some(Boolean));
  const hasNote  = !!(lesson.note && lesson.note.trim());
  const hwIcon   = '<svg viewBox="0 0 16 16" fill="none" width="13" height="13" aria-hidden="true"><path d="M3 13l2-.5 7-7-1.5-1.5-7 7L3 13z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><path d="M9.5 4l1.5 1.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>';
  const noteIcon = '<svg viewBox="0 0 16 16" fill="none" width="13" height="13" aria-hidden="true"><path d="M3 3h10v10H6l-3-3V3z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><path d="M5.5 6h5M5.5 8.5h3" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>';
  return `
    <div class="tile-head">
      <span class="tile-subject">${escHtml(subjectName)}</span>
      ${lesson.className ? `<span class="tile-class">${escHtml(lesson.className)}</span>` : ''}
    </div>
    ${lesson.title ? `<span class="tile-title">${escHtml(lesson.title)}</span>` : ''}
    <div class="tile-icons">
      ${hasNote  ? `<span class="tile-icon" title="ノート">${noteIcon}</span>` : ''}
      ${hasPhoto ? `<span class="tile-icon tile-icon--clip" title="添付ファイル">${ICON_CLIP}</span>` : ''}
      ${hasHw    ? `<span class="tile-icon tile-icon--hw" title="手書き">${hwIcon}</span>` : ''}
    </div>`;
}

/* Append a lesson cell (period can be a number or 'after') */
function appendLessonCell(grid, date, period, slim) {
  const key = lessonKey(date, period);
  const lesson = state.lessons[key];
  const cell = document.createElement('div');
  cell.className = 'grid-cell' + (lesson ? ' has-lesson' : '') + (slim ? ' grid-cell--slim' : '');
  cell.setAttribute('role', 'gridcell');
  cell.dataset.key = key;
  if (lesson) {
    const tile = document.createElement('button');
    const subjectObj = getSubjectById(lesson.subjectId);
    tile.className = 'lesson-tile' + (subjectObj ? '' : ' lesson-tile--nosubject');
    tile.style.setProperty('--tile-color', getSubjectColor(lesson.subjectId));
    tile.innerHTML = lessonTileHtml(lesson);
    tile.addEventListener('click', () => openLessonModal(key, date, period));
    cell.appendChild(tile);
  } else {
    const btn = document.createElement('button');
    btn.className = 'empty-cell-btn';
    btn.textContent = '+';
    btn.addEventListener('click', () => openLessonModal(key, date, period));
    cell.appendChild(btn);
  }
  grid.appendChild(cell);
}

/* 週案グリッドの該当コマを一瞬光らせて知らせる（出席→週案ジャンプ時など） */
function flashLessonCell(key) {
  const grid = document.getElementById('weekGrid');
  if (!grid) return;
  const cell = grid.querySelector('.grid-cell[data-key="' + key + '"]');
  if (!cell) return;
  cell.classList.remove('lesson-flash'); void cell.offsetWidth; cell.classList.add('lesson-flash');
  try { cell.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (e) {}
  setTimeout(() => cell.classList.remove('lesson-flash'), 2600);
}

/* 行事の展開ポップオーバー（週案の行事セルをタップ → 全項目表示＆編集） */
let _eventPop = null;
function openEventPopover(mk, day, anchor) {
  let pop = document.getElementById('eventPopover');
  if (!pop) {
    pop = document.createElement('div'); pop.id = 'eventPopover'; pop.className = 'event-popover'; pop.hidden = true;
    document.body.appendChild(pop);
    document.addEventListener('click', e => {
      if (pop.hidden) return;
      if (e.target.closest('#eventPopover') || e.target.closest('.grid-event-cell')) return;
      _saveEventPopover(); pop.hidden = true;
    });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && !pop.hidden) { pop.hidden = true; } });
  }
  _eventPop = { mk, day };
  const dayMap = (state.events[mk] && !Array.isArray(state.events[mk])) ? state.events[mk] : {};
  const items = String(dayMap[day] || '').split(/[\s　]+/).filter(Boolean);
  pop.innerHTML = `
    <div class="event-pop-title">${mk.slice(5)}/${day} の行事</div>
    ${items.length ? `<ul class="event-pop-list">${items.map(it => `<li>${escHtml(it)}</li>`).join('')}</ul>` : '<div class="event-pop-empty">まだ行事がありません</div>'}
    <label class="event-pop-label">編集（スペース／改行で項目を区切る）</label>
    <textarea class="event-pop-edit" id="eventPopEdit" rows="3">${escHtml(items.join('\n'))}</textarea>
    <div class="event-pop-actions">
      <button type="button" class="btn-ghost" id="eventPopClose">閉じる</button>
      <button type="button" class="btn-primary" id="eventPopSave">保存</button>
    </div>`;
  pop.querySelector('#eventPopSave').addEventListener('click', () => { _saveEventPopover(); pop.hidden = true; });
  pop.querySelector('#eventPopClose').addEventListener('click', () => { pop.hidden = true; });
  const r = anchor.getBoundingClientRect();
  pop.hidden = false;   // 表示してからサイズを測って位置調整
  const pw = pop.offsetWidth || 280, ph = pop.offsetHeight || 220;
  pop.style.left = Math.max(8, Math.min(Math.round(r.left), window.innerWidth - pw - 8)) + 'px';
  pop.style.top = Math.min(Math.round(r.bottom + 6), window.innerHeight - ph - 8) + 'px';
}
function _saveEventPopover() {
  if (!_eventPop) return;
  const { mk, day } = _eventPop;
  const el = document.getElementById('eventPopEdit');
  if (!el) return;
  const v = el.value.trim().replace(/[\s　]+/g, ' ');   // 空白（半角/全角/改行）を1つのスペースに正規化
  if (!state.events[mk] || Array.isArray(state.events[mk])) state.events[mk] = {};
  if (v) state.events[mk][day] = v; else delete state.events[mk][day];
  save();
  renderWeekGrid();
  if (state.activeView === 'events' && typeof renderEvents === 'function') renderEvents();
}

/* 時限の表示名（morning=朝 / after=放課後 / それ以外=N時限） */
function periodLabelOf(p) {
  return p === 'morning' ? '朝' : (p === 'after' ? '放課後' : `${p}時限`);
}

function renderWeekGrid() {
  const grid = document.getElementById('weekGrid');
  const periods = state.settings.periodsCount;
  const lunchAfter = state.settings.lunchAfter || 4;
  const times = state.settings.periodTimes || [];
  const start = state.currentWeekStart;
  const days = [0,1,2,3,4].map(d => addDays(start, d));
  const monthKeyOf = dt => `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}`;

  grid.innerHTML = '';

  // Build grid-template-rows.
  // 1〜6時限（=1fr）を主役に最大化し、行事・朝・放課後・昼は必要最小限に固定する。
  //   header / 行事(2行ぴったり固定) / 朝(狭め) / [periods=1fr, 昼=細] / 放課後(狭め)
  const rowSpec = ['54px', '44px', 'minmax(34px, auto)'];  // header, 行事(2行固定), 朝(狭め)
  for (let p = 1; p <= periods; p++) {
    rowSpec.push('minmax(0, 1fr)');
    if (p === lunchAfter) rowSpec.push('minmax(22px, auto)'); // 昼(細)
  }
  rowSpec.push('minmax(34px, auto)'); // 放課後(狭め)
  grid.style.gridTemplateRows = rowSpec.join(' ');

  // ── Header row ──
  const emptyHeader = document.createElement('div');
  emptyHeader.className = 'grid-day-header time-col';
  grid.appendChild(emptyHeader);
  days.forEach((date, d) => {
    const header = document.createElement('div');
    header.className = 'grid-day-header' + (isToday(date) ? ' today' : '');
    header.innerHTML = `<div class="grid-day-name">${DAYS[d]}</div><div class="grid-day-date">${date.getDate()}</div>`;
    grid.appendChild(header);
  });

  // ── 今日の行事 row (events, above period 1) ──
  const evLabel = document.createElement('div');
  evLabel.className = 'grid-special-label grid-event-label';
  evLabel.textContent = '行事';
  grid.appendChild(evLabel);
  days.forEach(date => {
    const mk = monthKeyOf(date);
    const dayMap = (state.events[mk] && !Array.isArray(state.events[mk])) ? state.events[mk] : {};
    const txt = dayMap[date.getDate()] || '';
    const cell = document.createElement('div');
    cell.className = 'grid-event-cell' + (txt ? ' has-event' : '');
    const items = txt.split(/[\s　]+/).filter(Boolean);   // スペース区切りで項目化
    const MAXL = 2;   // 常に2行。あふれたら右下に「＋N」
    let inner = items.slice(0, MAXL).map(it => `<span class="ev-item">${escHtml(it)}</span>`).join('');
    if (items.length > MAXL) inner += `<span class="ev-more">＋${items.length - MAXL}</span>`;
    cell.innerHTML = inner;
    cell.title = items.join('\n');
    cell.addEventListener('click', () => openEventPopover(mk, date.getDate(), cell));
    grid.appendChild(cell);
  });

  // ── 朝 row (before period 1) ──
  const amLabel = document.createElement('div');
  amLabel.className = 'grid-special-label grid-morning-label';
  amLabel.textContent = '朝';
  grid.appendChild(amLabel);
  days.forEach(date => appendLessonCell(grid, date, 'morning', true));

  // ── Period rows (insert lunch after lunchAfter) ──
  for (let p = 1; p <= periods; p++) {
    const label = document.createElement('div');
    label.className = 'grid-period-label';
    label.innerHTML = `<span class="gp-num">${p}</span>
      <input class="gp-time" value="${escHtml(times[p-1] || '')}" data-period="${p}" placeholder="--:--" aria-label="${p}時限の開始時刻" />`;
    grid.appendChild(label);
    days.forEach(date => appendLessonCell(grid, date, p));

    if (p === lunchAfter) {
      // 昼休み row
      const ll = document.createElement('div');
      ll.className = 'grid-special-label grid-lunch-label';
      ll.textContent = '昼';
      grid.appendChild(ll);
      days.forEach(date => {
        const ds = formatDate(date);
        const cell = document.createElement('div');
        cell.className = 'grid-lunch-cell';
        const inp = document.createElement('input');
        inp.className = 'lunch-input';
        inp.value = state.lunch[ds] || '';
        inp.placeholder = '';
        inp.setAttribute('aria-label', `${formatDate(date)}の昼休みメモ`);
        inp.addEventListener('input', () => {
          const v = inp.value.trim();
          if (v) state.lunch[ds] = v; else delete state.lunch[ds];
          saveSoft();
        });
        cell.appendChild(inp);
        grid.appendChild(cell);
      });
    }
  }

  // ── 放課後 row (after-school lesson cards) ──
  const asLabel = document.createElement('div');
  asLabel.className = 'grid-special-label grid-after-label';
  asLabel.textContent = '放課後';
  grid.appendChild(asLabel);
  days.forEach(date => appendLessonCell(grid, date, 'after', true));

  /* Current-time indicator bar */
  renderCurrentTimeBar(grid, periods);

  /* Wire period-time inputs */
  grid.querySelectorAll('.gp-time').forEach(inp => {
    inp.addEventListener('change', () => {
      const p = parseInt(inp.dataset.period, 10);
      if (!state.settings.periodTimes) state.settings.periodTimes = [];
      state.settings.periodTimes[p-1] = inp.value.trim();
      save();
      renderCurrentTimeBar(grid, periods);
    });
    inp.addEventListener('click', e => e.stopPropagation());
  });
}

/* Parse "HH:MM" → minutes since midnight */
function parseTimeMin(t) {
  const m = String(t || '').match(/(\d{1,2})\s*[:：]\s*(\d{1,2})/);
  return m ? parseInt(m[1],10)*60 + parseInt(m[2],10) : null;
}

function renderCurrentTimeBar(grid, periods) {
  const oldBar = grid.querySelector('.nbar');
  if (oldBar) oldBar.remove();

  const now = new Date();
  // only show if this week contains today (Mon–Fri)
  const diffDays = Math.floor((now - state.currentWeekStart) / 86400000);
  if (diffDays < 0 || diffDays > 4) return;

  const nowMin = now.getHours() * 60 + now.getMinutes();
  const labels = [...grid.querySelectorAll('.grid-period-label')];
  if (!labels.length) return;
  const times = (state.settings.periodTimes || []).map(parseTimeMin);

  // collect periods that have a valid start time
  const pts = [];
  labels.forEach((el, i) => {
    if (times[i] != null) pts.push({ t: times[i], top: el.offsetTop, h: el.offsetHeight });
  });
  if (!pts.length) return;

  let y = null;
  if (nowMin < pts[0].t) return; // before first lesson → no bar
  for (let i = 0; i < pts.length; i++) {
    const cur = pts[i], nxt = pts[i+1];
    if (nxt && nowMin >= cur.t && nowMin < nxt.t) {
      const frac = (nowMin - cur.t) / (nxt.t - cur.t);
      y = cur.top + frac * (nxt.top - cur.top);
      break;
    }
    if (!nxt && nowMin >= cur.t) {
      // within the last period only — hide once it has ended
      const dur = state.settings.lessonDuration || 50;
      if (nowMin > cur.t + dur) return;   // 最終時限が終わったら赤線を消す
      const frac = (nowMin - cur.t) / dur;
      y = cur.top + frac * cur.h;
    }
  }
  if (y == null) return;

  const bar = document.createElement('div');
  bar.className = 'nbar';
  bar.style.top = `${y}px`;
  grid.appendChild(bar);
}

/* ── Navigation ──────────────────────────────────────────── */
function navigateWeek(delta) {
  state.currentWeekStart = addDays(state.currentWeekStart, delta * 7);
  renderWeekTitle();
  renderWeekGrid();
  updateStats();
}

function goToToday() {
  state.currentWeekStart = getWeekStart(new Date());
  renderWeekTitle();
  renderWeekGrid();
  updateStats();
}

/* ── View Switching ──────────────────────────────────────── */
/* Render the content for a view (called when it becomes active) */
function renderViewContent(viewId) {
  if (viewId === 'todo')        renderTodoView();
  if (viewId === 'photos')      renderPhotoGallery();
  if (viewId === 'notes')       renderNotesList();
  if (viewId === 'progress')    renderProgressTable();
  if (viewId === 'events')      renderEventsGrid();
  if (viewId === 'settings')    renderSettings();
  if (viewId === 'roster')      renderRoster();
  if (viewId === 'attendance')  renderAttendance();
  if (viewId === 'evaluation')  renderEvaluation();
  if (viewId === 'print')       updatePrintWeekRange();
}

let _txTimers = [];
function _clearTxTimers() { _txTimers.forEach(clearTimeout); _txTimers = []; }

function switchView(viewId) {
  if (viewId === state.activeView && document.getElementById(`view-${viewId}`)?.classList.contains('active')) return;

  const main = document.getElementById('mainContent');
  const current = document.querySelector('.view.active');
  const next = document.getElementById(`view-${viewId}`);
  const effect = state.settings.viewTransition || 'pop';

  // update nav highlight immediately
  document.querySelectorAll('.nav-item').forEach(n => { n.classList.remove('active'); n.removeAttribute('aria-current'); });
  const navEl = document.querySelector(`.nav-item[data-view="${viewId}"]`);
  if (navEl) { navEl.classList.add('active'); navEl.setAttribute('aria-current', 'page'); }
  state.activeView = viewId;
  document.body.dataset.view = viewId;
  if (viewId === 'import') updateStorageMeter();   // バックアップ画面で保存容量を更新

  // 一部の広い画面（ToDo/名簿/出席/評価/進度）では右パネルを畳んで広く使う
  const wideViews = ['todo', 'roster', 'attendance', 'evaluation', 'progress'];
  const panel = document.getElementById('contextPanel');
  if (panel && window.innerWidth >= 768) {
    panel.classList.toggle('collapsed', wideViews.includes(viewId));
    document.getElementById('contextToggleBtn')?.setAttribute('aria-expanded', wideViews.includes(viewId) ? 'false' : 'true');
  }

  const finalize = () => {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active', 'view-leaving', 'view-entering'));
    if (next) next.classList.add('active');
    renderViewContent(viewId);
  };

  _clearTxTimers();
  if (main) main.dataset.tx = effect;

  if (effect === 'none' || !current || current === next || !next) {
    finalize();
    return;
  }

  // Phase 1: animate current out
  current.classList.add('view-leaving');
  const LEAVE = 150;
  _txTimers.push(setTimeout(() => {
    // Phase 2: swap + animate in
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active', 'view-leaving'));
    next.classList.add('active', 'view-entering');
    renderViewContent(viewId);
    _txTimers.push(setTimeout(() => next.classList.remove('view-entering'), 620));
  }, LEAVE));
}

/* ── Lesson Modal ────────────────────────────────────────── */
let currentLessonKey = null;
let currentMode = 'text';
let _lastMode = 'text';   // 直近に選んだモード（次に開く時のデフォルト）
let hwPageIndex = 0;
let lessonTags = [];
let lessonPhotos = [];

let _lmDate = null, _lmPeriod = null;   // 現在編集中の授業の日付・時限（出席受付用）

function openLessonModal(key, date, period) {
  currentLessonKey = key;
  _lmDate = key.split('_')[0];
  _lmPeriod = period;
  const lesson = state.lessons[key] || {};

  populateSubjectSelect();
  document.getElementById('lessonSubject').value = lesson.subjectId || '';
  populateClassSelect(lesson.className || '');
  document.getElementById('lessonClass').value = lesson.className || '';

  const dayIdx = [0,1,2,3,4,5].find(i => formatDate(addDays(state.currentWeekStart, i)) === key.split('_')[0]) ?? 0;
  const periodLabel = periodLabelOf(period);
  // 同じ教科・学級の中で何回目か（保存済みの内容に基づく）
  let occInfo = '';
  if (lesson.subjectId && lesson.className) {
    const occ = subjectOccurrences(lesson.subjectId, lesson.className);
    const idx = occ.findIndex(o => o.key === key);
    if (idx >= 0) occInfo = `　・${idx + 1}回目 / 全${occ.length}回`;
  }
  document.getElementById('lessonPeriodInfo').textContent = `${DAYS[dayIdx]}曜 ${periodLabel}${occInfo}`;

  // 出席受付：この日・時限・学級の出席状況＋受付起動ボタン
  renderLessonAttendance(key.split('_')[0], period);

  document.getElementById('lessonTitle').value = lesson.title || '';
  document.getElementById('lessonNote').value  = lesson.note  || '';

  lessonTags   = [...(lesson.tags   || [])];
  lessonPhotos = [...(lesson.photos || [])];
  hwPageIndex  = 0;

  renderModalTags('tagsContainer', 'tagInput', lessonTags);
  renderModalPhotos();
  updateHwPageInfo();
  // この時限に保存されたモードがあればそれを、無ければ直近のモードで開く
  setMode(lesson.mode || _lastMode);
  updateAutosave('');

  document.getElementById('lessonModalBackdrop').removeAttribute('hidden');
  // Don't auto-focus a field — on iPad that pops the subject dropdown / keyboard.
  trapFocus(document.getElementById('lessonModal'));
}

/* 授業モーダル内の出席受付ボタン＋出欠サマリーを描画 */
function renderLessonAttendance(dateStr, period) {
  const attEl = document.getElementById('lmAttendance');
  if (!attEl) return;
  const cls = document.getElementById('lessonClass')?.value || '';
  attEl.hidden = false;

  if (!cls) {
    attEl.innerHTML = `<div class="lm-att-empty">学級を選ぶと、この時間の出席受付ができます</div>`;
    return;
  }

  // この日・時限の受付のうち、この学級のもの（学級名の全角/半角・学校名プレフィックスを吸収）
  const target = normClass(cls);
  const sameClass = (className, schoolId) => {
    const c = normClass(className);
    if (c === target) return true;
    const school = state.schools.find(s => s.id === schoolId);
    return !!(school && normClass(school.name + className) === target);
  };
  const recs = state.reception.filter(r => {
    if (r.date !== dateStr || String(r.period) !== String(period)) return false;
    if (sameClass(r.className, null)) return true;
    const st = state.students.find(s => s.id === r.studentId);
    return st ? sameClass(st.className, st.schoolId) : false;
  });
  const presentIds = new Set(recs.map(r => r.studentId));
  // 欠席算出用の名簿：出席者がいればその学校に絞る（同名学級の他校混入を防ぐ）
  const schoolsOfPresent = new Set(recs.map(r => state.students.find(s => s.id === r.studentId)?.schoolId).filter(Boolean));
  const roster = state.students
    .filter(s => sameClass(s.className, s.schoolId) && (!schoolsOfPresent.size || schoolsOfPresent.has(s.schoolId)))
    .sort((a, b) => (a.number || 0) - (b.number || 0));
  const absentList = roster.filter(s => !presentIds.has(s.id));
  const forgotRecs = recs.filter(r => (r.items || []).length);

  const nameOf = r => r.name || state.students.find(s => s.id === r.studentId)?.name || r.studentId;
  const chips = arr => arr.length ? arr.join('') : '<span class="lm-att-none">なし</span>';
  const presentChips = chips(recs.filter(r => !(r.items || []).length).map(r => `<span class="lm-chip">${escHtml(nameOf(r))}</span>`));
  const forgotChips = chips(forgotRecs.map(r => `<span class="lm-chip lm-chip--forgot">${escHtml(nameOf(r))}<small>${escHtml((r.items || []).join('・'))}</small></span>`));
  const absentChips = chips(absentList.map(s => `<span class="lm-chip lm-chip--absent">${escHtml(s.name)}</span>`));

  attEl.innerHTML = `
    <button class="lm-att-btn" id="lmReceptionBtn">
      <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><path d="M2 8l3 3 5-7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
      この時間の出席受付（QR / 手入力）
    </button>
    ${(recs.length || roster.length) ? `<button class="lm-att-summary" id="lmAttToggle" aria-expanded="false">
      <span class="lm-att-stat lm-att-present">出席 <b>${recs.length}</b></span>
      <span class="lm-att-stat lm-att-absent">欠席 <b>${absentList.length}</b></span>
      ${forgotRecs.length ? `<span class="lm-att-stat lm-att-forgot">忘れ物 <b>${forgotRecs.length}</b></span>` : ''}
      <span class="lm-att-total">/ ${roster.length || recs.length}名</span>
      <span class="lm-att-caret" aria-hidden="true">▾</span>
    </button>
    <div class="lm-att-lists" id="lmAttLists" hidden>
      <div class="lm-att-row"><span class="lm-att-label lm-att-label--absent">欠席</span><div class="lm-chips">${absentChips}</div></div>
      ${forgotRecs.length ? `<div class="lm-att-row"><span class="lm-att-label lm-att-label--forgot">忘れ物</span><div class="lm-chips">${forgotChips}</div></div>` : ''}
      <div class="lm-att-row"><span class="lm-att-label lm-att-label--present">出席</span><div class="lm-chips">${presentChips}</div></div>
    </div>` : `<div class="lm-att-summary lm-att-summary--static">
      <span class="lm-att-stat lm-att-present">出席 <b>0</b></span>
      <span class="lm-att-total">まだ受付がありません</span>
    </div>`}`;

  attEl.querySelector('#lmReceptionBtn').addEventListener('click', () => {
    const d = dateStr, p = period;
    const r = resolveLessonClass(cls);   // 学校＋名簿上の正式な学級名を解決して引き継ぐ
    closeLessonModal();
    setTimeout(() => openReception({ date: d, period: p, cls: r.name, schoolId: r.schoolId || undefined }), 230);
  });
  attEl.querySelector('#lmAttToggle')?.addEventListener('click', () => {
    const lists = attEl.querySelector('#lmAttLists');
    const btn = attEl.querySelector('#lmAttToggle');
    const open = lists.hasAttribute('hidden');
    if (open) lists.removeAttribute('hidden'); else lists.setAttribute('hidden', '');
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    btn.classList.toggle('open', open);
  });
}
function animateModalClose(backdrop, after) {
  if (!backdrop || backdrop.hasAttribute('hidden')) { after?.(); return; }
  backdrop.classList.add('closing');
  setTimeout(() => {
    backdrop.classList.remove('closing');
    backdrop.setAttribute('hidden', '');
    after?.();
  }, 240);
}

function closeLessonModal() {
  // Cancel any queued autosave so it can't re-write (and revive) a lesson
  // after it was deleted or the modal was closed.
  clearTimeout(autosaveTimer);
  animateModalClose(document.getElementById('lessonModalBackdrop'), () => {
    currentLessonKey = null;
    releaseFocus();
  });
}

function saveLessonModal() {
  if (!currentLessonKey) return;
  const title   = document.getElementById('lessonTitle').value.trim();
  const note    = document.getElementById('lessonNote').value;
  const subject = document.getElementById('lessonSubject').value;
  const cls     = document.getElementById('lessonClass').value;

  const prev = state.lessons[currentLessonKey] || {};
  const hasHw = !!(prev.hwPages?.some(Boolean));
  // Record even without subject/class (free time, sub teaching, etc.).
  // Only delete when there is truly nothing to keep.
  if (!title && !note && !subject && !cls && !lessonPhotos.length && !hasHw) {
    delete state.lessons[currentLessonKey];
  } else {
    state.lessons[currentLessonKey] = {
      ...prev,
      subjectId: subject, className: cls, title, note,
      tags: [...lessonTags], photos: [...lessonPhotos], mode: currentMode,
    };
  }
  save();
  renderWeekGrid();
  updateStats();
  showAutosave('保存済み');
  closeLessonModal();
}

/* ── Move lesson to another day / period ─────────────────── */
function openMoveLessonPicker() {
  if (!currentLessonKey) return;

  const overlay = document.createElement('div');
  overlay.className = 'move-picker-overlay';
  overlay.innerHTML = `
    <div class="move-picker">
      <div class="move-picker-head">
        <span>移動先を選んでください</span>
        <button class="modal-close-btn" id="movePickerClose" aria-label="閉じる">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M15 5L5 15M5 5l10 10" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
        </button>
      </div>
      <div class="move-grid" id="moveGrid"></div>
    </div>`;
  document.body.appendChild(overlay);

  const grid = overlay.querySelector('#moveGrid');
  const periods = state.settings.periodsCount;
  grid.style.gridTemplateColumns = `40px repeat(5, 1fr)`;

  // header row
  grid.appendChild(cellEl('move-cell move-cell--corner', ''));
  for (let d = 0; d < 5; d++) grid.appendChild(cellEl('move-cell move-cell--head', DAYS[d]));

  for (let p = 1; p <= periods; p++) {
    grid.appendChild(cellEl('move-cell move-cell--period', `${p}`));
    for (let d = 0; d < 5; d++) {
      const date = addDays(state.currentWeekStart, d);
      const key = lessonKey(date, p);
      const occupied = !!state.lessons[key];
      const isCurrent = key === currentLessonKey;
      const btn = document.createElement('button');
      btn.className = 'move-cell move-slot'
        + (occupied ? ' occupied' : '')
        + (isCurrent ? ' current' : '');
      btn.textContent = isCurrent ? '今ここ' : (occupied ? '●' : '＋');
      btn.disabled = isCurrent;
      btn.addEventListener('click', () => moveLessonTo(key, occupied, overlay));
      grid.appendChild(btn);
    }
  }

  function cellEl(cls, txt) { const el = document.createElement('div'); el.className = cls; el.textContent = txt; return el; }

  overlay.querySelector('#movePickerClose').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
}

function collectLessonFromForm() {
  return {
    subjectId: document.getElementById('lessonSubject').value,
    className: document.getElementById('lessonClass').value,
    title:     document.getElementById('lessonTitle').value.trim(),
    note:      document.getElementById('lessonNote').value,
    tags:      [...lessonTags],
    photos:    [...lessonPhotos],
    hwPages:   state.lessons[currentLessonKey]?.hwPages || [],
    mode:      currentMode,
  };
}

async function moveLessonTo(newKey, occupied, overlay) {
  if (newKey === currentLessonKey) return;
  if (occupied) {
    const ok = await customConfirm('移動先には既に授業があります。入れ替えますか?');
    if (!ok) return;
  }
  const moving   = collectLessonFromForm();
  const existing = state.lessons[newKey];

  state.lessons[newKey] = moving;
  if (occupied && existing) state.lessons[currentLessonKey] = existing; // swap
  else delete state.lessons[currentLessonKey];

  save();
  renderWeekGrid();
  updateStats();
  overlay?.remove();
  closeLessonModal();
  showToast(occupied ? '授業を入れ替えました' : '授業を移動しました');
}

/* ── Global search ───────────────────────────────────────── */
function openSearch() {
  let overlay = document.getElementById('searchOverlay');
  if (overlay) { overlay.querySelector('#searchInput').focus(); return; }
  overlay = document.createElement('div');
  overlay.id = 'searchOverlay';
  overlay.className = 'search-overlay';
  overlay.innerHTML = `
    <div class="search-box">
      <div class="search-input-row">
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><circle cx="9" cy="9" r="6" stroke="currentColor" stroke-width="1.8"/><path d="M13.5 13.5l3.5 3.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
        <input type="search" id="searchInput" placeholder="授業・メモ・ToDo・生徒を検索…" aria-label="検索" />
        <button class="modal-close-btn" id="searchClose" aria-label="閉じる">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M15 5L5 15M5 5l10 10" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
        </button>
      </div>
      <div class="search-results" id="searchResults"></div>
    </div>`;
  document.body.appendChild(overlay);
  const input = overlay.querySelector('#searchInput');
  input.addEventListener('input', () => runSearch(input.value, overlay));
  overlay.querySelector('#searchClose').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  document.addEventListener('keydown', function esc(e){ if (e.key === 'Escape') { overlay.remove(); document.removeEventListener('keydown', esc); } });
  setTimeout(() => input.focus(), 40);
  runSearch('', overlay);
}

function runSearch(query, overlay) {
  const q = query.toLowerCase().trim();
  const out = overlay.querySelector('#searchResults');
  if (!q) { out.innerHTML = '<p class="search-hint">キーワードを入力してください。</p>'; return; }

  const results = [];
  // lessons
  Object.entries(state.lessons).forEach(([key, l]) => {
    const text = `${getSubjectById(l.subjectId)?.name||''} ${l.className||''} ${l.title||''} ${l.note||''}`;
    if (text.toLowerCase().includes(q)) {
      const [dateStr, period] = key.split('_');
      results.push({ type:'授業', label:`${l.title || getSubjectById(l.subjectId)?.name || '授業'}`, sub:`${dateStr} ${period}限`, action:()=>{ state.currentWeekStart = getWeekStart(new Date(dateStr+'T00:00:00')); renderWeekTitle(); renderWeekGrid(); switchView('weekly'); } });
    }
  });
  // notes
  state.notes.forEach(n => {
    if (`${n.title||''} ${n.content||''} ${(n.tags||[]).join(' ')}`.toLowerCase().includes(q))
      results.push({ type:'メモ', label: noteTitle(n), sub:(n.content||'').slice(0,40), action:()=>{ switchView('notes'); openNote(n.id); } });
  });
  // todos
  [...state.todos, ...state.longTodos].forEach(t => {
    if ((t.text||'').toLowerCase().includes(q))
      results.push({ type:'ToDo', label:t.text, sub: t.done?'完了':'未完了', action:()=>switchView('todo') });
  });
  // students
  state.students.forEach(s => {
    if (`${s.name||''} ${s.kana||''} ${s.className||''}`.toLowerCase().includes(q))
      results.push({ type:'生徒', label:s.name, sub:s.className, action:()=>{ state.rosterClass=s.className; switchView('roster'); } });
  });

  if (!results.length) { out.innerHTML = '<p class="search-hint">一致する結果がありません。</p>'; return; }
  out.innerHTML = '';
  results.slice(0, 40).forEach(r => {
    const item = document.createElement('button');
    item.className = 'search-result';
    item.innerHTML = `<span class="search-result-type">${r.type}</span>
      <span class="search-result-main"><span class="search-result-label">${escHtml(r.label)}</span>
      <span class="search-result-sub">${escHtml(r.sub||'')}</span></span>`;
    item.addEventListener('click', () => { overlay.remove(); r.action(); });
    out.appendChild(item);
  });
}

function setMode(mode) {
  currentMode = mode;
  _lastMode = mode;   // 状態を記憶
  const note  = document.getElementById('lessonNote');
  const hw     = document.getElementById('lmHw');
  const sw     = document.getElementById('hwModeSwitch');
  const label  = document.getElementById('lmEditorLabel');
  if (!note || !hw) return;

  if (mode === 'handwriting') {
    note.classList.add('hidden');
    hw.classList.remove('hidden');
    sw?.classList.add('on'); sw?.setAttribute('aria-checked', 'true');
    if (label) label.textContent = '手書き';
    if (!hwColors().includes(_lmHwColor)) _lmHwColor = hwColors()[0];
    renderHwColorRows();
    setTimeout(initLmHwCanvas, 30);
  } else {
    hw.classList.add('hidden');
    note.classList.remove('hidden');
    sw?.classList.remove('on'); sw?.setAttribute('aria-checked', 'false');
    if (label) label.textContent = 'ノート';
  }
}

/* ── Inline handwriting (in the lesson modal right column) ── */
let _lmHwCtx = null, _lmHwDrawing = false, _lmHwTool = 'pen',
    _lmHwColor = '#1a1a1a', _lmHwSize = 3, _lmHwUndo = [], _lmHwRedo = [];

function initLmHwCanvas() {
  const canvas = document.getElementById('lmHwCanvas');
  const wrap   = document.getElementById('lmHwCanvasWrap');
  if (!canvas || !wrap) return;
  const rect = wrap.getBoundingClientRect();
  const w = Math.round(rect.width)  || 640;
  const h = Math.round(rect.height) || 380;
  if (w < 50 || h < 50) { setTimeout(initLmHwCanvas, 60); return; } // layout not ready yet
  // 高精細バックバッファ：表示が小さいモーダル側でも最低でも横〜1600pxで描画し、
  // 全画面と同等の解像度にする（拡大/縮小しても文字がかくかく・ぼやけないように）。
  const dpr = Math.min(4, Math.max(Math.min(window.devicePixelRatio || 1, 3), 1600 / w));
  canvas.width  = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  canvas.style.width  = w + 'px';
  canvas.style.height = h + 'px';
  canvas._dpr = dpr;
  _lmHwCtx = canvas.getContext('2d');
  _lmHwCtx.setTransform(dpr, 0, 0, dpr, 0, 0); // 1 unit = 1 CSS px
  _lmHwCtx.fillStyle = '#ffffff';
  _lmHwCtx.fillRect(0, 0, w, h);
  _lmHwUndo = []; _lmHwRedo = [];
  lmHwLoadPage();
  updateLmHwPageInfo();
}

/* Handwriting pages are stored in IndexedDB (same store as photos) keyed by an
   "hw_*" id; state.lessons[*].hwPages holds the id (string) or null. Legacy
   data that stored a data: URL inline is still resolved for backward compat. */
async function hwResolve(ref) {
  if (!ref) return null;
  if (typeof ref === 'string' && ref.startsWith('data:')) return ref; // legacy inline
  try { return await mediaGet(ref); } catch (_) { return null; }
}
function hwStoreId(pages, idx, dataURL) {
  while (pages.length <= idx) pages.push(null);
  const prev = pages[idx];
  const id = (typeof prev === 'string' && prev.startsWith('hw_')) ? prev : ('hw_' + uid());
  pages[idx] = id;
  mediaPut(id, dataURL); // async write to IndexedDB (fire-and-forget, like photos)
  return id;
}

/* Whether a handwriting canvas has no visible ink (fully erased or never drawn
   on): every pixel is either fully transparent (erased) or plain white (the
   untouched fillRect background). Used on save so that erasing everything
   actually clears the page reference, instead of leaving a "blank" saved
   image behind (which used to keep the ✏️ marker stuck on the week tile). */
function isHwCanvasBlank(ctx) {
  const { width, height } = ctx.canvas;
  if (!width || !height) return true;
  const data = ctx.getImageData(0, 0, width, height).data;
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3];
    if (a === 0) continue;                                                   // fully erased
    if (data[i] >= 250 && data[i + 1] >= 250 && data[i + 2] >= 250) continue; // untouched white bg
    return false; // found actual ink
  }
  return true;
}

/* Clear a handwriting page slot (used when the canvas turns out blank on
   save) and free its IndexedDB entry so no orphaned blank image lingers. */
function hwClearPageRef(pages, idx) {
  if (idx >= pages.length) return;
  const prev = pages[idx];
  if (typeof prev === 'string' && prev.startsWith('hw_')) mediaDelete(prev);
  pages[idx] = null;
}

async function lmHwLoadPage() {
  if (!_lmHwCtx) return;
  const canvas = _lmHwCtx.canvas;
  const dpr = canvas._dpr || 1;
  const lw = canvas.width / dpr, lh = canvas.height / dpr; // logical (CSS) size
  const lesson = state.lessons[currentLessonKey];
  const ref = lesson?.hwPages?.[hwPageIndex];
  _lmHwCtx.fillStyle = '#ffffff';
  _lmHwCtx.fillRect(0, 0, lw, lh);
  const wantKey = currentLessonKey, wantIdx = hwPageIndex;
  const dataURL = await hwResolve(ref);
  // page may have changed while awaiting IndexedDB
  if (!dataURL || !_lmHwCtx || currentLessonKey !== wantKey || hwPageIndex !== wantIdx) return;
  const img = new Image();
  img.onload = () => {
    if (_lmHwCtx && currentLessonKey === wantKey && hwPageIndex === wantIdx)
      _hwDrawContain(_lmHwCtx, img, lw, lh);   // 縦横比を保って配置（つぶれ/見切れ防止）
  };
  img.src = dataURL;
}

/* 画像を縦横比を保ったままキャンバスに収めて描く（全画面↔モーダルで形が変わっても破綻しない） */
function _hwDrawContain(ctx, img, lw, lh) {
  const ir = img.width / img.height, cr = lw / lh;
  let dw = lw, dh = lh, dx = 0, dy = 0;
  if (ir > cr) { dh = lw / ir; dy = (lh - dh) / 2; }
  else if (ir < cr) { dw = lh * ir; dx = (lw - dw) / 2; }
  ctx.drawImage(img, dx, dy, dw, dh);
}

function lmHwSavePage() {
  if (!currentLessonKey || !_lmHwCtx) return;
  if (!state.lessons[currentLessonKey]) state.lessons[currentLessonKey] = {};
  if (!state.lessons[currentLessonKey].hwPages) state.lessons[currentLessonKey].hwPages = [];
  const pages = state.lessons[currentLessonKey].hwPages;
  if (isHwCanvasBlank(_lmHwCtx)) hwClearPageRef(pages, hwPageIndex);
  else hwStoreId(pages, hwPageIndex, _lmHwCtx.canvas.toDataURL('image/png'));
  saveSoft();
}

let _lmHwLast = null;
let _lmHwMid = null;   // スムージング用の中点

/* line width: solid base, Apple Pencil pressure only adds a little */
function lmHwWidth(e) {
  if (_lmHwTool === 'eraser') return Math.max(14, _lmHwSize * 9);
  // pressure is meaningful only for stylus; mouse/touch report 0 or 0.5
  const usePressure = e.pointerType === 'pen' && e.pressure > 0;
  const p = usePressure ? e.pressure : 1;
  return Math.max(1.8, _lmHwSize * (0.7 + p * 0.9));
}

function lmHwDown(e) {
  if (!_lmHwCtx) return;
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  e.preventDefault();
  try { e.target.setPointerCapture(e.pointerId); } catch (_) {}
  _lmHwDrawing = true;
  _lmHwUndo.push(_lmHwCtx.getImageData(0, 0, _lmHwCtx.canvas.width, _lmHwCtx.canvas.height));
  if (_lmHwUndo.length > 8) _lmHwUndo.shift();   // 高精細化に伴いメモリを抑制
  _lmHwRedo.length = 0;

  _lmHwCtx.globalCompositeOperation = _lmHwTool === 'eraser' ? 'destination-out' : 'source-over';
  _lmHwCtx.strokeStyle = _lmHwColor;
  _lmHwCtx.fillStyle   = _lmHwColor;
  _lmHwCtx.lineCap = 'round'; _lmHwCtx.lineJoin = 'round';

  const pt = hwPos(e, _lmHwCtx.canvas);
  _lmHwLast = pt;
  _lmHwMid = pt;
  // a dot so single taps leave a mark
  const w = lmHwWidth(e);
  _lmHwCtx.beginPath();
  _lmHwCtx.arc(pt.x, pt.y, Math.max(0.9, w / 2), 0, Math.PI * 2);
  _lmHwCtx.fill();
}

function lmHwMove(e) {
  if (!_lmHwDrawing || !_lmHwLast) return;
  e.preventDefault();
  _lmHwCtx.globalCompositeOperation = _lmHwTool === 'eraser' ? 'destination-out' : 'source-over';
  _lmHwCtx.strokeStyle = _lmHwColor;
  // capture all intermediate points (prevents gaps when drawing fast)
  const evs = (typeof e.getCoalescedEvents === 'function') ? e.getCoalescedEvents() : null;
  const points = (evs && evs.length) ? evs : [e];
  for (const ev of points) {
    const pt = hwPos(ev, _lmHwCtx.canvas);
    const mid = { x: (_lmHwLast.x + pt.x) / 2, y: (_lmHwLast.y + pt.y) / 2 };
    // 中点を結ぶ二次ベジェで滑らかに（フリーボード風）
    _lmHwCtx.lineWidth = lmHwWidth(ev);
    _lmHwCtx.beginPath();
    _lmHwCtx.moveTo(_lmHwMid.x, _lmHwMid.y);
    _lmHwCtx.quadraticCurveTo(_lmHwLast.x, _lmHwLast.y, mid.x, mid.y);
    _lmHwCtx.stroke();
    _lmHwMid = mid;
    _lmHwLast = pt;
  }
}

function lmHwUp(e) {
  if (!_lmHwDrawing) return;
  _lmHwDrawing = false;
  _lmHwLast = null;
  try { if (e && e.pointerId != null) e.target.releasePointerCapture(e.pointerId); } catch (_) {}
  _lmHwCtx.globalCompositeOperation = 'source-over';
  lmHwSavePage();
}

function updateLmHwPageInfo() {
  const pages = state.lessons[currentLessonKey]?.hwPages?.length || 1;
  const el = document.getElementById('lmHwPageInfo');
  if (el) el.textContent = `${hwPageIndex + 1}/${pages}`;
}

function setupLmHwToolbar() {
  const q = id => document.getElementById(id);
  const canvas = q('lmHwCanvas');
  if (canvas) {
    canvas.addEventListener('pointerdown', lmHwDown);
    canvas.addEventListener('pointermove', lmHwMove);
    canvas.addEventListener('pointerup', lmHwUp);
    canvas.addEventListener('pointerleave', lmHwUp);
    canvas.style.touchAction = 'none';
    // Suppress iOS Safari's long-press selection / copy-callout over the canvas
    canvas.addEventListener('touchstart', e => e.preventDefault(), { passive: false });
    canvas.addEventListener('touchmove',  e => e.preventDefault(), { passive: false });
    canvas.addEventListener('contextmenu', e => e.preventDefault());
    canvas.addEventListener('selectstart', e => e.preventDefault());
  }
  q('lmHwPen')?.addEventListener('click', () => {
    _lmHwTool = 'pen';
    q('lmHwPen').classList.add('active'); q('lmHwPen').setAttribute('aria-pressed','true');
    q('lmHwEraser').classList.remove('active'); q('lmHwEraser').setAttribute('aria-pressed','false');
  });
  q('lmHwEraser')?.addEventListener('click', () => {
    _lmHwTool = 'eraser';
    q('lmHwEraser').classList.add('active'); q('lmHwEraser').setAttribute('aria-pressed','true');
    q('lmHwPen').classList.remove('active'); q('lmHwPen').setAttribute('aria-pressed','false');
  });
  q('lmHwColors')?.addEventListener('click', e => {
    const btn = e.target.closest('.lm-hw-color');
    if (btn) onHwSwatchClick('lm', btn);
  });
  // 手書きカラーピッカー（ネイティブ input[type=color]）
  q('hwColorInput')?.addEventListener('input', e => applyHwPickerColor(e.target.value));
  q('lmHwUndo')?.addEventListener('click', () => {
    if (!_lmHwUndo.length || !_lmHwCtx) return;
    _lmHwRedo.push(_lmHwCtx.getImageData(0, 0, _lmHwCtx.canvas.width, _lmHwCtx.canvas.height));
    if (_lmHwRedo.length > 20) _lmHwRedo.shift();
    _lmHwCtx.putImageData(_lmHwUndo.pop(), 0, 0); lmHwSavePage();
  });
  q('lmHwRedo')?.addEventListener('click', () => {
    if (!_lmHwRedo.length || !_lmHwCtx) return;
    _lmHwUndo.push(_lmHwCtx.getImageData(0, 0, _lmHwCtx.canvas.width, _lmHwCtx.canvas.height));
    if (_lmHwUndo.length > 20) _lmHwUndo.shift();
    _lmHwCtx.putImageData(_lmHwRedo.pop(), 0, 0); lmHwSavePage();
  });
  q('lmHwClear')?.addEventListener('click', async () => {
    if (!_lmHwCtx) return;
    if (!await customConfirm('このページを消去しますか？')) return;
    _lmHwUndo.push(_lmHwCtx.getImageData(0,0,_lmHwCtx.canvas.width,_lmHwCtx.canvas.height));
    _lmHwRedo.length = 0;
    _lmHwCtx.fillStyle = '#fff'; _lmHwCtx.fillRect(0,0,_lmHwCtx.canvas.width,_lmHwCtx.canvas.height);
    lmHwSavePage();
  });
  q('lmHwPrev')?.addEventListener('click', () => {
    if (hwPageIndex > 0) { hwPageIndex--; lmHwLoadPage(); updateLmHwPageInfo(); }
  });
  q('lmHwNext')?.addEventListener('click', () => {
    const max = (state.lessons[currentLessonKey]?.hwPages?.length || 1) - 1;
    if (hwPageIndex < max) { hwPageIndex++; lmHwLoadPage(); updateLmHwPageInfo(); }
  });
  q('lmHwAddPage')?.addEventListener('click', () => {
    if (!currentLessonKey) return;
    if (!state.lessons[currentLessonKey]) state.lessons[currentLessonKey] = {};
    if (!state.lessons[currentLessonKey].hwPages) state.lessons[currentLessonKey].hwPages = [];
    state.lessons[currentLessonKey].hwPages.push(null);
    hwPageIndex = state.lessons[currentLessonKey].hwPages.length - 1;
    lmHwLoadPage(); updateLmHwPageInfo();
  });
}

function populateSubjectSelect() {
  const sel = document.getElementById('lessonSubject');
  sel.innerHTML = '<option value="">教科（任意）</option>';
  state.settings.subjects.forEach(s => {
    const opt = document.createElement('option');
    opt.value = s.id; opt.textContent = s.name;
    sel.appendChild(opt);
  });
}

function populateClassSelect(ensure) {
  const sel = document.getElementById('lessonClass');
  sel.innerHTML = '<option value="">学級（任意）</option>';
  const groups = allClassesGrouped();
  const allValues = new Set();
  groups.forEach(g => {
    const og = document.createElement('optgroup');
    og.label = g.schoolName;
    g.options.forEach(o => {
      const opt = document.createElement('option');
      opt.value = o.value; opt.textContent = o.label;
      og.appendChild(opt);
      allValues.add(o.value);
    });
    sel.appendChild(og);
  });
  // 取込データの授業は学級名が一覧に無い場合がある（全角や別学校）。
  // 現在値を必ず選択肢に含め、選択が外れないようにする。
  if (ensure && !allValues.has(ensure)) {
    const opt = document.createElement('option');
    opt.value = ensure; opt.textContent = ensure;
    sel.appendChild(opt);
  }
}

function renderModalTags(containerId, inputId, tags) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = '';
  tags.forEach((tag, i) => {
    const chip = document.createElement('span');
    chip.className = 'tag-chip';
    chip.innerHTML = `${escHtml(tag)}<span class="tag-chip-remove" role="button" aria-label="${tag}を削除" tabindex="0">×</span>`;
    chip.querySelector('.tag-chip-remove').addEventListener('click', () => {
      tags.splice(i, 1);
      renderModalTags(containerId, inputId, tags);
    });
    container.appendChild(chip);
  });
}

function renderModalPhotos() {
  const grid = document.getElementById('modalPhotoGrid');
  if (!grid) return;
  const addBtn = document.getElementById('addLessonPhotoBtn');
  Array.from(grid.children).forEach(c => { if (c !== addBtn) c.remove(); });
  lessonPhotos.forEach((photo, i) => {
    const item = document.createElement('div');
    item.className = 'photo-item';
    item.innerHTML = `<img alt="授業写真 ${i+1}" loading="lazy" />
      <button class="photo-del" aria-label="写真を削除">✕</button>`;
    setPhotoSrc(item.querySelector('img'), photo);
    // tap the photo → open the fullscreen viewer with all photos of this lesson
    item.querySelector('img').addEventListener('click', () =>
      openPhotoViewer(lessonPhotos.map(p => ({ photo: p, lessonKey: null })), i));
    item.querySelector('.photo-del').addEventListener('click', e => {
      e.stopPropagation();
      window.removeLessonPhoto(i);
    });
    grid.insertBefore(item, addBtn);
  });
}

window.removeLessonPhoto = function(i) {
  const p = lessonPhotos[i];
  if (p && !p.src) mediaDelete(p.id);
  lessonPhotos.splice(i, 1);
  // keep the persisted lesson in sync immediately
  if (currentLessonKey && state.lessons[currentLessonKey]) {
    state.lessons[currentLessonKey].photos = [...lessonPhotos];
    save();
  }
  renderModalPhotos();
};

/* ── Fullscreen photo viewer (lightbox, iPad Photos-style) ────
   Accepts a LIST of items [{photo, lessonKey?}] and a start index.
   Supports swipe left/right between photos and a bottom thumbnail strip.
   Backwards compatible: a single photo object can be passed too. */
function openPhotoViewer(items, index, maybeLessonKey) {
  // normalize: allow openPhotoViewer(photo, lessonKey) legacy form
  if (!Array.isArray(items)) items = [{ photo: items, lessonKey: maybeLessonKey ?? index ?? null }];
  if (!items.length) return;
  let cur = Math.max(0, Math.min(index | 0, items.length - 1));

  const ov = document.createElement('div');
  ov.className = 'photo-viewer';
  ov.innerHTML = `
    <div class="photo-viewer-bar">
      <span class="pv-open-slot"></span>
      <button class="pv-close" aria-label="閉じる">
        <svg width="22" height="22" viewBox="0 0 22 22" fill="none"><path d="M6 6l10 10M16 6L6 16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
      </button>
    </div>
    <div class="photo-viewer-stage">
      <button class="pv-nav pv-prev" aria-label="前の写真">‹</button>
      <img alt="写真" />
      <button class="pv-nav pv-next" aria-label="次の写真">›</button>
    </div>
    <div class="photo-viewer-thumbs"></div>`;
  document.body.appendChild(ov);

  const imgEl   = ov.querySelector('img');
  const thumbsEl = ov.querySelector('.photo-viewer-thumbs');
  const openSlot = ov.querySelector('.pv-open-slot');
  const prevBtn = ov.querySelector('.pv-prev');
  const nextBtn = ov.querySelector('.pv-next');

  // build thumbnail strip (hidden when only one photo)
  if (items.length > 1) {
    items.forEach((it, i) => {
      const t = document.createElement('button');
      t.className = 'pv-thumb';
      t.innerHTML = '<img alt="" />';
      setPhotoSrc(t.querySelector('img'), it.photo);
      t.addEventListener('click', () => show(i));
      thumbsEl.appendChild(t);
    });
  } else {
    thumbsEl.style.display = 'none';
  }

  function show(i) {
    cur = (i + items.length) % items.length;
    setPhotoSrc(imgEl, items[cur].photo);
    const single = items.length <= 1;
    prevBtn.style.display = single ? 'none' : '';
    nextBtn.style.display = single ? 'none' : '';
    // highlight + scroll active thumb into view
    thumbsEl.querySelectorAll('.pv-thumb').forEach((t, j) => {
      const on = j === cur;
      t.classList.toggle('active', on);
      if (on) t.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
    });
    // "この授業を開く" reflects the current photo
    const lessonKey = items[cur].lessonKey;
    openSlot.innerHTML = lessonKey ? '<button class="pv-btn pv-open">この授業を開く</button>' : '';
    openSlot.querySelector('.pv-open')?.addEventListener('click', () => {
      close();
      const date = lessonKey.split('_')[0];
      const period = lessonKey.split('_')[1];
      const p = (period === 'after') ? 'after' : parseInt(period, 10);
      state.currentWeekStart = getWeekStart(new Date(date + 'T00:00:00'));
      renderWeekTitle();
      renderWeekGrid();
      switchView('weekly');
      setTimeout(() => openLessonModal(lessonKey, date, p), 60);
    });
  }

  const close = () => { document.removeEventListener('keydown', ov._keyHandler); ov.remove(); };
  ov.querySelector('.pv-close').addEventListener('click', close);
  prevBtn.addEventListener('click', () => show(cur - 1));
  nextBtn.addEventListener('click', () => show(cur + 1));
  ov.addEventListener('click', e => {
    if (e.target === ov || e.target.classList.contains('photo-viewer-stage')) close();
  });

  // swipe (pointer) on the stage to move between photos
  let sx = null;
  const stage = ov.querySelector('.photo-viewer-stage');
  stage.addEventListener('pointerdown', e => { sx = e.clientX; });
  stage.addEventListener('pointerup', e => {
    if (sx === null) return;
    const dx = e.clientX - sx; sx = null;
    if (Math.abs(dx) > 45) show(dx < 0 ? cur + 1 : cur - 1);
  });
  // keyboard arrows / escape
  ov._keyHandler = e => {
    if (e.key === 'ArrowRight') show(cur + 1);
    else if (e.key === 'ArrowLeft') show(cur - 1);
    else if (e.key === 'Escape') close();
  };
  document.addEventListener('keydown', ov._keyHandler);

  show(cur);
}

function updateHwPageInfo() { updateLmHwPageInfo(); }

let autosaveTimer = null;
function scheduleAutosave() {
  clearTimeout(autosaveTimer);
  showAutosave('保存中…');
  autosaveTimer = setTimeout(() => {
    if (!currentLessonKey) return;
    const title   = document.getElementById('lessonTitle').value.trim();
    const note    = document.getElementById('lessonNote').value;
    const subject = document.getElementById('lessonSubject').value;
    const cls     = document.getElementById('lessonClass').value;
    const prev = state.lessons[currentLessonKey] || {};
    state.lessons[currentLessonKey] = {
      ...prev, subjectId: subject, className: cls, title, note,
      tags: [...lessonTags], photos: [...lessonPhotos], mode: currentMode,
    };
    save();
    renderWeekGrid();
    updateStats();
    showAutosave('自動保存済み ✓');
  }, 1500);
}

function showAutosave(msg) {
  const el = document.getElementById('autosaveIndicator');
  if (!el) return;
  el.textContent = msg;
  el.className = 'autosave-indicator' + (msg.includes('中') ? ' saving' : msg.includes('済') ? ' saved' : '');
}
function updateAutosave(msg) { showAutosave(msg); }

/* ── Handwriting — Modal Preview ─────────────────────────── */

function initModalHwCanvas() {
  // The modal uses fullscreen overlay for editing; show thumbnail if a page exists
  updateHandwritingPreview();
}

function updateHandwritingPreview() {
  // After fullscreen edits, refresh the inline canvas if it's active
  if (_lmHwCtx && currentMode === 'handwriting') lmHwLoadPage();
}


function hwPos(e, canvas) {
  const rect = canvas.getBoundingClientRect();
  // For DPR-scaled canvases (_dpr set) the 2D context is already scaled, so
  // we return CSS-px coords. Fullscreen canvas has no _dpr → maps 1:1.
  const dpr = canvas._dpr || 1;
  const scaleX = canvas.width  / rect.width  / dpr;
  const scaleY = canvas.height / rect.height / dpr;
  return {
    x: (e.clientX - rect.left) * scaleX,
    y: (e.clientY - rect.top)  * scaleY,
  };
}

/* ── Handwriting — Fullscreen Overlay ───────────────────── */
let _fsHwCtx    = null;
let _fsHwDrawing = false;
let _fsHwTool   = 'pen';
let _fsHwSize   = 3;
let _fsHwColor  = '#1a1a1a';
let _fsHwUndo   = [];
let _fsHwRedo   = [];
let _fsHwPage   = 0;

/* ── 手書きペンの色（カスタム可・通常4色／全画面6色・先頭4色は共通） ── */
const HW_DEFAULT_COLORS = ['#1a1a1a', '#e11d48', '#2563eb', '#16a34a', '#d97706', '#7c3aed'];

function hwColors() {
  let c = state.settings.hwColors;
  if (!Array.isArray(c) || c.length < 6) { c = [...HW_DEFAULT_COLORS]; state.settings.hwColors = c; }
  return c;
}

/* 通常モーダル(先頭4色)・全画面(6色)のスウォッチを state から描き直す */
function renderHwColorRows() {
  const cols = hwColors();
  const lm = document.getElementById('lmHwColors');
  if (lm) {
    lm.innerHTML = '';
    cols.slice(0, 4).forEach((color, i) => {
      const b = document.createElement('button');
      b.className = 'lm-hw-color' + (color === _lmHwColor ? ' active' : '');
      b.dataset.color = color; b.dataset.index = i;
      b.style.background = color; b.setAttribute('aria-label', '色' + (i + 1));
      lm.appendChild(b);
    });
  }
  const fs = document.getElementById('hwColorGroup');
  if (fs) {
    fs.innerHTML = '';
    cols.forEach((color, i) => {
      const b = document.createElement('button');
      b.className = 'hw-color-btn' + (color === _fsHwColor ? ' active' : '');
      b.dataset.color = color; b.dataset.index = i;
      b.style.background = color; b.setAttribute('aria-label', '色' + (i + 1));
      b.setAttribute('aria-pressed', color === _fsHwColor ? 'true' : 'false');
      fs.appendChild(b);
    });
  }
}

function hwSelectColor(ctx, color) {
  if (ctx === 'lm') {
    _lmHwColor = color; _lmHwTool = 'pen';
    document.getElementById('lmHwPen')?.classList.add('active');
    document.getElementById('lmHwEraser')?.classList.remove('active');
  } else {
    _fsHwColor = color; _fsHwTool = 'pen';
    document.getElementById('hwPenBtn')?.classList.add('active');
    document.getElementById('hwPenBtn')?.setAttribute('aria-pressed', 'true');
    document.getElementById('hwEraserBtn')?.classList.remove('active');
    document.getElementById('hwEraserBtn')?.setAttribute('aria-pressed', 'false');
  }
  renderHwColorRows();
}

/* スウォッチのタップ：未選択→選択／選択中をもう一度→OSの自由色ピッカーを直接開く */
function onHwSwatchClick(ctx, btn) {
  const idx = parseInt(btn.dataset.index, 10);
  const color = btn.dataset.color;
  const current = ctx === 'lm' ? _lmHwColor : _fsHwColor;
  if (color === current) openHwColorPicker(ctx, idx, btn);
  else hwSelectColor(ctx, color);
}

let _hwPickerCtx = null, _hwPickerIdx = -1;
/* color 入力をタップされたスウォッチの位置へ重ね（opacity:0）、ユーザー操作の流れの中で
   .click() してネイティブの自由色ピッカーを即表示する。画面外/非表示だと開けないため位置を合わせる。 */
function openHwColorPicker(ctx, idx, btn) {
  const input = document.getElementById('hwColorInput');
  if (!input) return;
  _hwPickerCtx = ctx; _hwPickerIdx = idx;
  const slot = String(hwColors()[idx] || '#1a1a1a');
  input.value = /^#[0-9a-f]{6}$/i.test(slot) ? slot : '#1a1a1a';
  if (btn) {
    const r = btn.getBoundingClientRect();
    input.style.left = r.left + 'px';
    input.style.top  = r.top + 'px';
    input.style.width  = Math.max(r.width, 24) + 'px';
    input.style.height = Math.max(r.height, 24) + 'px';
  }
  input.click();
}
function applyHwPickerColor(color) {
  if (_hwPickerIdx < 0) return;
  hwColors()[_hwPickerIdx] = color;
  save();
  hwSelectColor(_hwPickerCtx, color);   // そのスロットを選択状態にして再描画
  _hwPickerCtx = null; _hwPickerIdx = -1;
}

function openHwFullscreen() {
  const overlay = document.getElementById('hwFullscreenOverlay');
  if (!overlay) return;
  overlay.removeAttribute('hidden');
  overlay.style.display = 'flex';
  if (!hwColors().includes(_fsHwColor)) _fsHwColor = hwColors()[0];
  renderHwColorRows();
  _fsHwPage = hwPageIndex;
  setTimeout(() => initFsHwCanvas(), 30);
}

function closeHwFullscreen() {
  const overlay = document.getElementById('hwFullscreenOverlay');
  if (overlay) { overlay.setAttribute('hidden', ''); overlay.style.display = ''; }
  hwPageIndex = _fsHwPage;       // keep the page the user ended on
  // Refresh inline canvas in the modal
  updateHandwritingPreview();
  updateHwPageInfo();
  updateStats();
}

let _fsHwBound = false;

function initFsHwCanvas() {
  const canvas = document.getElementById('hwCanvas');
  if (!canvas) return;
  const w = canvas.parentElement.clientWidth  || window.innerWidth;
  const h = canvas.parentElement.clientHeight || (window.innerHeight - 56);
  // 高精細バックバッファ（インライン側と同方式・同等解像度）
  const dpr = Math.min(4, Math.max(Math.min(window.devicePixelRatio || 1, 3), 1600 / w));
  canvas.width  = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  canvas.style.width  = w + 'px';
  canvas.style.height = h + 'px';
  canvas._dpr = dpr;
  _fsHwCtx = canvas.getContext('2d');
  _fsHwCtx.setTransform(dpr, 0, 0, dpr, 0, 0); // 1 unit = 1 CSS px
  _fsHwCtx.fillStyle = '#ffffff';
  _fsHwCtx.fillRect(0, 0, w, h);
  _fsHwUndo = []; _fsHwRedo = [];
  loadFsHwPage();

  if (!_fsHwBound) {
    canvas.addEventListener('pointerdown',  fsHwDown,  { passive: false });
    canvas.addEventListener('pointermove',  fsHwMove,  { passive: false });
    canvas.addEventListener('pointerup',    fsHwUp);
    canvas.addEventListener('pointerleave', fsHwUp);
    canvas.addEventListener('contextmenu',  e => e.preventDefault());
    canvas.addEventListener('selectstart',  e => e.preventDefault());
    canvas.addEventListener('touchstart',   e => e.preventDefault(), { passive: false });
    canvas.addEventListener('touchmove',    e => e.preventDefault(), { passive: false });
    canvas.style.touchAction = 'none';
    _fsHwBound = true;
  }
}

async function loadFsHwPage() {
  if (!currentLessonKey || !_fsHwCtx) return;
  const canvas = _fsHwCtx.canvas;
  const dpr = canvas._dpr || 1;
  const lw = canvas.width / dpr, lh = canvas.height / dpr; // logical (CSS) size
  const lesson = state.lessons[currentLessonKey];
  const ref = lesson?.hwPages?.[_fsHwPage];
  _fsHwCtx.fillStyle = '#ffffff';
  _fsHwCtx.fillRect(0, 0, lw, lh);
  const wantKey = currentLessonKey, wantIdx = _fsHwPage;
  const dataURL = await hwResolve(ref);
  if (!dataURL || !_fsHwCtx || currentLessonKey !== wantKey || _fsHwPage !== wantIdx) return;
  const img = new Image();
  img.onload = () => {
    if (_fsHwCtx && currentLessonKey === wantKey && _fsHwPage === wantIdx)
      _hwDrawContain(_fsHwCtx, img, lw, lh);   // 縦横比を保って配置（つぶれ/見切れ防止）
  };
  img.src = dataURL;
}

/* line width: solid base, stylus pressure only adds a little (mirrors inline) */
function fsHwWidth(e) {
  if (_fsHwTool === 'eraser') return Math.max(14, _fsHwSize * 9);
  const usePressure = e.pointerType === 'pen' && e.pressure > 0;
  const p = usePressure ? e.pressure : 1;
  return Math.max(1.8, _fsHwSize * (0.7 + p * 0.9));
}

function saveFsHwPage() {
  if (!currentLessonKey || !_fsHwCtx) return;
  if (!state.lessons[currentLessonKey]) state.lessons[currentLessonKey] = {};
  if (!state.lessons[currentLessonKey].hwPages) state.lessons[currentLessonKey].hwPages = [];
  const pages = state.lessons[currentLessonKey].hwPages;
  if (isHwCanvasBlank(_fsHwCtx)) hwClearPageRef(pages, _fsHwPage);
  else hwStoreId(pages, _fsHwPage, _fsHwCtx.canvas.toDataURL('image/png'));
  save();
  updateStats();
}

let _fsHwLast = null;
let _fsHwMid = null;   // スムージング用の中点

function fsHwDown(e) {
  if (!_fsHwCtx) return;
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  e.preventDefault();
  try { e.target.setPointerCapture(e.pointerId); } catch (_) {}
  _fsHwDrawing = true;
  _fsHwUndo.push(_fsHwCtx.getImageData(0, 0, _fsHwCtx.canvas.width, _fsHwCtx.canvas.height));
  if (_fsHwUndo.length > 8) _fsHwUndo.shift();   // 高精細化に伴いメモリを抑制
  _fsHwRedo.length = 0;

  _fsHwCtx.globalCompositeOperation = _fsHwTool === 'eraser' ? 'destination-out' : 'source-over';
  _fsHwCtx.strokeStyle = _fsHwColor;
  _fsHwCtx.fillStyle   = _fsHwColor;
  _fsHwCtx.lineCap = 'round'; _fsHwCtx.lineJoin = 'round';

  const pt = hwPos(e, _fsHwCtx.canvas);
  _fsHwLast = pt;
  _fsHwMid = pt;
  // a dot so single taps leave a mark
  const w = fsHwWidth(e);
  _fsHwCtx.beginPath();
  _fsHwCtx.arc(pt.x, pt.y, Math.max(0.9, w / 2), 0, Math.PI * 2);
  _fsHwCtx.fill();
}

function fsHwMove(e) {
  if (!_fsHwDrawing || !_fsHwLast) return;
  e.preventDefault();
  _fsHwCtx.globalCompositeOperation = _fsHwTool === 'eraser' ? 'destination-out' : 'source-over';
  _fsHwCtx.strokeStyle = _fsHwColor;
  const evs = (typeof e.getCoalescedEvents === 'function') ? e.getCoalescedEvents() : null;
  const points = (evs && evs.length) ? evs : [e];
  for (const ev of points) {
    const pt = hwPos(ev, _fsHwCtx.canvas);
    const mid = { x: (_fsHwLast.x + pt.x) / 2, y: (_fsHwLast.y + pt.y) / 2 };
    _fsHwCtx.lineWidth = fsHwWidth(ev);
    _fsHwCtx.beginPath();
    _fsHwCtx.moveTo(_fsHwMid.x, _fsHwMid.y);
    _fsHwCtx.quadraticCurveTo(_fsHwLast.x, _fsHwLast.y, mid.x, mid.y);
    _fsHwCtx.stroke();
    _fsHwMid = mid;
    _fsHwLast = pt;
  }
}

function fsHwUp(e) {
  if (!_fsHwDrawing) return;
  _fsHwDrawing = false;
  _fsHwLast = null;
  try { if (e && e.pointerId != null) e.target.releasePointerCapture(e.pointerId); } catch (_) {}
  _fsHwCtx.globalCompositeOperation = 'source-over';
  saveFsHwPage();
}

function fsHwUndo() {
  if (!_fsHwUndo.length || !_fsHwCtx) return;
  _fsHwRedo.push(_fsHwCtx.getImageData(0, 0, _fsHwCtx.canvas.width, _fsHwCtx.canvas.height));
  if (_fsHwRedo.length > 30) _fsHwRedo.shift();
  _fsHwCtx.putImageData(_fsHwUndo.pop(), 0, 0);
  saveFsHwPage();
}

function fsHwRedo() {
  if (!_fsHwRedo.length || !_fsHwCtx) return;
  _fsHwUndo.push(_fsHwCtx.getImageData(0, 0, _fsHwCtx.canvas.width, _fsHwCtx.canvas.height));
  if (_fsHwUndo.length > 30) _fsHwUndo.shift();
  _fsHwCtx.putImageData(_fsHwRedo.pop(), 0, 0);
  saveFsHwPage();
}

function fsHwClear() {
  if (!_fsHwCtx) return;
  _fsHwUndo.push(_fsHwCtx.getImageData(0, 0, _fsHwCtx.canvas.width, _fsHwCtx.canvas.height));
  _fsHwRedo.length = 0;
  _fsHwCtx.fillStyle = '#ffffff';
  _fsHwCtx.fillRect(0, 0, _fsHwCtx.canvas.width, _fsHwCtx.canvas.height);
  saveFsHwPage();
}

function setupFsHwToolbar() {
  const q = id => document.getElementById(id);

  // Tool buttons
  q('hwPenBtn')?.addEventListener('click', () => {
    _fsHwTool = 'pen';
    q('hwPenBtn')?.classList.add('active');   q('hwPenBtn')?.setAttribute('aria-pressed','true');
    q('hwEraserBtn')?.classList.remove('active'); q('hwEraserBtn')?.setAttribute('aria-pressed','false');
  });
  q('hwEraserBtn')?.addEventListener('click', () => {
    _fsHwTool = 'eraser';
    q('hwEraserBtn')?.classList.add('active');  q('hwEraserBtn')?.setAttribute('aria-pressed','true');
    q('hwPenBtn')?.classList.remove('active');   q('hwPenBtn')?.setAttribute('aria-pressed','false');
  });

  // Color buttons（委譲：再タップでカラーピッカー）
  document.getElementById('hwColorGroup')?.addEventListener('click', e => {
    const btn = e.target.closest('.hw-color-btn');
    if (btn) onHwSwatchClick('fs', btn);
  });

  // Stroke size slider
  q('hwStrokeSlider')?.addEventListener('input', e => {
    _fsHwSize = parseInt(e.target.value, 10);
  });

  // Undo
  q('hwUndoBtn')?.addEventListener('click', fsHwUndo);
  q('hwRedoBtn')?.addEventListener('click', fsHwRedo);

  // Clear page
  q('hwClearPageBtn')?.addEventListener('click', async () => {
    if (await customConfirm('このページを消去しますか？')) fsHwClear();
  });

  // Page navigation
  q('hwFsPrev')?.addEventListener('click', () => {
    if (_fsHwPage > 0) { _fsHwPage--; loadFsHwPage(); updateFsHwPageInfo(); }
  });
  q('hwFsNext')?.addEventListener('click', () => {
    const max = (state.lessons[currentLessonKey]?.hwPages?.length || 1) - 1;
    if (_fsHwPage < max) { _fsHwPage++; loadFsHwPage(); updateFsHwPageInfo(); }
  });
  q('hwFsAddPage')?.addEventListener('click', () => {
    if (!currentLessonKey) return;
    if (!state.lessons[currentLessonKey]) state.lessons[currentLessonKey] = {};
    if (!state.lessons[currentLessonKey].hwPages) state.lessons[currentLessonKey].hwPages = [];
    state.lessons[currentLessonKey].hwPages.push(null);
    _fsHwPage = state.lessons[currentLessonKey].hwPages.length - 1;
    if (_fsHwCtx) { _fsHwCtx.fillStyle = '#ffffff'; _fsHwCtx.fillRect(0,0,_fsHwCtx.canvas.width,_fsHwCtx.canvas.height); }
    updateFsHwPageInfo();
  });

  // Save & Close
  q('hwSaveCloseBtn')?.addEventListener('click', closeHwFullscreen);
}

function updateFsHwPageInfo() {
  const pages = state.lessons[currentLessonKey]?.hwPages?.length || 1;
  const el = document.getElementById('hwFsPageInfo');
  if (el) el.textContent = `${_fsHwPage + 1} / ${pages}`;
}

/* ── ToDo (unified board, tag columns) ───────────────────── */

/* Days until a date string (negative = overdue) */
function daysUntil(dateStr) {
  if (!dateStr) return null;
  const today = new Date(); today.setHours(0,0,0,0);
  const due = new Date(dateStr + 'T00:00:00');
  return Math.round((due - today) / 86400000);
}

const TODO_UNTAGGED = '__none__';
const TAG_PALETTE = ['#4F46E5','#0EA5E9','#10B981','#F59E0B','#EC4899','#8B5CF6','#EF4444','#14B8A6','#D97706','#2563EB'];
function tagColor(tag) {
  if (tag === TODO_UNTAGGED) return 'var(--gray-400)';
  const custom = state.settings.tagColors && state.settings.tagColors[tag];   // ユーザー指定色を優先
  if (custom) return custom;
  let h = 0; for (let i = 0; i < tag.length; i++) h = (h * 31 + tag.charCodeAt(i)) >>> 0;
  return TAG_PALETTE[h % TAG_PALETTE.length];
}

/* タグの色を選ぶポップオーバー（カラム見出しの○をタップ） */
const TAG_COLOR_CHOICES = ['#4F46E5','#2563EB','#0EA5E9','#0891B2','#14B8A6','#10B981','#65A30D','#F59E0B','#D97706','#EA580C','#EF4444','#E11D48','#EC4899','#DB2777','#8B5CF6','#7C3AED','#475569','#0F172A'];
function openTagColorPicker(tag, anchor) {
  if (tag === TODO_UNTAGGED) return;
  let menu = document.getElementById('tagColorMenu');
  if (!menu) {
    menu = document.createElement('div'); menu.id = 'tagColorMenu'; menu.className = 'tag-color-menu'; menu.hidden = true;
    document.body.appendChild(menu);
    document.addEventListener('click', e => { if (menu.hidden) return; if (e.target.closest('#tagColorMenu') || e.target.closest('.todo-col-dot')) return; menu.hidden = true; });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') menu.hidden = true; });
  }
  const cur = String(tagColor(tag)).toLowerCase();
  menu.innerHTML = `<div class="tag-color-title">「${escHtml(tag)}」の色</div><div class="tag-color-grid">` +
    TAG_COLOR_CHOICES.map(c => `<button type="button" class="tag-color-swatch${c.toLowerCase() === cur ? ' active' : ''}" style="background:${c}" data-color="${c}" aria-label="${c}"></button>`).join('') + `</div>`;
  menu.querySelectorAll('.tag-color-swatch').forEach(b => b.addEventListener('click', () => {
    if (!state.settings.tagColors) state.settings.tagColors = {};
    state.settings.tagColors[tag] = b.dataset.color;
    save(); menu.hidden = true; renderTodoBoard(); renderTodoTagOptions();
  }));
  const r = anchor.getBoundingClientRect();
  menu.style.left = Math.min(Math.round(r.left), window.innerWidth - 220) + 'px';
  menu.style.top = Math.round(r.bottom + 6) + 'px';
  menu.hidden = false;
}

let _doneExpanded = {};   // タグごとの「完了」セクション展開状態
let _editingTodoId = null;

/* entry point from switchView */
function renderTodoView() {
  renderTodoBoard();
  renderTodoTagOptions();
  setTimeout(() => document.getElementById('todoComposeText')?.focus(), 60);
}

/* Fill the tag datalist with existing tags (for the pulldown) */
function renderTodoTagOptions() {
  const tags = [...new Set(state.todos.flatMap(t => t.tags || []))].sort((a,b)=>a.localeCompare(b,'ja'));

  // tappable chips (iPad-friendly tag selection)
  const picker = document.getElementById('todoTagPicker');
  if (!picker) return;
  if (!tags.length) { picker.innerHTML = ''; return; }
  const tagEl = document.getElementById('todoComposeTag');
  const cur = (tagEl?.value || '').trim();
  picker.innerHTML = `<span class="todo-tagpicker-label">タグ:</span>` +
    tags.map(t => `<button type="button" class="todo-tagchip${cur === t ? ' active' : ''}" data-tag="${escHtml(t)}" style="--chip-color:${tagColor(t)}">${escHtml(t)}</button>`).join('');
  picker.querySelectorAll('.todo-tagchip').forEach(btn => {
    btn.addEventListener('click', () => {
      if (tagEl) {
        // toggle: tapping the active chip clears it
        tagEl.value = (tagEl.value.trim() === btn.dataset.tag) ? '' : btn.dataset.tag;
      }
      renderTodoTagOptions();
      document.getElementById('todoComposeText')?.focus();
    });
  });
}

/* タグ入力欄の全表示プルダウン。ネイティブdatalistは入力値でフィルタされ
   「選択中だと他タグが出ない」ため、現在値に関係なく全タグを出す自前メニュー。 */
function toggleTodoTagMenu() {
  let menu = document.getElementById('todoTagMenu');
  if (!menu) {
    menu = document.createElement('div');
    menu.id = 'todoTagMenu';
    menu.className = 'todo-tagmenu';
    menu.hidden = true;
    document.body.appendChild(menu);
    document.addEventListener('click', e => {
      if (menu.hidden) return;
      if (e.target.closest('#todoTagMenu') || e.target.closest('#todoTagCaret')) return;
      menu.hidden = true;
    });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') menu.hidden = true; });
  }
  if (!menu.hidden) { menu.hidden = true; return; }
  const tags = [...new Set(state.todos.flatMap(t => t.tags || []))].sort((a, b) => a.localeCompare(b, 'ja'));
  const tagEl = document.getElementById('todoComposeTag');
  const cur = (tagEl?.value || '').trim();
  if (!tags.length) {
    menu.innerHTML = '<div class="todo-tagmenu-empty">タグはまだありません</div>';
  } else {
    menu.innerHTML = tags.map(t =>
      `<button type="button" class="todo-tagmenu-item${cur === t ? ' active' : ''}" data-tag="${escHtml(t)}"><span class="todo-tagmenu-dot" style="background:${tagColor(t)}"></span>${escHtml(t)}</button>`
    ).join('');
    menu.querySelectorAll('.todo-tagmenu-item').forEach(b => b.addEventListener('click', () => {
      if (tagEl) tagEl.value = (tagEl.value.trim() === b.dataset.tag) ? '' : b.dataset.tag;
      menu.hidden = true;
      renderTodoTagOptions();
    }));
  }
  const anchor = document.getElementById('todoComposeTag');
  if (anchor) {
    const r = anchor.getBoundingClientRect();
    menu.style.left = Math.round(r.left) + 'px';
    menu.style.top = Math.round(r.bottom + 4) + 'px';
    menu.style.minWidth = Math.round(r.width) + 'px';
  }
  menu.hidden = false;
}

function renderTodoBoard() {
  const board = document.getElementById('todoBoard');
  if (!board) { updatePanelTodo(); return; }

  // タグごとに 未完了 / 完了 を集約
  const byTag = new Map();   // tag -> { active:[], done:[] }
  state.todos.forEach(t => {
    const tags = (t.tags && t.tags.length) ? t.tags : [TODO_UNTAGGED];
    tags.forEach(tag => {
      if (!byTag.has(tag)) byTag.set(tag, { active: [], done: [] });
      (t.done ? byTag.get(tag).done : byTag.get(tag).active).push(t);
    });
  });

  // order: untagged first, then alphabetical
  const cols = [...byTag.keys()].sort((a, b) => {
    if (a === TODO_UNTAGGED) return -1;
    if (b === TODO_UNTAGGED) return 1;
    return a.localeCompare(b, 'ja');
  });

  board.innerHTML = '';

  if (!cols.length) {
    board.innerHTML = `<div class="todo-board-empty">
      <div class="empty-illo">✅</div>
      <p class="empty-lead">やることはありません</p>
      <p class="settings-hint">上の欄から追加してください。タグを付けると分類カラムができます。</p>
    </div>`;
    updatePanelTodo();
    return;
  }

  cols.forEach(tag => {
    const { active, done } = byTag.get(tag);
    active.sort(todoSort);
    done.sort((a, b) => (b.doneAt || b.createdAt || 0) - (a.doneAt || a.createdAt || 0));  // 新しく完了した順
    const col = document.createElement('div');
    col.className = 'todo-col';
    col.style.setProperty('--col-color', tagColor(tag));
    const label = tag === TODO_UNTAGGED ? '未分類' : tag;
    col.innerHTML = `
      <div class="todo-col-head">
        <span class="todo-col-dot"></span>
        <span class="todo-col-name">${escHtml(label)}</span>
        <span class="todo-col-count">${active.length}</span>
      </div>
      <div class="todo-col-body"></div>`;
    const body = col.querySelector('.todo-col-body');
    active.forEach(t => body.appendChild(createTodoCard(t)));

    // 見出しの○をタップ → タグ色を変更
    if (tag !== TODO_UNTAGGED) {
      const dot = col.querySelector('.todo-col-dot');
      if (dot) {
        dot.classList.add('todo-col-dot--btn');
        dot.title = '色を変更';
        dot.addEventListener('click', e => { e.stopPropagation(); openTagColorPicker(tag, dot); });
      }
    }

    // このグループの「完了」を下部に折りたたみ（既定は非表示・ボタンで開閉）
    if (done.length) {
      const expanded = !!_doneExpanded[tag];
      const sec = document.createElement('div');
      sec.className = 'todo-done-sec';
      sec.innerHTML = `
        <button class="todo-done-toggle" aria-expanded="${expanded}">
          <span class="todo-done-caret">▶</span>
          <span class="todo-done-label">完了</span>
          <span class="todo-col-count">${done.length}</span>
        </button>
        <div class="todo-done-body"></div>`;
      const dbody = sec.querySelector('.todo-done-body');
      if (expanded) done.forEach(t => dbody.appendChild(createTodoCard(t)));
      sec.querySelector('.todo-done-toggle').addEventListener('click', () => {
        _doneExpanded[tag] = !_doneExpanded[tag]; renderTodoBoard();
      });
      body.appendChild(sec);
    }
    board.appendChild(col);
  });

  updatePanelTodo();
}

/* sort: overdue/soonest deadline first, then no-deadline by creation */
function todoSort(a, b) {
  const da = a.due ? daysUntil(a.due) : Infinity;
  const db = b.due ? daysUntil(b.due) : Infinity;
  if (da !== db) return da - db;
  return (a.order ?? a.createdAt ?? 0) - (b.order ?? b.createdAt ?? 0);   // 締切なしは手動並び順（既定=作成順）
}

function createTodoCard(todo) {
  const reorderable = !todo.done && !todo.due;   // 締切なしの未完了だけ手動並び替え可
  const card = document.createElement('div');
  card.className = 'todo-card' + (todo.done ? ' todo-card--done' : '');
  card.dataset.todoId = todo.id;
  if (reorderable) card.dataset.reorder = '1';

  let meta = '';
  if (todo.done) {
    if (todo.doneAt) { const d = new Date(todo.doneAt); meta = `<span class="todo-doneat">✓ ${d.getMonth()+1}/${d.getDate()} 完了</span>`; }
  } else if (todo.due) {
    const d = daysUntil(todo.due);
    let cls = 'due-far', label;
    if (d < 0)        { cls = 'due-over';  label = `${-d}日超過`; }
    else if (d === 0) { cls = 'due-today'; label = '今日'; }
    else if (d <= 5)  { cls = 'due-soon';  label = `あと${d}日`; }
    else              { cls = 'due-far';   label = `${todo.due.slice(5).replace('-','/')}`; }
    meta = `<span class="todo-due ${cls}">📅 ${label}</span>`;
  }

  const dragHandle = reorderable ? `<button class="todo-drag" aria-label="並び替え" title="ドラッグで並び替え">⠿</button>` : '';

  card.innerHTML = `
    ${dragHandle}
    <button class="todo-check ${todo.done ? 'checked' : ''}" role="checkbox" aria-checked="${todo.done}" aria-label="${escHtml(todo.text)}"></button>
    <div class="todo-card-body">
      <span class="todo-card-text ${todo.done ? 'done' : ''}">${escHtml(todo.text)}</span>
      ${meta}
    </div>
    <button class="todo-card-edit" aria-label="編集" title="編集">
      <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><path d="M10.5 2.5l3 3L6 13l-3.5.5L3 10l7.5-7.5z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>
    </button>
    <button class="todo-card-del" aria-label="削除">
      <svg width="15" height="15" viewBox="0 0 14 14" fill="none"><path d="M2 2l10 10M12 2L2 12" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
    </button>`;
  card.querySelector('.todo-check').addEventListener('click', () => toggleTodo(todo.id));
  card.querySelector('.todo-card-edit').addEventListener('click', () => openTodoEdit(todo.id));
  card.querySelector('.todo-card-del').addEventListener('click', () => deleteTodo(todo.id));
  card.querySelector('.todo-drag')?.addEventListener('pointerdown', e => startTodoDrag(e, card));
  return card;
}

/* ── ToDo 並び替え（締切なしカードをドラッグ）──
   締切ありは締切順で上部固定。締切なしは order（既定=createdAt）で並び、ドラッグで更新。 */
let _todoDrag = null;
function _todoById(id) { return state.todos.find(t => t.id === id); }
function startTodoDrag(e, card) {
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  e.preventDefault(); e.stopPropagation();
  _todoDrag = { card, body: card.parentElement };
  card.classList.add('todo-card--dragging');
  try { e.target.setPointerCapture?.(e.pointerId); } catch (_) {}
  document.addEventListener('pointermove', _onTodoDragMove);
  document.addEventListener('pointerup', _endTodoDrag);
  document.addEventListener('pointercancel', _endTodoDrag);
}
function _onTodoDragMove(e) {
  if (!_todoDrag) return;
  e.preventDefault();
  const { card, body } = _todoDrag;
  const y = e.clientY;
  const sibs = [...body.querySelectorAll('.todo-card[data-reorder="1"]')].filter(c => c !== card);
  let target = null;
  for (const s of sibs) { const r = s.getBoundingClientRect(); if (y < r.top + r.height / 2) { target = s; break; } }
  if (target) { if (card.nextSibling !== target) body.insertBefore(card, target); }
  else {
    const last = sibs[sibs.length - 1];
    const doneSec = body.querySelector('.todo-done-sec');
    if (last) { if (last.nextSibling !== card) body.insertBefore(card, last.nextSibling); }
    else if (doneSec) body.insertBefore(card, doneSec);
    else body.appendChild(card);
  }
}
function _endTodoDrag() {
  document.removeEventListener('pointermove', _onTodoDragMove);
  document.removeEventListener('pointerup', _endTodoDrag);
  document.removeEventListener('pointercancel', _endTodoDrag);
  if (!_todoDrag) return;
  const { card, body } = _todoDrag;
  card.classList.remove('todo-card--dragging');
  const cards = [...body.querySelectorAll('.todo-card[data-reorder="1"]')];
  const idx = cards.indexOf(card);
  const moved = _todoById(card.dataset.todoId);
  if (moved) {
    const prev = idx > 0 ? _todoById(cards[idx - 1].dataset.todoId) : null;
    const next = idx < cards.length - 1 ? _todoById(cards[idx + 1].dataset.todoId) : null;
    const po = prev ? (prev.order ?? prev.createdAt ?? 0) : null;
    const no = next ? (next.order ?? next.createdAt ?? 0) : null;
    if (po != null && no != null) moved.order = (po + no) / 2;
    else if (po != null) moved.order = po + 1000;
    else if (no != null) moved.order = no - 1000;
    else moved.order = moved.createdAt || Date.now();
    save();
  }
  _todoDrag = null;
  renderTodoBoard();
}

/* ToDo を後から編集（内容・期限・タグ） */
function openTodoEdit(id) {
  const t = state.todos.find(x => x.id === id);
  if (!t) return;
  _editingTodoId = id;
  const q = i => document.getElementById(i);
  q('todoEditText').value = t.text || '';
  q('todoEditDate').value = t.due || '';
  q('todoEditTag').value  = (t.tags || []).join(' ');
  q('todoEditBackdrop').removeAttribute('hidden');
  setTimeout(() => q('todoEditText')?.focus(), 40);
}
function closeTodoEdit() {
  document.getElementById('todoEditBackdrop')?.setAttribute('hidden', '');
  _editingTodoId = null;
}
function saveTodoEdit() {
  const t = state.todos.find(x => x.id === _editingTodoId);
  if (!t) { closeTodoEdit(); return; }
  const q = i => document.getElementById(i);
  const text = (q('todoEditText').value || '').trim();
  if (!text) { showToast('内容を入力してください'); return; }
  t.text = text;
  t.due  = q('todoEditDate').value || '';
  t.tags = (q('todoEditTag').value || '').split(/[,、\s#]+/).map(s => s.trim()).filter(Boolean);
  save();
  closeTodoEdit();
  renderTodoBoard();
  renderTodoTagOptions();
}

/* Add from the compose form */
function composeAddTodo() {
  const textEl = document.getElementById('todoComposeText');
  const tagEl  = document.getElementById('todoComposeTag');
  const dateEl = document.getElementById('todoComposeDate');
  const text = (textEl?.value || '').trim();
  if (!text) { textEl?.focus(); return; }
  const tags = (tagEl?.value || '').split(/[,、\s#]+/).map(s => s.trim()).filter(Boolean);
  const due  = dateEl?.value || '';
  state.todos.push({ id: uid(), text, done: false, due, tags, createdAt: Date.now() });
  save();
  if (textEl) textEl.value = '';
  if (dateEl) dateEl.value = '';
  // keep the tag so several can be added to the same column quickly
  renderTodoBoard();
  renderTodoTagOptions();
  textEl?.focus();
}

function toggleTodo(id) {
  const t = state.todos.find(x => x.id === id);
  if (!t) return;
  t.done = !t.done;
  t.doneAt = t.done ? Date.now() : null;   // 完了日時を記録（後から見返せるように）
  save();
  renderTodoBoard();
}

function deleteTodo(id) {
  const idx = state.todos.findIndex(t => t.id === id);
  if (idx < 0) return;
  const snapshot = state.todos[idx];
  state.todos.splice(idx, 1);
  save();
  renderTodoBoard();
  showUndoToast('ToDo を削除しました', () => {
    state.todos.splice(Math.min(idx, state.todos.length), 0, snapshot);
    save(); renderTodoBoard();
  });
}

/* simple add used by the side panel quick-add */
async function addTodo() {
  const text = await customPrompt('ToDo を入力:');
  if (!text?.trim()) return;
  state.todos.push({ id: uid(), text: text.trim(), done: false, due: '', tags: [], createdAt: Date.now() });
  save();
  if (state.activeView === 'todo') renderTodoBoard();
  updatePanelTodo();
}

/* ── Panel ToDo ──────────────────────────────────────────── */
function updatePanelTodo() {
  const list  = document.getElementById('panelTodoList');
  const empty = document.getElementById('panelTodoEmpty');
  if (!list) return;
  // soonest-deadline first, then undated; show all incomplete (list scrolls)
  const items = state.todos.filter(t => !t.done).sort(todoSort);

  list.innerHTML = '';
  if (!items.length) { if (empty) empty.style.display = 'block'; }
  else {
    if (empty) empty.style.display = 'none';
    items.forEach(todo => {
      const d = todo.due ? daysUntil(todo.due) : null;
      const badge = (d != null && d <= 5)
        ? `<span class="urgent-badge">${d < 0 ? `${-d}日超過` : d === 0 ? '今日' : `あと${d}日`}</span>` : '';
      const li = document.createElement('li');
      li.className = 'panel-todo-item';
      li.innerHTML = `
        <div class="panel-todo-check ${todo.done ? 'checked' : ''}" role="checkbox" aria-checked="${todo.done}" tabindex="0"></div>
        <span class="panel-todo-text ${todo.done ? 'done' : ''}">${escHtml(todo.text)}</span>
        ${badge}`;
      const check = li.querySelector('.panel-todo-check');
      check.addEventListener('click',   () => toggleTodo(todo.id));
      check.addEventListener('keydown', e => { if (e.key === ' ' || e.key === 'Enter') toggleTodo(todo.id); });
      list.appendChild(li);
    });
  }

  /* Bottom bar chip */
  const pending = state.todos.filter(t => !t.done).length;
  const chip = document.getElementById('todoCountLabel');
  if (chip) chip.textContent = `ToDo ${pending}件`;
}

/* ── Class Status ────────────────────────────────────────── */
function updateClassStatus() {
  const now = new Date();
  const todayKey = formatDate(now);
  const timeMin  = now.getHours() * 60 + now.getMinutes();

  const periodTimes = [
    [8*60+45, 9*60+30], [9*60+40, 10*60+25], [10*60+35, 11*60+20],
    [11*60+30, 12*60+15],[13*60+15, 14*60],   [14*60+10, 14*60+55],
  ];

  let currentPeriod = null, nextPeriod = null;
  periodTimes.forEach((t, i) => {
    if (timeMin >= t[0] && timeMin < t[1]) currentPeriod = i + 1;
    if (!nextPeriod && timeMin < t[0]) nextPeriod = i + 1;
  });

  const fmtMin = m => `${Math.floor(m/60)}:${String(m%60).padStart(2,'0')}`;
  // 名前行＝教科（＋タイトル）。メタ行＝◯限・学級・時刻。
  const fill = (period, nameId, metaId) => {
    const nameEl = document.getElementById(nameId);
    const metaEl = document.getElementById(metaId);
    const l = period ? state.lessons[`${todayKey}_${period}`] : null;
    if (nameEl) {
      nameEl.textContent = l
        ? (getSubjectById(l.subjectId)?.name || '授業') + (l.title ? ` — ${l.title}` : '')
        : (period ? '未記録' : '–');
    }
    if (metaEl) {
      if (!period) { metaEl.textContent = ''; return; }
      const t = periodTimes[period - 1];
      const parts = [`${period}限`];
      if (l?.className) parts.push(l.className);
      if (t) parts.push(`${fmtMin(t[0])}–${fmtMin(t[1])}`);
      metaEl.textContent = parts.join(' · ');
    }
  };
  fill(currentPeriod, 'currentClassName', 'currentClassMeta');
  fill(nextPeriod,    'nextClassName',    'nextClassMeta');
}

/* ── Stats ───────────────────────────────────────────────── */
function updateStats() {
  const start = state.currentWeekStart;
  let lessons = 0, photos = 0, hw = 0;
  for (let d = 0; d < 5; d++) {
    const date = addDays(start, d);
    for (let p = 1; p <= state.settings.periodsCount; p++) {
      const lesson = state.lessons[lessonKey(date, p)];
      if (lesson?.title || lesson?.note) {
        lessons++;
        photos += lesson.photos?.length || 0;
        hw     += lesson.hwPages?.filter(Boolean).length || 0;
      }
    }
  }
  const s = id => document.getElementById(id);
  if (s('statLessons'))     s('statLessons').textContent     = lessons;
  if (s('statPhotos'))      s('statPhotos').textContent      = photos;
  if (s('statHandwriting')) s('statHandwriting').textContent = hw;
}

/* ── Progress Table ──────────────────────────────────────── */
/* 学級名の正規化（全角数字→半角・全角空白→半角・前後空白除去）。
   旧データ「２年２組」と名簿「2年2組」を同一視するため。 */
function normClass(name) {
  return String(name || '')
    .replace(/[０-９]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0))
    .replace(/　/g, ' ')
    .trim();
}

/* 学級の「実効クラス名」＝複数校運用のときだけ学校名を前置した表示/保存用の名前。
   例: 学校が四中のみ→"2年2組"のまま。三中・四中の2校体制→"四中2年2組"。
   名簿(students.className)・学級(classes.name)そのものには前置しない。
   （Mistakes M-9/M-10: 名簿データ側に前置を焼き込むと、授業登録側の前置と
   二重になったり、巻き戻すと進度表にゴースト列が戻ったりのモグラ叩きになった。
   前置は「表示・保存する瞬間にこの関数で都度合成する」方式に統一し、
   名簿は常に無印のまま保つ。）
   rawNameが既に学校名で始まっていれば二重に足さない（idempotent）。 */
function effectiveClassName(rawName, schoolId) {
  const name = rawName || '';
  if (!name || state.schools.length <= 1) return name;   // 単一校運用は前置不要
  const school = schoolById(schoolId);
  if (!school || !school.name) return name;
  if (normClass(name).startsWith(normClass(school.name))) return name;   // 既に前置済み→そのまま
  return school.name + name;
}

/* Grade number from a class name like "3年2組"（全角も対応） */
function gradeOfClass(name) {
  const m = normClass(name).match(/(\d+)\s*年/);
  return m ? parseInt(m[1], 10) : null;
}

/* 記録のある (学年, 教科) のうち最も授業数が多い組み合わせを返す（進度の初期選択用）。
   教科は設定に存在するもののみ対象。データが無ければ null。 */
function bestProgressDefault() {
  const validSubj = new Set(state.settings.subjects.map(s => s.id));
  const counts = {};
  Object.values(state.lessons).forEach(l => {
    if (!l.subjectId || !validSubj.has(l.subjectId) || !l.className) return;   // 教科＋学級があれば対象（タイトル/メモは不問）
    const g = gradeOfClass(l.className);
    if (g == null) return;
    const k = g + '|' + l.subjectId;
    counts[k] = (counts[k] || 0) + 1;
  });
  let bestK = null, bestN = 0;
  for (const k in counts) if (counts[k] > bestN) { bestN = counts[k]; bestK = k; }
  if (!bestK) return null;
  const [g, sid] = bestK.split('|');
  return { grade: parseInt(g, 10), subjectId: sid };
}

/* All lessons (subject, className) ordered chronologically by date+period。
   学級名は正規化して照合（全角/半角の違いを吸収）。 */
function lessonsOfSubjectClass(subjectId, className) {
  const periodOrder = p => (p === 'after' ? 99 : parseInt(p, 10) || 0);
  const target = normClass(className);
  return Object.entries(state.lessons)
    .filter(([, l]) => l.subjectId === subjectId && normClass(l.className) === target)   // 教科＋学級が一致すれば表示（タイトル/メモ不問）
    .map(([key, l]) => { const [date, period] = key.split('_'); return { key, date, period, l }; })
    .sort((a, b) => a.date.localeCompare(b.date) || periodOrder(a.period) - periodOrder(b.period));
}

let _progressGrade = null;
let _progressSubject = null;

function renderProgressTable() {
  const gradeSel = document.getElementById('progressGrade');
  const subjSel  = document.getElementById('progressSubjectSel');
  const container = document.getElementById('progressContent');
  if (!container) return;

  // 学校に関係なく、全学級＋全授業の学級名を正規化して集める（進度は学校横断で見る）。
  // classes/studentsは名簿上は無印なので、lessons.className（複数校なら前置済み）と
  // 同じ表記に揃えるため effectiveClassName() を通してから正規化する
  // （Mistakes M-9追記2/3: ここを揃えないと「三中2年1組」と「2年1組」が別クラス＝
  // 0時間のゴースト列として二重に出ていた）。
  const names = new Set();
  (state.classes || []).forEach(c => { if (c && c.name) names.add(normClass(effectiveClassName(c.name, c.schoolId))); });
  (state.students || []).forEach(s => { if (s.className) names.add(normClass(effectiveClassName(s.className, s.schoolId))); });
  Object.values(state.lessons).forEach(l => { if (l.className) names.add(normClass(l.className)); });
  const classes = [...names].sort((a,b)=>a.localeCompare(b,'ja',{numeric:true}));
  const grades = [...new Set(classes.map(gradeOfClass).filter(g => g != null))].sort((a,b)=>a-b);

  // 初期選択：①最後に開いた学年・教科（設定に保存）→ ②記録が最多の組み合わせ → ③先頭
  if (_progressGrade == null && state.settings.progressGrade != null) _progressGrade = state.settings.progressGrade;
  if (_progressSubject == null && state.settings.progressSubject) _progressSubject = state.settings.progressSubject;
  if (_progressGrade == null || _progressSubject == null) {
    const best = bestProgressDefault();
    if (best) {
      if (_progressSubject == null && state.settings.subjects.some(s => s.id === best.subjectId)) _progressSubject = best.subjectId;
      if (_progressGrade == null) _progressGrade = best.grade;
    }
  }

  if (gradeSel) {
    gradeSel.innerHTML = grades.length
      ? grades.map(g => `<option value="${g}">${g}年</option>`).join('')
      : '<option value="">学年なし</option>';
    if (_progressGrade == null || !grades.includes(_progressGrade)) _progressGrade = grades[0] ?? null;
    if (_progressGrade != null) gradeSel.value = String(_progressGrade);
  }
  if (subjSel) {
    subjSel.innerHTML = state.settings.subjects.map(s => `<option value="${s.id}">${escHtml(s.name)}</option>`).join('');
    if (!_progressSubject || !state.settings.subjects.some(s => s.id === _progressSubject)) _progressSubject = state.settings.subjects[0]?.id || null;
    if (_progressSubject) subjSel.value = _progressSubject;
  }

  if (_progressGrade == null || !_progressSubject) {
    container.innerHTML = '<div class="student-empty"><p>学級を登録すると、ここで進度を比較できます。</p></div>';
    return;
  }

  const subjName = getSubjectById(_progressSubject)?.name || '';
  const gradeClasses = classes.filter(c => gradeOfClass(c) === _progressGrade)
    .sort((a,b)=>a.localeCompare(b,'ja',{numeric:true}));

  // build per-class ordered lesson lists
  const perClass = gradeClasses.map(c => ({ name: c, lessons: lessonsOfSubjectClass(_progressSubject, c) }));
  const maxN = Math.max(0, ...perClass.map(pc => pc.lessons.length));

  if (!gradeClasses.length) {
    container.innerHTML = `<div class="student-empty"><p>${_progressGrade}年の学級がありません。</p></div>`;
    return;
  }

  // header
  let head = `<th class="pc-rownum"></th>` + perClass.map(pc => {
    const color = '';
    return `<th>${escHtml(pc.name)}<span class="pc-count">${pc.lessons.length}時間</span></th>`;
  }).join('');

  // rows: 1..maxN
  let rows = '';
  for (let i = 0; i < maxN; i++) {
    rows += `<tr><td class="pc-rownum">${i + 1}</td>` + perClass.map(pc => {
      const item = pc.lessons[i];
      if (!item) return `<td class="pc-empty"></td>`;
      const title = item.l.title || getSubjectById(item.l.subjectId)?.name || '';
      const md = item.date.slice(5).replace('-', '/');
      const hasPhoto = !!(item.l.photos?.length);
      // is this class behind the leader at this row?
      return `<td class="pc-cell"><button class="pc-lesson" data-key="${escHtml(item.key)}">
        <span class="pc-lesson-title">${escHtml(title)}</span>
        <span class="pc-lesson-date">
          <span>${md}・${item.period === 'after' ? '放課後' : item.period + '限'}</span>
          ${hasPhoto ? `<span class="tile-icon tile-icon--clip" title="添付ファイル">${ICON_CLIP}</span>` : ''}
        </span>
      </button></td>`;
    }).join('') + '</tr>';
  }
  if (maxN === 0) {
    rows = `<tr><td class="pc-rownum"></td><td colspan="${gradeClasses.length}" style="text-align:center;color:var(--gray-400);padding:24px;">この教科の記録がまだありません</td></tr>`;
  }

  container.innerHTML = `
    <div class="progress-compare-info">${_progressGrade}年・${escHtml(subjName)}　進度比較</div>
    <div class="progress-compare-wrap">
      <table class="progress-compare">
        <thead><tr>${head}</tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;

  // click a cell → jump to that lesson in the week grid（出席画面のジャンプと同じ挙動）
  container.querySelectorAll('.pc-lesson').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.key;
      const [dateStr] = key.split('_');
      state.currentWeekStart = getWeekStart(new Date(dateStr + 'T00:00:00'));
      renderWeekTitle(); renderWeekGrid();
      switchView('weekly');
      setTimeout(() => flashLessonCell(key), 280);   // 遷移後に該当コマを光らせる
    });
  });
}

/* ── Photos Gallery ──────────────────────────────────────── */
function renderPhotoGallery() {
  const grid = document.getElementById('photoGrid');
  if (!grid) return;
  grid.innerHTML = '';
  const addBtn = document.createElement('button');
  addBtn.className = 'photo-add-btn';
  addBtn.setAttribute('aria-label', '写真を追加');
  addBtn.style.minHeight = '140px';
  addBtn.innerHTML = `<svg width="32" height="32" viewBox="0 0 32 32" fill="none"><path d="M16 4v24M4 16h24" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/></svg>`;
  addBtn.addEventListener('click', () => document.getElementById('photoFileInput').click());
  grid.appendChild(addBtn);

  // Aggregate: standalone gallery photos + every photo registered in a lesson.
  const allItems = galleryPhotos();
  allItems.forEach((entry, i) => {
    const { photo, lessonKey, label } = entry;
    const item = document.createElement('div');
    item.className = 'photo-item';
    item.innerHTML = `<img alt="${escHtml(photo.caption || `写真 ${i+1}`)}" loading="lazy" />
      <button class="photo-del" aria-label="写真を削除">✕</button>
      ${label ? `<span class="photo-item-label">${escHtml(label)}</span>` : ''}`;
    setPhotoSrc(item.querySelector('img'), photo);
    item.querySelector('img').addEventListener('click', () => openPhotoViewer(allItems, i));
    item.querySelector('.photo-del').addEventListener('click', e => {
      e.stopPropagation();
      removeGalleryPhoto(photo.id, lessonKey);
    });
    grid.insertBefore(item, addBtn);
  });
}

/* Build the combined gallery list: free photos + lesson-embedded photos. */
function galleryPhotos() {
  const out = [];
  (state.photos || []).forEach(p => out.push({ photo: p, lessonKey: null, label: '' }));
  Object.entries(state.lessons || {}).forEach(([key, l]) => {
    (l.photos || []).forEach(p => {
      const date = key.split('_')[0];
      const period = key.split('_')[1];
      const periodLabel = (period === 'after') ? '放課後' : `${period}限`;
      const subj = getSubjectById(l.subjectId)?.name || l.title || '授業';
      out.push({ photo: p, lessonKey: key, label: `${date} ${periodLabel}・${subj}` });
    });
  });
  // newest first by the photo's recorded date (falls back to insertion order)
  out.sort((a, b) => String(b.photo.date || '').localeCompare(String(a.photo.date || '')));
  return out;
}

async function removeGalleryPhoto(id, lessonKey) {
  if (!await customConfirm('この写真を削除しますか?')) return;
  if (lessonKey && state.lessons[lessonKey]) {
    state.lessons[lessonKey].photos = (state.lessons[lessonKey].photos || []).filter(p => p.id !== id);
    mediaDelete(id);
  } else {
    const p = (state.photos || []).find(x => x.id === id);
    if (p && !p.src) mediaDelete(id);
    state.photos = (state.photos || []).filter(p => p.id !== id);
  }
  save();
  renderPhotoGallery();
  updateStats();
}

window.deletePhoto = function(id) {
  const p = state.photos.find(x => x.id === id);
  if (p && !p.src) mediaDelete(id);
  state.photos = state.photos.filter(p => p.id !== id);
  save(); renderPhotoGallery();
};

/* ── Notes ───────────────────────────────────────────────── */
/* Derive a display title for a note (explicit title or first line) */
function noteTitle(note) {
  if (note.title && note.title.trim()) return note.title.trim();
  const firstLine = (note.content || '').split('\n')[0].trim();
  return firstLine || '（無題）';
}

function renderNotesList() {
  const container = document.getElementById('notesList');
  if (!container) return;

  const query = (document.getElementById('notesSearch')?.value || '').toLowerCase().trim();
  let notes = [...state.notes];
  if (query) {
    notes = notes.filter(n =>
      (n.content || '').toLowerCase().includes(query) ||
      noteTitle(n).toLowerCase().includes(query) ||
      (n.tags || []).some(t => t.toLowerCase().includes(query))
    );
  }
  // Most recently edited first
  notes.sort((a, b) => (b.updated || 0) - (a.updated || 0));

  container.innerHTML = '';
  if (!notes.length) {
    container.innerHTML = '<p class="notes-empty">' + (query ? '一致するメモがありません' : 'メモがありません') + '</p>';
    return;
  }

  notes.forEach(note => {
    const item = document.createElement('button');
    item.className = 'note-item' + (note.id === state.activeNoteId ? ' active' : '');
    item.setAttribute('role', 'listitem');
    const body = (note.content || '').split('\n').slice(1).join(' ').trim()
      || (note.content || '').trim();
    const preview = body.length > 60 ? body.slice(0, 60) + '…' : body;
    const tagsHtml = (note.tags || []).map(t => `<span class="note-item-tag">${escHtml(t)}</span>`).join('');
    item.innerHTML = `
      <div class="note-item-title">${escHtml(noteTitle(note))}</div>
      <div class="note-item-preview">${escHtml(preview || '内容なし')}</div>
      ${tagsHtml ? `<div class="note-item-tags">${tagsHtml}</div>` : ''}
      <div class="note-item-date">${note.date || ''}</div>`;
    item.addEventListener('click', () => openNote(note.id));
    container.appendChild(item);
  });
}

let _noteTags = [];

function openNote(id) {
  const note = state.notes.find(n => n.id === id);
  if (!note) return;
  state.activeNoteId = id;

  document.getElementById('notesEditorEmpty')?.classList.add('hidden');
  document.getElementById('notesEditorPane')?.classList.remove('hidden');

  const titleEl = document.getElementById('noteTitleInput');
  const bodyEl  = document.getElementById('noteBodyInput');
  const dateEl  = document.getElementById('noteEditorDate');
  if (titleEl) titleEl.value = note.title || '';
  if (bodyEl)  bodyEl.value  = note.content || '';
  if (dateEl)  dateEl.textContent = note.date || '';

  _noteTags = [...(note.tags || [])];
  renderNoteTags();
  renderNotesList();
}

function renderNoteTags() {
  const container = document.getElementById('noteTagsContainer');
  if (!container) return;
  container.innerHTML = '';
  _noteTags.forEach((tag, i) => {
    const chip = document.createElement('span');
    chip.className = 'tag-chip';
    chip.innerHTML = `${escHtml(tag)}<span class="tag-chip-remove" role="button" tabindex="0" aria-label="${escHtml(tag)}を削除">×</span>`;
    chip.querySelector('.tag-chip-remove').addEventListener('click', () => {
      _noteTags.splice(i, 1);
      persistActiveNote();
      renderNoteTags();
    });
    container.appendChild(chip);
  });
}

function persistActiveNote() {
  const note = state.notes.find(n => n.id === state.activeNoteId);
  if (!note) return;
  note.title   = document.getElementById('noteTitleInput')?.value || '';
  note.content = document.getElementById('noteBodyInput')?.value || '';
  note.tags    = [..._noteTags];
  note.date    = formatDate(new Date());
  note.updated = Date.now();
  save();
}

function addNote() {
  const note = { id: uid(), title: '', content: '', tags: [], date: formatDate(new Date()), updated: Date.now() };
  state.notes.unshift(note);
  save();
  openNote(note.id);
  setTimeout(() => document.getElementById('noteTitleInput')?.focus(), 40);
}

async function deleteActiveNote() {
  if (!state.activeNoteId) return;
  if (!await customConfirm('このメモを削除しますか?')) return;
  const id = state.activeNoteId;
  const idx = state.notes.findIndex(n => n.id === id);
  const snapshot = state.notes[idx];
  state.notes = state.notes.filter(n => n.id !== id);
  state.activeNoteId = null;
  save();
  document.getElementById('notesEditorPane')?.classList.add('hidden');
  document.getElementById('notesEditorEmpty')?.classList.remove('hidden');
  renderNotesList();
  showUndoToast('メモを削除しました', () => {
    state.notes.splice(Math.max(0, idx), 0, snapshot);
    save(); openNote(snapshot.id);
  });
}

/* ── Events (per-day vertical input) ─────────────────────── */
const WEEKDAY_JP = ['日','月','火','水','木','金','土'];

function renderEventsGrid() {
  const grid  = document.getElementById('eventsGrid');
  const label = document.getElementById('eventsMonthLabel');
  if (!grid) return;

  const y = state.eventsYear;
  const m = state.eventsMonth;
  const monthKey = `${y}-${String(m).padStart(2,'0')}`;
  if (label) label.textContent = `${y}年${m}月`;

  if (!state.events[monthKey] || Array.isArray(state.events[monthKey])) {
    state.events[monthKey] = state.events[monthKey] && !Array.isArray(state.events[monthKey])
      ? state.events[monthKey] : {};
  }
  const map = state.events[monthKey];
  const daysInMonth = new Date(y, m, 0).getDate();

  grid.innerHTML = '';
  grid.className = 'events-daylist';

  for (let day = 1; day <= daysInMonth; day++) {
    const dow = new Date(y, m - 1, day).getDay();
    const isToday = (y === new Date().getFullYear() && m === (new Date().getMonth()+1) && day === new Date().getDate());

    const row = document.createElement('div');
    row.className = 'event-row'
      + (dow === 0 ? ' event-row--sun' : '')
      + (dow === 6 ? ' event-row--sat' : '')
      + (isToday ? ' event-row--today' : '');

    const dateLabel = document.createElement('div');
    dateLabel.className = 'event-date-label';
    dateLabel.innerHTML = `<span class="event-daynum">${day}</span><span class="event-dow">${WEEKDAY_JP[dow]}</span>`;

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'event-input';
    input.value = map[day] || '';
    input.placeholder = '行事・予定を入力…';
    input.setAttribute('aria-label', `${m}月${day}日の行事`);
    input.dataset.day = day;
    input.addEventListener('input', () => {
      const v = input.value.trim();
      if (v) map[day] = v; else delete map[day];
      save();
    });
    // Enter → move to next day's input for fast entry
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const next = grid.querySelector(`.event-input[data-day="${day+1}"]`);
        if (next) next.focus();
      }
    });

    row.appendChild(dateLabel);
    row.appendChild(input);
    grid.appendChild(row);
  }
}

function navigateEventsMonth(delta) {
  state.eventsMonth += delta;
  if (state.eventsMonth > 12) { state.eventsMonth = 1;  state.eventsYear++; }
  if (state.eventsMonth < 1)  { state.eventsMonth = 12; state.eventsYear--; }
  renderEventsGrid();
}

/* ═══════════════════════════════════════════════════════════
   STUDENT SECTION — Roster / Attendance / Evaluation
═══════════════════════════════════════════════════════════ */

/* Populate a <select> with the schools of the workspace */
function fillSchoolSelect(sel) {
  if (!sel) return;
  sel.innerHTML = '';
  state.schools.forEach(sc => {
    const opt = document.createElement('option');
    opt.value = sc.id; opt.textContent = sc.name;
    if (sc.id === state.activeSchoolId) opt.selected = true;
    sel.appendChild(opt);
  });
}

/* Populate a class <select>; keeps state.rosterClass valid */
function fillClassSelect(sel, { allOption = false } = {}) {
  if (!sel) return;
  const classes = getClassList();
  sel.innerHTML = '';
  if (allOption) {
    const o = document.createElement('option');
    o.value = ''; o.textContent = 'すべての学級';
    sel.appendChild(o);
  }
  classes.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c; opt.textContent = c;
    sel.appendChild(opt);
  });
  if (!state.rosterClass || !classes.includes(state.rosterClass)) {
    state.rosterClass = classes[0] || '';
  }
  sel.value = state.rosterClass || '';
}

/* ── Roster ──────────────────────────────────────────────── */
/* ── Roster: 3-column manager (学校 / 学級 / 名簿) ───────── */
let _rmEditSchoolId = null;   // inline-editing school
let _rmEditClassId  = null;   // inline-editing class

function renderRoster() {
  renderRmSchools();
  renderRmClasses();
  renderRmRoster();
}

function renderRmSchools() {
  const list = document.getElementById('rmSchoolList');
  const count = document.getElementById('rmSchoolCount');
  if (!list) return;
  if (count) count.textContent = `${state.schools.length}校`;
  list.innerHTML = '';
  state.schools.forEach(sc => {
    const n = state.students.filter(s => s.schoolId === sc.id).length;
    const item = document.createElement('div');
    const active = sc.id === state.activeSchoolId;
    item.className = 'rm-item' + (active ? ' active' : '') + (_rmEditSchoolId === sc.id ? ' editing' : '');

    if (_rmEditSchoolId === sc.id) {
      item.innerHTML = `
        <div class="rm-edit">
          <input class="rm-edit-name" value="${escHtml(sc.name)}" aria-label="学校名" />
          <input class="rm-edit-code" value="${escHtml(sc.code || '')}" maxlength="1" inputmode="numeric" aria-label="学校コード" />
          <div class="rm-edit-actions">
            <button class="btn-student btn-sm" data-save-school="${sc.id}">保存</button>
            <button class="btn-ghost btn-sm" data-cancel-school>取消</button>
          </div>
        </div>`;
    } else {
      item.innerHTML = `
        <button class="rm-item-main" data-pick-school="${sc.id}">
          <span class="rm-item-name">${escHtml(sc.name)}</span>
          <span class="rm-item-sub">コード ${escHtml(sc.code || '?')} ・ ${n}名</span>
        </button>
        <button class="rm-item-edit" data-edit-school="${sc.id}" aria-label="${escHtml(sc.name)}を編集">✎</button>`;
    }
    list.appendChild(item);
  });

  list.querySelectorAll('[data-pick-school]').forEach(b => b.addEventListener('click', () => {
    state.activeSchoolId = b.dataset.pickSchool; state.rosterClass = null; _rmEditClassId = null;
    save(); renderRoster();
  }));
  list.querySelectorAll('[data-edit-school]').forEach(b => b.addEventListener('click', () => {
    _rmEditSchoolId = b.dataset.editSchool; renderRmSchools();
    setTimeout(() => list.querySelector('.rm-edit-name')?.focus(), 30);
  }));
  list.querySelectorAll('[data-save-school]').forEach(b => b.addEventListener('click', () => {
    const sc = schoolById(b.dataset.saveSchool);
    const wrap = b.closest('.rm-item');
    const name = wrap.querySelector('.rm-edit-name').value.trim();
    const code = wrap.querySelector('.rm-edit-code').value.replace(/\D/g, '').slice(0, 1);
    if (name) sc.name = name;
    if (code && !state.schools.some(s => s.id !== sc.id && String(s.code) === code)) {
      sc.code = code;
      // school code change → recompute IDs of all its students
      state.students.filter(s => s.schoolId === sc.id).forEach(s => {
        s.qrId = makeStudentId(s.schoolId, s.year, s.grade, s.classNo, s.number);
      });
    }
    _rmEditSchoolId = null; save(); renderRoster();
  }));
  list.querySelectorAll('[data-cancel-school]').forEach(b => b.addEventListener('click', () => {
    _rmEditSchoolId = null; renderRmSchools();
  }));
}

function renderRmClasses() {
  const list = document.getElementById('rmClassList');
  const count = document.getElementById('rmClassCount');
  if (!list) return;

  // ensure rosterClass valid
  const names = getClassList();
  if (!state.rosterClass || !names.includes(state.rosterClass)) state.rosterClass = names[0] || null;

  const explicit = activeSchoolClasses().slice().sort((a,b)=>a.name.localeCompare(b.name,'ja',{numeric:true}));
  const explicitNames = new Set(explicit.map(c => c.name));
  const derivedOnly = [...new Set(activeSchoolStudents().map(s => s.className).filter(Boolean))]
    .filter(n => !explicitNames.has(n)).sort((a,b)=>a.localeCompare(b,'ja',{numeric:true}));

  if (count) count.textContent = `${explicit.length + derivedOnly.length}学級`;
  list.innerHTML = '';

  const addRow = (name, sub, clsObj) => {
    const item = document.createElement('div');
    const active = state.rosterClass === name;
    item.className = 'rm-item' + (active ? ' active' : '') + (clsObj && _rmEditClassId === clsObj.id ? ' editing' : '');
    if (clsObj && _rmEditClassId === clsObj.id) {
      item.innerHTML = `
        <div class="rm-edit">
          <input class="rm-edit-name" value="${escHtml(clsObj.name)}" aria-label="学級名" />
          <input class="rm-edit-code" value="${escHtml(String(clsObj.year || ''))}" inputmode="numeric" aria-label="年度" style="width:64px" />
          <div class="rm-edit-actions">
            <button class="btn-student btn-sm" data-save-class="${clsObj.id}">保存</button>
            <button class="btn-ghost btn-sm" data-cancel-class>取消</button>
          </div>
        </div>`;
    } else {
      item.innerHTML = `
        <button class="rm-item-main" data-pick-class="${escHtml(name)}">
          <span class="rm-item-name">${escHtml(name)}</span>
          <span class="rm-item-sub">${sub}</span>
        </button>
        ${clsObj ? `<button class="rm-item-edit" data-edit-class="${clsObj.id}" aria-label="${escHtml(name)}を編集">✎</button>
        <button class="rm-item-del" data-del-class="${clsObj.id}" aria-label="${escHtml(name)}を削除">×</button>` : ''}`;
    }
    list.appendChild(item);
  };

  explicit.forEach(c => addRow(c.name, `${c.year}年度 ・ ${studentsInClass(c.name).length}名`, c));
  derivedOnly.forEach(name => addRow(name, `生徒${studentsInClass(name).length}名`, null));

  if (!explicit.length && !derivedOnly.length) {
    list.innerHTML = '<div class="rm-empty">学級がありません。<br>下の欄から追加してください。</div>';
  }

  list.querySelectorAll('[data-pick-class]').forEach(b => b.addEventListener('click', () => {
    state.rosterClass = b.dataset.pickClass; _rmEditClassId = null; renderRoster();
  }));
  list.querySelectorAll('[data-edit-class]').forEach(b => b.addEventListener('click', () => {
    _rmEditClassId = b.dataset.editClass; renderRmClasses();
    setTimeout(() => list.querySelector('.rm-edit-name')?.focus(), 30);
  }));
  list.querySelectorAll('[data-save-class]').forEach(b => b.addEventListener('click', () => {
    saveInlineClass(b.dataset.saveClass, b.closest('.rm-item'));
  }));
  list.querySelectorAll('[data-cancel-class]').forEach(b => b.addEventListener('click', () => {
    _rmEditClassId = null; renderRmClasses();
  }));
  list.querySelectorAll('[data-del-class]').forEach(b => b.addEventListener('click', () => deleteClassEntity(b.dataset.delClass)));
}

function saveInlineClass(classId, wrap) {
  const c = state.classes.find(x => x.id === classId);
  if (!c) return;
  const parsed = parseClassText(wrap.querySelector('.rm-edit-name').value);
  if (!parsed) { showToast('学級名を読み取れません（例: 3年2組）'); return; }
  const year = String(wrap.querySelector('.rm-edit-code').value).replace(/\D/g, '').slice(0, 4) || String(c.year);
  const newName = makeClassName(parsed.grade, parsed.classNo);
  const oldName = c.name;
  activeSchoolStudents().filter(s => s.className === oldName).forEach(s => {
    s.grade = parseInt(parsed.grade, 10); s.classNo = parseInt(parsed.classNo, 10); s.year = parseInt(year, 10);
    s.className = newName; s.qrId = makeStudentId(s.schoolId, s.year, s.grade, s.classNo, s.number);
  });
  c.grade = parsed.grade; c.classNo = parsed.classNo; c.year = year; c.name = newName;
  if (state.rosterClass === oldName) state.rosterClass = newName;
  _rmEditClassId = null; save(); renderRoster();
  showToast('学級を更新しました');
}

/* ── Roster (name list with paste) ───────────────────────── */
function rosterRowCount() {
  const list = studentsInClass(state.rosterClass);
  const maxNum = list.reduce((m, s) => Math.max(m, s.number || 0), 0);
  return Math.max(40, maxNum); // at least 40 出席番号
}

function renderRmRoster() {
  const body = document.getElementById('rmRoster');
  const title = document.getElementById('rmRosterTitle');
  if (!body) return;

  if (!state.rosterClass) {
    if (title) title.textContent = '名簿';
    body.innerHTML = '<div class="rm-empty">左で学級を選んでください。</div>';
    return;
  }
  if (title) title.textContent = `名簿 — ${state.rosterClass}`;

  const cls = classByName(state.rosterClass);
  const { grade, classNo } = parseClassName(state.rosterClass);
  const year = cls?.year || new Date().getFullYear();
  const sc = schoolById(state.activeSchoolId);
  const rowCount = rosterRowCount();

  let rows = '';
  for (let num = 1; num <= rowCount; num++) {
    const st = activeSchoolStudents().find(s => s.className === state.rosterClass && s.number === num);
    const id = makeStudentId(state.activeSchoolId, year, grade, classNo, num);
    const detailBtn = st
      ? `<button class="rm-row-detail" type="button" data-sid="${escHtml(st.id)}" aria-label="${escHtml(st.name)}の詳細を編集" title="ふりがな・番号・QR・メモなどを編集">詳細</button>`
      : '';
    rows += `
      <div class="rm-row${st ? ' filled' : ''}">
        <span class="rm-row-num">${num}</span>
        <input class="rm-row-name" data-num="${num}" value="${escHtml(st?.name || '')}" placeholder="${num}番" aria-label="${num}番の名前" />
        ${detailBtn}
        <span class="rm-row-id">${escHtml(id)}</span>
      </div>`;
  }

  body.innerHTML = `<div class="rm-roster-list">${rows}</div>`;

  body.querySelectorAll('.rm-row-detail').forEach(b =>
    b.addEventListener('click', () => openStudentModal(b.dataset.sid)));

  body.querySelectorAll('.rm-row-name').forEach(inp => {
    inp.addEventListener('input', () => {
      setRosterStudent(state.rosterClass, parseInt(inp.dataset.num, 10), inp.value.trim());
      inp.closest('.rm-row')?.classList.toggle('filled', !!inp.value.trim());
    });
    inp.addEventListener('paste', e => handleRosterPaste(e, parseInt(inp.dataset.num, 10)));
    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const next = body.querySelector(`.rm-row-name[data-num="${parseInt(inp.dataset.num,10)+1}"]`);
        if (next) { next.focus(); next.select(); }
      }
    });
  });
}

/* Create / update / remove a student at a given 出席番号 */
function setRosterStudent(className, number, name) {
  const cls = classByName(className);
  const { grade, classNo } = parseClassName(className);
  const year = cls?.year || new Date().getFullYear();
  let st = activeSchoolStudents().find(s => s.className === className && s.number === number);
  if (!name) {
    if (st) { state.students = state.students.filter(s => s.id !== st.id); delete state.attendance[st.id]; delete state.evaluations[st.id]; }
    saveSoft();
    return;
  }
  if (!st) {
    st = { id: uid(), schoolId: state.activeSchoolId, year: +year, grade: +grade, classNo: +classNo, number, name, kana: '', note: '', className };
    state.students.push(st);
  } else {
    st.name = name;
  }
  st.qrId = makeStudentId(st.schoolId, st.year, st.grade, st.classNo, st.number);
  saveSoft();
}

/* Save without re-rendering (used during rapid typing) */
let _softSaveTimer = null;
function saveSoft() {
  clearTimeout(_softSaveTimer);
  _softSaveTimer = setTimeout(save, 400);
}

/* Paste multiline names → spread down from the pasted row */
function handleRosterPaste(e, startNum) {
  const text = (e.clipboardData || window.clipboardData)?.getData('text') || '';
  if (!/[\n\r\t]/.test(text)) return; // single value → let default paste happen
  e.preventDefault();
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l !== '');
  lines.forEach((line, i) => {
    // "1<tab>山田" or "1 山田" → take name part; otherwise whole line
    let name = line.includes('\t') ? line.split('\t').pop().trim() : line.replace(/^\s*\d+[.\s、,]+/, '').trim() || line;
    setRosterStudent(state.rosterClass, startNum + i, name);
  });
  save();
  renderRmRoster();
  showToast(`${lines.length}名を登録しました`);
}

/* ── Bulk paste modal ────────────────────────────────────── */
function openPasteModal() {
  if (!state.rosterClass) { showToast('先に学級を選んでください'); return; }
  document.getElementById('pasteModalHint').textContent =
    `「${state.rosterClass}」に登録します。名前を1行に1人ずつ貼り付けてください。`;
  document.getElementById('pasteTextarea').value = '';
  document.getElementById('pasteStartNum').value = '1';
  document.getElementById('pastePreview').textContent = '';
  document.getElementById('pasteModalBackdrop').removeAttribute('hidden');
  setTimeout(() => document.getElementById('pasteTextarea')?.focus(), 40);
}
function closePasteModal() { document.getElementById('pasteModalBackdrop').setAttribute('hidden', ''); }
function applyPasteModal() {
  const text = document.getElementById('pasteTextarea').value;
  const start = parseInt(document.getElementById('pasteStartNum').value, 10) || 1;
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l !== '');
  if (!lines.length) { showToast('名前が入力されていません'); return; }
  lines.forEach((line, i) => {
    let name = line.includes('\t') ? line.split('\t').pop().trim() : line.replace(/^\s*\d+[.\s、,]+/, '').trim() || line;
    setRosterStudent(state.rosterClass, start + i, name);
  });
  save();
  closePasteModal();
  renderRoster();
  showToast(`${lines.length}名を登録しました`);
}

/* ── Roster CSV export ───────────────────────────────────── */
function csvEscape(v) {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function exportRosterCsv() {
  if (!state.rosterClass) { showToast('先に学級を選んでください'); return; }
  const cls = classByName(state.rosterClass);
  const { grade, classNo } = parseClassName(state.rosterClass);
  const year = cls?.year || new Date().getFullYear();
  const sc = schoolById(state.activeSchoolId);
  const list = studentsInClass(state.rosterClass);
  if (!list.length) { showToast('この学級に生徒がいません'); return; }

  const header = ['year', 'school', 'class_name', 'number', 'id', 'name', 'qr_text'];
  const rows = list.map(st => {
    const id = makeStudentId(state.activeSchoolId, year, grade, classNo, st.number);
    return [year, sc?.name || '', state.rosterClass, st.number, id, st.name || '', id];
  });
  const csv = '﻿' + [header, ...rows].map(r => r.map(csvEscape).join(',')).join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${sc?.name || '学校'}_${state.rosterClass}_生徒ID.csv`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('CSVを書き出しました');
}

/* ── Student edit modal ──────────────────────────────────── */
let _editingStudentId = null;

/* Parse "3年2組" → { grade:3, classNo:2 } */
function parseClassName(cls) {
  const m = (cls || '').match(/(\d+)\s*年\s*(\d+)\s*組/);
  if (m) return { grade: parseInt(m[1], 10), classNo: parseInt(m[2], 10) };
  return { grade: '', classNo: '' };
}

function openStudentModal(id) {
  const isNew = !id;
  _editingStudentId = id;
  const st = isNew ? null : state.students.find(s => s.id === id);

  document.getElementById('studentModalTitle').textContent = isNew ? '生徒を追加' : '生徒を編集';
  const v = (elId, val) => { const el = document.getElementById(elId); if (el) el.value = val; };

  // defaults from the currently selected class
  const fromClass = parseClassName(state.rosterClass);
  const thisYear = new Date().getFullYear();

  v('studentYear',   st?.year   ?? thisYear);
  v('studentGrade',  st?.grade  ?? fromClass.grade);
  v('studentClassNo',st?.classNo ?? fromClass.classNo);
  v('studentNumber', st?.number ?? (isNew ? nextStudentNumber() : ''));
  v('studentName',   st?.name || '');
  v('studentKana',   st?.kana || '');
  v('studentNote',   st?.note || '');

  updateStudentIdPreview();

  document.getElementById('deleteStudentBtn').style.display = isNew ? 'none' : '';
  document.getElementById('studentModalBackdrop').removeAttribute('hidden');
  setTimeout(() => document.getElementById('studentName')?.focus(), 40);
  trapFocus(document.querySelector('.modal--student'));
}

let _pendingQrId = null;

/* Recompute the deterministic ID from the form fields */
function updateStudentIdPreview() {
  const year    = document.getElementById('studentYear').value.trim();
  const grade   = document.getElementById('studentGrade').value.trim();
  const classNo = document.getElementById('studentClassNo').value.trim();
  const number  = parseInt(document.getElementById('studentNumber').value, 10) || 0;
  _pendingQrId = makeStudentId(state.activeSchoolId, year, grade, classNo, number);
  renderStudentQr(_pendingQrId);
}

function renderStudentQr(qrId) {
  const input = document.getElementById('studentQrId');
  if (input) input.value = qrId;
  const wrap = document.getElementById('studentQrWrap');
  if (wrap) {
    if (!qrId) { wrap.innerHTML = '<span class="qr-placeholder">—</span>'; return; }
    const url = `https://api.qrserver.com/v1/create-qr-code/?size=160x160&margin=0&data=${encodeURIComponent(qrId)}`;
    wrap.innerHTML = `<img src="${url}" alt="QRコード" width="120" height="120" loading="lazy" />`;
  }
}

function nextStudentNumber() {
  const list = studentsInClass(state.rosterClass);
  return list.length ? Math.max(...list.map(s => s.number || 0)) + 1 : 1;
}

function closeStudentModal() {
  document.getElementById('studentModalBackdrop').setAttribute('hidden', '');
  _editingStudentId = null;
  releaseFocus();
}

function saveStudentModal() {
  const year    = parseInt(document.getElementById('studentYear').value, 10) || new Date().getFullYear();
  const grade   = parseInt(document.getElementById('studentGrade').value, 10) || '';
  const classNo = parseInt(document.getElementById('studentClassNo').value, 10) || '';
  const num     = parseInt(document.getElementById('studentNumber').value, 10) || 0;
  const name    = document.getElementById('studentName').value.trim();
  const kana    = document.getElementById('studentKana').value.trim();
  const note    = document.getElementById('studentNote').value.trim();
  if (!name) { showToast('氏名を入力してください'); return; }
  if (!grade || !classNo) { showToast('学年と組を入力してください'); return; }

  const className = deriveClassName(grade, classNo);
  const qrId = makeStudentId(state.activeSchoolId, year, grade, classNo, num);

  if (_editingStudentId) {
    const st = state.students.find(s => s.id === _editingStudentId);
    if (st) Object.assign(st, { year, grade, classNo, number: num, name, kana, note, className, qrId });
  } else {
    // avoid creating a duplicate when the same class/出席番号 already exists
    const dup = num && activeSchoolStudents().find(s => s.qrId === qrId && s.number === num);
    if (dup) {
      Object.assign(dup, { year, grade, classNo, number: num, name, kana, note, className, qrId });
    } else {
      state.students.push({
        id: uid(), schoolId: state.activeSchoolId,
        year, grade, classNo, number: num, name, kana, note, className, qrId,
      });
    }
  }
  state.rosterClass = className; // jump to the student's class
  save();
  closeStudentModal();
  renderRoster();
  showToast('保存しました');
}

async function deleteStudent() {
  if (!_editingStudentId) return;
  const id = _editingStudentId;
  const st = state.students.find(s => s.id === id);
  if (!await customConfirm(`${st?.name || 'この生徒'} を削除しますか?`)) return;
  const snapshot = { st: { ...st }, att: state.attendance[id], evl: state.evaluations[id] };
  state.students = state.students.filter(s => s.id !== id);
  delete state.attendance[id];
  delete state.evaluations[id];
  save();
  closeStudentModal();
  renderRoster();
  showUndoToast(`${st?.name || '生徒'} を削除しました`, () => {
    state.students.push(snapshot.st);
    if (snapshot.att) state.attendance[id] = snapshot.att;
    if (snapshot.evl) state.evaluations[id] = snapshot.evl;
    save(); renderRoster();
  });
}

/* ── School management ───────────────────────────────────── */
function openSchoolModal() {
  renderSchoolsList();
  document.getElementById('schoolModalBackdrop').removeAttribute('hidden');
}
function closeSchoolModal() {
  document.getElementById('schoolModalBackdrop').setAttribute('hidden', '');
}
function renderSchoolsList() {
  const list = document.getElementById('schoolsList');
  if (!list) return;
  list.innerHTML = '';
  state.schools.forEach(sc => {
    const count = state.students.filter(s => s.schoolId === sc.id).length;
    const row = document.createElement('div');
    row.className = 'school-row' + (sc.id === state.activeSchoolId ? ' active' : '');
    row.innerHTML = `
      <button class="school-pick" data-pick="${sc.id}">
        <span class="school-name">${escHtml(sc.name)} <span class="school-code-badge">コード ${escHtml(sc.code || '?')}</span></span>
        <span class="school-count">${count}名</span>
      </button>
      <button class="school-rename" data-rename="${sc.id}" aria-label="名前・コードを変更">✎</button>
      <button class="school-del" data-del="${sc.id}" aria-label="削除">×</button>`;
    list.appendChild(row);
  });
  list.querySelectorAll('[data-pick]').forEach(b => b.addEventListener('click', () => {
    state.activeSchoolId = b.dataset.pick; state.rosterClass = null;
    save(); renderSchoolsList(); refreshStudentViews();
  }));
  list.querySelectorAll('[data-rename]').forEach(b => b.addEventListener('click', async () => {
    const sc = state.schools.find(s => s.id === b.dataset.rename);
    const name = await customPrompt('学校名:', sc?.name || '');
    if (name === null) return;
    if (name.trim()) sc.name = name.trim();
    const code = await customPrompt('学校コード（生徒IDに使われます）:', sc?.code || '');
    if (code !== null && code.trim()) sc.code = code.trim();
    save(); renderSchoolsList(); refreshStudentViews();
  }));
  list.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', async () => {
    if (state.schools.length <= 1) { showToast('最後の学校は削除できません'); return; }
    const sc = state.schools.find(s => s.id === b.dataset.del);
    const n = state.students.filter(s => s.schoolId === sc.id).length;
    if (!await customConfirm(`「${sc.name}」と所属生徒${n}名を削除しますか?`)) return;
    state.students = state.students.filter(s => s.schoolId !== sc.id);
    state.schools  = state.schools.filter(s => s.id !== sc.id);
    if (state.activeSchoolId === sc.id) state.activeSchoolId = state.schools[0].id;
    state.rosterClass = null;
    save(); renderSchoolsList(); refreshStudentViews();
  }));
}
function addSchool(name, code) {
  name = (name || '').trim();
  if (!name) return false;
  code = (code || '').trim() || String(state.schools.length + 1);
  state.schools.push({ id: uid(), name, code });
  save(); renderSchoolsList();
  return true;
}

function refreshStudentViews() {
  if (state.activeView === 'roster')     renderRoster();
  if (state.activeView === 'attendance') renderAttendance();
  if (state.activeView === 'evaluation') renderEvaluation();
}

/* ── Class management ────────────────────────────────────── */
function openClassModal() {
  renderClassManageList();
  const sc = schoolById(state.activeSchoolId);
  document.getElementById('classModalSchool').textContent =
    `「${sc?.name || ''}」の学級を追加・編集します。学級名は「3年2組」や「3-2」のように入力できます。`;
  const yearEl = document.getElementById('classAddYear');
  if (yearEl && !yearEl.value) yearEl.value = new Date().getFullYear();
  document.getElementById('classModalBackdrop').removeAttribute('hidden');
  setTimeout(() => document.getElementById('classAddText')?.focus(), 40);
}
function closeClassModal() {
  document.getElementById('classModalBackdrop').setAttribute('hidden', '');
}

function renderClassManageList() {
  const list = document.getElementById('classManageList');
  if (!list) return;
  // explicit classes + classes that exist only via students
  const explicit = activeSchoolClasses();
  const explicitNames = new Set(explicit.map(c => c.name));
  const derivedOnly = [...new Set(activeSchoolStudents().map(s => s.className).filter(Boolean))]
    .filter(n => !explicitNames.has(n));

  const rows = [];
  explicit.slice().sort((a,b)=>a.name.localeCompare(b.name,'ja',{numeric:true})).forEach(c => {
    const count = studentsInClass(c.name).length;
    rows.push(`
      <div class="school-row${state.rosterClass === c.name ? ' active' : ''}">
        <button class="school-pick" data-pick-class="${escHtml(c.name)}">
          <span class="school-name">${escHtml(c.name)} <span class="school-code-badge">${c.year || ''}年度</span></span>
          <span class="school-count">${count}名</span>
        </button>
        <button class="school-rename" data-edit-class="${c.id}" aria-label="編集">✎</button>
        <button class="school-del" data-del-class="${c.id}" aria-label="削除">×</button>
      </div>`);
  });
  // classes that only exist through students — offer to register as explicit
  derivedOnly.sort((a,b)=>a.localeCompare(b,'ja',{numeric:true})).forEach(name => {
    const count = studentsInClass(name).length;
    rows.push(`
      <div class="school-row${state.rosterClass === name ? ' active' : ''}">
        <button class="school-pick" data-pick-class="${escHtml(name)}">
          <span class="school-name">${escHtml(name)} <span class="school-code-badge">名簿から</span></span>
          <span class="school-count">${count}名</span>
        </button>
      </div>`);
  });

  list.innerHTML = rows.join('') || '<div class="student-empty"><p>まだ学級がありません。下から追加してください。</p></div>';

  list.querySelectorAll('[data-pick-class]').forEach(b => b.addEventListener('click', () => {
    state.rosterClass = b.dataset.pickClass;
    closeClassModal(); refreshStudentViews();
  }));
  list.querySelectorAll('[data-edit-class]').forEach(b => b.addEventListener('click', () => editClassEntity(b.dataset.editClass)));
  list.querySelectorAll('[data-del-class]').forEach(b => b.addEventListener('click', () => deleteClassEntity(b.dataset.delClass)));
}

function addClassEntity(text, year) {
  const parsed = parseClassText(text);
  if (!parsed) { showToast('学級名を読み取れません（例: 3年2組）'); return false; }
  year = String(year || new Date().getFullYear()).replace(/\D/g, '').slice(0, 4) || String(new Date().getFullYear());
  const name = makeClassName(parsed.grade, parsed.classNo);
  const exists = activeSchoolClasses().find(c => c.name === name && String(c.year) === year);
  if (exists) { showToast('同じ学級がすでにあります'); state.rosterClass = name; return false; }
  state.classes.push({
    id: 'cls_' + uid(), schoolId: state.activeSchoolId,
    year, grade: parsed.grade, classNo: parsed.classNo, name,
  });
  state.rosterClass = name;
  save();
  renderClassManageList();
  showToast(`${name} を追加しました`);
  return true;
}

async function editClassEntity(classId) {
  const c = state.classes.find(x => x.id === classId);
  if (!c) return;
  const text = await customPrompt('学級名（例: 3年2組 / 3-2）:', c.name);
  if (text === null) return;
  const parsed = parseClassText(text);
  if (!parsed) { showToast('学級名を読み取れません'); return; }
  const yearStr = await customPrompt('年度:', String(c.year || new Date().getFullYear()));
  if (yearStr === null) return;
  const year = String(yearStr).replace(/\D/g, '').slice(0, 4) || String(c.year);
  const newName = makeClassName(parsed.grade, parsed.classNo);
  const oldName = c.name;

  // update member students (className + recompute ID)
  const members = activeSchoolStudents().filter(s => s.className === oldName);
  members.forEach(s => {
    s.grade = parseInt(parsed.grade, 10);
    s.classNo = parseInt(parsed.classNo, 10);
    s.year = parseInt(year, 10);
    s.className = newName;
    s.qrId = makeStudentId(s.schoolId, s.year, s.grade, s.classNo, s.number);
  });
  c.grade = parsed.grade; c.classNo = parsed.classNo; c.year = year; c.name = newName;
  if (state.rosterClass === oldName) state.rosterClass = newName;
  save();
  renderClassManageList();
  refreshStudentViews();
  showToast(members.length ? `学級と${members.length}名の生徒IDを更新しました` : '学級を更新しました');
}

async function deleteClassEntity(classId) {
  const c = state.classes.find(x => x.id === classId);
  if (!c) return;
  const members = activeSchoolStudents().filter(s => s.className === c.name);
  const msg = members.length
    ? `「${c.name}」と所属生徒${members.length}名を削除しますか?`
    : `「${c.name}」を削除しますか?`;
  if (!await customConfirm(msg)) return;
  if (members.length) {
    const ids = new Set(members.map(s => s.id));
    state.students = state.students.filter(s => !ids.has(s.id));
    ids.forEach(id => { delete state.attendance[id]; delete state.evaluations[id]; });
  }
  state.classes = state.classes.filter(x => x.id !== classId);
  if (state.rosterClass === c.name) state.rosterClass = null;
  save();
  renderClassManageList();
  refreshStudentViews();
}

/* ── Attendance ──────────────────────────────────────────── */
const ATT_CYCLE = { '': 'present', present: 'absent', absent: 'late', late: 'early', early: '' };
const ATT_MARK  = { present: '○', absent: '×', late: '△', early: '▽', '': '' };
const ATT_CLASS = { present: 'att-o', absent: 'att-x', late: 'att-tri', early: 'att-tri', '': 'att-empty' };

let _attMode = 'subject';   // 既定は教科別（回数）。'grid'＝従来の月間
let _attSubject = null;

/* 選択中の学級における、ある教科の授業（＝回）を日付+時限順に。
   旧データの全角や学校名プレフィックス（例「四中２年２組」）も吸収して照合。 */
function subjectOccurrences(subjectId, className) {
  const periodOrder = p => (p === 'after' ? 99 : parseInt(p, 10) || 0);
  const target = normClass(className);
  const school = state.schools.find(s => s.id === state.activeSchoolId);
  const withSchool = school ? normClass(school.name + className) : null;
  return Object.entries(state.lessons)
    .filter(([, l]) => {
      if (l.subjectId !== subjectId) return false;
      const c = normClass(l.className);
      return c === target || (withSchool && c === withSchool);
    })
    .map(([key, l]) => { const [date, period] = key.split('_'); return { key, date, period, l }; })
    .sort((a, b) => a.date.localeCompare(b.date) || periodOrder(a.period) - periodOrder(b.period));
}

/* 教科別・何回目ベースの出欠マトリクス（日付ではなく「第N回」で並べる）。
   出席判定は受付(reception)の studentId+date+period で行う（学校コード入りIDなので確実）。 */
function renderAttendanceBySubject() {
  const container = document.getElementById('attendanceContent');
  if (!container) return;
  const cls = state.rosterClass;
  const students = studentsInClass(cls);
  if (!students.length) {
    container.innerHTML = `<div class="student-empty"><p>この学級に生徒がいません。名簿で登録してください。</p></div>`;
    return;
  }
  const subjName = getSubjectById(_attSubject)?.name || '';
  const occ = subjectOccurrences(_attSubject, cls);
  if (!occ.length) {
    container.innerHTML = `<p class="settings-hint">${escHtml(cls || '')}・${escHtml(subjName)} の授業がまだ週案に登録されていません。</p>`;
    return;
  }

  // 受付を date|period で索引化（present 判定用）
  const recIndex = {}; // `${date}|${period}|${studentId}` -> rec
  state.reception.forEach(r => { recIndex[`${r.date}|${r.period}|${r.studentId}`] = r; });
  const md = d => d.slice(5).replace('-', '/');

  // ヘッダー：第1回（日付）… タップでその授業の週案へ
  const headCells = occ.map((o, i) =>
    `<th class="abs-occ" data-key="${escHtml(o.key)}" data-date="${escHtml(o.date)}" data-period="${escHtml(String(o.period))}">
       <button class="abs-occ-jump" type="button" title="この授業の週案へ"><span class="abs-occ-n">${i + 1}</span><span class="abs-occ-d">${md(o.date)}</span><span class="abs-occ-p">${periodLabelOf(o.period)}</span></button>
       <button class="abs-occ-all" type="button" title="この回を全員「出席」に">全員○</button>
     </th>`
  ).join('');

  const rows = students.map(st => {
    const cells = [];
    const absentNos = [];
    occ.forEach((o, i) => {
      const r = recIndex[`${o.date}|${o.period}|${st.id}`];
      const base = `class="abs-cell EXTRA" data-sid="${st.id}" data-date="${o.date}" data-period="${escHtml(String(o.period))}" data-name="${escHtml(st.name)}" data-cls="${escHtml(st.className)}" role="button" tabindex="0" title="タップで変更"`;
      if (r) {
        const forgot = (r.items || []).length > 0;
        cells.push(`<td ${base.replace('EXTRA', forgot ? 'abs-forgot' : '')}>${forgot ? '△' : '○'}</td>`);
      } else {
        cells.push(`<td ${base.replace('EXTRA', 'abs-x')}>×</td>`);
        absentNos.push(i + 1);
      }
    });
    const summary = absentNos.length
      ? `<span class="abs-sum-x">欠${absentNos.length}</span><span class="abs-sum-list">（${absentNos.join('・')}回目）</span>`
      : `<span class="abs-sum-ok">皆出席</span>`;
    return `<tr>
      <td class="abs-name abs-name--btn" data-sid="${st.id}" role="button" tabindex="0" title="生徒の詳細を開く"><span class="abs-num">${st.number || ''}</span>${escHtml(st.name)}</td>
      ${cells.join('')}
      <td class="abs-summary">${summary}</td></tr>`;
  }).join('');

  // 回数が増えて横スクロールになった状態で、セルをタップ→保存→再描画すると
  // innerHTML を作り直すたびに .abs-wrap の scrollLeft が 0 に戻ってしまい、
  // 右端（最新の回）を編集するたびに左端へ押し戻される不具合があった。
  // 再描画の前にスクロール位置を控えておき、描画後に同じ位置へ戻す。
  const prevScrollLeft = container.querySelector('.abs-wrap')?.scrollLeft || 0;

  container.innerHTML = `
    <p class="settings-hint">${escHtml(cls || '')}・${escHtml(subjName)}　全${occ.length}回　／　○出席・×欠席・△忘れ物（日付ではなく授業の回数で表示）</p>
    <div class="abs-wrap">
      <table class="abs-table">
        <thead><tr><th class="abs-name abs-corner">氏名</th>${headCells}<th class="abs-summary">欠席</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;

  const wrap = container.querySelector('.abs-wrap');
  if (wrap && prevScrollLeft) wrap.scrollLeft = prevScrollLeft;

  // 回数（番号/日付）→ その授業の週へジャンプ（進度表と同じ挙動）
  container.querySelectorAll('.abs-occ-jump').forEach(btn => btn.addEventListener('click', () => {
    const key = btn.closest('.abs-occ').dataset.key;
    const dateStr = key.split('_')[0];
    state.currentWeekStart = getWeekStart(new Date(dateStr + 'T00:00:00'));
    renderWeekTitle(); renderWeekGrid(); switchView('weekly');
    setTimeout(() => flashLessonCell(key), 280);   // 遷移後に該当コマを光らせる
  }));
  // 「全員○」→ その回（日付＋時限）を全員出席に
  container.querySelectorAll('.abs-occ-all').forEach(btn => btn.addEventListener('click', () => {
    const th = btn.closest('.abs-occ');
    markSessionPresent(th.dataset.date, th.dataset.period);
  }));

  // セル（○×△）をタップ → 後から出欠を変更
  container.querySelectorAll('.abs-cell[data-sid]').forEach(td => {
    const open = () => openAttEdit(td.dataset.sid, td.dataset.date, td.dataset.period, td.dataset.name, td.dataset.cls);
    td.addEventListener('click', open);
    td.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
  });
  // 氏名をタップ → 名簿の生徒詳細モーダルを開く
  container.querySelectorAll('.abs-name[data-sid]').forEach(td => {
    const open = () => openStudentModal(td.dataset.sid);
    td.addEventListener('click', open);
    td.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
  });
}

/* その回（日付＋時限）を、いまの学級の生徒全員「出席」にする。
   出席タブで「まず全員出席→欠席の人だけ×に直す」運用向け。受付画面には置かない
   （受付中は生徒が触れてしまうため）。 */
async function markSessionPresent(date, period) {
  const cls = state.rosterClass;
  const roster = studentsInClass(cls);
  if (!roster.length) return;
  const presentIds = new Set(
    state.reception.filter(r => r.date === date && String(r.period) === String(period)).map(r => r.studentId)
  );
  const todo = roster.filter(s => !presentIds.has(s.id));
  const label = `${date.slice(5).replace('-', '/')}・${periodLabelOf(period)}`;
  if (!todo.length) { showToast('この回はすでに全員出席です'); return; }
  if (!(await customConfirm(`${label} を全員「出席」にします。よろしいですか？\n（このあと欠席の人だけ × に直してください）`))) return;
  todo.forEach(st => {
    if (!state.attendance[st.id]) state.attendance[st.id] = {};
    state.attendance[st.id][date] = 'present';
    state.reception.push({ date, period, className: st.className, studentId: st.id, name: st.name, time: nowTimeStr(), items: [] });
  });
  save();
  renderAttendanceBySubject();
  showToast(`全員「出席」にしました（${todo.length}名）`);
}

/* 出欠あとから変更ポップアップ（出席/忘れ物/欠席を切替） */
let _attEdit = null;
function openAttEdit(studentId, date, period, name, className) {
  _attEdit = { studentId, date, period, className };
  const rec = state.reception.find(r => r.date === date && String(r.period) === String(period) && r.studentId === studentId);
  const curItems = new Set(rec ? (rec.items || []) : []);
  document.getElementById('attEditName').textContent = name || '';
  document.getElementById('attEditInfo').textContent = `${className || ''}　${date.slice(5).replace('-', '/')}・${periodLabelOf(period)}`;
  const grid = document.getElementById('attEditGrid');
  grid.innerHTML = getForgotItems().map(it =>
    `<button type="button" class="forgot-item${curItems.has(it) ? ' selected' : ''}" data-item="${escHtml(it)}">${escHtml(it)}</button>`).join('');
  grid.querySelectorAll('.forgot-item').forEach(b => b.addEventListener('click', () => b.classList.toggle('selected')));
  document.getElementById('attEditBackdrop').removeAttribute('hidden');
}
function closeAttEdit() {
  document.getElementById('attEditBackdrop').setAttribute('hidden', '');
  _attEdit = null;
}
/* present=true で出席（itemsは忘れ物）、present=false で欠席（受付削除） */
function setAttendanceState(present) {
  const e = _attEdit; if (!e) return;
  const { studentId, date, period, className } = e;
  state.reception = state.reception.filter(r => !(r.date === date && String(r.period) === String(period) && r.studentId === studentId));
  if (present) {
    const items = [...document.querySelectorAll('#attEditGrid .forgot-item.selected')].map(b => b.dataset.item);
    state.reception.push({ date, period, className, studentId, name: document.getElementById('attEditName').textContent, time: nowTimeStr(), items });
    if (!state.attendance[studentId]) state.attendance[studentId] = {};
    state.attendance[studentId][date] = 'present';
  } else {
    if (state.attendance[studentId]) delete state.attendance[studentId][date];
  }
  save();
  closeAttEdit();
  renderAttendanceBySubject();
}

function renderAttendance() {
  fillSchoolSelect(document.getElementById('attSchoolSelect'));
  fillClassSelect(document.getElementById('attClassSelect'));

  // 出席は「教科別（回数）」表示のみ（月間グリッドは廃止）
  const subjSel = document.getElementById('attSubjectSelect');
  if (subjSel) {
    subjSel.innerHTML = state.settings.subjects.map(s => `<option value="${s.id}">${escHtml(s.name)}</option>`).join('');
    if (!_attSubject || !state.settings.subjects.some(s => s.id === _attSubject)) _attSubject = state.settings.subjects[0]?.id || null;
    if (_attSubject) subjSel.value = _attSubject;
  }
  renderAttendanceBySubject();
  return;

  // eslint-disable-next-line no-unreachable
  const container = document.getElementById('attendanceContent');
  if (!container) return;

  const students = studentsInClass(state.rosterClass);
  if (!students.length) {
    container.innerHTML = `<div class="student-empty"><p>この学級に生徒がいません。名簿で登録してください。</p></div>`;
    return;
  }

  const y = state.attendanceYear, m = state.attendanceMonth;
  const daysInMonth = new Date(y, m, 0).getDate();
  const days = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const dow = new Date(y, m - 1, d).getDay();
    if (dow === 0 || dow === 6) continue; // weekdays only
    days.push({ d, dow });
  }

  const headCells = days.map(({ d, dow }) => {
    const isToday = (y === new Date().getFullYear() && m === new Date().getMonth()+1 && d === new Date().getDate());
    return `<div class="att-hc${isToday ? ' today' : ''}">${WEEKDAY_JP[dow]}<br>${d}</div>`;
  }).join('');

  const alerts = [];
  const rows = students.map(st => {
    let cAbsent = 0, cMax = 0, run = 0, late = 0, early = 0, present = 0;
    const cells = days.map(({ d }) => {
      const dateStr = `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      const status = state.attendance[st.id]?.[dateStr] || '';
      if (status === 'absent') { cAbsent++; run++; cMax = Math.max(cMax, run); } else run = 0;
      if (status === 'late')  late++;
      if (status === 'early') early++;
      if (status === 'present') present++;
      return `<button class="att-cell-btn" data-sid="${st.id}" data-date="${dateStr}">
        <span class="${ATT_CLASS[status]}">${ATT_MARK[status]}</span></button>`;
    }).join('');
    if (cMax >= 3) alerts.push(`${st.name}（${cMax}日連続欠席）`);
    const summary = `<div class="att-sum"><span class="att-sum-x">欠${cAbsent}</span><span class="att-sum-t">遅${late}</span><span class="att-sum-e">早${early}</span></div>`;
    return `<div class="att-row">
      <div class="att-name"><span class="att-num">${st.number || ''}</span>${escHtml(st.name)}</div>
      ${cells}${summary}</div>`;
  }).join('');

  const alertHtml = alerts.length
    ? `<div class="att-alert">⚠️ 連続欠席に注意：${alerts.map(escHtml).join('、')}</div>` : '';

  container.innerHTML = `
    <p class="settings-hint">セルをタップして 出席○ → 欠席× → 遅刻△ → 早退▽ → 空 と切り替わります。右端に月間集計が出ます。</p>
    ${alertHtml}
    <div class="att-grid-wrap" style="--att-days:${days.length}">
      <div class="att-head"><div class="att-hc att-hc--name">氏名</div>${headCells}<div class="att-hc att-hc--sum">月間計</div></div>
      ${rows}
    </div>
    <div class="att-legend">
      <span class="leg-i"><span class="att-o">○</span>出席</span>
      <span class="leg-i"><span class="att-x">×</span>欠席</span>
      <span class="leg-i"><span class="att-tri">△</span>遅刻</span>
      <span class="leg-i"><span class="att-tri">▽</span>早退</span>
    </div>`;

  container.querySelectorAll('.att-cell-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const sid = btn.dataset.sid, date = btn.dataset.date;
      if (!state.attendance[sid]) state.attendance[sid] = {};
      const cur = state.attendance[sid][date] || '';
      const next = ATT_CYCLE[cur];
      if (next) state.attendance[sid][date] = next;
      else delete state.attendance[sid][date];
      const span = btn.querySelector('span');
      span.className = ATT_CLASS[next];
      span.textContent = ATT_MARK[next];
      save();
      // refresh this row's monthly summary
      const rec = state.attendance[sid] || {};
      let ab=0, la=0, ea=0;
      Object.values(rec).forEach(s => { if (s==='absent') ab++; else if (s==='late') la++; else if (s==='early') ea++; });
      const sum = btn.closest('.att-row')?.querySelector('.att-sum');
      if (sum) sum.innerHTML = `<span class="att-sum-x">欠${ab}</span><span class="att-sum-t">遅${la}</span><span class="att-sum-e">早${ea}</span>`;
    });
  });
}

/* ── Evaluation ──────────────────────────────────────────── */
function renderEvaluation() {
  fillSchoolSelect(document.getElementById('evalSchoolSelect'));
  fillClassSelect(document.getElementById('evalClassSelect'));

  const subjSel = document.getElementById('evalSubjectSelect');
  if (subjSel) {
    const cur = subjSel.value;
    subjSel.innerHTML = state.settings.subjects.map(s => `<option value="${s.id}">${escHtml(s.name)}</option>`).join('');
    if (cur) subjSel.value = cur;
  }
  const subjectId = subjSel?.value || state.settings.subjects[0]?.id || '';

  const container = document.getElementById('evaluationContent');
  if (!container) return;

  const students = studentsInClass(state.rosterClass);
  if (!students.length) {
    container.innerHTML = `<div class="student-empty"><p>この学級に生徒がいません。名簿で登録してください。</p></div>`;
    return;
  }

  // 列（項目）は 学校×学級×教科 ごとに保持
  const colKey = `${state.activeSchoolId}__${state.rosterClass}__${subjectId}`;
  if (!state.evalColumns[colKey]) state.evalColumns[colKey] = [];
  const columns = state.evalColumns[colKey];

  const scoreOf = (sid, colId) => state.evaluations[sid]?.[subjectId]?.scores?.[colId] ?? '';

  const head = `<tr>
    <th class="evt-name evt-corner">氏名</th>
    ${columns.map(c => `<th class="evt-col"><span class="evt-col-name" data-col="${c.id}" title="クリックで名前変更">${escHtml(c.name)}</span><button class="evt-col-del" data-del="${c.id}" aria-label="${escHtml(c.name)}を削除">✕</button></th>`).join('')}
    <th class="evt-add"><button class="evt-add-btn" id="evtAddCol">＋ 項目</button></th>
  </tr>`;

  const body = students.map(st => `<tr>
    <td class="evt-name"><span class="evt-num">${st.number || ''}</span>${escHtml(st.name)}</td>
    ${columns.map(c => `<td class="evt-cell"><input class="evt-input" inputmode="decimal" data-sid="${st.id}" data-col="${c.id}" value="${escHtml(String(scoreOf(st.id, c.id)))}" aria-label="${escHtml(st.name)} ${escHtml(c.name)}" /></td>`).join('')}
    <td class="evt-pad"></td>
  </tr>`).join('');

  container.innerHTML = `
    <p class="settings-hint">点数を入力する表です。右上の「＋ 項目」でテスト等の列を増やせます（学級・教科ごとに保存）。</p>
    <div class="evt-wrap">
      <table class="evt-table">
        <thead>${head}</thead>
        <tbody>${body}</tbody>
      </table>
    </div>`;

  // 項目（列）を追加
  container.querySelector('#evtAddCol')?.addEventListener('click', async () => {
    const name = await customPrompt('項目名（例：1学期中間 / 小テスト①）', `項目${columns.length + 1}`);
    if (name === null) return;
    columns.push({ id: 'col_' + uid(), name: (name || '').trim() || `項目${columns.length + 1}` });
    save(); renderEvaluation();
  });
  // 列名の変更
  container.querySelectorAll('.evt-col-name').forEach(el => el.addEventListener('click', async () => {
    const col = columns.find(c => c.id === el.dataset.col); if (!col) return;
    const name = await customPrompt('項目名を変更', col.name);
    if (name === null) return;
    col.name = (name || '').trim() || col.name; save(); renderEvaluation();
  }));
  // 列の削除
  container.querySelectorAll('.evt-col-del').forEach(b => b.addEventListener('click', async () => {
    const col = columns.find(c => c.id === b.dataset.del); if (!col) return;
    if (!await customConfirm(`項目「${col.name}」を削除しますか?（入力した点数も消えます）`)) return;
    const idx = columns.indexOf(col); columns.splice(idx, 1);
    students.forEach(st => { const sc = state.evaluations[st.id]?.[subjectId]?.scores; if (sc) delete sc[col.id]; });
    save(); renderEvaluation();
  }));
  // 点数入力
  container.querySelectorAll('.evt-input').forEach(inp => inp.addEventListener('input', () => {
    const sid = inp.dataset.sid, colId = inp.dataset.col;
    if (!state.evaluations[sid]) state.evaluations[sid] = {};
    if (!state.evaluations[sid][subjectId]) state.evaluations[sid][subjectId] = {};
    if (!state.evaluations[sid][subjectId].scores) state.evaluations[sid][subjectId].scores = {};
    state.evaluations[sid][subjectId].scores[colId] = inp.value;
    save();
  }));
}

function navigateAttendanceMonth(delta) {
  state.attendanceMonth += delta;
  if (state.attendanceMonth > 12) { state.attendanceMonth = 1;  state.attendanceYear++; }
  if (state.attendanceMonth < 1)  { state.attendanceMonth = 12; state.attendanceYear--; }
  renderAttendance();
}

/* ═══ QR受付（出席）システム ═══ */
const FORGOT_ITEMS = ['教科書','ノート','ワーク','プリント','筆記用具','提出物','宿題','タブレット','体操服','その他'];
/* The editable list lives in settings; fall back to the defaults above. */
function getForgotItems() {
  const list = state.settings.forgotItems;
  return (Array.isArray(list) && list.length) ? list : FORGOT_ITEMS;
}
let _rcpForgotStudent = null;

function rcpKey() {
  return { date: document.getElementById('rcpDate').value, period: document.getElementById('rcpPeriod').value, cls: document.getElementById('rcpClass').value };
}

/* populate the reception class select from the active school's classes */
function rcpFillClasses(preferClass) {
  const clsSel = document.getElementById('rcpClass');
  if (!clsSel) return;
  const classes = getClassList();
  const want = preferClass || state.rosterClass;
  // 完全一致→正規化一致の順で選択（全角/半角の違いを吸収）
  let chosen = null;
  if (want) chosen = classes.find(c => c === want) || classes.find(c => normClass(c) === normClass(want)) || null;
  const list = classes.slice();
  if (want && !chosen) { list.push(want); chosen = want; } // 一覧に無くても受付できるよう追加
  clsSel.innerHTML = list.map(c => `<option value="${escHtml(c)}">${escHtml(c)}</option>`).join('');
  if (chosen) { clsSel.value = chosen; state.rosterClass = chosen; }
}

/* 授業の学級名(全角や「四中…」プレフィックス込み)から、所属学校と名簿上の正式な学級名を解決。
   授業モーダルから受付に来たときに「その学校・その学級」を自動で引き継ぐため。 */
function resolveLessonClass(className) {
  if (!className) return { schoolId: null, name: '' };
  const target = normClass(className);
  for (const sc of state.schools) {
    const names = [...new Set(state.students.filter(s => s.schoolId === sc.id).map(s => s.className).filter(Boolean))];
    const hit = names.find(nm => normClass(nm) === target || normClass(sc.name + nm) === target);
    if (hit) return { schoolId: sc.id, name: hit };
  }
  return { schoolId: null, name: className }; // 名簿に無ければ学校は判別不可。名前だけ
}

function openReception(prefill) {
  _ensureScanAudio();   // 受付を開いたタップのうちに確認音を解錠
  // school select
  const schoolSel = document.getElementById('rcpSchool');
  if (schoolSel) {
    if (prefill?.schoolId && state.schools.some(s => s.id === prefill.schoolId)) state.activeSchoolId = prefill.schoolId;
    fillSchoolSelect(schoolSel);
  }

  // date / period
  const dateEl = document.getElementById('rcpDate');
  dateEl.value = prefill?.date || dateEl.value || formatDate(new Date());
  if (prefill?.period != null) document.getElementById('rcpPeriod').value = String(prefill.period);

  // classes for the (possibly prefilled) school + class（表記ゆれは rcpFillClasses が吸収）
  rcpFillClasses(prefill?.cls);

  document.getElementById('receptionOverlay').removeAttribute('hidden');
  renderReceptionLists();
  setTimeout(() => document.getElementById('rcpScanInput')?.focus(), 60);
}
function closeReception() {
  stopCamScan();
  document.getElementById('receptionOverlay').setAttribute('hidden', '');
  switchView('attendance');   // 受付終了後はそのまま出席タブへ（ここで修正できるように）
}

/* ── 受付：カメラでQR読み取り（BarcodeDetector優先＝高速、無ければjsQRフォールバック） ── */
let _camStream = null, _camTimer = null, _camDetector = null, _camCooldown = 0;
let _camFacing = 'environment';   // 'environment'=背面 / 'user'=前面

/* zxing-wasm：jsQRより高精度・高速なQRデコーダ（BarcodeDetector非対応のiOS等で使う）。
   CDNから動的import。失敗（オフライン等）したら jsQR にフォールバックするので安全。 */
let _zxingMod = null, _zxingTried = false;
function _getZxing() {
  if (_zxingMod || _zxingTried) return;
  _zxingTried = true;
  import('https://esm.sh/zxing-wasm@2/reader')
    .then(m => { _zxingMod = m; })
    .catch(() => { _zxingMod = null; });
}

const CAM_CONSTRAINTS = facing => ({ video: { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });

function _updateCamFlipLabel() {
  const b = document.getElementById('rcpCamFlip');
  if (b) b.textContent = _camFacing === 'user' ? '🔄 前面カメラ' : '🔄 背面カメラ';
}

async function startCamScan() {
  _ensureScanAudio();   // タップ操作のうちに確認音を解錠
  const video = document.getElementById('rcpCamVideo');
  const wrap = document.getElementById('rcpCam');
  const btn = document.getElementById('rcpCamBtn');
  if (!video || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    rcpFlash('この端末ではカメラを使えません', true); return;
  }
  _camFacing = 'environment';
  try {
    _camStream = await navigator.mediaDevices.getUserMedia(CAM_CONSTRAINTS(_camFacing));
  } catch (e) { rcpFlash('カメラを起動できませんでした（カメラの許可が必要です）', true); return; }
  video.srcObject = _camStream;
  video.style.transform = 'none';
  try { await video.play(); } catch (e) {}
  if (wrap) wrap.hidden = false;
  if (btn) btn.hidden = true;
  document.querySelector('.rcp-scanmain')?.classList.add('cam-active');   // ID入力欄等を隠してプレビューを拡大
  _updateCamFlipLabel();
  _camDetector = null;
  if ('BarcodeDetector' in window) {
    try { _camDetector = new BarcodeDetector({ formats: ['qr_code'] }); } catch (e) { _camDetector = null; }
  }
  if (!_camDetector) _getZxing();   // iOS等：高精度エンジン(zxing-wasm)を先読み
  clearTimeout(_camTimer);
  _camTick();
}
/* 前面／背面カメラの切り替え（許可は取得済みなので再プロンプトは出ない） */
async function flipCamScan() {
  if (!_camStream || !navigator.mediaDevices) return;
  _camFacing = _camFacing === 'environment' ? 'user' : 'environment';
  try { _camStream.getTracks().forEach(t => t.stop()); } catch (e) {}
  try {
    _camStream = await navigator.mediaDevices.getUserMedia(CAM_CONSTRAINTS(_camFacing));
  } catch (e) {
    // 一部端末は前面が無い／指定が厳しい等。素の指定で再試行。
    try { _camStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: _camFacing }, audio: false }); }
    catch (e2) { rcpFlash(`${_camFacing === 'user' ? '前面' : '背面'}カメラに切り替えられませんでした`, true); _camFacing = _camFacing === 'user' ? 'environment' : 'user'; _updateCamFlipLabel(); return; }
  }
  const video = document.getElementById('rcpCamVideo');
  if (video) {
    video.srcObject = _camStream;
    video.style.transform = _camFacing === 'user' ? 'scaleX(-1)' : 'none';   // 前面は鏡像表示
    try { await video.play(); } catch (e) {}
  }
  _updateCamFlipLabel();
}
async function _camTick() {
  if (!_camStream) return;
  const video = document.getElementById('rcpCamVideo');
  const popupOpen = !document.getElementById('forgotModalBackdrop')?.hasAttribute('hidden');
  if (video && video.readyState >= 2 && Date.now() >= _camCooldown && !popupOpen) {
    let text = null;
    try {
      if (_camDetector || window.jsQR) {
        const c = document.getElementById('rcpCamCanvas');
        const vw = video.videoWidth || 640, vh = video.videoHeight || 480;
        // 中央の正方形だけ切り出して縮小（前面/背面どちらも・両エンジン共通で読み取り枠に合わせる）
        const crop = Math.round(Math.min(vw, vh) * 0.72);
        const sx = Math.round((vw - crop) / 2), sy = Math.round((vh - crop) / 2);
        const side = 480;   // 広角の前面カメラでもQRが小さくなりすぎないよう少し高解像度に
        c.width = side; c.height = side;
        const ctx = c.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(video, sx, sy, crop, crop, 0, 0, side, side);
        if (_camDetector) {
          const codes = await _camDetector.detect(c);
          if (codes && codes.length) text = codes[0].rawValue;
        } else {
          const img = ctx.getImageData(0, 0, side, side);
          if (_zxingMod && _zxingMod.readBarcodes) {   // 高精度エンジン優先（小さい/傾いたQRに強い）
            try {
              const res = await _zxingMod.readBarcodes(img, { tryHarder: true, formats: ['QRCode'], maxNumberOfSymbols: 1 });
              if (res && res.length && res[0].text) text = res[0].text;
            } catch (e) {}
          }
          if (!text && window.jsQR) {   // 取れなければ jsQR（オフライン時もこちら）
            const r = window.jsQR(img.data, side, side, { inversionAttempts: 'dontInvert' });
            if (r && r.data) text = r.data;
          }
        }
      }
    } catch (e) {}
    if (text) {
      _camCooldown = Date.now() + 1800;   // 同じQRの連続読み取り防止
      const input = document.getElementById('rcpScanInput');
      if (input) { input.value = String(text).trim(); handleRcpScan(); }
    }
  }
  _camTimer = setTimeout(_camTick, 60);   // 約16fps
}
function stopCamScan() {
  clearTimeout(_camTimer); _camTimer = null;
  if (_camStream) { try { _camStream.getTracks().forEach(t => t.stop()); } catch (e) {} _camStream = null; }
  const video = document.getElementById('rcpCamVideo'); if (video) video.srcObject = null;
  const wrap = document.getElementById('rcpCam'); if (wrap) wrap.hidden = true;
  const btn = document.getElementById('rcpCamBtn'); if (btn) btn.hidden = false;
  document.querySelector('.rcp-scanmain')?.classList.remove('cam-active');
}

/* 読み取り確認音（Web Audioで生成＝音源ファイル不要・オフライン可）。
   iOS等で鳴らすにはユーザー操作で一度 unlock が必要なので、受付/カメラ開始時に解錠する。 */
let _scanAudioCtx = null;
function _ensureScanAudio() {
  try {
    if (!_scanAudioCtx) _scanAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (_scanAudioCtx.state === 'suspended') _scanAudioCtx.resume();
  } catch (e) {}
}
function playScanBeep() {
  try {
    _ensureScanAudio();
    const ctx = _scanAudioCtx; if (!ctx) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(880, t);          // ピ
    o.frequency.setValueAtTime(1320, t + 0.07);  // ポッ（二段で「読み取った感」）
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.3, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    o.connect(g); g.connect(ctx.destination);
    o.start(t); o.stop(t + 0.2);
  } catch (e) {}
}

function handleRcpScan() {
  const input = document.getElementById('rcpScanInput');
  const code = input.value.trim();
  if (!code) return;
  input.value = '';
  const { cls } = rcpKey();
  const inClass = studentsInClass(cls);
  // qrId 完全一致（学校内）。別の学級の生徒なら弾く。
  const byId = activeSchoolStudents().find(s => s.qrId === code);
  if (byId && !inClass.some(s => s.id === byId.id)) {
    rcpFlash(`${byId.name || 'この生徒'} は受付中の学級ではありません（${byId.className || '別の学級'}）`, true);
    return;
  }
  let st = byId || null;
  if (!st) {   // 出席番号での手入力フォールバック（当該学級内のみ）
    const num = parseInt(code.replace(/\D/g, ''), 10);
    st = inClass.find(s => s.number === num) || null;
  }
  if (!st) { rcpFlash(`「${code}」は見つかりません`, true); return; }
  playScanBeep();   // 読み取り確認音
  openForgotPopup(st);
}

/* ── ハードウェアQR/バーコードリーダー対応 ──
   リーダーは「キーボードの超高速連打＋Enter」として届く。受付中にフォーカスが
   入力欄から外れていると桁を取りこぼすため、画面全体でキー入力を監視し、
   高速連打（=リーダー）だけをバッファに溜めてEnterでまとめて処理する。
   手入力欄やメモを人が打っている間（該当欄にフォーカス）は一切介入しない。 */
let _scanBuf = '';
let _scanLastTs = 0;
let _scanTimer = null;
const SCAN_GAP_MS = 60;   // これより短い間隔の連続入力＝リーダーとみなす
const SCAN_MIN_LEN = 4;

function _scanReset() { _scanBuf = ''; clearTimeout(_scanTimer); }
function _scanCommit() {
  const code = _scanBuf;
  _scanReset();
  if (code.length >= SCAN_MIN_LEN) _processScannedCode(code);
}

function _scanKeyHandler(e) {
  const ov = document.getElementById('receptionOverlay');
  if (!ov || ov.hasAttribute('hidden')) { _scanReset(); return; }   // 受付中のみ作動
  const ae = document.activeElement;
  if (ae && ae.id === 'forgotMemo') { _scanReset(); return; }        // メモの手入力には触らない
  if (e.ctrlKey || e.metaKey || e.altKey) return;

  const now = Date.now();
  const fast = now - _scanLastTs < SCAN_GAP_MS;   // 連打＝ハードウェアリーダー
  _scanLastTs = now;

  if (e.key === 'Enter') {
    // リーダーの連打（または十分な長さ）に続くEnter＝1件として確定。
    // 入力欄にフォーカスがあっても拾えるよう、ここで横取りする。
    if (_scanBuf.length >= SCAN_MIN_LEN && (fast || _scanBuf.length >= 6)) {
      e.preventDefault(); e.stopPropagation();
      _scanCommit();
    } else {
      _scanReset();   // ゆっくりの手入力Enterは入力欄側の処理に任せる
    }
    return;
  }
  if (e.key && e.key.length === 1) {
    if (!fast) _scanBuf = '';            // 連打が途切れたら新しい読み取りとして開始
    _scanBuf += e.key;
    if (fast && _scanBuf.length >= 2) { e.preventDefault(); e.stopPropagation(); }   // 連打中の桁が入力欄に散らばらないように
    clearTimeout(_scanTimer);
    // Enterを送らないリーダー向け：連打が止まったら自動確定（手入力は短いので発火しない）
    _scanTimer = setTimeout(() => { if (_scanBuf.length >= 6) _scanCommit(); else _scanReset(); }, 130);
  }
}

function _processScannedCode(code) {
  // 忘れ物ポップアップ表示中は、今の生徒を確定してから（取りこぼし防止のため無視）
  const popup = document.getElementById('forgotModalBackdrop');
  if (popup && !popup.hasAttribute('hidden')) return;
  const input = document.getElementById('rcpScanInput');
  if (input) input.value = String(code).trim();
  handleRcpScan();
}

function rcpFlash(msg, err) {
  const hint = document.getElementById('rcpScanHint');
  if (!hint) return;
  hint.textContent = msg;
  hint.style.color = err ? 'var(--danger)' : 'var(--student)';
  setTimeout(() => { hint.textContent = '外付けリーダーはそのまま使えます。手入力は出席番号でもOK。'; hint.style.color = ''; }, 2200);
}

function openForgotPopup(student) {
  _rcpForgotStudent = student;
  document.getElementById('forgotName').textContent = student.name;
  document.getElementById('forgotId').textContent = `${student.className} ${student.number}番`;
  document.getElementById('forgotMemo').value = '';
  const grid = document.getElementById('forgotGrid');
  grid.innerHTML = getForgotItems().map(it => `<button type="button" class="forgot-item" data-item="${escHtml(it)}">${escHtml(it)}</button>`).join('');
  grid.querySelectorAll('.forgot-item').forEach(b => b.addEventListener('click', () => b.classList.toggle('selected')));
  document.getElementById('forgotModalBackdrop').removeAttribute('hidden');
  setTimeout(() => document.getElementById('forgotPresentBtn')?.focus(), 40);
}
function closeForgotPopup() {
  document.getElementById('forgotModalBackdrop').setAttribute('hidden', '');
  _rcpForgotStudent = null;
  document.getElementById('rcpScanInput')?.focus();
}

function confirmPresent() {
  const st = _rcpForgotStudent;
  if (!st) return;
  const items = [...document.querySelectorAll('#forgotGrid .forgot-item.selected')].map(b => b.dataset.item);
  const memo = document.getElementById('forgotMemo').value.trim();
  if (memo) items.push(memo);
  const { date, period } = rcpKey();

  // mark present in the monthly grid (linked to 週案 via date)
  if (!state.attendance[st.id]) state.attendance[st.id] = {};
  state.attendance[st.id][date] = 'present';

  // upsert reception record
  const existing = state.reception.find(r => r.date === date && String(r.period) === String(period) && r.studentId === st.id);
  if (existing) { existing.items = items; existing.time = nowTimeStr(); }
  else state.reception.push({ date, period, className: st.className, studentId: st.id, name: st.name, time: nowTimeStr(), items });

  save();
  closeForgotPopup();
  renderReceptionLists();
  rcpBurst(st.name, items.length);
}

function nowTimeStr() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

function renderReceptionLists() {
  const { date, period, cls } = rcpKey();
  const roster = studentsInClass(cls);
  const recs = state.reception.filter(r => r.date === date && String(r.period) === String(period) && roster.some(s => s.id === r.studentId));
  const recById = {}; recs.forEach(r => { recById[r.studentId] = r; });
  const presentIds = new Set(recs.map(r => r.studentId));
  const present = roster.filter(s => presentIds.has(s.id));
  const remain  = roster.filter(s => !presentIds.has(s.id));

  const pN = document.getElementById('rcpPresentN'); if (pN) pN.textContent = present.length;
  const rN = document.getElementById('rcpRemainN');  if (rN) rN.textContent = remain.length;

  // 受付済み（新しい順）— ✕で取り消し（先生のみ操作する想定）
  const presentList = document.getElementById('rcpPresentList');
  if (presentList) {
    const sorted = present.slice().sort((a, b) => (recById[b.id]?.time || '').localeCompare(recById[a.id]?.time || ''));
    presentList.innerHTML = sorted.map(s => {
      const r = recById[s.id];
      const forgot = (r?.items || []).length;
      return `<div class="rcp-rowitem rcp-rowitem--done${forgot ? ' has-forgot' : ''}">
        <span class="rcp-rowitem-num">${s.number || ''}</span>
        <span class="rcp-rowitem-name">${escHtml(s.name)}</span>
        ${forgot ? `<span class="rcp-rowitem-forgot">🎒 ${escHtml((r.items || []).join('・'))}</span>` : ''}
        <span class="rcp-rowitem-time">${r?.time || ''}</span>
        <button class="rcp-rowitem-undo" data-undo="${s.id}" aria-label="${escHtml(s.name)}の受付を取消">✕</button>
      </div>`;
    }).join('') || '<div class="rcp-empty">まだ受付がありません</div>';
    presentList.querySelectorAll('.rcp-rowitem-undo').forEach(b => b.addEventListener('click', async () => {
      const sid = b.dataset.undo;
      if (await customConfirm('この生徒の受付を取り消しますか?')) {
        state.reception = state.reception.filter(r => !(r.date === date && String(r.period) === String(period) && r.studentId === sid));
        if (state.attendance[sid]) delete state.attendance[sid][date];
        save(); renderReceptionLists();
      }
    }));
  }

  // 未受付（表示のみ＝代理タップ防止。受付はQR/番号入力で行う）
  const remainList = document.getElementById('rcpRemainList');
  if (remainList) {
    remainList.innerHTML = remain.map(s =>
      `<div class="rcp-rowitem"><span class="rcp-rowitem-num">${s.number || ''}</span><span class="rcp-rowitem-name">${escHtml(s.name)}</span></div>`
    ).join('') || '<div class="rcp-empty">全員そろいました 🎉</div>';
  }
}

/* 受付完了：前面に一瞬カッコよく出してすぐ消える（残さない） */
let _rcpBurstTimer = null;
function rcpBurst(name, forgot) {
  const el = document.getElementById('rcpBurst');
  if (!el) return;
  document.getElementById('rcpBurstName').textContent = name;
  document.getElementById('rcpBurstMsg').textContent = forgot ? '出席（忘れ物あり）' : '出席しました';
  el.classList.toggle('has-forgot', !!forgot);
  el.removeAttribute('hidden');
  el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
  clearTimeout(_rcpBurstTimer);
  _rcpBurstTimer = setTimeout(() => {
    el.classList.remove('show'); el.classList.add('out');
    setTimeout(() => { el.classList.remove('out'); el.setAttribute('hidden', ''); }, 260);
  }, 1100);
}

/* ── Settings ────────────────────────────────────────────── */
function renderSettings() {
  const s = id => document.getElementById(id);
  if (s('teacherName'))    s('teacherName').value    = state.settings.teacherName;
  if (s('schoolName'))     s('schoolName').value      = state.settings.schoolName;
  if (s('periodsCount'))   s('periodsCount').value    = state.settings.periodsCount;
  if (s('lessonDuration')) s('lessonDuration').value  = state.settings.lessonDuration || 50;

  renderSubjectColorGrid();
  renderClassesList();
  renderAppearanceSeg();
  renderThemeGrid();
  renderTransitionGrid();
  const verEl = document.getElementById('aboutVersion');
  if (verEl) verEl.textContent = 'v' + APP_VERSION;
}

/* show the running version in the header so it's visible on every screen
   (makes "is the new build loaded?" answerable at a glance) */
function showHeaderVersion() {
  const el = document.getElementById('headerVersion');
  if (el) el.textContent = 'v' + APP_VERSION;
}

function renderForgotItemsEditor() {
  const container = document.getElementById('forgotEditList');
  if (!container) return;
  // seed settings from defaults the first time so the user can edit them
  if (!Array.isArray(state.settings.forgotItems)) state.settings.forgotItems = [...FORGOT_ITEMS];
  container.innerHTML = '';
  state.settings.forgotItems.forEach((item, idx) => {
    const el = document.createElement('div');
    el.className = 'subject-color-item';
    el.innerHTML = `
      <span class="subject-color-name">${escHtml(item)}</span>
      <button class="subject-del-btn" aria-label="${escHtml(item)}を削除" data-idx="${idx}">
        <svg width="16" height="16" viewBox="0 0 14 14" fill="none"><path d="M2 2l10 10M12 2L2 12" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
      </button>`;
    el.querySelector('.subject-del-btn').addEventListener('click', () => {
      state.settings.forgotItems.splice(idx, 1);
      save(); renderForgotItemsEditor();
    });
    container.appendChild(el);
  });
}

function openForgotItemsModal() {
  renderForgotItemsEditor();
  document.getElementById('forgotItemsModalBackdrop')?.removeAttribute('hidden');
  setTimeout(() => document.getElementById('forgotAddName')?.focus(), 40);
}

function closeForgotItemsModal() {
  document.getElementById('forgotItemsModalBackdrop')?.setAttribute('hidden', '');
}

function addForgotItem(name) {
  name = (name || '').trim();
  if (!name) return false;
  if (!Array.isArray(state.settings.forgotItems)) state.settings.forgotItems = [...FORGOT_ITEMS];
  if (state.settings.forgotItems.includes(name)) return false;
  state.settings.forgotItems.push(name);
  save();
  renderForgotItemsEditor();
  return true;
}

/* 「設定を保存」ボタンが必要なカテゴリ（入力欄を後でまとめて保存するもの）だけ。
   テーマ・外観・アニメ・教科は選択した瞬間に save() 済みなので不要。 */
const SETTINGS_SAVE_CATS = ['account', 'lesson'];

/* iPad-style settings master-detail: show one category at a time */
function showSettingsCategory(cat) {
  document.querySelectorAll('.settings-nav-item').forEach(b =>
    b.classList.toggle('active', b.dataset.cat === cat));
  document.querySelectorAll('.settings-section[data-cat]').forEach(sec =>
    sec.classList.toggle('hidden', sec.dataset.cat !== cat));
  if (cat === 'feedback' && window.Tally) { try { Tally.loadEmbeds(); } catch (e) {} }
  const actions = document.querySelector('.settings-actions');
  if (actions) actions.classList.toggle('hidden', !SETTINGS_SAVE_CATS.includes(cat));
}

function renderSubjectColorGrid() {
  const container = document.getElementById('subjectColorGrid');
  if (!container) return;
  container.innerHTML = '';
  state.settings.subjects.forEach(s => {
    const item = document.createElement('div');
    item.className = 'subject-color-item';
    item.innerHTML = `
      <input type="color" class="subject-color-input" value="${s.color}" aria-label="${escHtml(s.name)}のカラー" data-id="${s.id}" />
      <span class="subject-color-name">${escHtml(s.name)}</span>
      <button class="subject-del-btn" aria-label="${escHtml(s.name)}を削除" data-id="${s.id}">
        <svg width="16" height="16" viewBox="0 0 14 14" fill="none"><path d="M2 2l10 10M12 2L2 12" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
      </button>`;
    item.querySelector('.subject-color-input').addEventListener('input', e => {
      const sub = state.settings.subjects.find(x => x.id === e.target.dataset.id);
      if (sub) { sub.color = e.target.value; save(); renderWeekGrid(); }
    });
    item.querySelector('.subject-del-btn').addEventListener('click', async () => {
      if (await customConfirm(`教科「${s.name}」を削除しますか?`)) {
        state.settings.subjects = state.settings.subjects.filter(x => x.id !== s.id);
        save(); renderSubjectColorGrid(); renderWeekGrid();
      }
    });
    container.appendChild(item);
  });
}

function addSubject(name, color) {
  name = (name || '').trim();
  if (!name) return false;
  const id = 'subj_' + uid();
  state.settings.subjects.push({ id, name, color: color || '#4F46E5' });
  save();
  renderSubjectColorGrid();
  return true;
}

function renderClassesList() {
  const list = document.getElementById('classesList');
  if (!list) return;
  list.innerHTML = '';
  const classes = getClassList();
  if (!classes.length) {
    list.innerHTML = '<p class="placeholder-text">まだ学級がありません。名簿で生徒を登録してください。</p>';
    return;
  }
  classes.forEach(cls => {
    const count = studentsInClass(cls).length;
    const chip = document.createElement('span');
    chip.className = 'class-chip class-chip--readonly';
    chip.innerHTML = `${escHtml(cls)}${count ? `<span class="class-chip-count">${count}</span>` : ''}`;
    list.appendChild(chip);
  });
}

function saveSettings() {
  const s = id => document.getElementById(id);
  state.settings.teacherName    = s('teacherName')?.value.trim()   || '';
  state.settings.schoolName     = s('schoolName')?.value.trim()    || '';
  state.settings.periodsCount = parseInt(s('periodsCount')?.value || DEFAULT_PERIODS, 10);
  state.settings.lessonDuration = parseInt(s('lessonDuration')?.value || 50, 10);
  save();
  renderWeekGrid();
  showToast('設定を保存しました');
}

/* ── 保存容量メーター（v11: 全データがIndexedDB側なので単一メーターに統合） ──── */
function _fmtBytes(b) {
  if (!b || b < 0) return '0 B';
  const u = ['B', 'KB', 'MB', 'GB', 'TB']; let i = 0;
  while (b >= 1024 && i < u.length - 1) { b /= 1024; i++; }
  return (b >= 10 || i === 0 ? Math.round(b) : b.toFixed(1)) + ' ' + u[i];
}
function _meterColor(pct) {
  return pct >= 90 ? 'var(--danger, #dc2626)' : (pct >= 70 ? '#f59e0b' : 'var(--brand)');
}
async function updateStorageMeter() {
  // v10にあった「テキスト＝localStorage・5MB上限」メーターは廃止。
  // v11はテキストも写真・手書きも同じIndexedDBに入るため、単一のメーターで足りる。
  const text = document.getElementById('storageMeterText');
  const fill = document.getElementById('storageMeterFill');
  if (text && fill) {
    try {
      if (navigator.storage && navigator.storage.estimate) {
        const est = await navigator.storage.estimate();
        const usage = est.usage || 0, quota = est.quota || 0;
        const pct = quota ? Math.min(100, Math.round(usage / quota * 100)) : 0;
        text.textContent = `${_fmtBytes(usage)} / ${_fmtBytes(quota)}（${pct}%）`;
        if (navigator.storage.persisted) {
          try {
            const persisted = await navigator.storage.persisted();
            text.textContent += persisted ? ' ・自動削除されない設定: 有効' : ' ・自動削除されない設定: 未確定';
          } catch (_) {}
        }
        fill.style.width = pct + '%';
        fill.style.background = _meterColor(pct);
      } else {
        text.textContent = 'この端末では取得できません';
      }
    } catch (e) { text.textContent = '取得に失敗しました'; }
  }
}

/* ── Teacher Password UI ─────────────────────────────────── */

/* ── Weather ─────────────────────────────────────────────── */
/* (openWeatherModal already defined above) */

/* ── Toast ───────────────────────────────────────────────── */
function showToast(msg) {
  let toast = document.getElementById('toastEl');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toastEl';
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');
    Object.assign(toast.style, {
      position: 'fixed',
      bottom: 'calc(20px + env(safe-area-inset-bottom))',
      left: '50%', transform: 'translateX(-50%)',
      background: 'var(--gray-800,#1f2937)', color: '#fff',
      padding: '10px 20px', borderRadius: '24px',
      fontSize: '13px', fontWeight: '600',
      boxShadow: '0 4px 16px rgba(0,0,0,.2)', zIndex: '9999',
      transition: 'opacity .3s, transform .3s', pointerEvents: 'auto',
      touchAction: 'none', cursor: 'pointer', userSelect: 'none',
    });
    document.body.appendChild(toast);
    wireSwipeDismiss(toast);
  }
  toast.textContent = msg;
  toast.style.transform = 'translateX(-50%)';
  toast.style.opacity = '1';
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => { toast.style.opacity = '0'; }, 2500);
}

/* バナーをスワイプ／タップですぐ消せるようにする（下端トースト向け：横スワイプ＋下スワイプで離脱） */
function wireSwipeDismiss(el) {
  el.style.willChange = 'transform, opacity';
  const reset = () => {
    el.style.transition = 'opacity .25s ease, transform .25s cubic-bezier(.22,1,.36,1)';
    el.style.transform = 'translateX(-50%)';
    el.style.opacity = '1';
  };
  const fling = (tx, ty) => {
    clearTimeout(el._timer);
    el.style.transition = 'opacity .22s ease, transform .22s ease';
    el.style.transform = `translateX(calc(-50% + ${tx}px)) translateY(${ty}px)`;
    el.style.opacity = '0';
  };
  let sx = 0, sy = 0, dx = 0, dy = 0, dragging = false, moved = false;
  el.addEventListener('touchstart', e => {
    const t = e.touches[0]; sx = t.clientX; sy = t.clientY; dx = dy = 0; dragging = true; moved = false;
    el.style.transition = 'none';
    clearTimeout(el._timer);   // ドラッグ中は自動消去を止める
  }, { passive: true });
  el.addEventListener('touchmove', e => {
    if (!dragging) return;
    const t = e.touches[0];
    dx = t.clientX - sx;
    dy = Math.max(t.clientY - sy, -12);   // 上方向はほぼ動かさない（下端トーストなので）
    if (Math.abs(dx) > 5 || Math.abs(dy) > 5) moved = true;
    const dist = Math.max(Math.abs(dx), Math.max(dy, 0));
    el.style.transform = `translateX(calc(-50% + ${dx}px)) translateY(${dy}px)`;
    el.style.opacity = String(Math.max(0.15, 1 - dist / 160));
  }, { passive: true });
  el.addEventListener('touchend', () => {
    dragging = false;
    if (Math.abs(dx) > 56) fling(dx > 0 ? 320 : -320, dy);   // 横スワイプ→その方向へ飛ばす
    else if (dy > 56) fling(dx, 220);                        // 下スワイプ→下へ
    else reset();                                            // 中途半端なら戻す
  });
  el.addEventListener('click', () => { if (!moved) fling(0, 40); });
}

/* Toast with an "元に戻す" (undo) action */
function showUndoToast(msg, restoreFn) {
  let toast = document.getElementById('undoToastEl');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'undoToastEl';
    toast.className = 'undo-toast';
    toast.setAttribute('role', 'status');
    document.body.appendChild(toast);
  }
  toast.innerHTML = `<span>${escHtml(msg)}</span><button class="undo-toast-btn">元に戻す</button>`;
  toast.classList.add('show');
  clearTimeout(toast._timer);
  const close = () => { toast.classList.remove('show'); };
  toast.querySelector('.undo-toast-btn').onclick = () => { restoreFn(); close(); };
  toast._timer = setTimeout(close, 6000);
}

/* ── Custom Prompt / Confirm ─────────────────────────────────
   Native prompt()/confirm() are blocked in PWA / sandboxed
   environments, so we use an in-app modal instead. Both return
   Promises. customPrompt → string|null, customConfirm → bool. */
const DIALOG_ICON_EDIT = '<svg width="26" height="26" viewBox="0 0 24 24" fill="none"><path d="M4 16.5V20h3.5L18 9.5 14.5 6 4 16.5z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M13 7.5L16.5 11" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
const DIALOG_ICON_ASK  = '<svg width="26" height="26" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2"/><path d="M9.5 9.5a2.5 2.5 0 113.5 2.3c-.8.4-1 .9-1 1.7" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="16.5" r="1" fill="currentColor"/></svg>';

function setDialogIcon(svg) {
  const el = document.getElementById('dialogIcon');
  if (el) el.innerHTML = svg;
}

function customPrompt(message, defaultValue = '') {
  return new Promise(resolve => {
    const backdrop = document.getElementById('dialogBackdrop');
    const titleEl  = document.getElementById('dialogTitle');
    const inputEl  = document.getElementById('dialogInput');
    const okBtn    = document.getElementById('dialogOkBtn');
    const cancelBtn= document.getElementById('dialogCancelBtn');
    if (!backdrop) { resolve(null); return; }

    setDialogIcon(DIALOG_ICON_EDIT);
    okBtn.textContent = '追加';
    titleEl.textContent = message;
    inputEl.hidden = false;
    inputEl.value = defaultValue;
    backdrop.removeAttribute('hidden');
    setTimeout(() => { inputEl.focus(); inputEl.select(); }, 30);

    function cleanup() {
      backdrop.setAttribute('hidden', '');
      okBtn.removeEventListener('click', onOk);
      cancelBtn.removeEventListener('click', onCancel);
      inputEl.removeEventListener('keydown', onKey);
      backdrop.removeEventListener('click', onBackdrop);
    }
    function onOk()     { const v = inputEl.value; cleanup(); resolve(v); }
    function onCancel() { cleanup(); resolve(null); }
    function onKey(e) {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onOk(); }
      else if (e.key === 'Escape') onCancel();
    }
    function onBackdrop(e) { if (e.target === backdrop) onCancel(); }

    okBtn.addEventListener('click', onOk);
    cancelBtn.addEventListener('click', onCancel);
    inputEl.addEventListener('keydown', onKey);
    backdrop.addEventListener('click', onBackdrop);
  });
}

function customConfirm(message) {
  return new Promise(resolve => {
    const backdrop = document.getElementById('dialogBackdrop');
    const titleEl  = document.getElementById('dialogTitle');
    const inputEl  = document.getElementById('dialogInput');
    const okBtn    = document.getElementById('dialogOkBtn');
    const cancelBtn= document.getElementById('dialogCancelBtn');
    if (!backdrop) { resolve(false); return; }

    setDialogIcon(DIALOG_ICON_ASK);
    okBtn.textContent = 'OK';
    titleEl.textContent = message;
    inputEl.hidden = true;
    backdrop.removeAttribute('hidden');
    setTimeout(() => okBtn.focus(), 30);

    function cleanup() {
      backdrop.setAttribute('hidden', '');
      okBtn.removeEventListener('click', onOk);
      cancelBtn.removeEventListener('click', onCancel);
      backdrop.removeEventListener('click', onBackdrop);
      document.removeEventListener('keydown', onKey);
    }
    function onOk()     { cleanup(); resolve(true); }
    function onCancel() { cleanup(); resolve(false); }
    function onKey(e) {
      if (e.key === 'Enter')  { e.preventDefault(); onOk(); }
      else if (e.key === 'Escape') onCancel();
    }
    function onBackdrop(e) { if (e.target === backdrop) onCancel(); }

    okBtn.addEventListener('click', onOk);
    cancelBtn.addEventListener('click', onCancel);
    backdrop.addEventListener('click', onBackdrop);
    document.addEventListener('keydown', onKey);
  });
}

/* この端末のWEEKYデータを完全削除して初期状態へ戻す（二重確認つき） */
async function wipeAllData() {
  const ok = await customConfirm('すべてのデータ（週案・名簿・出席・評価・写真など）を完全に削除します。元に戻せません。先にバックアップは済んでいますか？');
  if (!ok) return;
  const typed = await customPrompt('確認のため「削除」と入力してください:', '');
  if (typed === null || typed.trim() !== '削除') { showToast('削除をキャンセルしました'); return; }
  try {
    Object.keys(localStorage).filter(k => k.startsWith('weeky_')).forEach(k => localStorage.removeItem(k));
  } catch (e) {}
  try {
    await new Promise(res => {
      const r = indexedDB.deleteDatabase(MEDIA_DB);
      r.onsuccess = r.onerror = r.onblocked = () => res();
    });
  } catch (e) {}
  try {
    // v11: テキスト本体（state）はこちらのDBに入っている。写真(MEDIA_DB)と
    // 同様に削除しないと「消したのに再読込したらデータが復活する」になる。
    _stateDbPromise = null;
    await new Promise(res => {
      const r = indexedDB.deleteDatabase(STATE_DB);
      r.onsuccess = r.onerror = r.onblocked = () => res();
    });
  } catch (e) {}
  showToast('データを削除しました。再起動します…');
  setTimeout(() => location.reload(), 800);
}

/* ── Focus Trap ──────────────────────────────────────────── */
let focusTrapEl = null;
let prevFocus   = null;

function trapFocus(el) {
  focusTrapEl  = el;
  // If the caller already focused a field inside the modal (e.g. a search or
  // todo input), keep it. Otherwise focus the dialog container itself rather
  // than the first interactive element — focusing a <select> on iOS pops its
  // dropdown open immediately, which we never want on open.
  if (!el.contains(document.activeElement)) {
    prevFocus = document.activeElement;
    if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1');
    // preventScroll: focusing must not scroll the page (on iOS that shifts the
    // layout up and exposes a white strip at the bottom).
    el.focus({ preventScroll: true });
  }
  document.addEventListener('keydown', handleFocusTrap);
}

function releaseFocus() {
  document.removeEventListener('keydown', handleFocusTrap);
  focusTrapEl = null;
  if (prevFocus) prevFocus.focus();
}

function handleFocusTrap(e) {
  if (!focusTrapEl) return;
  if (e.key === 'Escape') {
    closeLessonModal();
    ['weatherModalBackdrop','hwFullscreenOverlay'].forEach(id => {
      const el = document.getElementById(id);
      if (el && !el.hasAttribute('hidden')) {
        el.setAttribute('hidden', '');
        if (id === 'hwFullscreenOverlay') el.style.display = '';
      }
    });
    return;
  }
  if (e.key !== 'Tab') return;
  const focusable = getFocusable(focusTrapEl);
  if (!focusable.length) return;
  const [first, last] = [focusable[0], focusable[focusable.length - 1]];
  if (e.shiftKey) { if (document.activeElement === first) { last.focus(); e.preventDefault(); } }
  else            { if (document.activeElement === last)  { first.focus(); e.preventDefault(); } }
}

function getFocusable(el) {
  return Array.from(el.querySelectorAll(
    'button:not([disabled]),[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'
  )).filter(e => !e.closest('[hidden]') && !e.closest('.hidden'));
}

/* ── Sidebar ─────────────────────────────────────────────── */
function openSidebar() {
  document.getElementById('sidebar').classList.add('open');
  document.getElementById('sidebarOverlay')?.classList.add('open');
  document.getElementById('hamburgerBtn')?.setAttribute('aria-expanded', 'true');
}

function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebarOverlay')?.classList.remove('open');
  document.getElementById('hamburgerBtn')?.setAttribute('aria-expanded', 'false');
}

/* ── Context Panel ───────────────────────────────────────── */
function toggleContextPanel() {
  const panel = document.getElementById('contextPanel');
  const btn   = document.getElementById('contextToggleBtn');
  if (!panel) return;
  const isMobile = window.innerWidth < 768;
  if (isMobile) {
    panel.classList.toggle('open');
    btn?.setAttribute('aria-expanded', panel.classList.contains('open') ? 'true' : 'false');
  } else {
    panel.classList.toggle('collapsed');
    btn?.setAttribute('aria-expanded', !panel.classList.contains('collapsed') ? 'true' : 'false');
  }
}

/* ── Photo file input ────────────────────────────────────── */
function handlePhotoFiles(files, target) {
  Array.from(files).forEach(file => {
    if (!file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = async e => {
      const id = uid();
      try { await mediaPut(id, e.target.result); }
      catch (err) { showToast('画像の保存に失敗しました'); return; }
      const photo = { id, caption: file.name, date: formatDate(new Date()) }; // ref only
      if (target === 'gallery') { state.photos.push(photo); save(); renderPhotoGallery(); updateStats(); }
      else {
        lessonPhotos.push(photo);
        // Persist to the lesson immediately — on iOS the photo picker can reload
        // the page, which would otherwise drop the not-yet-saved photo.
        if (currentLessonKey) {
          const prev = state.lessons[currentLessonKey] || {};
          state.lessons[currentLessonKey] = { ...prev, photos: [...lessonPhotos] };
          save();
        }
        renderModalPhotos();
      }
    };
    reader.readAsDataURL(file);
  });
}

/* ── Import / Export ─────────────────────────────────────── */
/* ── Print ───────────────────────────────────────────────── */
/* week range label shown on the 印刷 view */
function updatePrintWeekRange() {
  const el = document.getElementById('printWeekRange');
  if (!el) return;
  const s = state.currentWeekStart;
  const fmt = d => `${d.getMonth()+1}/${d.getDate()}`;
  el.textContent = `${s.getFullYear()}年 ${fmt(s)}（月）〜 ${fmt(addDays(s,4))}（金）`;
}

/* Shared print header: title (week range) + owner (teacher / school).
   hPx/suf/toU を渡すと固定高さ(overflow:hidden)にする（週案表用。総高さを常に一定に
   保つため）。省略時（詳細メモ用）は従来どおり自然な高さのまま。 */
function printHeaderHtml(title, hPx, suf, toU) {
  const s = state.currentWeekStart;
  const fmt = d => `${d.getMonth()+1}/${d.getDate()}`;
  const range = `${s.getFullYear()}年 ${fmt(s)}（月）〜 ${fmt(addDays(s,4))}（金）`;
  const name = state.settings.teacherName || '';
  const school = state.settings.schoolName || '';
  const style = hPx ? ` style="height:${toU(hPx)}${suf}"` : '';
  return `<div class="p-header"${style}>
    <div class="p-title">${escHtml(title)}　${range}</div>
    <div class="p-owner">${name ? `<span class="p-owner-name">${escHtml(name)}</span><br>` : ''}${escHtml(school)}</div>
  </div>`;
}

/* 印刷・PDF共通のコンポーネントCSS（html/body や @page は含めない＝
   PDF生成時にページへ注入しても本体のbodyを壊さない）。 */
const PRINT_COMPONENT_CSS = `
  /* box-sizing の既定を統一。印刷iframe(PRINT_CSS)だけでなくPDFホストにも効かせる必要が
     あるため、共通CSSであるこちらに置く（片方だけだとpadding分だけ height:100% の
     計算がズレて行の高さが揃わなくなる）。 */
  * { box-sizing: border-box; }
  .p-header { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px;
    border-bottom: 3px solid #334155; padding-bottom: 7px; margin-bottom: 12px;
    overflow: hidden; }
  .p-title { font-size: 19px; font-weight: 800; letter-spacing: .02em; color: #1e293b; }
  .p-owner { font-size: 12.5px; color: #475569; text-align: right; line-height: 1.5; white-space: nowrap; }
  .p-owner .p-owner-name { font-size: 14.5px; font-weight: 700; color: #0f172a; }
  /* ── 週案表 ──
     v11.1.2でテーブル(<table>)からCSS Gridへ全面移行。
     理由：HTMLテーブルは<tr>/<td>にheightを指定しても「最低保証」でしかなく、
     内容（長い学級名・長いタイトルなど）や端末のフォント幅次第で実際の行の高さが
     勝手に伸びる。html2canvasによるPDF化は固定サイズの領域を切り取るため、
     行が伸びた分だけ下にはみ出し、最後の行（放課後）ごと画面外に消える、
     学級バッジやタイトルの位置がズレる、といった不具合が実機(iPad/iPhone)で
     発生した（PC Chromeでの目視確認では内容が短く再現しなかった）。
     CSS Gridの grid-template-rows は内容量に関わらず本当に固定される（詳細メモの
     「田の字」レイアウトと同じ方式）ため、これを週案表にも採用する。
     行の高さは.pw-grid側で一括指定し、各セルはheight指定不要（グリッドが自動で
     トラック高さいっぱいに広げる）。はみ出す内容はセル自身のoverflow:hiddenで切る。 */
  .pw-sheet { display: flex; flex-direction: column; overflow: hidden; }
  .pw-grid { display: grid; grid-template-columns: 8% repeat(5, 1fr);
    font-size: 12px; border: 1.5px solid #94a3b8; border-radius: 10px; overflow: hidden; }
  .pw-gc { border-right: 1px solid #d4dae3; border-bottom: 1px solid #d4dae3;
    overflow: hidden; min-width: 0; min-height: 0; }
  .pw-grid > .pw-gc:nth-child(6n) { border-right: none; }
  .pw-grid > .pw-gc:nth-last-child(-n+6) { border-bottom: none; }
  .pw-corner-h, .pw-day-h { background: linear-gradient(#f4f6fb, #e8edf5); border-bottom: 1.5px solid #94a3b8; }
  .pw-day-h { display: flex; flex-direction: column; align-items: center; justify-content: center;
    text-align: center; font-weight: 800; color: #334155; }
  .pw-day-h .pw-dow { display: block; font-size: 15px; font-weight: 800; color: #1e293b; }
  .pw-day-h .pw-date { display: block; font-size: 10.5px; color: #64748b; font-weight: 600; margin-top: 1px; }
  /* 時限ラベル（1,2…）・行事/昼/放課後ラベル：div自体をflexで上下左右中央に
     （もうtable-cellではないのでvertical-align問題は起きない）。 */
  .pw-rlabel { background: #f1f5f9; font-weight: 700; font-size: 12px; color: #334155;
    display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; }
  .pw-rlabel .pw-pnum { display: block; font-size: 16px; font-weight: 800; color: #1e293b; }
  .pw-rlabel .pw-time { display: block; font-size: 9.5px; color: #94a3b8; font-weight: 500; margin-top: 1px; }
  .pw-rl-events, .pw-rl-after { background: #e2e8f0; color: #475569; }
  .pw-rl-lunch { background: #fef3c7; color: #92400e; }
  /* 授業セル：教科＝左、クラス＝右、その下にタイトル（左寄せ・上から） */
  .pw-lesson { padding: 5px 7px; line-height: 1.35; text-align: left; }
  /* align-items は center。baseline だと overflow:hidden を持つ .pw-subj の
     ベースラインが下端になり（Safari）、教科名とピルが縦ズレ・下半分が見切れる。 */
  .pw-cell-head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 2px 4px; min-width: 0; }
  /* overflow:hidden は付けない。Safari では文字下端がクリップされ、かつ
     flexベースラインが下端へずれて隣のクラスピルも下にずれる。教科名は短いので
     クリップ不要。折り返さず1行で出す。 */
  .pw-subj { font-weight: 800; font-size: 13px; line-height: 18px; letter-spacing: .01em; flex: 0 1 auto; white-space: nowrap; }
  /* 学校名つきの長い学級名は最大2行まで折り返して表示し、それでも入りきらない分は
     省略（行の高さは常に一定を優先）。line-height は教科名と同じ 18px に揃える。 */
  .pw-cls  { flex: 0 1 auto; max-width: 100%; font-size: 10px; color: #475569; word-break: break-word; line-height: 18px;
    display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden;
    background: rgba(255,255,255,.7); border: 1px solid rgba(100,116,139,.3); border-radius: 8px; padding: 0 6px; }
  .pw-ttl  { margin-top: 4px; font-size: 11px; color: #1e293b;
    display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden; }
  .pw-note-flag { margin-top: 3px; font-size: 9px; color: #94a3b8; }
  /* 行事・昼・放課後（特殊行の日別セル）。もうtableではないので
     display:-webkit-boxを付けても列崩壊は起きない（教訓はMistakes M-11参照）。 */
  .pw-special { padding: 5px 8px 5px 16px; font-size: 11px; color: #1e293b;
    display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
  .pw-special-lunch { background: #fffdf3; }
  /* 詳細メモ：A4横1枚を「田の字」＝2×2＝4コマで固定枠表示する。
     枠の高さは.pd-grid--quadの実寸(JSでインラインstyleにより確定)を
     grid-template-rows:1fr 1fr で均等分割し、各カードはheight:100%で
     ぴったり埋める。内容が多い時は.pd-note側で吸収してoverflow:hiddenで
     切る（枠自体は内容量に関わらず常に一定サイズ＝要望どおり）。 */
  .pd-grid--quad { display: grid; grid-template-columns: 1fr 1fr; grid-template-rows: 1fr 1fr;
    gap: 8px; overflow: hidden; }
  .pd-card { height: 100%; min-height: 0; min-width: 0; overflow: hidden;
    display: flex; flex-direction: column;
    border: 1px solid #bbb; border-left: 5px solid var(--c, #888); border-radius: 6px;
    padding: 6px 8px 7px; }
  .pd-card-head { flex: 0 0 auto; display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px;
    border-bottom: 1px solid #ddd; padding-bottom: 3px; margin-bottom: 4px; }
  .pd-day { font-size: 11.5px; font-weight: 700; color: #111; }
  .pd-period { font-size: 10.5px; font-weight: 700; color: #fff; background: var(--c, #555); border-radius: 4px; padding: 1px 6px; }
  .pd-subject { font-size: 12px; font-weight: 800; }
  .pd-class { font-size: 10.5px; color: #555; }
  .pd-lessontitle { font-size: 11.5px; font-weight: 600; flex-basis: 100%; }
  .pd-tags { flex: 0 0 auto; margin: 0 0 3px; }
  .pd-tag { display: inline-block; font-size: 9px; color: #444; background: #eee; border-radius: 999px; padding: 1px 6px; margin: 0 3px 2px 0; }
  /* flex:1で余った高さを全部使い、入りきらない分はoverflow:hiddenで切る
     （line-clampだと写真の有無で残り行数が変わり調整が面倒なため、
     flexボックスの実高さでそのまま切る方式に統一）。 */
  .pd-note { flex: 1 1 auto; min-height: 0; overflow: hidden;
    font-size: 10.5px; color: #222; line-height: 1.5; white-space: pre-wrap; word-break: break-word; }
  .pd-media { flex: 0 0 auto; margin-top: 4px; display: flex; flex-wrap: wrap; gap: 4px; overflow: hidden; max-height: 68px; }
  .pd-media img { max-width: 92px; max-height: 64px; border: 1px solid #ccc; border-radius: 4px; object-fit: contain; }
  .pd-empty { font-size: 12px; color: #666; padding: 20px 4px; }
`;

/* 印刷ドキュメント用の自己完結CSS（iframe印刷・主にMac用フォールバック）。
   @pageの余白はPDF出力(PDF_A4.margin)と同じ5mmに統一。フォントもWindowsで
   日本語が確実にHiragino相当の見た目（≒行の折り返し量）になるよう、
   Segoe UIより先にWindows標準の日本語フォントを指定する（フォントが違うと
   文字幅が変わり、折り返し行数＝セルの必要高さが端末ごとにズレる一因になる）。 */
const PRINT_CSS = `
  @page { size: A4 landscape; margin: 5mm; }
  html, body { margin: 0; padding: 0; background: #fff; color: #111;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
    font-family: -apple-system, BlinkMacSystemFont, "Hiragino Sans", "Hiragino Kaku Gothic ProN",
      "Yu Gothic Medium", "Yu Gothic", Meiryo, "Segoe UI", Roboto, sans-serif; }
` + PRINT_COMPONENT_CSS;

/* 専用iframeに印刷用ドキュメントを書き出して印刷（→ iOSでは「PDFとして保存」が安定） */
function printDocument(innerHtml) {
  // 既存の印刷iframeがあれば除去
  document.getElementById('weekyPrintFrame')?.remove();
  const frame = document.createElement('iframe');
  frame.id = 'weekyPrintFrame';
  frame.setAttribute('aria-hidden', 'true');
  Object.assign(frame.style, { position: 'fixed', right: '0', bottom: '0', width: '0', height: '0', border: '0', visibility: 'hidden' });
  document.body.appendChild(frame);

  const doc = frame.contentWindow.document;
  doc.open();
  doc.write(`<!DOCTYPE html><html lang="ja"><head><meta charset="utf-8">
    <title>WEEKY 印刷</title><style>${PRINT_CSS}</style></head>
    <body>${innerHtml}</body></html>`);
  doc.close();

  // 画像（手書き・写真）の読み込みを待ってから印刷
  const imgs = Array.from(doc.images || []);
  const waitImgs = Promise.all(imgs.map(img => img.complete
    ? Promise.resolve()
    : new Promise(res => { img.onload = img.onerror = res; })));

  // iframeは印刷UIが閉じてから片付ける。早く消すとiOSで印刷UI表示中に
  // 中身が消えて真っ白／キャンセルになるため、afterprint まで残す。
  let cleaned = false;
  const cleanup = () => { if (cleaned) return; cleaned = true; frame.remove(); };
  waitImgs.then(() => {
    const w = frame.contentWindow;
    w.onafterprint = () => setTimeout(cleanup, 400);
    // afterprint が来ない環境用の保険（長め：印刷中の削除を避ける）
    setTimeout(cleanup, 60000);
    setTimeout(() => { w.focus(); try { w.print(); } catch (_) { window.print(); } }, 200);
  });
}

async function doPrint() {
  const type = document.querySelector('input[name="printType"]:checked')?.value || 'weekly';
  const html = (type === 'detail') ? await buildDetailPrintHtml() : buildWeeklyPrintHtml('mm');
  printDocument(html);
}

/* 週案表：A4横1枚に収まる時間割（HTMLを返す）。
   unit='px' … PDFダウンロード用（html2canvasが読む1040px幅のデザイン単位そのまま）
   unit='mm' … ブラウザ印刷(@page)用（実寸mm。PDF_PX_PER_MMで換算するので見た目の
               縦横比はPDF出力と常に一致する＝端末や出力経路が違っても仕上がりが揃う）
   v11.1.2：<table>をやめてCSS Grid（.pw-grid）に統一。行の高さは
   grid-template-rowsに一括で渡すことで完全に固定される（テーブル行と違い、
   内容量やフォント幅で勝手に伸びることがない＝実機での「下段消失・ズレ・見切れ」の
   根本対策）。各セルはgridトラックの高さいっぱいに自動で広がるので、
   セル側に高さ指定は不要。はみ出す内容はセル自身のoverflow:hiddenで切る。 */
function buildWeeklyPrintHtml(unit = 'px') {
  const start = state.currentWeekStart;
  const periods = state.settings.periodsCount;
  const lunchAfter = state.settings.lunchAfter || 4;
  const times = state.settings.periodTimes || [];
  const days = [0,1,2,3,4].map(d => addDays(start, d));
  const monthKeyOf = dt => `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}`;

  // ページ内訳は常にデザインpx（PDF_PAGE_W_PX=1040幅基準）で計算し、mm出力時だけ
  // 最後にPDF_PX_PER_MMで換算する。こうすることでPDF/印刷どちらでも比率が完全に一致する。
  const isMm = unit === 'mm';
  const toU = px => isMm ? +(px / PDF_PX_PER_MM).toFixed(2) : Math.round(px);
  const suf = isMm ? 'mm' : 'px';
  const HEADER_H = 60, THEAD_H = 48, SPECIAL_H = 48;   // デザインpx（行事・昼・放課後は共通）
  const fixedTotal = HEADER_H + THEAD_H + SPECIAL_H * 3; // 行事＋昼＋放課後の3行ぶん
  const periodH = Math.max(50, (PDF_PAGE_H_PX - fixedTotal) / periods);
  const sheetW = isMm ? PDF_CONTENT_W_MM : PDF_PAGE_W_PX;
  const sheetH = isMm ? PDF_CONTENT_H_MM : PDF_PAGE_H_PX;

  // 行の高さは出現順にrowHeightsへ積み、最後にgrid-template-rowsへまとめて渡す。
  // セルは6個（ラベル1＋月〜金5）ずつ出現順に並べるだけで、grid-auto-flow:row（既定）が
  // 自動で折り返してくれるので、行番号の管理は不要。
  const rowHeights = [];
  const cells = [];

  // lesson cell（授業コマ／放課後コマ共通）
  const lessonCell = (date, period) => {
    const l = state.lessons[lessonKey(date, period)];
    if (!l || !(l.subjectId || l.title || l.className)) return `<div class="pw-gc pw-lesson"></div>`;
    const subj = getSubjectById(l.subjectId)?.name || '';
    const color = getSubjectColor(l.subjectId);
    const hasNote = !!(l.note && l.note.trim());
    return `<div class="pw-gc pw-lesson" style="background:${hexA(color, 0.10)}; border-left:4px solid ${color}">
      <div class="pw-cell-head">
        <span class="pw-subj" style="color:${color}">${escHtml(subj)}</span>
        ${l.className ? `<span class="pw-cls">${escHtml(l.className)}</span>` : ''}
      </div>
      ${l.title ? `<div class="pw-ttl">${escHtml(l.title)}</div>` : ''}
      ${hasNote ? `<div class="pw-note-flag">✎ メモあり</div>` : ''}
    </div>`;
  };

  // header row（角＋曜日・日付）
  rowHeights.push(THEAD_H);
  cells.push(`<div class="pw-gc pw-corner-h"></div>`);
  days.forEach((date, d) => {
    cells.push(`<div class="pw-gc pw-day-h"><span class="pw-dow">${DAYS[d]}</span><span class="pw-date">${date.getMonth()+1}/${date.getDate()}</span></div>`);
  });

  // events row（行事）
  rowHeights.push(SPECIAL_H);
  cells.push(`<div class="pw-gc pw-rlabel pw-rl-events">行事</div>`);
  days.forEach(date => {
    const mk = monthKeyOf(date);
    const dayMap = (state.events[mk] && !Array.isArray(state.events[mk])) ? state.events[mk] : {};
    const txt = dayMap[date.getDate()] || '';
    cells.push(`<div class="pw-gc pw-special">${escHtml(txt)}</div>`);
  });

  // 各時限（＋lunchAfter直後に昼を挿入）
  for (let p = 1; p <= periods; p++) {
    rowHeights.push(periodH);
    const time = times[p-1] ? `<span class="pw-time">${escHtml(times[p-1])}</span>` : '';
    cells.push(`<div class="pw-gc pw-rlabel"><span class="pw-pnum">${p}</span>${time}</div>`);
    days.forEach(date => cells.push(lessonCell(date, p)));

    if (p === lunchAfter) {
      rowHeights.push(SPECIAL_H);
      cells.push(`<div class="pw-gc pw-rlabel pw-rl-lunch">昼</div>`);
      days.forEach(date => {
        const txt = state.lunch[formatDate(date)] || '';
        cells.push(`<div class="pw-gc pw-special pw-special-lunch">${escHtml(txt)}</div>`);
      });
    }
  }

  // after row（放課後）
  rowHeights.push(SPECIAL_H);
  cells.push(`<div class="pw-gc pw-rlabel pw-rl-after">放課後</div>`);
  days.forEach(date => cells.push(lessonCell(date, 'after')));

  const rowsTemplate = rowHeights.map(h => `${toU(h)}${suf}`).join(' ');

  return `<div class="pw-sheet" style="width:${toU(sheetW)}${suf}; height:${toU(sheetH)}${suf}">` +
    printHeaderHtml('週案表', HEADER_H, suf, toU) +
    `<div class="pw-grid" style="grid-template-rows:${rowsTemplate}">${cells.join('')}</div></div>`;
}

/* 詳細メモ：その週の登録済みコマを1枚ずつのカードHTML（配列）にして返す。
   写真はIndexedDBから取得して dataURL で埋め込む。 */
async function detailCardHtmls() {
  const start = state.currentWeekStart;
  const fmt = d => `${d.getMonth()+1}/${d.getDate()}`;

  const items = [];
  for (let d = 0; d < 5; d++) {
    const date = addDays(start, d);
    const periodList = ['morning'];
    for (let p = 1; p <= state.settings.periodsCount; p++) periodList.push(p);
    periodList.push('after');
    for (const p of periodList) {
      const l = state.lessons[lessonKey(date, p)];
      const has = l && (l.title || (l.note && l.note.trim()) || l.subjectId || l.photos?.length || l.hwPages?.some(Boolean));
      if (has) items.push({ d, date, p, l });
    }
  }

  const photoSrc = {};
  await Promise.all(items.flatMap(({ l }) =>
    (l.photos || []).map(async ph => { try { const src = await mediaGet(ph.id); if (src) photoSrc[ph.id] = src; } catch (_) {} })
  ));

  // resolve handwriting pages (stored in IndexedDB by id) for embedding
  const hwSrc = {};
  await Promise.all(items.flatMap(({ l }) =>
    (l.hwPages || []).filter(Boolean).map(async ref => { try { const src = await hwResolve(ref); if (src) hwSrc[ref] = src; } catch (_) {} })
  ));

  return items.map(({ d, date, p, l }) => {
    const subj = getSubjectById(l.subjectId)?.name || '';
    const color = getSubjectColor(l.subjectId);
    const periodLabel = periodLabelOf(p);
    const tags = (l.tags || []).map(t => `<span class="pd-tag">${escHtml(t)}</span>`).join('');
    const hw = (l.hwPages || []).filter(Boolean).map(ref => hwSrc[ref] ? `<img src="${hwSrc[ref]}" alt="手書き">` : '').join('');
    const photos = (l.photos || []).map(ph => photoSrc[ph.id] ? `<img src="${photoSrc[ph.id]}" alt="写真">` : '').join('');
    const media = (hw || photos) ? `<div class="pd-media">${hw}${photos}</div>` : '';
    return `<div class="pd-card" style="border-left:5px solid ${color}">
      <div class="pd-card-head">
        <span class="pd-day">${DAYS[d]}（${fmt(date)}）</span>
        <span class="pd-period" style="background:${color}">${periodLabel}</span>
        ${subj ? `<span class="pd-subject">${escHtml(subj)}</span>` : ''}
        ${l.className ? `<span class="pd-class">${escHtml(l.className)}</span>` : ''}
        ${l.title ? `<span class="pd-lessontitle">${escHtml(l.title)}</span>` : ''}
      </div>
      ${tags ? `<div class="pd-tags">${tags}</div>` : ''}
      ${l.note && l.note.trim() ? `<div class="pd-note">${escHtml(l.note)}</div>` : ''}
      ${media}
    </div>`;
  });
}

/* 詳細メモ（ブラウザ印刷/@page用）：A4横1枚＝2×2＝4コマの「田の字」で
   ページを区切る。週案表と同じくデザインpx(PDF_PAGE_H_PX基準)をmmへ換算して
   使うので、PDFダウンロード版と見た目の比率が揃う。 */
async function buildDetailPrintHtml() {
  const cards = await detailCardHtmls();
  if (!cards.length) return printHeaderHtml('詳細メモ') + `<div class="pd-empty">この週には記録のある授業がありません。</div>`;
  const HEADER_H = 60; // デザインpx（週案表と同じ値で統一）
  const toMm = px => +(px / PDF_PX_PER_MM).toFixed(2);
  const fullH = toMm(PDF_PAGE_H_PX);
  const firstH = toMm(PDF_PAGE_H_PX - HEADER_H);
  let html = printHeaderHtml('詳細メモ', HEADER_H, 'mm', toMm);
  for (let i = 0, pageIndex = 0; i < cards.length; i += 4, pageIndex++) {
    const h = pageIndex === 0 ? firstH : fullH;
    const isLast = i + 4 >= cards.length;
    const brk = isLast ? '' : 'break-after: page; page-break-after: always;';
    html += `<div class="pd-grid--quad" style="height:${h}mm; ${brk}">${cards.slice(i, i + 4).join('')}</div>`;
  }
  return html;
}

/* ═══ PDFダウンロード（html2canvas + jsPDF）═══
   印刷ダイアログを使わず、A4横のPDFファイルを直接ダウンロードする。
   （iOS Safariは @page の横向きを無視するため、印刷経由では横向きにできない） */
const PDF_PAGE_W_PX = 1040;                         // A4横の内容幅（px相当）
const PDF_A4 = { w: 297, h: 210, margin: 5 };       // mm（上下左右5mm余白）
const PDF_CONTENT_W_MM = PDF_A4.w - PDF_A4.margin * 2;
const PDF_CONTENT_H_MM = PDF_A4.h - PDF_A4.margin * 2;
const PDF_PX_PER_MM = PDF_PAGE_W_PX / PDF_CONTENT_W_MM;
const PDF_PAGE_H_PX = Math.floor(PDF_CONTENT_H_MM * PDF_PX_PER_MM);

function _pdfMakeHost() {
  const host = document.createElement('div');
  host.id = '_pdfHost';
  host.style.cssText = `position:fixed; left:-99999px; top:0; width:${PDF_PAGE_W_PX}px; background:#fff; color:#111;`
    // Windowsで日本語がSegoe UI（非対応→フォント置換）に落ちる前にYu Gothic/Meiryoを
    // 挟む。フォントが変わると文字幅・折り返し行数が変わり、行の必要高さが端末ごとに
    // ズレる一因になっていたため、印刷iframe側(PRINT_CSS)と同じスタックに揃える。
    + `font-family:-apple-system,BlinkMacSystemFont,"Hiragino Sans","Hiragino Kaku Gothic ProN","Yu Gothic Medium","Yu Gothic",Meiryo,"Segoe UI",Roboto,sans-serif;`;
  // 注入CSS。.pd-grid--quad/.pd-card は共通CSS(PRINT_COMPONENT_CSS)側で
  // 既にheight:100%+grid-template-rows:1fr 1frの固定枠になっているので、
  // PDFホスト専用の上書きは不要。
  host.innerHTML = `<style>${PRINT_COMPONENT_CSS}
    #_pdfHost .pdf-page { width:${PDF_PAGE_W_PX}px; background:#fff; padding:0; overflow:hidden; }
  </style>`;
  document.body.appendChild(host);
  return host;
}

async function _pdfWaitImgs(root) {
  const imgs = [...root.querySelectorAll('img')];
  await Promise.all(imgs.map(im => im.complete ? null : new Promise(r => { im.onload = im.onerror = r; })));
}

async function _pdfAddPage(pdf, pageEl, isFirst, opts = {}) {
  const fit = opts.fit || 1;          // 1=内容いっぱい、0.95=少し余白を残す
  const centerV = !!opts.centerV;     // 縦方向も中央に置くか（週案表用）
  await _pdfWaitImgs(pageEl);
  // 固定高さを超えた分（放課後など）が切り取られないよう、実コンテンツの全高を取り込む
  const fullH = opts.fixedH || Math.max(pageEl.scrollHeight, pageEl.offsetHeight);
  // v11.1.3：日本語の小さな文字（10〜11px）がPDFで「半分欠けたように」ぼやける不具合対策。
  // 原因は2つ複合していた。①scale:2だと1040px幅のデザインを2080px幅でしかラスタライズせず、
  // 画数の多い漢字を小さいサイズで描くには解像度が足りなかった。②JPEG圧縮は写真向けの
  // 非可逆圧縮で、文字のようなくっきりした線の周りにリンギングノイズ（にじみ）が出やすく、
  // 細い画線が欠けて見える一因になっていた。scaleを引き上げ、可逆圧縮のPNGに変更することで
  // 解決する（実機での目視確認はできないため、原因分析に基づく対策として実施）。
  const canvas = await window.html2canvas(pageEl, { scale: 3, backgroundColor: '#fff', useCORS: true, logging: false,
    width: PDF_PAGE_W_PX, height: fullH, windowWidth: PDF_PAGE_W_PX, windowHeight: fullH });
  const img = canvas.toDataURL('image/png');
  const ratio = canvas.width / canvas.height;
  let w = PDF_CONTENT_W_MM, h = w / ratio;
  if (h > PDF_CONTENT_H_MM) { h = PDF_CONTENT_H_MM; w = h * ratio; }   // 1枚に収める
  w *= fit; h *= fit;
  const x = PDF_A4.margin + (PDF_CONTENT_W_MM - w) / 2;
  const y = centerV ? PDF_A4.margin + (PDF_CONTENT_H_MM - h) / 2 : PDF_A4.margin;
  if (!isFirst) pdf.addPage();
  pdf.addImage(img, 'PNG', x, y, w, h);
}

async function exportPdf() {
  if (!window.jspdf || !window.html2canvas) { showToast('PDF機能を読み込めませんでした'); return; }
  const type = document.querySelector('input[name="printType"]:checked')?.value || 'weekly';
  showToast('PDFを作成中…');
  const host = _pdfMakeHost();
  try {
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

    if (type === 'weekly') {
      const page = document.createElement('div');
      page.className = 'pdf-page';
      page.style.height = PDF_PAGE_H_PX + 'px';   // A4横の内容高さいっぱいに表を伸ばす
      page.innerHTML = buildWeeklyPrintHtml('px');
      host.appendChild(page);
      // fixedH指定で常にPDF_PAGE_H_PXぴったりのキャンバスにする（内容量で
      // 縮小率が変わらないよう固定。行の高さ自体はbuildWeeklyPrintHtml側で
      // 既に確定済みなので、通常はscrollHeightもほぼ一致するが念のため明示）。
      await _pdfAddPage(pdf, page, true, { fit: 0.90, centerV: true, fixedH: PDF_PAGE_H_PX });
    } else {
      const cards = await detailCardHtmls();
      const header = printHeaderHtml('詳細メモ');
      if (!cards.length) {
        const page = document.createElement('div');
        page.className = 'pdf-page';
        page.innerHTML = header + `<div class="pd-empty">この週には記録のある授業がありません。</div>`;
        host.appendChild(page);
        await _pdfAddPage(pdf, page, true);
      } else {
        // A4横1ページに「田の字」＝2×2＝4コマ。4枚ずつページにし、各カードは
        // .pd-grid--quad（grid-template-rows:1fr 1fr）でぴったり均等割り＝
        // 内容量に関わらず枠は常に同じ大きさ（要望どおり）。
        for (let i = 0, pageIndex = 0; i < cards.length; i += 4, pageIndex++) {
          const page = document.createElement('div');
          page.className = 'pdf-page';
          page.style.height = PDF_PAGE_H_PX + 'px';   // A4横の用紙高さに固定
          page.style.display = 'flex';
          page.style.flexDirection = 'column';
          page.style.overflow = 'hidden';
          if (pageIndex === 0) page.insertAdjacentHTML('beforeend', header);
          const grid = document.createElement('div');
          grid.className = 'pd-grid--quad';
          grid.style.flex = '1 1 auto';
          grid.style.minHeight = '0';
          for (let k = i; k < Math.min(i + 4, cards.length); k++) grid.insertAdjacentHTML('beforeend', cards[k]);
          page.appendChild(grid);
          host.appendChild(page);
          await _pdfAddPage(pdf, page, pageIndex === 0, { fixedH: PDF_PAGE_H_PX });
        }
      }
    }

    const s = state.currentWeekStart;
    const label = type === 'detail' ? '詳細メモ' : '週案表';
    pdf.save(`WEEKY-${label}-${formatDate(s)}.pdf`);
    showToast('PDFを書き出しました');
  } catch (e) {
    showToast('PDFの作成に失敗しました');
  } finally {
    host.remove();
  }
}

const SCHEMA_VERSION = 2;

function collectState() {
  return {
    schemaVersion: SCHEMA_VERSION, app: 'WEEKY', appVersion: APP_VERSION, exported: new Date().toISOString(),
    lessons: state.lessons, todos: state.todos, longTodos: state.longTodos,
    projects: state.projects, notes: state.notes, events: state.events,
    lunch: state.lunch,
    schools: state.schools, activeSchoolId: state.activeSchoolId,
    students: state.students, attendance: state.attendance, evaluations: state.evaluations,
    evalColumns: state.evalColumns,
    reception: state.reception,
    photos: state.photos, settings: state.settings,
  };
}

function downloadJson(obj, name) {
  const blob = new Blob([JSON.stringify(obj)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = name;
  a.click(); URL.revokeObjectURL(url);
}

/* Lightweight backup — all text data, no images */
function exportJson() {
  downloadJson(collectState(), `weeky-backup-${formatDate(new Date())}.json`);
  markBackupDone();
  showToast('バックアップを書き出しました');
}

/* Full backup — text data + all images from IndexedDB (base64) */
async function exportFullBackup() {
  showToast('画像を含めて準備中…');
  const media = await mediaAll();
  const data = collectState();
  data.media = media;       // { mediaId: dataURL }
  data.fullBackup = true;
  downloadJson(data, `weeky-full-backup-${formatDate(new Date())}.json`);
  markBackupDone();
  showToast('完全バックアップを書き出しました');
}

function importJson(file) {
  const reader = new FileReader();
  reader.onload = async e => {
    try {
      const data = JSON.parse(e.target.result);
      if (data.lessons)   Object.assign(state.lessons, data.lessons);
      if (data.todos)     state.todos     = data.todos;
      if (data.longTodos) state.longTodos = data.longTodos;
      if (data.projects)  state.projects  = data.projects;
      if (data.notes)     state.notes     = data.notes;
      if (data.events)    Object.assign(state.events, data.events);
      if (data.lunch)     Object.assign(state.lunch, data.lunch);
      if (data.schools)   state.schools   = data.schools;
      if (data.activeSchoolId) state.activeSchoolId = data.activeSchoolId;
      if (data.students)  state.students  = data.students;
      if (data.attendance)  state.attendance  = data.attendance;
      if (data.reception)   state.reception   = data.reception;
      if (data.evaluations) state.evaluations = data.evaluations;
      if (data.evalColumns) state.evalColumns = data.evalColumns;
      if (data.photos)    state.photos    = data.photos;
      if (data.settings)  Object.assign(state.settings, data.settings);

      // restore images into IndexedDB
      if (data.media && typeof data.media === 'object') {
        for (const [id, dataUrl] of Object.entries(data.media)) {
          try { await mediaPut(id, dataUrl); } catch (err) { /* skip */ }
        }
      }
      ensureDefaultSchool();
      migrateData();
      save();
      renderWeekGrid(); updateStats(); updatePanelTodo();
      applyTheme(state.settings.theme || 'indigo');
      applyAppearance(state.settings.appearance || 'light');
      showToast(data.media ? '完全バックアップを復元しました' : 'インポートしました');
    } catch { showToast('ファイルを読み込めませんでした'); }
  };
  reader.readAsText(file);
}

/* ── ToDo deadline notifications (mac-style, top-left) ───── */
let _lastTodoNotify = 0;
function checkTodoNotifications(force) {
  const now = Date.now();
  if (!force && now - _lastTodoNotify < 90_000) return; // throttle ~90s
  const soon = state.todos
    .filter(t => !t.done && t.due)
    .map(t => ({ t, d: daysUntil(t.due) }))
    .filter(x => x.d != null && x.d <= 5)   // within 5 days or overdue
    .sort((a, b) => a.d - b.d);
  if (!soon.length) return;
  _lastTodoNotify = now;
  soon.slice(0, 4).forEach((x, i) => setTimeout(() => showTodoBanner(x.t, x.d), i * 500));
}

function todoNotifStack() {
  let s = document.getElementById('todoNotifStack');
  if (!s) { s = document.createElement('div'); s.id = 'todoNotifStack'; document.body.appendChild(s); }
  return s;
}

function showTodoBanner(todo, d) {
  const label = d < 0 ? `${-d}日超過しています` : d === 0 ? '今日が締切です' : `あと${d}日で締切`;
  const b = document.createElement('div');
  b.className = 'todo-notif';
  b.setAttribute('role', 'button'); b.tabIndex = 0;
  b.innerHTML = `
    <div class="todo-notif-icon">📌</div>
    <div class="todo-notif-body">
      <div class="todo-notif-title">締切が近いToDo</div>
      <div class="todo-notif-text">${escHtml(todo.text)}</div>
      <div class="todo-notif-sub">${label}・${escHtml(todo.due)}</div>
    </div>
    <button class="todo-notif-close" aria-label="閉じる">✕</button>`;
  todoNotifStack().appendChild(b);
  requestAnimationFrame(() => b.classList.add('show'));
  let closed = false;
  const close = () => { if (closed) return; closed = true; b.classList.remove('show'); setTimeout(() => b.remove(), 420); };
  // ✕ ボタン：その場ですぐ消す（画面遷移しない）
  b.querySelector('.todo-notif-close').addEventListener('click', e => { e.stopPropagation(); close(); });
  b.addEventListener('click', () => { close(); focusTodo(todo.id); });
  b.addEventListener('keydown', e => { if (e.key === 'Enter') { close(); focusTodo(todo.id); } });
  setTimeout(close, 6500);
}

/* ToDo画面へ移動して該当カードまでスクロール＋一瞬ハイライト */
function focusTodo(id) {
  switchView('todo');
  setTimeout(() => {
    const card = document.querySelector(`.todo-card[data-todo-id="${id}"]`);
    if (!card) return;
    card.scrollIntoView({ block: 'center', behavior: 'smooth' });
    card.classList.remove('todo-card--flash');
    void card.offsetWidth;
    card.classList.add('todo-card--flash');
    setTimeout(() => card.classList.remove('todo-card--flash'), 1600);
  }, 260);
}

/* ── Backup reminder ─────────────────────────────────────── */
function markBackupDone() {
  kvSet('weeky_v10_lastBackup', String(Date.now())).catch(() => {});
  hideBackupBanner();
}
async function checkBackupReminder() {
  const last = parseInt((await kvGet('weeky_v10_lastBackup')) || '0', 10);
  const days = (Date.now() - last) / 86400000;
  // remind if never backed up and there is real data, or >7 days since last
  const hasData = state.students.length || Object.keys(state.lessons).length || state.notes.length;
  if (hasData && (!last || days >= 7)) showBackupBanner(last);
}
function showBackupBanner(last) {
  if (document.getElementById('backupBanner')) return;
  const banner = document.createElement('div');
  banner.id = 'backupBanner';
  banner.className = 'backup-banner';
  banner.innerHTML = `
    <span class="backup-banner-icon">💾</span>
    <span class="backup-banner-text">${last ? 'しばらくバックアップしていません。' : 'まだバックアップしていません。'}データを書き出して安全に保管しましょう。</span>
    <button class="btn-primary btn-sm" id="backupNowBtn">今すぐ書き出す</button>
    <button class="backup-banner-close" id="backupDismissBtn" aria-label="閉じる">×</button>`;
  document.body.appendChild(banner);
  banner.querySelector('#backupNowBtn').addEventListener('click', exportFullBackup);
  banner.querySelector('#backupDismissBtn').addEventListener('click', () => {
    // snooze 1 day
    kvSet('weeky_v10_lastBackup', String(Date.now() - 6*86400000)).catch(() => {});
    hideBackupBanner();
  });
}
function hideBackupBanner() { document.getElementById('backupBanner')?.remove(); }

/* ── PWA + update notification ───────────────────────────── */
let _swReg = null;
let _lastUpdateCheck = 0;
/* 新しいバージョンが出ていないか確認する（reg.update() で再取得→差分があれば updatefound 発火）。
   呼びすぎ防止に20秒スロットル。ロック解除・復帰・定期で呼ぶ。 */
function checkForUpdate() {
  const now = Date.now();
  if (now - _lastUpdateCheck < 20_000) return;
  _lastUpdateCheck = now;
  try { _swReg && _swReg.update(); } catch (e) {}
}
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./service-worker.js').then(reg => {
      _swReg = reg;
      // 既に待機中の新SWがあれば即通知
      if (reg.waiting && navigator.serviceWorker.controller) showUpdateBanner();
      // 新しいSWを検出 → 再読込を促す
      reg.addEventListener('updatefound', () => {
        const nw = reg.installing;
        if (!nw) return;
        nw.addEventListener('statechange', () => {
          if (nw.state === 'installed' && navigator.serviceWorker.controller) {
            showUpdateBanner();
          }
        });
      });
    }).catch(() => {});
  });
  // 復帰時・フォーカス時・定期的にこまめにチェック（ロック解除時は _lockSubmit からも呼ぶ）
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') checkForUpdate(); });
  window.addEventListener('focus', checkForUpdate);
  setInterval(checkForUpdate, 3 * 60_000);  // 3分ごと
}
function showUpdateBanner() {
  if (document.getElementById('updateBanner')) return;
  const banner = document.createElement('div');
  banner.id = 'updateBanner';
  banner.className = 'update-banner';
  banner.innerHTML = `
    <span>新しいバージョンがあります。</span>
    <button class="btn-primary btn-sm" id="updateReloadBtn">更新して再読込</button>
    <button class="backup-banner-close" id="updateDismissBtn" aria-label="閉じる">×</button>`;
  document.body.appendChild(banner);
  banner.querySelector('#updateReloadBtn').addEventListener('click', () => location.reload());
  banner.querySelector('#updateDismissBtn').addEventListener('click', () => banner.remove());
}

/* ══════════════════════════════════════════════════════════
   MAIN INIT
════════════════════════════════════════════════════════════ */
/* ── iOS standalone PWA viewport height ───────────────────────
   In a home-screen PWA, CSS vh/dvh can momentarily report the wrong height
   right after launch (and after rotation / multitasking), leaving a white
   band near the home indicator. window.innerHeight always reflects the true
   visible area, so we mirror it into --app-height and the body uses that. */
function setAppHeight() {
  document.documentElement.style.setProperty('--app-height', window.innerHeight + 'px');
}
/* iOSのダブルタップ拡大を無効化（ピンチズームは残す）。
   touch-action:manipulation だけでは効かない端末向けに、300ms以内の2回目タップを抑止。 */
function preventDoubleTapZoom() {
  let last = 0;
  document.addEventListener('touchend', (e) => {
    const now = Date.now();
    if (now - last <= 300) {
      // テキスト入力やテキスト選択を邪魔しないよう、入力系は除外
      const t = e.target;
      if (!(t && t.closest && t.closest('input, textarea, [contenteditable="true"]'))) {
        e.preventDefault();
      }
    }
    last = now;
  }, { passive: false });
}

function initAppHeight() {
  setAppHeight();
  window.addEventListener('resize', setAppHeight);
  window.addEventListener('orientationchange', () => { setAppHeight(); setTimeout(setAppHeight, 300); });
  if (window.visualViewport) window.visualViewport.addEventListener('resize', setAppHeight);
  // On a fresh PWA launch iOS reports a too-small innerHeight until some
  // viewport event fires (e.g. returning from another app). Re-measure on
  // every event that can carry the corrected height, plus the first user
  // interaction, plus a short poll for the first few seconds after launch.
  window.addEventListener('load', setAppHeight);
  window.addEventListener('pageshow', setAppHeight);
  window.addEventListener('focus', setAppHeight);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) setAppHeight(); });
  window.addEventListener('scroll', setAppHeight, { once: true, passive: true });
  window.addEventListener('touchstart', setAppHeight, { once: true, passive: true });
  [60, 200, 500, 1000, 1600, 2500].forEach(t => setTimeout(setAppHeight, t));
  let n = 0;
  const poll = setInterval(() => { setAppHeight(); if (++n > 12) clearInterval(poll); }, 250);
}

/* ── 初回セットアップ（オンボーディング） ─────────────────────
   macOS設定風に、ステップを WAAPI でふわっと切り替える初回ウィザード。
   既存ユーザー（データあり）には出さない。新規は教科を空から選ぶ。 */
let _obIndex = 0;
let _obSteps = [];
const OB_PALETTE = ['#4F46E5','#7C3AED','#0D9488','#D97706','#16A34A','#DC2626','#DB2777','#EA580C','#0284C7','#65A30D'];

async function needsOnboarding() {
  if ((await kvGet('weeky_onboarded')) === '1') return false;
  const hasData = (state.settings.teacherName && state.settings.teacherName.trim())
    || state.classes.length || state.students.length
    || Object.keys(state.lessons).length;
  if (hasData) { kvSet('weeky_onboarded', '1').catch(() => {}); return false; }  // 既存ユーザーは対象外
  return true;
}

async function maybeStartOnboarding() {
  if (!(await needsOnboarding())) return;
  state.settings.subjects = [];   // 新規ユーザーは使う教科だけ自分で追加する
  startOnboarding();
}

function obAddClass(text) {
  ensureDefaultSchool();
  const parsed = parseClassText(text);
  if (!parsed) return null;
  const name = makeClassName(parsed.grade, parsed.classNo);
  if (activeSchoolClasses().some(c => c.name === name)) return name;
  state.classes.push({ id: 'cls_' + uid(), schoolId: state.activeSchoolId,
    year: String(new Date().getFullYear()), grade: parsed.grade, classNo: parsed.classNo, name });
  return name;
}

function obHasSubject(name) { return state.settings.subjects.some(s => s.name === name); }
function obToggleSubject(name, color) {
  name = (name || '').trim(); if (!name) return;
  const i = state.settings.subjects.findIndex(s => s.name === name);
  if (i >= 0) state.settings.subjects.splice(i, 1);
  else state.settings.subjects.push({ id: 'subj_' + uid(), name, color: color || OB_PALETTE[state.settings.subjects.length % OB_PALETTE.length] });
}

function buildObSteps() {
  return [
    { key: 'welcome', nextLabel: 'はじめる', html: () => `
        <img src="icons/icon-192.png" class="ob-icon" alt="WEEKY" data-ob-stagger />
        <h1 class="ob-title" data-ob-stagger>WEEKYへようこそ</h1>
        <p class="ob-sub" data-ob-stagger>授業記録・週案・名簿・出席をひとつに。<br>かんたんな初期設定から始めましょう。</p>` },

    { key: 'teacher', html: () => `
        <div class="ob-emoji" data-ob-stagger>🧑‍🏫</div>
        <h1 class="ob-title" data-ob-stagger>あなたのこと</h1>
        <p class="ob-sub" data-ob-stagger>週案やPDFの見出しに使います。あとから変更できます。</p>
        <div class="ob-field" data-ob-stagger><label>先生のお名前</label>
          <input class="ob-input" id="obTeacher" type="text" placeholder="例：山田 太郎" /></div>
        <div class="ob-field" data-ob-stagger><label>学校名</label>
          <input class="ob-input" id="obSchool" type="text" placeholder="例：みどり中学校" /></div>`,
      mount(slide) {
        slide.querySelector('#obTeacher').value = state.settings.teacherName || '';
        slide.querySelector('#obSchool').value  = state.settings.schoolName  || '';
      },
      commit() {
        state.settings.teacherName = (document.getElementById('obTeacher')?.value || '').trim();
        state.settings.schoolName  = (document.getElementById('obSchool')?.value  || '').trim();
      } },

    { key: 'subjects', html: () => `
        <div class="ob-emoji" data-ob-stagger>📚</div>
        <h1 class="ob-title" data-ob-stagger>使う教科を選ぶ</h1>
        <p class="ob-sub" data-ob-stagger>タップで追加。担当する教科だけでOK。あとで増やせます。</p>
        <div class="ob-chips" id="obSubjChips" data-ob-stagger></div>
        <div class="ob-inline" data-ob-stagger>
          <input class="ob-input" id="obSubjCustom" type="text" placeholder="その他の教科を入力" />
          <button class="ob-mini-btn" id="obSubjAdd" type="button">追加</button>
        </div>
        <div class="ob-added" id="obSubjAdded" data-ob-stagger></div>`,
      mount(slide) {
        const chips = slide.querySelector('#obSubjChips');
        const added = slide.querySelector('#obSubjAdded');
        const renderChips = () => {
          chips.innerHTML = '';
          SUBJECT_DEFAULTS.forEach(sub => {
            const on = obHasSubject(sub.name);
            const c = document.createElement('button');
            c.type = 'button';
            c.className = 'ob-chip' + (on ? ' is-on' : '');
            c.innerHTML = `<span class="ob-chip-dot" style="background:${sub.color}"></span>${escHtml(sub.name)}${on ? '<span class="ob-chip-check">✓</span>' : ''}`;
            c.addEventListener('click', () => { obToggleSubject(sub.name, sub.color); renderChips(); renderAdded(); });
            chips.appendChild(c);
          });
        };
        const renderAdded = () => {
          const custom = state.settings.subjects.filter(s => !SUBJECT_DEFAULTS.some(d => d.name === s.name));
          added.innerHTML = '';
          custom.forEach(s => {
            const el = document.createElement('span');
            el.className = 'ob-added-chip';
            el.innerHTML = `<span class="ob-chip-dot" style="background:${s.color}"></span>${escHtml(s.name)}<span class="ob-x">×</span>`;
            el.querySelector('.ob-x').addEventListener('click', () => { obToggleSubject(s.name); renderAdded(); });
            added.appendChild(el);
          });
        };
        const input = slide.querySelector('#obSubjCustom');
        const doAdd = () => { const v = input.value.trim(); if (!v) return; if (!obHasSubject(v)) obToggleSubject(v); input.value = ''; renderChips(); renderAdded(); input.focus(); };
        slide.querySelector('#obSubjAdd').addEventListener('click', doAdd);
        input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); doAdd(); } });
        renderChips(); renderAdded();
      } },

    { key: 'class', html: () => `
        <div class="ob-emoji" data-ob-stagger>🏫</div>
        <h1 class="ob-title" data-ob-stagger>学級を登録</h1>
        <p class="ob-sub" data-ob-stagger>担当する学級を追加しましょう。<br>「3年2組」のように入力します。</p>
        <div class="ob-inline" data-ob-stagger>
          <input class="ob-input" id="obClassInput" type="text" placeholder="例：3年2組" />
          <button class="ob-mini-btn" id="obClassAdd" type="button">追加</button>
        </div>
        <div class="ob-added" id="obClassAdded" data-ob-stagger></div>
        <p class="ob-hint" data-ob-stagger>あとから名簿画面で生徒も登録できます。1つも無くてもOKです。</p>`,
      mount(slide) {
        const added = slide.querySelector('#obClassAdded');
        const input = slide.querySelector('#obClassInput');
        const renderAdded = () => {
          added.innerHTML = '';
          activeSchoolClasses().forEach(c => {
            const el = document.createElement('span');
            el.className = 'ob-added-chip';
            el.innerHTML = `${escHtml(c.name)}<span class="ob-x">×</span>`;
            el.querySelector('.ob-x').addEventListener('click', () => {
              state.classes = state.classes.filter(x => x.id !== c.id); renderAdded();
            });
            added.appendChild(el);
          });
        };
        const doAdd = () => {
          const name = obAddClass(input.value.trim());
          if (!name) { input.style.borderColor = 'var(--danger, #dc2626)'; return; }
          input.value = ''; input.style.borderColor = ''; renderAdded(); input.focus();
        };
        slide.querySelector('#obClassAdd').addEventListener('click', doAdd);
        input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); doAdd(); } });
        renderAdded();
      } },

    { key: 'periods', html: () => `
        <div class="ob-emoji" data-ob-stagger>🕐</div>
        <h1 class="ob-title" data-ob-stagger>1日の時限数</h1>
        <p class="ob-sub" data-ob-stagger>週案グリッドの行数になります。あとで変更できます。</p>
        <div data-ob-stagger style="display:flex;justify-content:center;margin-bottom:6px;">
          <div class="ob-seg" id="obPeriods"></div>
        </div>
        <p class="ob-hint" data-ob-stagger>開始時刻などの細かい調整は、設定画面でいつでもできます。</p>`,
      mount(slide) {
        const seg = slide.querySelector('#obPeriods');
        const render = () => {
          seg.innerHTML = '';
          [4,5,6,7].forEach(n => {
            const b = document.createElement('button');
            b.type = 'button';
            b.textContent = String(n);
            if (state.settings.periodsCount === n) b.className = 'is-on';
            b.addEventListener('click', () => { state.settings.periodsCount = n; render(); });
            seg.appendChild(b);
          });
        };
        render();
      } },

    { key: 'location', html: () => `
        <div class="ob-emoji" data-ob-stagger>🌤️</div>
        <h1 class="ob-title" data-ob-stagger>天気の地点</h1>
        <p class="ob-sub" data-ob-stagger>ホーム画面に表示する天気の場所です。<br>あとから設定や天気画面で変更できます。</p>
        <div class="ob-field" data-ob-stagger><label>都市名で設定</label>
          <div class="ob-inline">
            <input class="ob-input" id="obCity" type="text" placeholder="例：熊本、札幌、Naha" />
            <button class="ob-mini-btn" id="obCitySearch" type="button">検索</button>
          </div>
        </div>
        <div class="ob-inline" data-ob-stagger style="justify-content:center;flex-wrap:wrap;gap:10px;">
          <button class="ob-mini-btn" id="obGeoBtn" type="button">📍 現在地を使う</button>
          <button class="ob-mini-btn" id="obTokyoBtn" type="button">東京にする</button>
        </div>
        <p class="ob-hint" id="obLocStatus" data-ob-stagger></p>`,
      mount(slide) {
        const status = slide.querySelector('#obLocStatus');
        const showStatus = () => { status.textContent = `現在の地点：${state.settings.weatherName || '東京'}`; };
        showStatus();
        const input = slide.querySelector('#obCity');
        const doCity = async () => {
          const name = (input.value || '').trim();
          if (!name) return;
          status.textContent = '検索中…';
          try {
            const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=1&language=ja&format=json`;
            const res = await fetch(url);
            const geo = await res.json();
            const hit = geo?.results?.[0];
            if (!hit) { status.textContent = '都市が見つかりませんでした。別の表記でお試しください'; return; }
            state.settings.weatherLat = hit.latitude;
            state.settings.weatherLon = hit.longitude;
            state.settings.weatherName = hit.name + (hit.admin1 ? `（${hit.admin1}）` : '');
            _weatherCache = null;
            showStatus();
          } catch (e) { status.textContent = '検索に失敗しました。通信環境をご確認ください'; }
        };
        slide.querySelector('#obCitySearch').addEventListener('click', doCity);
        input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); doCity(); } });
        slide.querySelector('#obGeoBtn').addEventListener('click', () => {
          if (!window.isSecureContext || !navigator.geolocation) {
            status.textContent = '現在地はhttps接続でのみ使えます。都市名で設定してください';
            return;
          }
          status.textContent = '現在地を取得中…';
          navigator.geolocation.getCurrentPosition(pos => {
            state.settings.weatherLat = pos.coords.latitude;
            state.settings.weatherLon = pos.coords.longitude;
            state.settings.weatherName = '現在地';
            _weatherCache = null;
            showStatus();
          }, () => { status.textContent = '現在地の取得に失敗しました。都市名で設定してください'; },
             { enableHighAccuracy: false, timeout: 8000, maximumAge: 600000 });
        });
        slide.querySelector('#obTokyoBtn').addEventListener('click', () => {
          state.settings.weatherLat = 35.6895;
          state.settings.weatherLon = 139.6917;
          state.settings.weatherName = '東京';
          _weatherCache = null;
          showStatus();
        });
      } },

    { key: 'consent', nextLabel: '次へ', html: () => `
        <div class="ob-emoji" data-ob-stagger>📋</div>
        <h1 class="ob-title" data-ob-stagger>ご利用の前に</h1>
        <div class="ob-disclaimer" data-ob-stagger>
          <p>このアプリは個人が制作したものです。<strong>万一データが消失しても、作者は責任を負えません。</strong></p>
          <p>児童・生徒の<strong>個人情報の取り扱いには十分ご注意ください。</strong>データは端末内のみに保存され、外部へ送信されることはありません。</p>
          <p>万一に備え、<strong>定期的なバックアップを必ず行ってください。</strong></p>
        </div>
        <label class="ob-agree" data-ob-stagger>
          <input type="checkbox" id="obAgree" />
          <span>上記に同意します</span>
        </label>`,
      mount(slide) {
        const cb = slide.querySelector('#obAgree');
        const next = document.getElementById('obNext');
        const sync = () => { next.disabled = !cb.checked; };
        sync();
        cb.addEventListener('change', sync);
      } },

    { key: 'done', nextLabel: '週案をはじめる', html: () => `
        <div class="ob-emoji" data-ob-stagger>🎉</div>
        <h1 class="ob-title" data-ob-stagger>準備完了！</h1>
        <p class="ob-sub" data-ob-stagger>さっそく今週の週案を作ってみましょう。<br>いつでも設定から内容を変更できます。</p>` },
  ];
}

function renderObDots() {
  const dots = document.getElementById('obDots');
  if (!dots) return;
  dots.innerHTML = '';
  _obSteps.forEach((_, i) => {
    const s = document.createElement('span');
    if (i === _obIndex) s.className = 'is-on';
    dots.appendChild(s);
  });
}

function renderObStep(direction) {
  const stage = document.getElementById('obStage');
  const step = _obSteps[_obIndex];
  const old = stage.querySelector('.ob-slide');
  if (old) {
    old.animate(
      [{ opacity: 1, transform: 'translateY(0) scale(1)' },
       { opacity: 0, transform: `translateY(${direction > 0 ? -22 : 22}px) scale(.98)` }],
      { duration: 240, easing: 'cubic-bezier(.4,0,.2,1)', fill: 'forwards' }
    ).onfinish = () => old.remove();
  }
  const slide = document.createElement('div');
  slide.className = 'ob-slide';
  slide.innerHTML = `<div class="ob-slide-inner">${step.html()}</div>`;
  stage.appendChild(slide);
  document.getElementById('obNext').disabled = false;   // 同意ゲート等を毎ステップでリセット
  if (step.mount) step.mount(slide);

  slide.animate(
    [{ opacity: 0, transform: `translateY(${direction > 0 ? 26 : -26}px) scale(.985)` },
     { opacity: 1, transform: 'translateY(0) scale(1)' }],
    { duration: 440, easing: 'cubic-bezier(.22,1,.36,1)' }
  );
  [...slide.querySelectorAll('[data-ob-stagger]')].forEach((el, i) => {
    el.animate(
      [{ opacity: 0, transform: 'translateY(14px)' }, { opacity: 1, transform: 'translateY(0)' }],
      { duration: 520, delay: 90 + i * 70, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'both' }
    );
  });

  const back = document.getElementById('obBack');
  back.hidden = _obIndex === 0;
  document.getElementById('obNext').textContent = step.nextLabel || '続ける';
  renderObDots();
}

function obNext() {
  const step = _obSteps[_obIndex];
  if (step.commit) step.commit();
  if (_obIndex >= _obSteps.length - 1) { finishOnboarding(); return; }
  _obIndex++; renderObStep(1);
}
function obPrev() {
  if (_obIndex === 0) return;
  const step = _obSteps[_obIndex];
  if (step.commit) step.commit();
  _obIndex--; renderObStep(-1);
}

function startOnboarding() {
  _obSteps = buildObSteps();
  _obIndex = 0;
  const ov = document.getElementById('onboarding');
  if (!ov) return;
  ov.removeAttribute('hidden');
  document.getElementById('obNext').addEventListener('click', obNext);
  document.getElementById('obBack').addEventListener('click', obPrev);
  ov.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 400, easing: 'ease' });
  renderObStep(1);
}

function finishOnboarding() {
  ensureDefaultSchool();
  if (state.settings.schoolName && state.schools[0]) state.schools[0].name = state.settings.schoolName;
  kvSet('weeky_onboarded', '1').catch(() => {});
  save();
  const ov = document.getElementById('onboarding');
  ov.style.pointerEvents = 'none';   // 透明になっても操作を奪わないよう即無効化
  const close = () => { ov.setAttribute('hidden', ''); ov.style.pointerEvents = ''; };
  const anim = ov.animate(
    [{ opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(1.04)' }],
    { duration: 420, easing: 'cubic-bezier(.4,0,.2,1)', fill: 'forwards' }
  );
  anim.onfinish = close;
  setTimeout(close, 600);   // onfinish が発火しない環境向けのフォールバック
  // 設定が反映された状態で背後を描き直す
  renderWeekGrid();
  if (typeof renderSettings === 'function') renderSettings();
  updateClassStatus();
  tutorialDone().then(done => { if (!done) setTimeout(startTutorial, 750); });   // 初期設定の直後に1回だけ
}

/* ════════ 初回チュートリアル（カード＋名簿スポットライト＋応援） ════════ */
const TUT_KEY = 'weeky_v10_tutorial_done';
let _tutIndex = 0, _tutSteps = [], _tutEl = null;

async function tutorialDone(){ try { return (await kvGet(TUT_KEY)) === '1'; } catch(e){ return false; } }
function markTutorialDone(){ kvSet(TUT_KEY, '1').catch(() => {}); }

function buildTutSteps(){
  return [
    { type:'card', emoji:'👋', title:'ようこそ、WEEKY へ',
      body:'準備おつかれさまでした！かんたんに使い方を案内します（1分くらい）。<br>「スキップ」でいつでも閉じられます。',
      primary:{ label:'次へ', action:_tutNext } },
    { type:'card', emoji:'🔒', title:'まず、安心してください',
      body:'このあと生徒の情報を入力します。「これ打ち込んで大丈夫かな？」と思いましたよね。<br><br><b>大丈夫です。</b>データはこの端末の中だけに保存され、インターネットと通信する機能はこのアプリにはありません。あるとしたら、天気をちょっと見てくるくらいです。',
      primary:{ label:'次へ', action:_tutNext } },
    { type:'spot', target:'.nav-item[data-view="roster"]', emoji:'👥', title:'名簿を登録してみましょう',
      body:'まずは自分に関わる生徒の名簿から。ここ（名簿）で「学校 → 学級 → 生徒」の順に登録できます。',
      primary:{ label:'名簿を開く', action:()=>{ try{ switchView('roster'); }catch(e){} _tutNext(); } } },
    { type:'spot', target:'.nav-item[data-view="weekly"]', emoji:'📝', title:'次は授業を追加してみましょう',
      body:'週案（今週の時間割）に戻ります。空いているコマをタップすると、教科・学級・タイトル・ノートなどを入力できます。',
      primary:{ label:'週案を開く', action:()=>{ try{ switchView('weekly'); }catch(e){} setTimeout(_tutNext, 320); } } },
    { type:'spot', target:'.grid-cell:not(.has-lesson)', emoji:'👆', title:'ここをタップしてみましょう',
      body:'空いているコマをタップすると、その時間の授業を登録できます。教科・学級・タイトル・写真・手書きメモまで、この1画面で全部入力できます。',
      primary:{ label:'わかった', action:_tutNext },
      // 授業モーダルは z-index 500 でチュートリアルのオーバーレイ（4000）より下にあるため、
      // ここだけクリック透過にすると「タップしたのにモーダルが影に隠れて見えない」状態になる。
      // このステップは説明のみに留め、実際に開くのは「わかった」を閉じた後にしてもらう。
      noClickThrough:true },
    { type:'spot', target:'.nav-item[data-view="todo"]', emoji:'✅', title:'ToDoも使ってみましょう',
      body:'授業以外の「やること」はToDoにまとめて管理できます。タグごとにカンバン形式で整理され、締切が近いものは自動で上に並びます。授業準備・提出物チェックなど、なんでも放り込んでOKです。',
      primary:{ label:'ToDoを開く', action:()=>{ try{ switchView('todo'); }catch(e){} _tutNext(); } } },
    { type:'card', emoji:'☕', title:'最後に、ひとつだけ',
      body:'いま、ひとりで頑張って作っています。維持・管理・保守にも少しずつ費用がかかっています。先生たちにはこれで楽をしてほしいので、料金は設けていません。<br><br>もし「いいな、応援したいな」と思えたら、製作者にコーヒーを1杯おごる感覚で、少しだけ寄付いただけたら嬉しいです（製作者、コーヒー大好きです。豆から淹れる本格派！）。<br><br>もちろん全機能ずっと無料。寄付しても特別な機能解放などはありません。ただ、製作者が<b>めちゃくちゃ喜びます。</b><br><br>「一銭もやらん、タダで使いたいんだ！」という方は、右上の × を押してください。二度とこの画面は出ません。もう請求じみたことはしませんので、安心してくださいね。',
      primary:{ label:'応援する（PayPay）', action:()=>{ _tutFinish(); try{ switchView('settings'); showSettingsCategory('support'); }catch(e){} } },
      noSkip:true },
  ];
}

function _tutBuildEl(){
  const ov = document.createElement('div');
  ov.className = 'tut-overlay'; ov.id = 'tutorialOverlay'; ov.hidden = true;
  ov.innerHTML =
    '<div class="tut-spot" id="tutSpot" hidden></div>' +
    '<div class="tut-card" id="tutCard" role="dialog" aria-modal="true">' +
      '<button class="tut-close" id="tutClose" type="button" aria-label="閉じる">×</button>' +
      '<div class="tut-emoji" id="tutEmoji" aria-hidden="true"></div>' +
      '<h3 class="tut-title" id="tutTitle"></h3>' +
      '<div class="tut-body" id="tutBody"></div>' +
      '<div class="tut-controls">' +
        '<button class="tut-skip" id="tutSkip" type="button">スキップ</button>' +
        '<span class="tut-dots" id="tutDots"></span>' +
        '<button class="tut-primary" id="tutPrimary" type="button">次へ</button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(ov);
  ov.querySelector('#tutClose').addEventListener('click', _tutFinish);
  ov.querySelector('#tutSkip').addEventListener('click', _tutFinish);
  window.addEventListener('resize', _tutReposition);
  return ov;
}

function startTutorial(){
  _tutSteps = buildTutSteps();
  _tutIndex = 0;
  if (!_tutEl) _tutEl = _tutBuildEl();
  _tutEl.hidden = false;
  _tutRender();
}

function _tutNext(){
  if (_tutIndex >= _tutSteps.length - 1) { _tutFinish(); return; }
  _tutIndex++; _tutRender();
}

function _tutFinish(){
  markTutorialDone();
  if (_tutEl) _tutEl.hidden = true;
}

function _tutRender(){
  if (!_tutEl) return;
  const s = _tutSteps[_tutIndex];
  const g = id => document.getElementById(id);
  g('tutEmoji').textContent = s.emoji || '';
  g('tutTitle').textContent = s.title || '';
  g('tutBody').innerHTML = s.body || '';
  const prim = g('tutPrimary');
  prim.textContent = (s.primary && s.primary.label) || '次へ';
  prim.onclick = (s.primary && s.primary.action) || _tutNext;
  g('tutSkip').style.visibility = s.noSkip ? 'hidden' : 'visible';
  g('tutDots').innerHTML = _tutSteps.map((_, i) => `<span class="tut-dot${i === _tutIndex ? ' on' : ''}"></span>`).join('');
  _tutReposition();
}

function _tutReposition(){
  if (!_tutEl || _tutEl.hidden) return;
  const s = _tutSteps[_tutIndex];
  const spot = document.getElementById('tutSpot'), card = document.getElementById('tutCard');
  if (!spot || !card) return;
  card.classList.remove('tut-card--center', 'tut-card--bottom');
  card.style.left = card.style.top = card.style.transform = '';
  const tgt = (s.type === 'spot' && s.target) ? document.querySelector(s.target) : null;
  if (tgt && tgt.offsetParent !== null) {
    const r = tgt.getBoundingClientRect(), pad = 6;
    spot.hidden = false;
    spot.style.left = (r.left - pad) + 'px'; spot.style.top = (r.top - pad) + 'px';
    spot.style.width = (r.width + pad * 2) + 'px'; spot.style.height = (r.height + pad * 2) + 'px';
    _tutEl.classList.remove('tut-dim');
    // スポットライト中は実際のUI（ナビ・コマ）を本当にタップできるようにする。
    // .tut-spot はもともと pointer-events:none だが、親の .tut-overlay が
    // 画面全体を覆って auto のままだと結局クリックを吸収してしまい、
    // 「タップしてみましょう」と案内していても反応しないバグになっていた。
    // ただし対象がモーダルを開く操作（授業セルなど）の場合、モーダルの
    // z-indexがオーバーレイより低く裏に隠れてしまうため、そのステップだけは
    // 従来通りブロックしたまま（noClickThrough）にしておく。
    if (!s.noClickThrough) _tutEl.classList.add('tut-clickthrough');
    else _tutEl.classList.remove('tut-clickthrough');
    if (window.innerWidth < 560) {
      card.classList.add('tut-card--bottom');
    } else {
      card.style.left = Math.min(r.right + 16, window.innerWidth - 340) + 'px';
      card.style.top = Math.max(14, Math.min(r.top, window.innerHeight - 280)) + 'px';
    }
  } else {
    spot.hidden = true;
    _tutEl.classList.add('tut-dim');
    _tutEl.classList.remove('tut-clickthrough');
    card.classList.add('tut-card--center');
  }
}

async function startApp() {
  document.getElementById('activationGate')?.setAttribute('hidden', '');

  showHeaderVersion();
  initAppHeight();
  preventDoubleTapZoom();
  await load();   // v11: IndexedDBからの読み込みなのでawaitしてから描画に入る
  migratePhotosToIdb();   // move any legacy inline photos into IndexedDB
  requestPersistentStorage();   // ask the browser not to auto-evict our data
  applyTheme(state.settings.theme || 'indigo');
  applyAppearance(state.settings.appearance || 'light');
  // 初回は switchView を通らないため body[data-view] が未設定→週ナビが隠れる。明示設定。
  document.body.dataset.view = state.activeView || 'weekly';
  renderWeekTitle();
  renderWeekGrid();
  updatePanelTodo();
  updateClassStatus();
  updateStats();
  loadWeather();

  // Clock
  updateClock();
  setInterval(updateClock, 10_000);

  // Class status refresh
  setInterval(updateClassStatus, 60_000);

  // Move the red current-time bar every minute while on the weekly view
  setInterval(() => {
    if (state.activeView === 'weekly') {
      const grid = document.getElementById('weekGrid');
      if (grid) renderCurrentTimeBar(grid, state.settings.periodsCount);
    }
  }, 60_000);

  bindEvents();

  // 画面ロック（PIN）初期化：起動時ロック・無操作タイマー・設定UI
  initLock();

  // 初回ユーザーにはセットアップウィザードを表示（既存ユーザーには出さない）
  maybeStartOnboarding();

  // remind to back up if it's been a while
  setTimeout(checkBackupReminder, 1500);

  // deadline notifications on load + whenever the window regains focus
  setTimeout(() => checkTodoNotifications(true), 1800);
  window.addEventListener('focus', () => checkTodoNotifications());
  document.addEventListener('visibilitychange', () => { if (!document.hidden) checkTodoNotifications(); });
}

function bindEvents() {
  const q = id => document.getElementById(id);

  /* ── Week navigation ── */
  q('prevWeekBtn')?.addEventListener('click', () => navigateWeek(-1));
  q('nextWeekBtn')?.addEventListener('click', () => navigateWeek(1));
  q('todayBtn')?.addEventListener('click', goToToday);

  /* キーボードの ← / → で前週・翌週へ（週案画面で、入力中やモーダル表示中は無効） */
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (document.body.dataset.view !== 'weekly') return;
    const t = e.target;
    if (t && t.closest && t.closest('input, textarea, select, [contenteditable="true"]')) return;
    if (document.querySelector('.modal-backdrop:not([hidden]), .reception-overlay:not([hidden]), .hw-fullscreen:not([hidden])')) return;
    if (document.getElementById('weekCalPop') && !document.getElementById('weekCalPop').hidden) return;
    e.preventDefault();
    navigateWeek(e.key === 'ArrowLeft' ? -1 : 1);
  });

  /* tap the week title → open the in-app calendar; pick a day to jump weeks */
  q('weekTitle')?.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleWeekCalendar();
  });
  q('weekCalPrev')?.addEventListener('click', (e) => { e.stopPropagation(); shiftCalMonth(-1); });
  q('weekCalNext')?.addEventListener('click', (e) => { e.stopPropagation(); shiftCalMonth(1); });
  q('weekCalToday')?.addEventListener('click', (e) => {
    e.stopPropagation();
    pickCalendarDate(formatDate(new Date()));
  });
  q('weekCalGrid')?.addEventListener('click', (e) => {
    const btn = e.target.closest('.week-cal-day');
    if (btn) { e.stopPropagation(); pickCalendarDate(btn.dataset.date); }
  });

  /* ── Sidebar nav ── */
  document.querySelectorAll('.nav-item[data-view]').forEach(btn =>
    btn.addEventListener('click', () => switchView(btn.dataset.view))
  );
  q('hamburgerBtn')?.addEventListener('click', openSidebar);
  q('sidebarCloseBtn')?.addEventListener('click', closeSidebar);
  q('sidebarOverlay')?.addEventListener('click', closeSidebar);

  /* ── Context panel ── */
  q('contextToggleBtn')?.addEventListener('click', toggleContextPanel);

  /* ── Weather ── */
  q('weatherBtn')?.addEventListener('click', openWeatherModal);
  q('weatherModalClose')?.addEventListener('click', () => {
    q('weatherModalBackdrop')?.setAttribute('hidden', '');
    releaseFocus();
  });
  q('weatherModalBackdrop')?.addEventListener('click', e => {
    if (e.target === e.currentTarget) { e.currentTarget.setAttribute('hidden', ''); releaseFocus(); }
  });

  /* ── Lesson modal ── */
  q('lessonModalClose')?.addEventListener('click', closeLessonModal);
  q('lessonCancelBtn')?.addEventListener('click', closeLessonModal);
  q('lessonDeleteBtn')?.addEventListener('click', async () => {
    if (!currentLessonKey) { closeLessonModal(); return; }
    clearTimeout(autosaveTimer); // stop a queued autosave from reviving it
    if (!await customConfirm('この授業のカードを削除しますか?（内容・写真・手書きもすべて消えます）')) return;
    // remove the lesson's photos from IndexedDB too
    (state.lessons[currentLessonKey]?.photos || []).forEach(p => { if (p && !p.src) mediaDelete(p.id); });
    delete state.lessons[currentLessonKey];
    lessonPhotos = [];
    save();
    renderWeekGrid();
    updateStats();
    closeLessonModal();
    showToast('授業を削除しました');
  });
  q('lessonSaveBtn')?.addEventListener('click', saveLessonModal);
  q('lessonModalBackdrop')?.addEventListener('click', e => {
    if (e.target === e.currentTarget) saveLessonModal();  // 外の暗い所をタップ→自動保存して閉じる
  });
  q('hwModeSwitch')?.addEventListener('click', () => setMode(currentMode === 'handwriting' ? 'text' : 'handwriting'));
  setupLmHwToolbar();
  q('moveLessonBtn')?.addEventListener('click', openMoveLessonPicker);

  /* ── Header search ── */
  q('searchBtn')?.addEventListener('click', openSearch);
  // Cmd/Ctrl + K opens search from anywhere
  document.addEventListener('keydown', e => {
    if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
      e.preventDefault();
      openSearch();
    }
  });

  ['lessonTitle', 'lessonNote'].forEach(id => q(id)?.addEventListener('input', scheduleAutosave));
  ['lessonSubject', 'lessonClass'].forEach(id => q(id)?.addEventListener('change', scheduleAutosave));
  q('lessonClass')?.addEventListener('change', () => { if (_lmDate != null) renderLessonAttendance(_lmDate, _lmPeriod); });

  /* ── Tags ── */
  function setupTagInput(inputId, containerId, tags) {
    q(inputId)?.addEventListener('keydown', e => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      const val = e.target.value.trim();
      if (val && !tags.includes(val)) { tags.push(val); renderModalTags(containerId, inputId, tags); }
      e.target.value = '';
    });
  }
  setupTagInput('tagInput', 'tagsContainer', lessonTags);
  setupTagInput('tagInputHW', 'tagsContainerHW', lessonTags);

  /* ── Panel ToDo quick add ── */
  q('addTodayTodoBtn')?.addEventListener('click', async () => {
    const text = await customPrompt('今日の ToDo を入力:');
    if (!text?.trim()) return;
    state.todos.push({ id: uid(), text: text.trim(), done: false, due: '', tags: [], createdAt: Date.now() });
    save(); updatePanelTodo();
    if (state.activeView === 'todo') renderTodoBoard();
  });

  /* ── ToDo board compose ── */
  q('todoComposeForm')?.addEventListener('submit', e => {
    e.preventDefault();
    composeAddTodo();
  });
  q('todoTagCaret')?.addEventListener('click', toggleTodoTagMenu);

  /* ── Notes (2-pane editor) ── */
  q('addNoteBtn')?.addEventListener('click', addNote);
  q('notesSearch')?.addEventListener('input', renderNotesList);
  q('noteDeleteBtn')?.addEventListener('click', deleteActiveNote);
  let _noteSaveTimer = null;
  const debouncedNoteSave = () => {
    clearTimeout(_noteSaveTimer);
    _noteSaveTimer = setTimeout(() => { persistActiveNote(); renderNotesList(); }, 400);
  };
  q('noteTitleInput')?.addEventListener('input', debouncedNoteSave);
  q('noteBodyInput')?.addEventListener('input', debouncedNoteSave);
  q('noteTagInput')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const v = e.target.value.trim();
      if (v && !_noteTags.includes(v)) {
        _noteTags.push(v);
        persistActiveNote();
        renderNoteTags();
        renderNotesList();
      }
      e.target.value = '';
    }
  });

  /* ── Student section: school/class selects ── */
  const onSchoolChange = e => { state.activeSchoolId = e.target.value; state.rosterClass = null; save(); refreshStudentViews(); };
  const onClassChange  = e => { state.rosterClass = e.target.value; refreshStudentViews(); };
  ['rosterSchoolSelect','attSchoolSelect','evalSchoolSelect'].forEach(id =>
    q(id)?.addEventListener('change', onSchoolChange));
  ['rosterClassSelect','attClassSelect','evalClassSelect'].forEach(id =>
    q(id)?.addEventListener('change', onClassChange));
  q('evalSubjectSelect')?.addEventListener('change', renderEvaluation);

  /* ── Roster 3-column manager ── */
  q('rmSchoolAddForm')?.addEventListener('submit', e => {
    e.preventDefault();
    const nameEl = q('rmSchoolName'), codeEl = q('rmSchoolCode');
    if (addSchool(nameEl?.value, codeEl?.value)) {
      state.activeSchoolId = state.schools[state.schools.length - 1].id;
      state.rosterClass = null;
      nameEl.value = ''; if (codeEl) codeEl.value = '';
      save(); renderRoster(); nameEl.focus();
    }
  });
  q('rmClassAddForm')?.addEventListener('submit', e => {
    e.preventDefault();
    const textEl = q('rmClassText'), yearEl = q('rmClassYear');
    if (!yearEl.value) yearEl.value = new Date().getFullYear();
    if (addClassEntity(textEl?.value, yearEl?.value)) {
      textEl.value = ''; renderRoster(); textEl.focus();
    }
  });
  q('rmPasteBtn')?.addEventListener('click', openPasteModal);
  q('rmCsvBtn')?.addEventListener('click', exportRosterCsv);
  q('rmDetailBtn')?.addEventListener('click', () => openStudentModal(null));

  /* ── Bulk paste modal ── */
  q('pasteModalClose')?.addEventListener('click', closePasteModal);
  q('pasteCancelBtn')?.addEventListener('click', closePasteModal);
  q('pasteApplyBtn')?.addEventListener('click', applyPasteModal);
  q('pasteModalBackdrop')?.addEventListener('click', e => { if (e.target === e.currentTarget) closePasteModal(); });
  q('pasteTextarea')?.addEventListener('input', e => {
    const n = e.target.value.split(/\r?\n/).filter(l => l.trim()).length;
    const p = q('pastePreview'); if (p) p.textContent = n ? `${n}名を登録します` : '';
  });

  /* ── Student modal ── */
  q('studentModalClose')?.addEventListener('click', closeStudentModal);
  q('studentCancelBtn')?.addEventListener('click', closeStudentModal);
  q('saveStudentBtn')?.addEventListener('click', saveStudentModal);
  q('deleteStudentBtn')?.addEventListener('click', deleteStudent);
  // recompute deterministic ID live as fields change
  ['studentYear','studentGrade','studentClassNo','studentNumber'].forEach(id =>
    q(id)?.addEventListener('input', updateStudentIdPreview));
  q('copyQrIdBtn')?.addEventListener('click', () => {
    const id = _pendingQrId || '';
    navigator.clipboard?.writeText(id).then(() => showToast('IDをコピーしました'))
      .catch(() => { const el = q('studentQrId'); el?.select(); document.execCommand('copy'); showToast('IDをコピーしました'); });
  });
  // tap the ID field to select all (easy manual copy on iPad)
  q('studentQrId')?.addEventListener('focus', e => e.target.select());
  q('studentQrId')?.addEventListener('click', e => e.target.select());

  /* ── School modal ── */
  q('schoolModalClose')?.addEventListener('click', closeSchoolModal);
  q('schoolAddForm')?.addEventListener('submit', e => {
    e.preventDefault();
    const el = q('schoolAddName');
    const codeEl = q('schoolAddCode');
    if (addSchool(el?.value, codeEl?.value)) {
      el.value = ''; if (codeEl) codeEl.value = '';
      fillSchoolSelect(q('rosterSchoolSelect')); refreshStudentViews();
    }
  });

  /* ── Class modal ── */
  q('manageClassesBtn')?.addEventListener('click', openClassModal);
  q('classModalClose')?.addEventListener('click', closeClassModal);
  q('classModalBackdrop')?.addEventListener('click', e => { if (e.target === e.currentTarget) closeClassModal(); });
  q('classAddForm')?.addEventListener('submit', e => {
    e.preventDefault();
    const textEl = q('classAddText');
    const yearEl = q('classAddYear');
    if (addClassEntity(textEl?.value, yearEl?.value)) {
      textEl.value = ''; textEl.focus();
      fillClassSelect(q('rosterClassSelect')); refreshStudentViews();
    }
  });

  /* ── Attendance month nav ── */
  q('attSubjectSelect')?.addEventListener('change', e => { _attSubject = e.target.value; renderAttendance(); });

  /* ── QR受付 ── */
  q('startReceptionBtn')?.addEventListener('click', () => openReception());
  q('rcpClose')?.addEventListener('click', closeReception);
  q('rcpScanInput')?.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); handleRcpScan(); } });
  document.addEventListener('keydown', _scanKeyHandler, true);   // ハードウェアQR/バーコードリーダーの取りこぼし対策（受付中のみ作動）
  q('rcpCamBtn')?.addEventListener('click', startCamScan);
  q('rcpCamStop')?.addEventListener('click', stopCamScan);
  q('rcpCamFlip')?.addEventListener('click', flipCamScan);
  q('tutReplayBtn')?.addEventListener('click', startTutorial);
  q('todoEditSave')?.addEventListener('click', saveTodoEdit);
  q('todoEditCancel')?.addEventListener('click', closeTodoEdit);
  q('todoEditBackdrop')?.addEventListener('click', e => { if (e.target === e.currentTarget) closeTodoEdit(); });
  ['rcpDate','rcpPeriod','rcpClass'].forEach(id => q(id)?.addEventListener('change', renderReceptionLists));
  // 受付中に学校を切り替える → その学校の学級に入れ替えて再表示
  q('rcpSchool')?.addEventListener('change', e => {
    state.activeSchoolId = e.target.value;
    state.rosterClass = null;
    rcpFillClasses();
    renderReceptionLists();
  });
  q('forgotCancelBtn')?.addEventListener('click', closeForgotPopup);
  q('forgotPresentBtn')?.addEventListener('click', confirmPresent);
  q('forgotModalBackdrop')?.addEventListener('click', e => { if (e.target === e.currentTarget) closeForgotPopup(); });

  /* 出欠あとから変更ポップアップ */
  q('attEditCancel')?.addEventListener('click', closeAttEdit);
  q('attEditPresent')?.addEventListener('click', () => setAttendanceState(true));
  q('attEditAbsent')?.addEventListener('click', () => setAttendanceState(false));
  q('attEditBackdrop')?.addEventListener('click', e => { if (e.target === e.currentTarget) closeAttEdit(); });

  /* 忘れ物の項目 編集モーダル（出席タブのボタンから開く） */
  q('forgotItemsBtn')?.addEventListener('click', openForgotItemsModal);
  q('forgotItemsModalClose')?.addEventListener('click', closeForgotItemsModal);
  q('forgotItemsModalBackdrop')?.addEventListener('click', e => { if (e.target === e.currentTarget) closeForgotItemsModal(); });

  /* ── Progress ── */
  q('progressGrade')?.addEventListener('change', e => { _progressGrade = parseInt(e.target.value, 10); state.settings.progressGrade = _progressGrade; save(); renderProgressTable(); });
  q('progressSubjectSel')?.addEventListener('change', e => { _progressSubject = e.target.value; state.settings.progressSubject = _progressSubject; save(); renderProgressTable(); });

  /* ── Photos ── */
  q('photoFileInput')?.addEventListener('change', e => {
    handlePhotoFiles(e.target.files, currentLessonKey ? 'lesson' : 'gallery');
    e.target.value = '';
  });
  q('addPhotoBtn')?.addEventListener('click', () => q('photoFileInput')?.click());
  q('addLessonPhotoBtn')?.addEventListener('click', () => q('photoFileInput')?.click());

  /* ── Print / PDF ── */
  q('exportPdfBtn')?.addEventListener('click', exportPdf);
  q('printBtn')?.addEventListener('click', doPrint);

  /* ── Import / Export ── */
  q('exportJsonBtn')?.addEventListener('click', exportJson);
  q('importJsonBtn')?.addEventListener('click', () => q('importFileInput')?.click());
  q('fullBackupBtn')?.addEventListener('click', exportFullBackup);
  q('wipeDataBtn')?.addEventListener('click', wipeAllData);
  q('importFileInput')?.addEventListener('change', e => {
    if (e.target.files[0]) importJson(e.target.files[0]);
    e.target.value = '';
  });

  /* ── Settings ── */
  q('saveSettingsBtn')?.addEventListener('click', saveSettings);
  document.querySelectorAll('.settings-nav-item').forEach(b =>
    b.addEventListener('click', () => showSettingsCategory(b.dataset.cat)));

  /* ── Events month nav ── */
  q('eventsPrevMonthBtn')?.addEventListener('click', () => navigateEventsMonth(-1));
  q('eventsNextMonthBtn')?.addEventListener('click', () => navigateEventsMonth(1));

  /* ── Import events ── */
  q('importEventsBtn')?.addEventListener('click', async () => {
    const text = await customPrompt('Excel等からコピーした行事を貼り付けてください。\n1行=1日。「日付［タブ/カンマ］行事名」、または上から順に1日目・2日目…として取り込みます。');
    if (!text) return;
    const y = state.eventsYear, m = state.eventsMonth;
    const monthKey = `${y}-${String(m).padStart(2,'0')}`;
    if (!state.events[monthKey] || Array.isArray(state.events[monthKey])) state.events[monthKey] = {};
    const map = state.events[monthKey];
    const lines = text.split('\n');
    let count = 0, seq = 1;
    lines.forEach(line => {
      if (!line.trim()) { seq++; return; } // blank line still advances the day
      const parts = line.split(/\t|,/);
      let day, name;
      const dm = parts[0].match(/(\d{1,2})/);
      if (parts.length > 1 && dm) { day = parseInt(dm[1], 10); name = parts.slice(1).join(' ').trim(); }
      else { day = seq; name = line.trim(); }
      if (day >= 1 && day <= 31 && name) { map[day] = name; count++; }
      seq++;
    });
    save(); renderEventsGrid();
    showToast(`${count}件の行事を取り込みました`);
  });

  /* ── Clear lesson ── */
  q('clearLessonBtn')?.addEventListener('click', async () => {
    if (!await customConfirm('授業内容をクリアしますか?')) return;
    q('lessonTitle').value = ''; q('lessonNote').value = '';
    lessonTags = []; lessonPhotos = [];
    renderModalTags('tagsContainer', 'tagInput', lessonTags);
    renderModalPhotos();
  });
  q('clearLessonHWBtn')?.addEventListener('click', () => q('clearLessonBtn')?.click());

  /* ── HW modal page nav ── */
  q('hwPrevPage')?.addEventListener('click', () => {
    if (hwPageIndex > 0) { hwPageIndex--; updateHandwritingPreview(); updateHwPageInfo(); }
  });
  q('hwNextPage')?.addEventListener('click', () => {
    const pages = state.lessons[currentLessonKey]?.hwPages?.length || 1;
    if (hwPageIndex < pages - 1) { hwPageIndex++; updateHandwritingPreview(); updateHwPageInfo(); }
  });
  q('hwAddPage')?.addEventListener('click', () => {
    if (!currentLessonKey) return;
    if (!state.lessons[currentLessonKey]) state.lessons[currentLessonKey] = {};
    if (!state.lessons[currentLessonKey].hwPages) state.lessons[currentLessonKey].hwPages = [];
    state.lessons[currentLessonKey].hwPages.push(null);
    hwPageIndex = state.lessons[currentLessonKey].hwPages.length - 1;
    updateHandwritingPreview();
    updateHwPageInfo();
  });

  /* ── HW fullscreen ── */
  q('hwFullscreenBtn')?.addEventListener('click', openHwFullscreen);
  setupFsHwToolbar();

  /* ── Subject add ── */
  q('subjectAddForm')?.addEventListener('submit', e => {
    e.preventDefault();
    const nameEl  = q('subjectAddName');
    const colorEl = q('subjectAddColor');
    if (addSubject(nameEl?.value, colorEl?.value)) {
      nameEl.value = '';
      nameEl.focus();
    }
  });

  q('forgotAddForm')?.addEventListener('submit', e => {
    e.preventDefault();
    const nameEl = q('forgotAddName');
    if (addForgotItem(nameEl?.value)) {
      nameEl.value = '';
      nameEl.focus();
    }
  });

  /* ── Quick actions ── */
  q('quickRecordBtn')?.addEventListener('click', () => {
    switchView('weekly'); showToast('授業セルをタップして記録できます');
  });
  q('quickBackupBtn')?.addEventListener('click', exportJson);
  q('launchAttendanceBtn')?.addEventListener('click', () => showToast('出席管理モジュールを起動します'));

  /* ── Keyboard shortcuts ── */
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      closeSidebar();
      const panel = q('contextPanel');
      if (panel?.classList.contains('open')) panel.classList.remove('open');
    }
  });

  /* ── Resize: reinit canvases ── */
  window.addEventListener('resize', () => {
    const hwCanvas = q('hwCanvas');
    if (hwCanvas && _fsHwCtx) {
      const prev = _fsHwCtx.canvas.toDataURL('image/png');
      _fsHwCtx.canvas.width  = hwCanvas.parentElement.clientWidth  || window.innerWidth;
      _fsHwCtx.canvas.height = hwCanvas.parentElement.clientHeight || window.innerHeight - 56;
      const img = new Image();
      img.onload = () => _fsHwCtx.drawImage(img, 0, 0);
      img.src = prev;
    }
  });
}

/* ── Entry point ─────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', initActivationGate);
