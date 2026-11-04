/* ============================================================
   music.js — раздел «Музыка»: локальный аудиоплеер «Ритма».

   ВАЖНО ОБ ИСТОЧНИКЕ. У Яндекс.Музыки нет публичного API для
   сторонних приложений, поэтому подключение внешнего сервиса
   напрямую невозможно без нарушения условий использования.
   Раздел реализован как полноценный локальный плеер: он работает
   с вашими аудиофайлами (хранятся в IndexedDB этого браузера),
   поддерживает плейлисты, избранное и синхронизацию с локальной
   библиотекой. Точка расширения для легального внешнего источника
   описана в настройках раздела.

   Публичный интерфейс:
     window.Music = { route, label, subtitle(), mount(host), tracks, synth }
   ============================================================ */
(function (global) {
  'use strict';

  const RU = global.RU;
  const Store = global.Store;
  const UI = global.UI;

  /* ============================================================
     Хранилище аудиофайлов (IndexedDB)
     ============================================================ */

  const DB_NAME = 'ritm-music';
  const DB_STORE = 'files';

  function idb() {
    return new Promise((resolve, reject) => {
      if (!global.indexedDB) { reject(new Error('IndexedDB недоступен')); return; }
      const req = global.indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(DB_STORE)) req.result.createObjectStore(DB_STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  function idbTx(mode, fn) {
    return idb().then((db) => new Promise((resolve, reject) => {
      const tx = db.transaction(DB_STORE, mode);
      const store = tx.objectStore(DB_STORE);
      const out = fn(store);
      tx.oncomplete = () => resolve(out && out.result !== undefined ? out.result : undefined);
      tx.onerror = () => reject(tx.error);
    }));
  }

  const idbPut = (key, blob) => idbTx('readwrite', (s) => s.put(blob, key));
  const idbGet = (key) => idbTx('readonly', (s) => s.get(key));
  const idbDel = (key) => idbTx('readwrite', (s) => s.delete(key));

  /* ============================================================
     Генерация демо-треков (офлайн-синтез в WAV)
     Демонстрационные композиции создаются кодом — никакого
     внешнего контента и загрузок.
     ============================================================ */

  const DEMO = [
    { id: 'demo-morning', title: 'Утренний свет', artist: 'Ритм · демо', kind: 'demo', collection: 'demo', seconds: 26, seed: 11, root: 261.63, bpm: 92, wave: 'triangle' },
    { id: 'demo-focus',   title: 'Глубокая работа', artist: 'Ритм · демо', kind: 'demo', collection: 'demo', seconds: 30, seed: 27, root: 220.00, bpm: 76, wave: 'sine' },
    { id: 'demo-evening', title: 'Тихий вечер',   artist: 'Ритм · демо', kind: 'demo', collection: 'demo', seconds: 28, seed: 43, root: 196.00, bpm: 68, wave: 'sine' },

    /* Чарт-подобные композиции: сгенерированы в браузере по мотивам
       популярных жанров мировых и российских чартов. Реальные
       лицензионные записи загрузить нельзя (авторские права), поэтому
       здесь — оригинальные синтезированные треки с ритмической основой. */
    { id: 'chart-pop',   title: 'Поп-хит',        artist: 'Ритм · чарт-синтез', kind: 'demo', collection: 'chart', seconds: 32, seed: 101, root: 246.94, bpm: 118, wave: 'triangle', beat: true },
    { id: 'chart-dance', title: 'Танцпол',        artist: 'Ритм · чарт-синтез', kind: 'demo', collection: 'chart', seconds: 34, seed: 137, root: 261.63, bpm: 126, wave: 'square',   beat: true, scale: [0, 2, 3, 5, 7, 10, 12] },
    { id: 'chart-hiphop',title: 'Хип-хоп бит',    artist: 'Ритм · чарт-синтез', kind: 'demo', collection: 'chart', seconds: 30, seed: 173, root: 174.61, bpm: 90,  wave: 'sine',     beat: true },
    { id: 'chart-rock',  title: 'Рок-энергия',    artist: 'Ритм · чарт-синтез', kind: 'demo', collection: 'chart', seconds: 33, seed: 211, root: 196.00, bpm: 132, wave: 'square',   beat: true },
    { id: 'chart-ru',    title: 'Русский поп',    artist: 'Ритм · чарт-синтез', kind: 'demo', collection: 'chart', seconds: 34, seed: 257, root: 220.00, bpm: 122, wave: 'triangle', beat: true, scale: [0, 2, 4, 5, 7, 9, 12] },
    { id: 'chart-edm',   title: 'Электро-клуб',   artist: 'Ритм · чарт-синтез', kind: 'demo', collection: 'chart', seconds: 36, seed: 293, root: 233.08, bpm: 128, wave: 'square',   beat: true }
  ];

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function osc(wave, phase) {
    const p = phase % (Math.PI * 2);
    if (wave === 'triangle') return (2 / Math.PI) * Math.asin(Math.sin(p));
    if (wave === 'square') return Math.sin(p) >= 0 ? 1 : -1;
    return Math.sin(p);
  }

  function renderSamples(track) {
    const sr = 22050;
    const len = Math.floor(track.seconds * sr);
    const data = new Float32Array(len);
    const rnd = mulberry32(track.seed);
    const scale = track.scale || [0, 3, 5, 7, 10, 12];   // минорная пентатоника
    const step = (60 / track.bpm) / 2;

    const addNote = (start, dur, freq, gain) => {
      const s0 = Math.floor(start * sr);
      const n = Math.floor(dur * sr);
      const inc = (Math.PI * 2 * freq) / sr;
      let phase = 0;
      for (let i = 0; i < n; i++) {
        const idx = s0 + i;
        if (idx >= len) break;
        const t = i / n;
        const env = Math.min(1, t * 40) * Math.pow(1 - t, 1.6);
        data[idx] += osc(track.wave, phase) * env * gain;
        phase += inc;
      }
    };

    /* Ритмическая основа (бас-барабан и хэт) для чарт-треков */
    const addKick = (start, gain) => {
      const s0 = Math.floor(start * sr);
      const n = Math.floor(0.18 * sr);
      let phase = 0;
      for (let i = 0; i < n; i++) {
        const idx = s0 + i;
        if (idx >= len) break;
        const t = i / n;
        phase += (Math.PI * 2 * (120 - 70 * t)) / sr;
        data[idx] += Math.sin(phase) * Math.pow(1 - t, 2) * gain;
      }
    };

    const addHat = (start, gain) => {
      const s0 = Math.floor(start * sr);
      const n = Math.floor(0.05 * sr);
      for (let i = 0; i < n; i++) {
        const idx = s0 + i;
        if (idx >= len) break;
        const t = i / n;
        data[idx] += (rnd() * 2 - 1) * Math.pow(1 - t, 3) * gain;
      }
    };

    if (track.beat) {
      const beatLen = 60 / track.bpm;
      let b = 0;
      for (let bt = 0; bt < track.seconds; bt += beatLen, b++) {
        addKick(bt, 0.55);
        if (b % 2 === 1) addHat(bt + beatLen / 2, 0.13);
      }
    }

    let t = 0, i = 0;
    while (t < track.seconds - step) {
      const deg = scale[(rnd() * scale.length) | 0] + 12 * ((rnd() * 2) | 0);
      const f = track.root * Math.pow(2, deg / 12);
      const dur = step * (rnd() < 0.28 ? 2 : 1);
      addNote(t, dur * 0.92, f, 0.24);
      if (i % 4 === 0) addNote(t, step * 3.5, track.root / 2, 0.22);
      t += dur; i++;
    }

    // нормализация
    let peak = 0;
    for (let k = 0; k < len; k++) peak = Math.max(peak, Math.abs(data[k]));
    if (peak > 0.9) { const g = 0.9 / peak; for (let k = 0; k < len; k++) data[k] *= g; }
    return { data: data, sr: sr };
  }

  function encodeWav(samples, sr) {
    const len = samples.length;
    const buf = new ArrayBuffer(44 + len * 2);
    const view = new DataView(buf);
    const str = (o, s) => { for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i)); };
    str(0, 'RIFF'); view.setUint32(4, 36 + len * 2, true); str(8, 'WAVE');
    str(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
    view.setUint32(24, sr, true); view.setUint32(28, sr * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
    str(36, 'data'); view.setUint32(40, len * 2, true);
    let o = 44;
    for (let i = 0; i < len; i++) {
      const s = Math.max(-1, Math.min(1, samples[i]));
      view.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      o += 2;
    }
    return new Blob([buf], { type: 'audio/wav' });
  }

  const demoCache = {};
  function demoBlob(track) {
    if (!demoCache[track.id]) {
      const r = renderSamples(track);
      demoCache[track.id] = encodeWav(r.data, r.sr);
    }
    return demoCache[track.id];
  }

  /* ============================================================
     Данные модуля
     ============================================================ */

  const data = () => Store.state().music;

  function library() { return data().tracks; }
  function allTracks() { return DEMO.concat(library()); }
  function trackById(id) { return allTracks().find((t) => t.id === id) || null; }
  function isFav(id) { return data().favorites.indexOf(id) !== -1; }

  function pushRecent(id) {
    const v = Store.state().music;
    if (!v.recent) v.recent = [];
    v.recent = [id].concat(v.recent.filter((x) => x !== id)).slice(0, 12);
  }

  /* ============================================================
     Плеер
     ============================================================ */

  const audio = new global.Audio();
  audio.preload = 'metadata';

  const ps = {
    tab: 'library',
    queue: [],
    index: -1,
    shuffle: false,
    repeat: false,
    openPlaylist: null,
    objectUrl: null,
    volumeValue: 0.9
  };

  const current = () => (ps.index >= 0 ? trackById(ps.queue[ps.index]) : null);

  function fmtTime(sec) {
    if (!isFinite(sec) || sec < 0) sec = 0;
    const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
    return m + ':' + RU.pad2(s);
  }

  async function loadAndPlay(id) {
    const track = trackById(id);
    if (!track) return;
    let blob = null;
    try {
      blob = track.kind === 'demo' ? demoBlob(track) : await idbGet(id);
    } catch (e) { blob = null; }
    if (!blob) {
      UI.toast({ icon: '⚠️', title: 'Файл недоступен', text: 'Аудио для этого трека не найдено.', kind: 'warn' });
      return;
    }
    if (ps.objectUrl) { URL.revokeObjectURL(ps.objectUrl); ps.objectUrl = null; }
    ps.objectUrl = URL.createObjectURL(blob);
    audio.src = ps.objectUrl;
    audio.volume = ps.volumeValue || 0.9;
    pushRecent(id);
    Store.save();
    const play = audio.play();
    if (play && play.catch) play.catch(() => {});
    updatePlayerUI();
  }

  function playTrack(id, queue) {
    if (queue && queue.length) { ps.queue = queue.slice(); }
    else if (ps.queue.indexOf(id) === -1) { ps.queue = allTracks().map((t) => t.id); }
    ps.index = ps.queue.indexOf(id);
    loadAndPlay(id);
    paintPlayer();
    paintBody();
  }

  function nextIndex(step) {
    if (!ps.queue.length) return -1;
    let i = ps.index + step;
    if (ps.shuffle && step === 1) i = (Math.random() * ps.queue.length) | 0;
    if (i >= ps.queue.length) i = ps.repeat ? 0 : -1;
    if (i < 0 && ps.repeat) i = ps.queue.length - 1;
    return i;
  }

  function step_(dir) {
    const i = nextIndex(dir);
    if (i < 0) { audio.pause(); updatePlayerUI(); return; }
    ps.index = i;
    loadAndPlay(ps.queue[i]);
    paintPlayer();
    paintBody();
  }

  function togglePlay() {
    const c = current();
    if (!c) {
      const first = allTracks()[0];
      if (first) playTrack(first.id);
      return;
    }
    if (audio.paused) {
      if (!audio.src) { loadAndPlay(c.id); return; }
      const p = audio.play();
      if (p && p.catch) p.catch(() => {});
    } else {
      audio.pause();
    }
    updatePlayerUI();
    paintBody();
  }

  audio.addEventListener('ended', () => {
    if (ps.repeat && ps.queue.length === 1) { audio.currentTime = 0; audio.play(); return; }
    step_(1);
  });
  audio.addEventListener('timeupdate', updateProgress);
  audio.addEventListener('play', updatePlayerUI);
  audio.addEventListener('pause', updatePlayerUI);

  function updateProgress() {
    const seek = document.getElementById('msSeek');
    const cur = document.getElementById('msCur');
    const dur = document.getElementById('msDur');
    const total = audio.duration || (current() ? current().seconds : 0);
    if (seek) seek.value = String(total ? Math.round((audio.currentTime / total) * 1000) : 0);
    if (cur) cur.textContent = fmtTime(audio.currentTime);
    if (dur) dur.textContent = fmtTime(total);
  }

  function updatePlayerUI() {
    const btn = document.getElementById('msPlayBtn');
    if (btn) {
      const playing = !audio.paused && !!audio.src;
      btn.textContent = playing ? '❚❚' : '▶';
      btn.setAttribute('aria-label', playing ? 'Пауза' : 'Играть');
    }
    updateProgress();
  }

  /* ============================================================
     Разметка
     ============================================================ */

  function playerHTML() {
    const c = current();
    const title = c ? c.title : 'Ничего не играет';
    const artist = c ? c.artist : 'Выберите трек из библиотеки';
    return '<section class="card ms-player">' +
      '<div class="ms-player__art' + (c ? ' is-live' : '') + '">' + (c ? '♫' : '♪') + '</div>' +
      '<div class="ms-player__main">' +
        '<div class="ms-player__now">' +
          '<strong id="msTitle">' + RU.escapeHtml(title) + '</strong>' +
          '<span id="msArtist">' + RU.escapeHtml(artist) + '</span>' +
        '</div>' +
        '<div class="ms-player__seek">' +
          '<span id="msCur" class="ms-time">0:00</span>' +
          '<input type="range" id="msSeek" class="ms-range" min="0" max="1000" value="0" aria-label="Позиция трека">' +
          '<span id="msDur" class="ms-time">0:00</span>' +
        '</div>' +
        '<div class="ms-player__ctrl">' +
          '<button type="button" class="ms-btn" data-ms="prev" aria-label="Предыдущий">⏮</button>' +
          '<button type="button" class="ms-btn ms-btn--main" id="msPlayBtn" data-ms="playpause" aria-label="Играть">▶</button>' +
          '<button type="button" class="ms-btn" data-ms="next" aria-label="Следующий">⏭</button>' +
          '<button type="button" class="ms-btn ms-toggle' + (ps.shuffle ? ' is-on' : '') + '" data-ms="shuffle" aria-label="Перемешать">⤨</button>' +
          '<button type="button" class="ms-btn ms-toggle' + (ps.repeat ? ' is-on' : '') + '" data-ms="repeat" aria-label="Повтор">↻</button>' +
          '<span class="ms-vol">' +
            '<span aria-hidden="true">🔊</span>' +
            '<input type="range" id="msVol" class="ms-range ms-range--vol" min="0" max="100" value="' +
              Math.round((ps.volumeValue || 0.9) * 100) + '" aria-label="Громкость">' +
          '</span>' +
        '</div>' +
      '</div>' +
    '</section>';
  }

  function sourceNote() {
    return '<details class="card card--flat ms-source">' +
      '<summary>Источник музыки и синхронизация</summary>' +
      '<p>Сейчас раздел работает с <b>локальной библиотекой</b>: файлы, которые вы импортируете, ' +
        'хранятся только в этом браузере (IndexedDB) и никуда не отправляются.</p>' +
      '<p>Прямое подключение <b>Яндекс.Музыки</b> невозможно: у сервиса нет публичного API для сторонних ' +
        'приложений, а неофициальные обращения нарушают его условия использования. Поэтому вместо внешнего ' +
        'стриминга реализован собственный плеер с плейлистами, избранным и демо-треками.</p>' +
      '<p>Если легальный источник появится (собственный сервер, открытый API, файловое хранилище), ' +
        'его можно подключить как ещё одну «полку» библиотеки — интерфейс раздела к этому готов.</p>' +
    '</details>';
  }

  function tabsHTML() {
    const t = (id, label) => '<button type="button" class="segments__opt' + (ps.tab === id ? ' is-active' : '') +
      '" data-ms="tab" data-val="' + id + '">' + label + '</button>';
    return '<div class="segments ms-tabs">' +
      t('library', 'Библиотека') + t('playlists', 'Плейлисты') + t('favorites', 'Избранное') + '</div>';
  }

  function trackRow(t, ctx) {
    const fav = isFav(t.id);
    const active = current() && current().id === t.id;
    return '<div class="ms-row' + (active ? ' is-active' : '') + '">' +
      '<button type="button" class="ms-row__play" data-ms="play" data-id="' + t.id + '" aria-label="Играть">' +
        (active && !audio.paused ? '❚❚' : '▶') + '</button>' +
      '<div class="ms-row__t">' +
        '<strong>' + RU.escapeHtml(t.title) + '</strong>' +
        '<span>' + RU.escapeHtml(t.artist || '—') + (t.kind === 'demo' ? ' · демо' : '') + '</span>' +
      '</div>' +
      '<span class="ms-row__dur">' + fmtTime(t.seconds) + '</span>' +
      '<button type="button" class="ms-row__ico' + (fav ? ' is-on' : '') + '" data-ms="like" data-id="' + t.id +
        '" aria-label="Избранное">' + (fav ? '★' : '☆') + '</button>' +
      '<button type="button" class="ms-row__ico" data-ms="add" data-id="' + t.id + '" aria-label="В плейлист">＋</button>' +
      (ctx === 'playlist'
        ? '<button type="button" class="ms-row__ico" data-ms="unlink" data-id="' + t.id + '" aria-label="Убрать из плейлиста">✕</button>'
        : (t.kind === 'file'
          ? '<button type="button" class="ms-row__ico" data-ms="remove" data-id="' + t.id + '" aria-label="Удалить файл">🗑</button>'
          : '<span class="ms-row__ico is-ghost"></span>')) +
    '</div>';
  }

  function libraryHTML() {
    const lib = library();
    const demos = DEMO.filter((t) => t.collection !== 'chart');
    const charts = DEMO.filter((t) => t.collection === 'chart');
    const queue = allTracks().map((t) => t.id);
    return '<div class="ms-group">' +
      '<div class="ms-group__head"><h3>Моя библиотека</h3>' +
        '<label class="btn btn--sm btn--accent ms-import">' +
          '<input type="file" id="msFileInput" accept="audio/*" multiple hidden> Импортировать файлы' +
        '</label>' +
      '</div>' +
      (lib.length
        ? '<div class="ms-list" data-queue="1">' + lib.map((t) => trackRow(t, 'library')).join('') + '</div>'
        : '<p class="ms-muted">Пока пусто. Импортируйте аудиофайлы — они сохранятся в этом браузере. ' +
          'Поддерживаются MP3, WAV, OGG, M4A и другие форматы, которые умеет браузер.</p>') +
    '</div>' +
    '<div class="ms-group">' +
      '<div class="ms-group__head"><h3>Демо-композиции</h3>' +
        '<span class="chip">синтез в браузере</span></div>' +
      '<div class="ms-list" data-queue="1">' + demos.map((t) => trackRow(t, 'library')).join('') + '</div>' +
    '</div>' +
    '<div class="ms-group">' +
      '<div class="ms-group__head"><h3>Чарты · синтез</h3>' +
        '<span class="chip">жанровые демо</span></div>' +
      '<p class="ms-muted">Композиции созданы в браузере по мотивам популярных жанров мировых и российских чартов. ' +
        'Готовые лицензионные записи добавить нельзя из-за авторских прав — зато эти треки играют офлайн и без интернета.</p>' +
      '<div class="ms-list" data-queue="1">' + charts.map((t) => trackRow(t, 'library')).join('') + '</div>' +
    '</div>' +
    '<p class="ms-hint">Очередь воспроизведения: ' + queue.length + ' ' +
      RU.plural(queue.length, 'трек', 'трека', 'треков') + '</p>';
  }

  function playlistsHTML() {
    if (ps.openPlaylist) {
      const pl = data().playlists.find((p) => p.id === ps.openPlaylist);
      if (!pl) { ps.openPlaylist = null; return playlistsHTML(); }
      const tracks = pl.trackIds.map(trackById).filter(Boolean);
      return '<button type="button" class="btn btn--sm btn--ghost ms-back" data-ms="pl-back">← Плейлисты</button>' +
        '<div class="ms-group__head"><h3>' + RU.escapeHtml(pl.name) + '</h3>' +
          '<button type="button" class="btn btn--sm btn--accent" data-ms="pl-play" data-id="' + pl.id + '">▶ Играть всё</button></div>' +
        (tracks.length
          ? '<div class="ms-list">' + tracks.map((t) => trackRow(t, 'playlist')).join('') + '</div>'
          : '<p class="ms-muted">В плейлисте пока нет треков. Добавьте их кнопкой «＋» в списках треков.</p>');
    }
    const pls = data().playlists;
    return '<div class="ms-group__head"><h3>Мои плейлисты</h3>' +
        '<button type="button" class="btn btn--sm btn--accent" data-ms="pl-new">+ Новый плейлист</button></div>' +
      (pls.length
        ? '<div class="ms-pls">' + pls.map((p) =>
          '<article class="card ms-pl" data-ms="pl-open" data-id="' + p.id + '">' +
            '<span class="ms-pl__art">≡</span>' +
            '<div class="ms-pl__t"><strong>' + RU.escapeHtml(p.name) + '</strong>' +
            '<span>' + p.trackIds.length + ' ' + RU.plural(p.trackIds.length, 'трек', 'трека', 'треков') + '</span></div>' +
            '<button type="button" class="ms-row__ico" data-ms="pl-del" data-id="' + p.id + '" aria-label="Удалить плейлист">🗑</button>' +
          '</article>').join('') + '</div>'
        : '<p class="ms-muted">Плейлистов пока нет. Создайте первый и добавьте в него треки.</p>');
  }

  function favoritesHTML() {
    const favIds = data().favorites;
    const favs = favIds.map(trackById).filter(Boolean);
    return '<div class="ms-group__head"><h3>Избранное</h3>' +
        (favs.length ? '<button type="button" class="btn btn--sm btn--accent" data-ms="fav-play">▶ Играть всё</button>' : '') +
      '</div>' +
      (favs.length
        ? '<div class="ms-list">' + favs.map((t) => trackRow(t, 'fav')).join('') + '</div>'
        : '<p class="ms-muted">Отметьте треки звёздочкой ☆ — они появятся здесь.</p>');
  }

  function bodyHTML() {
    if (ps.tab === 'playlists') return playlistsHTML();
    if (ps.tab === 'favorites') return favoritesHTML();
    return libraryHTML();
  }

  function template() {
    return '<div class="ms">' + playerHTML() + sourceNote() + tabsHTML() +
      '<div class="ms__body" id="msBody">' + bodyHTML() + '</div></div>';
  }

  function paintPlayer() {
    const host = document.querySelector('.ms-player');
    if (!host) return;
    const wrap = host.parentNode;
    const tmp = document.createElement('div');
    tmp.innerHTML = playerHTML();
    wrap.replaceChild(tmp.firstChild, host);
    bindPlayer(wrap.querySelector('.ms-player'));
    updatePlayerUI();
  }

  function paintBody() {
    const box = document.getElementById('msBody');
    if (box) box.innerHTML = bodyHTML();
  }

  /* ============================================================
     Действия
     ============================================================ */

  function addToPlaylist(trackId) {
    const pls = data().playlists;
    if (!pls.length) {
      UI.toast({ icon: '≡', title: 'Сначала создайте плейлист', text: 'Вкладка «Плейлисты» → «Новый плейлист»' });
      return;
    }
    UI.openModal({
      title: 'Добавить в плейлист',
      body: '<div class="ms-pls">' + pls.map((p) =>
        '<button type="button" class="ms-pick" data-pick="' + p.id + '">' +
          '<strong>' + RU.escapeHtml(p.name) + '</strong>' +
          '<span>' + p.trackIds.length + ' ' + RU.plural(p.trackIds.length, 'трек', 'трека', 'треков') + '</span>' +
        '</button>').join('') + '</div>',
      noFocus: true,
      foot: '<button class="btn btn--ghost" data-close="modal">Отмена</button>',
      onMount: (b) => {
        b.addEventListener('click', (e) => {
          const el = e.target.closest('[data-pick]');
          if (!el) return;
          const pl = data().playlists.find((p) => p.id === el.getAttribute('data-pick'));
          if (pl && pl.trackIds.indexOf(trackId) === -1) pl.trackIds.push(trackId);
          Store.save(true);
          UI.closeModal();
          UI.toast({ icon: '≡', title: 'Добавлено в «' + (pl ? pl.name : '') + '»' });
          paintBody();
        });
      }
    });
  }

  async function importFiles(host, files) {
    const list = Array.prototype.slice.call(files);
    if (!list.length) return;
    let added = 0;
    for (const file of list) {
      if (!/^audio\//.test(file.type) && !/\.(mp3|wav|ogg|m4a|aac|flac|opus)$/i.test(file.name)) continue;
      const id = 'f-' + RU.uid();
      const seconds = await probeDuration(file);
      try { await idbPut(id, file); } catch (e) { /* без хранилища трек недоступен */ }
      const name = file.name.replace(/\.[^.]+$/, '');
      data().tracks.push({
        id: id, title: name, artist: 'Локальный файл', kind: 'file',
        seconds: Math.round(seconds), size: file.size, addedAt: new Date().toISOString()
      });
      added++;
    }
    Store.save(true);
    paint(host);
    if (added) {
      UI.confetti(20);
      UI.toast({ icon: '🎵', title: 'Добавлено треков: ' + added, text: 'Файлы сохранены в браузере', kind: 'ok' });
    } else {
      UI.toast({ icon: '⚠️', title: 'Аудиофайлы не найдены', kind: 'warn' });
    }
  }

  function probeDuration(file) {
    return new Promise((resolve) => {
      try {
        const url = URL.createObjectURL(file);
        const a = new global.Audio();
        a.preload = 'metadata';
        const done = (v) => { URL.revokeObjectURL(url); resolve(v); };
        a.onloadedmetadata = () => done(isFinite(a.duration) ? a.duration : 0);
        a.onerror = () => done(0);
        setTimeout(() => done(isFinite(a.duration) ? a.duration : 0), 3000);
        a.src = url;
      } catch (e) { resolve(0); }
    });
  }

  function removeTrack(host, id) {
    const d = data();
    d.tracks = d.tracks.filter((t) => t.id !== id);
    d.favorites = d.favorites.filter((x) => x !== id);
    d.playlists.forEach((p) => { p.trackIds = p.trackIds.filter((x) => x !== id); });
    idbDel(id).catch(() => {});
    if (current() && current().id === id) { audio.pause(); audio.removeAttribute('src'); ps.index = -1; }
    Store.save(true);
    paint(host);
    UI.toast({ icon: '🗑', title: 'Трек удалён' });
  }

  function newPlaylist(host) {
    UI.openModal({
      title: 'Новый плейлист',
      body: '<label class="field"><span class="field__label">Название</span>' +
        '<input class="field__input" id="msPlName" maxlength="50" placeholder="Например, для тренировки"></label>',
      noFocus: false,
      foot: '<button class="btn btn--ghost" data-close="modal">Отмена</button>' +
        '<button class="btn btn--accent" id="msPlSave">Создать</button>',
      onMount: (b, f) => {
        f.querySelector('#msPlSave').addEventListener('click', () => {
          const name = b.querySelector('#msPlName').value.trim();
          if (!name) { b.querySelector('#msPlName').focus(); return; }
          data().playlists.unshift({ id: 'pl-' + RU.uid(), name: name, trackIds: [], createdAt: new Date().toISOString() });
          Store.save(true);
          UI.closeModal();
          ps.tab = 'playlists';
          paint(host);
          UI.toast({ icon: '≡', title: 'Плейлист создан', text: name, kind: 'ok' });
        });
      }
    });
  }

  /* ============================================================
     Привязка событий
     ============================================================ */

  function bindPlayer(root) {
    if (!root) return;
    root.querySelectorAll('[data-ms]').forEach((b) => {
      const act = b.getAttribute('data-ms');
      if (act === 'prev') b.addEventListener('click', () => step_(-1));
      else if (act === 'next') b.addEventListener('click', () => step_(1));
      else if (act === 'playpause') b.addEventListener('click', togglePlay);
      else if (act === 'shuffle') b.addEventListener('click', () => { ps.shuffle = !ps.shuffle; b.classList.toggle('is-on', ps.shuffle); });
      else if (act === 'repeat') b.addEventListener('click', () => { ps.repeat = !ps.repeat; b.classList.toggle('is-on', ps.repeat); });
    });
    const seek = root.querySelector('#msSeek');
    if (seek) seek.addEventListener('input', () => {
      const total = audio.duration || (current() ? current().seconds : 0);
      if (total) audio.currentTime = (seek.value / 1000) * total;
    });
    const vol = root.querySelector('#msVol');
    if (vol) vol.addEventListener('input', () => {
      ps.volumeValue = vol.value / 100;
      audio.volume = ps.volumeValue;
    });
  }

  function bind(host) {
    bindPlayer(host.querySelector('.ms-player'));

    const fileInput = host.querySelector('#msFileInput');
    if (fileInput) fileInput.addEventListener('change', () => importFiles(host, fileInput.files));

    host.querySelector('.ms-tabs').addEventListener('click', (e) => {
      const b = e.target.closest('[data-val]');
      if (!b) return;
      ps.tab = b.getAttribute('data-val');
      ps.openPlaylist = null;
      host.innerHTML = template();
      bind(host);
      updatePlayerUI();
    });

    host.querySelector('#msBody').addEventListener('click', (e) => {
      const el = e.target.closest('[data-ms]');
      if (!el) return;
      const act = el.getAttribute('data-ms');
      const id = el.getAttribute('data-id');

      if (act === 'play') {
        if (current() && current().id === id) { togglePlay(); paintBody(); return; }
        const q = (el.closest('.ms-list') && ps.tab === 'library')
          ? library().map((t) => t.id).concat(DEMO.map((t) => t.id))
          : undefined;
        playTrack(id, el.closest('.ms-list') ? q : undefined);
      }
      else if (act === 'like') {
        const favs = data().favorites;
        const i = favs.indexOf(id);
        if (i === -1) favs.push(id); else favs.splice(i, 1);
        Store.save(true);
        UI.toast({ icon: i === -1 ? '★' : '☆', title: i === -1 ? 'В избранном' : 'Убрано из избранного' });
        paintBody();
      }
      else if (act === 'add') addToPlaylist(id);
      else if (act === 'remove') removeTrack(host, id);
      else if (act === 'unlink') {
        const pl = data().playlists.find((p) => p.id === ps.openPlaylist);
        if (pl) pl.trackIds = pl.trackIds.filter((x) => x !== id);
        Store.save(true);
        paintBody();
      }
      else if (act === 'pl-new') newPlaylist(host);
      else if (act === 'pl-open') { ps.openPlaylist = id; paintBody(); }
      else if (act === 'pl-back') { ps.openPlaylist = null; paintBody(); }
      else if (act === 'pl-play') {
        const pl = data().playlists.find((p) => p.id === id);
        if (pl && pl.trackIds.length) playTrack(pl.trackIds[0], pl.trackIds);
      }
      else if (act === 'pl-del') {
        data().playlists = data().playlists.filter((p) => p.id !== id);
        Store.save(true);
        paintBody();
      }
      else if (act === 'fav-play') {
        const q = data().favorites.slice();
        if (q.length) playTrack(q[0], q);
      }
    });
  }

  function paint(host) {
    host.innerHTML = template();
    bind(host);
    updatePlayerUI();
  }

  /* ============================================================
     Публичный объект модуля
     ============================================================ */

  global.Music = {
    route: 'music',
    label: 'Музыка',
    subtitle() {
      const n = library().length + DEMO.length;
      return 'Локальная библиотека · ' + n + ' ' + RU.plural(n, 'трек', 'трека', 'треков');
    },
    mount(host) {
      ps.tab = 'library';
      ps.openPlaylist = null;
      paint(host);
    },
    tracks: allTracks,
    synth: { renderSamples: renderSamples, encodeWav: encodeWav, demoBlob: demoBlob, DEMO: DEMO },
    player: audio
  };
})(window);
