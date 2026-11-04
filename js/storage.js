/* ============================================================
   storage.js — локальное хранилище, пользователи, сессия,
   экспорт/импорт, облачная синхронизация
   ============================================================ */
(function (global) {
  'use strict';

  const RU = global.RU;
  const NS = 'ritm.v1';
  const K_USERS = NS + '.users';
  const K_SESSION = NS + '.session';
  const K_DATA = NS + '.data.';      // + userId
  const K_THEME = NS + '.theme';     // тема до входа (для экрана логина)

  /* ---------- Безопасный доступ к localStorage ---------- */
  const memory = {};
  let lsOk = true;
  try {
    const probe = NS + '.probe';
    global.localStorage.setItem(probe, '1');
    global.localStorage.removeItem(probe);
  } catch (e) { lsOk = false; }

  function rawGet(key) {
    if (!lsOk) return key in memory ? memory[key] : null;
    try { return global.localStorage.getItem(key); } catch (e) { return null; }
  }
  function rawSet(key, val) {
    if (!lsOk) { memory[key] = val; return; }
    try { global.localStorage.setItem(key, val); }
    catch (e) {
      // Квота переполнена — пробуем освободить старые резервные копии
      try {
        Object.keys(global.localStorage)
          .filter((k) => k.indexOf(NS + '.backup.') === 0)
          .forEach((k) => global.localStorage.removeItem(k));
        global.localStorage.setItem(key, val);
      } catch (e2) { memory[key] = val; lsOk = false; }
    }
  }
  function rawDel(key) {
    if (!lsOk) { delete memory[key]; return; }
    try { global.localStorage.removeItem(key); } catch (e) {}
  }
  function readJSON(key, fallback) {
    const raw = rawGet(key);
    if (!raw) return fallback;
    try { return JSON.parse(raw); } catch (e) { return fallback; }
  }
  function writeJSON(key, obj) { rawSet(key, JSON.stringify(obj)); }

  /* ---------- Кэш активного профиля ---------- */
  let state = null;          // объект данных текущего пользователя
  let flushTimer = 0;

  const DEFAULT_CATEGORIES = [
    { id: 'c-health',  name: 'Здоровье',   color: '#178A5B', icon: '💚' },
    { id: 'c-body',    name: 'Спорт',      color: '#F0512A', icon: '🏃' },
    { id: 'c-mind',    name: 'Развитие',   color: '#6B5BD2', icon: '📚' },
    { id: 'c-work',    name: 'Работа',     color: '#2F6FD0', icon: '💻' },
    { id: 'c-home',    name: 'Быт',        color: '#C8880B', icon: '🧹' },
    { id: 'c-other',   name: 'Другое',     color: '#8A6A4F', icon: '⭐' }
  ];

  function blankState() {
    return {
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      settings: {
        theme: 'auto',            // auto | light | dark
        accent: '#F0512A',
        weekStart: 1,             // 1 = понедельник, 0 = воскресенье
        notifications: false,
        soundOnComplete: true,
        confetti: true,
        homeLayout: 'list',       // list | compact
        reminderOffset: 0         // минут после напоминания до повтора
      },
      categories: DEFAULT_CATEGORIES.slice(),
      habits: [],
      logs: {},                   // { habitId: { 'YYYY-MM-DD': число } }
      achievements: {},           // { achievementId: ISO-дата получения }

      /* ---------- Дополнительные модули ---------- */
      chess: {
        stats: { wins: 0, losses: 0, draws: 0 },
        games: []                 // сохранённые партии
      },
      training: {
        plans: [],                // пользовательские планы
        lessons: {},              // { 'programId/lessonId': ISO-дата }
        sessions: []              // журнал тренировок
      },
      recipes: {
        favorites: [],            // id рецептов
        custom: []                // собственные рецепты
      },
      music: {
        playlists: [],            // { id, name, trackIds: [] }
        favorites: [],            // id треков
        tracks: [],               // метаданные локальных файлов
        recent: []                // недавно прослушанные
      },
      nutrition: {
        profile: {                // параметры для расчёта нормы калорий
          sex: 'f', age: 30, height: 170, weight: 70,
          activity: 1.375, goal: 'keep'
        },
        custom: [],               // собственные продукты (БЖУ на 100 г)
        entries: [],              // дневник питания: { id, date, meal, name, grams, kcal, p, f, c }
        water: {}                 // { 'YYYY-MM-DD': число стаканов }
      },
      blackjack: {
        chips: 1000,              // банк фишек
        bet: 50,                  // последняя ставка
        stats: { hands: 0, wins: 0, losses: 0, pushes: 0, blackjacks: 0, best: 0 },
        history: []               // последние раздачи
      }
    };
  }

  /* ---------- Пользователи ---------- */

  const store = {};

  store.isPersistent = () => lsOk;

  store.users = () => readJSON(K_USERS, []);

  store.findUser = (login) => {
    const l = String(login || '').trim().toLowerCase();
    return store.users().find((u) => u.login === l) || null;
  };

  store.register = async (name, login, password) => {
    const l = String(login || '').trim().toLowerCase();
    if (!/^[a-z0-9._-]{3,24}$/.test(l)) {
      throw new Error('Логин: 3–24 символа, латиница, цифры, точка, дефис или подчёркивание.');
    }
    if (String(password).length < 4) throw new Error('Пароль должен содержать минимум 4 символа.');
    if (store.findUser(l)) throw new Error('Такой логин уже занят — выберите другой.');

    const user = {
      id: RU.uid(),
      name: String(name || '').trim() || l,
      login: l,
      pass: await RU.hash(password),
      createdAt: new Date().toISOString()
    };
    const users = store.users();
    users.push(user);
    writeJSON(K_USERS, users);

    const st = blankState();
    writeJSON(K_DATA + user.id, st);
    store.openSession(user.id);
    return user;
  };

  store.login = async (login, password) => {
    const user = store.findUser(login);
    if (!user) throw new Error('Пользователь с таким логином не найден.');
    const h = await RU.hash(password);
    if (h !== user.pass) throw new Error('Неверный пароль. Попробуйте ещё раз.');
    store.openSession(user.id);
    return user;
  };

  /** Перечитать состояние текущего пользователя из хранилища.
      Нужно второму окну (виджету), когда данные изменило основное приложение. */
  store.reload = () => {
    const id = store.currentUserId();
    if (!id) { state = null; return null; }
    state = migrate(readJSON(K_DATA + id, null) || blankState());
    return state;
  };

  store.openSession = (userId) => {
    rawSet(K_SESSION, userId);
    store.reload();
    store.save(true);
    return state;
  };

  store.currentUserId = () => rawGet(K_SESSION);

  store.currentUser = () => {
    const id = store.currentUserId();
    return store.users().find((u) => u.id === id) || null;
  };

  store.logout = () => {
    store.flush();
    rawDel(K_SESSION);
    state = null;
  };

  store.updateUser = (patch) => {
    const id = store.currentUserId();
    const users = store.users();
    const u = users.find((x) => x.id === id);
    if (!u) return null;
    Object.assign(u, patch);
    writeJSON(K_USERS, users);
    return u;
  };

  store.deleteAccount = () => {
    const id = store.currentUserId();
    rawDel(K_DATA + id);
    rawDel(K_SESSION);
    writeJSON(K_USERS, store.users().filter((u) => u.id !== id));
    state = null;
  };

  /* ---------- Состояние ---------- */

  store.state = () => state;

  /** Сохранить (по умолчанию — с задержкой, чтобы не тормозить UI) */
  store.save = (immediate) => {
    if (!state) return;
    state.updatedAt = new Date().toISOString();
    const id = store.currentUserId();
    if (!id) return;
    if (immediate) {
      clearTimeout(flushTimer);
      writeJSON(K_DATA + id, state);
      return;
    }
    clearTimeout(flushTimer);
    flushTimer = setTimeout(() => {
      writeJSON(K_DATA + id, state);
    }, 180);
  };

  store.flush = () => {
    if (!state) return;
    const id = store.currentUserId();
    if (!id) return;
    clearTimeout(flushTimer);
    writeJSON(K_DATA + id, state);
  };

  store.reset = () => {
    if (!state) return;
    state = Object.assign(blankState(), { createdAt: state.createdAt });
    store.save(true);
  };

  /* ---------- Миграции ---------- */
  function migrate(st) {
    if (!st.version) st.version = 1;
    if (!Array.isArray(st.categories) || !st.categories.length) st.categories = DEFAULT_CATEGORIES.slice();
    if (!Array.isArray(st.habits)) st.habits = [];
    if (!st.logs || typeof st.logs !== 'object') st.logs = {};
    if (!st.achievements || typeof st.achievements !== 'object') st.achievements = {};
    if (!st.settings) st.settings = blankState().settings;
    // дополнительные модули (для старых резервных копий)
    const def = blankState();
    if (!st.chess || typeof st.chess !== 'object') st.chess = def.chess;
    else {
      if (!st.chess.stats) st.chess.stats = def.chess.stats;
      if (!Array.isArray(st.chess.games)) st.chess.games = [];
    }
    if (!st.training || typeof st.training !== 'object') st.training = def.training;
    else {
      if (!Array.isArray(st.training.plans)) st.training.plans = [];
      if (!st.training.lessons || typeof st.training.lessons !== 'object') st.training.lessons = {};
      if (!Array.isArray(st.training.sessions)) st.training.sessions = [];
    }
    if (!st.recipes || typeof st.recipes !== 'object') st.recipes = def.recipes;
    else {
      if (!Array.isArray(st.recipes.favorites)) st.recipes.favorites = [];
      if (!Array.isArray(st.recipes.custom)) st.recipes.custom = [];
    }
    if (!st.music || typeof st.music !== 'object') st.music = def.music;
    else {
      if (!Array.isArray(st.music.playlists)) st.music.playlists = [];
      if (!Array.isArray(st.music.favorites)) st.music.favorites = [];
      if (!Array.isArray(st.music.tracks)) st.music.tracks = [];
      if (!Array.isArray(st.music.recent)) st.music.recent = [];
    }
    if (!st.nutrition || typeof st.nutrition !== 'object') st.nutrition = def.nutrition;
    else {
      if (!st.nutrition.profile || typeof st.nutrition.profile !== 'object') st.nutrition.profile = def.nutrition.profile;
      if (!Array.isArray(st.nutrition.custom)) st.nutrition.custom = [];
      if (!Array.isArray(st.nutrition.entries)) st.nutrition.entries = [];
      if (!st.nutrition.water || typeof st.nutrition.water !== 'object') st.nutrition.water = {};
    }
    if (!st.blackjack || typeof st.blackjack !== 'object') st.blackjack = def.blackjack;
    else {
      const bj = st.blackjack, dbj = def.blackjack;
      if (typeof bj.chips !== 'number') bj.chips = dbj.chips;
      if (typeof bj.bet !== 'number') bj.bet = dbj.bet;
      if (!Array.isArray(bj.history)) bj.history = [];
      if (!bj.stats || typeof bj.stats !== 'object') bj.stats = { hands: 0, wins: 0, losses: 0, pushes: 0, blackjacks: 0, best: 0 };
      else ['hands', 'wins', 'losses', 'pushes', 'blackjacks', 'best'].forEach((k) => {
        if (typeof bj.stats[k] !== 'number') bj.stats[k] = 0;
      });
    }
    // нормализация логов: значения -> числа
    Object.keys(st.logs).forEach((hid) => {
      const m = st.logs[hid];
      if (!m || typeof m !== 'object') { delete st.logs[hid]; return; }
      Object.keys(m).forEach((k) => {
        const v = Number(m[k]);
        if (!v || v <= 0) delete m[k]; else m[k] = v;
      });
    });
    st.habits.forEach((h) => {
      if (!h.freq || !h.freq.type) h.freq = { type: 'daily' };
      if (!h.target || h.target < 1) h.target = 1;
      if (!h.createdAt) h.createdAt = new Date().toISOString();
    });
    return st;
  }

  /* ---------- Тема до входа ---------- */
  store.themePref = () => rawGet(K_THEME) || 'auto';
  store.setThemePref = (t) => rawSet(K_THEME, t);

  /* ---------- Экспорт / импорт ---------- */

  store.exportObject = () => ({
    app: 'Ритм',
    format: 'ritm-backup',
    version: 1,
    exportedAt: new Date().toISOString(),
    user: (function () {
      const u = store.currentUser();
      if (!u) return null;
      return { name: u.name, login: u.login, createdAt: u.createdAt };
    })(),
    data: state
  });

  store.exportJSON = () => JSON.stringify(store.exportObject(), null, 2);

  store.download = (filename) => {
    const json = store.exportJSON();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || ('ritm-backup-' + RU.today() + '.json');
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1200);
  };

  store.importObject = (obj) => {
    const payload = (obj && obj.data) ? obj.data : obj;
    if (!payload || typeof payload !== 'object' || !Array.isArray(payload.habits)) {
      throw new Error('Файл не похож на резервную копию «Ритма».');
    }
    state = migrate(payload);
    store.save(true);
    return state;
  };

  store.importJSON = (text) => store.importObject(JSON.parse(text));

  /* ---------- Код синхронизации (перенос между устройствами) ---------- */

  store.makeSyncCode = () => {
    const json = JSON.stringify(store.exportObject());
    const bytes = new TextEncoder().encode(json);
    let bin = '';
    bytes.forEach((b) => { bin += String.fromCharCode(b); });
    return 'RITM1.' + btoa(bin);
  };

  store.readSyncCode = (code) => {
    const clean = String(code || '').trim().replace(/\s+/g, '');
    if (clean.indexOf('RITM1.') !== 0) throw new Error('Неверный код синхронизации.');
    const bin = atob(clean.slice(6));
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    const json = new TextDecoder().decode(bytes);
    return store.importJSON(json);
  };

  /* ---------- Облачная синхронизация (необязательный REST-эндпоинт) ---------- */

  const K_CLOUD = NS + '.cloud';

  store.cloudConfig = () => readJSON(K_CLOUD, { url: '', token: '' });
  store.setCloudConfig = (cfg) => writeJSON(K_CLOUD, {
    url: String(cfg.url || '').trim(),
    token: String(cfg.token || '').trim()
  });

  store.cloudEnabled = () => {
    const c = store.cloudConfig();
    return !!c.url && /^https?:\/\//i.test(c.url);
  };

  function cloudRequest(method, payload) {
    const c = store.cloudConfig();
    const id = store.currentUserId();
    const url = c.url.replace('{id}', encodeURIComponent(id || 'me'));
    const headers = { 'Content-Type': 'application/json' };
    if (c.token) headers['Authorization'] = 'Bearer ' + c.token;
    return fetch(url, {
      method: method,
      headers: headers,
      body: payload ? JSON.stringify(payload) : undefined
    }).then((r) => {
      if (!r.ok) throw new Error('Сервер ответил ' + r.status);
      return r.status === 204 ? null : r.json();
    });
  }

  /** Отправка состояния на сервер (POST/PUT) */
  store.cloudPush = () => {
    if (!store.cloudEnabled()) return Promise.reject(new Error('Облако не настроено.'));
    store.flush();
    return cloudRequest('POST', store.exportObject());
  };

  /** Загрузка состояния с сервера (GET) */
  store.cloudPull = () => {
    if (!store.cloudEnabled()) return Promise.reject(new Error('Облако не настроено.'));
    return cloudRequest('GET').then((res) => {
      if (!res) return null;
      const remote = (res.data) ? res.data : res;
      if (Date.now() - new Date(remote.updatedAt || 0) < 0) return null;
      state = migrate(remote);
      store.save(true);
      return state;
    });
  };

  /** Слияние: объединяем привычки и логи, свежее состояние по updatedAt */
  store.cloudMerge = () => {
    if (!store.cloudEnabled()) return Promise.reject(new Error('Облако не настроено.'));
    return cloudRequest('GET').then((res) => {
      if (!res) return store.cloudPush().then(() => ({ merged: false }));
      const remote = migrate((res.data) ? res.data : res);
      const local = state;
      const merged = mergeStates(local, remote);
      state = merged;
      store.save(true);
      return store.cloudPush().then(() => ({ merged: true, habits: merged.habits.length }));
    });
  };

  function mergeStates(a, b) {
    const out = JSON.parse(JSON.stringify(a));
    const byId = {};
    out.habits.forEach((h) => { byId[h.id] = h; });
    b.habits.forEach((h) => {
      const ex = byId[h.id];
      if (!ex) { out.habits.push(h); byId[h.id] = h; return; }
      if (new Date(h.updatedAt || 0) > new Date(ex.updatedAt || 0)) {
        Object.assign(ex, h);
      }
    });
    // логи: берём максимум значения по каждому дню
    Object.keys(b.logs || {}).forEach((hid) => {
      out.logs[hid] = out.logs[hid] || {};
      Object.keys(b.logs[hid]).forEach((d) => {
        const v = b.logs[hid][d] || 0;
        if (v > (out.logs[hid][d] || 0)) out.logs[hid][d] = v;
      });
    });
    // категории из более свежего состояния
    if (new Date(b.updatedAt || 0) > new Date(a.updatedAt || 0)) out.categories = b.categories;
    // достижения объединяем
    out.achievements = Object.assign({}, b.achievements, a.achievements);
    Object.keys(out.logs).forEach((hid) => {
      if (!out.logs[hid] || !Object.keys(out.logs[hid]).length) delete out.logs[hid];
    });
    out.updatedAt = new Date().toISOString();
    return out;
  }

  /* ---------- Автоматическая резервная копия ---------- */
  store.autoBackup = () => {
    const id = store.currentUserId();
    if (!id || !state) return;
    const key = NS + '.backup.' + id + '.' + RU.today();
    if (!rawGet(key)) writeJSON(key, { at: new Date().toISOString(), data: state });
    // храним не более 7 последних дней
    const keys = Object.keys(lsOk ? global.localStorage : {})
      .filter((k) => k.indexOf(NS + '.backup.' + id + '.') === 0)
      .sort();
    while (keys.length > 7) rawDel(keys.shift());
  };

  global.Store = store;
})(window);
