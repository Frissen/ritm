/* ============================================================
   ui.js — экраны, формы, модальные окна, тосты, анимации
   ============================================================ */
(function (global) {
  'use strict';

  const RU = global.RU;
  const Store = global.Store;
  const Model = global.Model;
  const Stats = global.Stats;
  const Charts = global.Charts;
  const Notify = global.Notify;

  const UI = {};

  const view = () => document.getElementById('view');
  const modalEl = () => document.getElementById('modal');
  const modalTitle = () => document.getElementById('modalTitle');
  const modalBody = () => document.getElementById('modalBody');
  const modalFoot = () => document.getElementById('modalFoot');

  /* Состояние интерфейса (не сохраняется) */
  const uiState = {
    range: 'month',
    filter: 'active',
    search: '',
    sort: 'order',
    statsHabit: 'all',
    editId: null
  };
  UI.state = uiState;

  /* ============================================================
     Тема
     ============================================================ */

  UI.applyTheme = (pref) => {
    const choice = pref || (Store.state() && Store.state().settings.theme) || Store.themePref() || 'auto';
    const dark = global.matchMedia && global.matchMedia('(prefers-color-scheme: dark)').matches;
    const effective = choice === 'auto' ? (dark ? 'dark' : 'light') : choice;
    document.documentElement.setAttribute('data-theme', effective);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', effective === 'dark' ? '#16130F' : '#F4F0E8');
    Store.setThemePref(choice);
    return effective;
  };

  UI.toggleTheme = () => {
    const cur = document.documentElement.getAttribute('data-theme');
    const next = cur === 'dark' ? 'light' : 'dark';
    if (Store.state()) {
      Store.state().settings.theme = next;
      Store.save(true);
    }
    UI.applyTheme(next);
    UI.toast({ icon: next === 'dark' ? '🌙' : '☀️', title: next === 'dark' ? 'Тёмная тема' : 'Светлая тема' });
  };

  /* ============================================================
     Тосты
     ============================================================ */

  UI.toast = (opts) => {
    const host = document.getElementById('toasts');
    if (!host) return;
    const node = document.createElement('div');
    node.className = 'toast' + (opts.kind ? ' toast--' + opts.kind : '');
    node.innerHTML =
      (opts.icon ? '<span class="toast__ico" aria-hidden="true">' + opts.icon + '</span>' : '') +
      '<div class="toast__body"><b>' + RU.escapeHtml(opts.title || '') + '</b>' +
      (opts.text ? '<span>' + RU.escapeHtml(opts.text) + '</span>' : '') + '</div>';
    host.appendChild(node);
    const life = opts.duration || 3800;
    const kill = () => {
      node.classList.add('is-out');
      setTimeout(() => node.remove(), 320);
    };
    const t = setTimeout(kill, life);
    node.addEventListener('click', () => { clearTimeout(t); kill(); });
    while (host.children.length > 4) host.removeChild(host.firstChild);
  };

  /* ============================================================
     Празднование
     ============================================================ */

  UI.confetti = (count) => {
    const host = document.getElementById('confetti');
    if (!host || !Store.state() || !Store.state().settings.confetti) return;
    if (global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const n = count || 26;
    const colors = RU.PALETTE;
    for (let i = 0; i < n; i++) {
      const p = document.createElement('i');
      const left = 12 + Math.random() * 76;
      p.style.left = left + 'vw';
      p.style.top = '-4vh';
      p.style.background = colors[(Math.random() * colors.length) | 0];
      p.style.setProperty('--dx', (Math.random() * 180 - 90).toFixed(0) + 'px');
      p.style.setProperty('--rot', (360 + Math.random() * 720).toFixed(0) + 'deg');
      p.style.setProperty('--dur', (1 + Math.random() * .8).toFixed(2) + 's');
      p.style.animationDelay = (Math.random() * .18).toFixed(2) + 's';
      if (Math.random() > .6) { p.style.width = '7px'; p.style.height = '7px'; p.style.borderRadius = '50%'; }
      host.appendChild(p);
      setTimeout(() => p.remove(), 2200);
    }
  };

  UI.beep = () => {
    const s = Store.state();
    if (!s || !s.settings.soundOnComplete) return;
    try {
      const Ctx = global.AudioContext || global.webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(660, ctx.currentTime);
      o.frequency.exponentialRampToValueAtTime(990, ctx.currentTime + .12);
      g.gain.setValueAtTime(.0001, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(.09, ctx.currentTime + .02);
      g.gain.exponentialRampToValueAtTime(.0001, ctx.currentTime + .22);
      o.connect(g); g.connect(ctx.destination);
      o.start(); o.stop(ctx.currentTime + .24);
      setTimeout(() => ctx.close(), 500);
    } catch (e) {}
  };

  /* ============================================================
     Модальное окно
     ============================================================ */

  UI.openModal = (opts) => {
    modalTitle().textContent = opts.title || '';
    modalBody().innerHTML = opts.body || '';
    modalFoot().innerHTML = opts.foot || '';
    modalEl().hidden = false;
    document.body.style.overflow = 'hidden';
    const first = modalBody().querySelector('input, select, textarea, button');
    if (first && !opts.noFocus) setTimeout(() => first.focus(), 60);
    if (typeof opts.onMount === 'function') opts.onMount(modalBody(), modalFoot());
  };

  UI.closeModal = () => {
    modalEl().hidden = true;
    modalBody().innerHTML = '';
    modalFoot().innerHTML = '';
    document.body.style.overflow = '';
    uiState.editId = null;
  };

  /* ============================================================
     Общие фрагменты
     ============================================================ */

  function trendChip(delta) {
    if (!delta) return '<span class="trend trend--flat">без изменений</span>';
    const up = delta > 0;
    return '<span class="trend trend--' + (up ? 'up' : 'down') + '">' +
      (up ? '▲ +' : '▼ ') + Math.abs(delta) + '%</span>';
  }

  function greeting() {
    const h = new Date().getHours();
    if (h < 5) return 'Доброй ночи';
    if (h < 12) return 'Доброе утро';
    if (h < 18) return 'Добрый день';
    return 'Добрый вечер';
  }

  function habitColor(h) { return h && h.color ? h.color : '#F0512A'; }

  function reminderLabel(h) {
    if (!h.reminder) return null;
    const at = Notify.nextReminderToday(h);
    if (!at) return '⏰ ' + h.reminder;
    const now = new Date();
    const mins = Math.round((at - now) / 60000);
    if (mins <= 0) return '⏰ напоминание прошло';
    if (mins < 60) return '⏰ через ' + mins + ' мин';
    const hh = Math.floor(mins / 60), mm = mins % 60;
    return '⏰ через ' + hh + ' ч' + (mm ? ' ' + mm + ' мин' : '');
  }

  function targetLabel(h) {
    if (!h.target || h.target < 2) return null;
    const v = Model.value(h.id, RU.today());
    return v + ' / ' + h.target + (h.unit ? ' ' + h.unit : '');
  }

  /* ============================================================
     ЭКРАН «СЕГОДНЯ»
     ============================================================ */

  function rowHTML(h, date) {
    const key = RU.key(date);
    const target = h.target || 1;
    const value = Model.value(h.id, key);
    const done = value >= target;
    const streak = Model.currentStreak(h, date);
    const cats = Model.category(h.categoryId);
    const color = habitColor(h);
    const stepMode = target > 1;

    const meta = [];
    if (stepMode) meta.push('<i>' + targetLabel(h) + '</i>');
    meta.push('<i>' + RU.escapeHtml(Model.describeFrequency(h)) + '</i>');
    if (cats) meta.push('<i><span class="chip__dot" style="background:' + cats.color + '"></span>' + RU.escapeHtml(cats.name) + '</i>');
    if (streak > 1) meta.push('<i class="habit-row__streak">🔥 ' + streak + ' ' + RU.plural(streak, 'день', 'дня', 'дней') + '</i>');
    else if (reminderLabel(h) && !done) meta.push('<i>' + RU.escapeHtml(reminderLabel(h)) + '</i>');

    const control = stepMode
      ? '<div class="stepper" data-stepper="' + h.id + '">' +
          '<button class="stepper__btn" data-act="dec" data-id="' + h.id + '" aria-label="Уменьшить">−</button>' +
          '<span class="stepper__val"><b>' + value + '</b>/' + target + '</span>' +
          '<button class="stepper__btn" data-act="inc" data-id="' + h.id + '" aria-label="Увеличить">+</button>' +
        '</div>'
      : '<button class="mark-btn' + (done ? ' is-done' : '') + '" data-act="toggle" data-id="' + h.id +
        '" aria-label="' + (done ? 'Снять отметку' : 'Отметить выполнение') + '" aria-pressed="' + done + '">' +
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 12.5 9.5 17.5 19.5 6.5"/></svg></button>';

    const pct = Math.round(value / target * 100);

    return '<article class="habit-row' + (done ? ' is-done' : '') + '" data-row="' + h.id + '" style="--habit-color:' + color + '">' +
      '<div class="habit-row__icon" aria-hidden="true">' + RU.escapeHtml(h.icon) + '</div>' +
      '<div class="habit-row__body">' +
        '<span class="habit-row__name">' + RU.escapeHtml(h.name) + '</span>' +
        '<div class="habit-row__meta">' + meta.join('') + '</div>' +
      '</div>' +
      '<button class="icon-btn icon-btn--sm" data-act="open" data-id="' + h.id + '" aria-label="Подробнее">' +
        '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg>' +
      '</button>' +
      control +
      (stepMode ? '<span class="habit-row__bar"><i style="width:' + pct + '%"></i></span>' : '') +
    '</article>';
  }

  function heroHTML(date) {
    const sum = Model.daySummary(date);
    const board = Stats.streakBoard();
    const bestNow = board.length ? board[0].current : 0;
    const user = Store.currentUser();
    const name = user ? user.name : 'друг';

    let message;
    if (!sum.total) message = 'На сегодня привычек нет. Отличный повод добавить новую.';
    else if (sum.done === sum.total) message = 'Все привычки на сегодня выполнены. Так держать!';
    else if (sum.done === 0) message = 'Начните с самой простой привычки — импульс появится сразу.';
    else message = 'Выполнено ' + sum.done + ' из ' + sum.total + '. Осталось совсем немного.';

    return '<section class="hero">' +
      '<div class="hero__ring">' + Charts.ring(sum.rate, { size: 160, stroke: 14 }) +
        '<div class="hero__ring-label"><div>' +
          '<div class="hero__ring-num">' + sum.rate + '%</div>' +
          '<div class="hero__ring-sub">' + sum.done + ' из ' + sum.total + '</div>' +
        '</div></div>' +
      '</div>' +
      '<div class="hero__text">' +
        '<p class="eyebrow">' + RU.formatDate(date) + ' · ' + RU.weekdayName(date) + '</p>' +
        '<h2>' + greeting() + ', ' + RU.escapeHtml(name) + '</h2>' +
        '<p>' + RU.escapeHtml(message) + '</p>' +
        '<div class="kpis">' +
          '<div class="kpi kpi--streak"><div class="kpi__val">' + bestNow + '</div>' +
            '<div class="kpi__lab">' + RU.escapeHtml(RU.plural(bestNow, 'день', 'дня', 'дней') + ' в лучшей серии') + '</div></div>' +
          '<div class="kpi"><div class="kpi__val">' + sum.left + '</div><div class="kpi__lab">осталось сегодня</div></div>' +
          '<div class="kpi"><div class="kpi__val">' + Model.active().length + '</div><div class="kpi__lab">активных привычек</div></div>' +
        '</div>' +
      '</div>' +
    '</section>';
  }

  function renderToday() {
    const today = RU.startOfDay(new Date());
    const list = Model.scheduleFor(today);
    const others = Model.active().filter((h) => !Model.isScheduled(h, today));
    const compact = Store.state().settings.homeLayout === 'compact';

    let html = heroHTML(today);

    html += '<section class="today-grid">' +
      '<div class="section-title"><h3>План на сегодня</h3>' +
        '<button class="btn btn--sm btn--ghost" data-act="layout" title="Плотность списка">' +
          (compact ? 'Обычный вид' : 'Компактный вид') + '</button>' +
      '</div>';

    if (!list.length) {
      html += '<div class="empty"><div class="empty__icon" aria-hidden="true">🌤️</div>' +
        '<h3>На сегодня привычек нет</h3>' +
        '<p>Добавьте первую привычку — например, «выпить стакан воды» или «10 минут прогулки».</p>' +
        '<button class="btn btn--accent" data-act="new">+ Новая привычка</button></div>';
    } else {
      html += '<div class="habit-list' + (compact ? ' habit-list--compact' : '') + '">' +
        list.map((h) => rowHTML(h, today)).join('') + '</div>';
    }
    html += '</section>';

    if (others.length) {
      html += '<section class="today-grid" style="margin-top:var(--gutter)">' +
        '<details class="card card--flat"><summary class="subsection-title">' +
          'Не по расписанию сегодня · ' + others.length + '</summary>' +
        '<div class="habit-list" style="margin-top:14px">' +
          others.slice(0, 12).map((h) => rowHTML(h, today)).join('') +
        '</div></details></section>';
    }

    view().innerHTML = html;
  }

  /** Частичное обновление после отметки — без полной перерисовки */
  function updateRowVisual(habitId) {
    const h = Model.get(habitId);
    const row = view().querySelector('[data-row="' + habitId + '"]');
    if (!h || !row) return;
    const kill = view().querySelector('.hero');
    const fresh = document.createElement('div');
    fresh.innerHTML = rowHTML(h, new Date());
    const next = fresh.firstElementChild;
    row.replaceWith(next);
    next.classList.add('is-just-done');
    setTimeout(() => next.classList.remove('is-just-done'), 620);

    if (kill) {
      const wrap = document.createElement('div');
      wrap.innerHTML = heroHTML(new Date());
      kill.replaceWith(wrap.firstElementChild);
    }
  }

  /* ============================================================
     ЭКРАН «ПРИВЫЧКИ»
     ============================================================ */

  function cardHTML(h) {
    const snap = Model.habitSnapshot(h);
    const cat = Model.category(h.categoryId);
    const color = habitColor(h);
    const archived = !!h.archived;
    return '<article class="habit-card' + (archived ? ' is-archived' : '') + '" style="--habit-color:' + color + '">' +
      '<div class="habit-card__top">' +
        '<div class="habit-card__icon" aria-hidden="true">' + RU.escapeHtml(h.icon) + '</div>' +
        '<div style="min-width:0">' +
          '<div class="habit-card__name">' + RU.escapeHtml(h.name) + '</div>' +
          '<div class="habit-card__desc">' + (h.description ? RU.escapeHtml(h.description) : RU.escapeHtml(Model.describeFrequency(h))) + '</div>' +
        '</div>' +
      '</div>' +
      '<div class="chips">' +
        '<span class="chip">' + RU.escapeHtml(Model.describeFrequency(h)) + '</span>' +
        (cat ? '<span class="chip"><span class="chip__dot" style="background:' + cat.color + '"></span>' + RU.escapeHtml(cat.name) + '</span>' : '') +
        (h.target > 1 ? '<span class="chip">Цель: ' + h.target + (h.unit ? ' ' + RU.escapeHtml(h.unit) : '') + '</span>' : '') +
        (h.reminder ? '<span class="chip">⏰ ' + h.reminder + '</span>' : '') +
        (archived ? '<span class="chip chip--accent">В архиве</span>' : '') +
      '</div>' +
      '<div class="habit-card__metrics">' +
        '<div class="metric"><b>' + snap.streak + '</b><span>серия</span></div>' +
        '<div class="metric"><b>' + snap.month.rate + '%</b><span>месяц</span></div>' +
        '<div class="metric"><b>' + snap.total + '</b><span>всего</span></div>' +
      '</div>' +
      Charts.miniGrid(h, 28) +
      '<div class="habit-card__actions">' +
        '<button class="btn btn--sm" data-act="edit" data-id="' + h.id + '">Изменить</button>' +
        '<button class="btn btn--sm btn--ghost" data-act="open" data-id="' + h.id + '">Детали</button>' +
        '<button class="btn btn--sm btn--ghost" data-act="' + (archived ? 'restore' : 'archive') + '" data-id="' + h.id +
          '" title="' + (archived ? 'Вернуть из архива' : 'В архив') + '">' + (archived ? '↩︎' : '🗄') + '</button>' +
      '</div>' +
    '</article>';
  }

  function renderHabits() {
    let list = Model.all();
    if (uiState.filter === 'active') list = list.filter((h) => !h.archived);
    else if (uiState.filter === 'archived') list = list.filter((h) => h.archived);

    const q = uiState.search.trim().toLowerCase();
    if (q) {
      list = list.filter((h) =>
        (h.name + ' ' + h.description + ' ' + Model.categoryName(h.categoryId)).toLowerCase().indexOf(q) !== -1);
    }

    if (uiState.sort === 'name') list = list.slice().sort((a, b) => a.name.localeCompare(b.name, 'ru'));
    else if (uiState.sort === 'streak') list = list.slice().sort((a, b) => Model.currentStreak(b) - Model.currentStreak(a));
    else if (uiState.sort === 'created') list = list.slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    else list = list.slice().sort((a, b) => (a.order || 0) - (b.order || 0));

    const counts = {
      all: Model.all().length,
      active: Model.active().length,
      archived: Model.archived().length
    };

    let html = '<section>' +
      '<div class="habits-toolbar">' +
        '<div class="filters">' +
          ['all:Все:all', 'active:Активные:active', 'archived:Архив:archived'].map((s) => {
            const p = s.split(':');
            return '<button class="filter-chip' + (uiState.filter === p[2] ? ' is-active' : '') +
              '" data-act="filter" data-value="' + p[2] + '">' + p[1] + ' · ' + counts[p[2]] + '</button>';
          }).join('') +
        '</div>' +
        '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
          '<input class="field__input" style="width:190px" type="search" placeholder="Поиск…" value="' +
            RU.escapeHtml(uiState.search) + '" data-act="search" aria-label="Поиск привычек" />' +
          '<select class="field__select" style="width:150px" data-act="sort" aria-label="Сортировка">' +
            '<option value="order"' + (uiState.sort === 'order' ? ' selected' : '') + '>По порядку</option>' +
            '<option value="name"' + (uiState.sort === 'name' ? ' selected' : '') + '>По названию</option>' +
            '<option value="streak"' + (uiState.sort === 'streak' ? ' selected' : '') + '>По серии</option>' +
            '<option value="created"' + (uiState.sort === 'created' ? ' selected' : '') + '>Новые сверху</option>' +
          '</select>' +
          '<button class="btn btn--accent" data-act="new">+ Новая</button>' +
        '</div>' +
      '</div>';

    if (!list.length) {
      html += '<div class="empty"><div class="empty__icon" aria-hidden="true">🌱</div>' +
        '<h3>' + (uiState.filter === 'archived' ? 'Архив пуст' : 'Пока ничего не добавлено') + '</h3>' +
        '<p>Привычки — это маленькие действия, которые повторяются каждый день. Начните с одной.</p>' +
        (counts.all === 0 ? '<button class="btn btn--accent" data-act="seed">Загрузить примеры</button> ' : '') +
        '<button class="btn btn--primary" data-act="new">+ Новая привычка</button></div>';
    } else {
      html += '<div class="habit-cards">' + list.map(cardHTML).join('') + '</div>';
    }
    html += '</section>';
    view().innerHTML = html;
  }

  /* ============================================================
     ЭКРАН «АНАЛИТИКА»
     ============================================================ */

  function renderStats() {
    const range = Stats.range(uiState.range);
    const board = Stats.streakBoard();
    const ov = Stats.overview(range);

    const heading = '<section class="stats-head">' +
      '<div><p class="eyebrow">Период</p><h3 style="font-size:22px">' + RU.escapeHtml(range.label) + '</h3></div>' +
      '<div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">' +
        '<label class="select-inline">Период' +
          '<select data-act="range" aria-label="Период аналитики">' +
            [['week', 'Неделя'], ['month', 'Месяц'], ['year', 'Год'], ['all', 'Всё время']]
              .map((p) => '<option value="' + p[0] + '"' + (uiState.range === p[0] ? ' selected' : '') + '>' + p[1] + '</option>').join('') +
          '</select></label>' +
      '</div></section>';

    const cards = '<section class="stat-cards">' +
      statCard('📈', ov.rate + '<small>%</small>', 'Процент выполнения', trendChip(ov.delta)) +
      statCard('✅', ov.done + '<small>/' + ov.scheduled + '</small>', 'Выполнено из запланированных') +
      statCard('📅', String(ov.activeDays), 'Дней с активностью') +
      statCard('🔥', String(board.length ? board[0].current : 0), 'Текущая лучшая серия') +
    '</section>';

    const ws = Store.state().settings.weekStart;
    const heatStart = RU.startOfWeek(RU.addDays(new Date(), -181), ws);
    const heatPad = RU.daysBetween(RU.addDays(new Date(), -181), heatStart);
    const heatCells = Stats.heatmap(heatStart, new Date());

    const trend = Stats.rateTrend(range.from, range.to, uiState.range === 'year' || uiState.range === 'all' ? 7 : 1);
    const weekdays = Stats.byWeekday(range.from, range.to);
    const cats = Stats.byCategory(range);

    const panels = '<section class="panels">' +
      '<div class="panel panel--wide"><div class="panel__head"><h3>Календарь выполнения</h3>' +
        '<p>Насыщенность = доля выполненных привычек дня</p></div>' +
        Charts.heatmap(heatCells, heatPad) + '</div>' +

      '<div class="panel panel--wide"><div class="panel__head"><h3>Динамика выполнения</h3>' +
        '<p>' + (uiState.range === 'year' || uiState.range === 'all' ? 'По неделям' : 'По дням') + '</p></div>' +
        Charts.spark(trend) + '</div>' +

      '<div class="panel"><div class="panel__head"><h3>По дням недели</h3></div>' +
        Charts.hbars(weekdays.map((w) => ({ name: w.label, rate: w.rate, color: 'var(--accent)' }))) + '</div>' +

      '<div class="panel"><div class="panel__head"><h3>Категории</h3>' +
        '<p>Сравнение по проценту выполнения</p></div>' +
        (cats.length
          ? Charts.hbars(cats.map((c) => ({ name: c.name, icon: c.icon, color: c.color, rate: c.rate, note: '(' + c.habits + ')' })))
          : '<p class="form__hint">Нет данных за период.</p>') + '</div>' +

      '<div class="panel"><div class="panel__head"><h3>Рейтинг серий</h3>' +
        '<p>Текущие серии по привычкам</p></div>' +
        (board.length
          ? '<div class="streak-list">' + board.slice(0, 8).map((b) =>
              '<div class="streak-item"><span class="streak-item__fire" aria-hidden="true">' +
              (b.current >= 7 ? '🔥' : (b.current > 0 ? '✨' : '·')) + '</span>' +
              '<span class="streak-item__name">' + RU.escapeHtml(b.habit.icon + ' ' + b.habit.name) + '</span>' +
              '<span class="streak-item__num">' + b.current + ' / ' + b.best + '</span></div>').join('') + '</div>'
          : '<p class="form__hint">Пока нет привычек.</p>') + '</div>' +

      '<div class="panel panel--wide"><div class="panel__head"><h3>Эта неделя по дням</h3>' +
        '<p>Отметки по каждой привычке</p></div>' +
        weekTableHTML() + '</div>' +
    '</section>';

    view().innerHTML = heading + cards + panels;
  }

  function statCard(icon, value, label, extra) {
    return '<article class="stat-card"><div class="stat-card__top">' +
      '<span class="stat-card__ico" aria-hidden="true">' + icon + '</span>' + (extra || '') + '</div>' +
      '<div class="stat-card__val">' + value + '</div>' +
      '<div class="stat-card__lab">' + label + '</div></article>';
  }

  function weekTableHTML() {
    const m = Stats.weekMatrix(new Date());
    if (!m.rows.length) return '<p class="form__hint">На этой неделе привычек по расписанию нет.</p>';
    const head = '<tr><th>Привычка</th>' +
      m.days.map((d) => '<th>' + RU.WEEKDAYS_SHORT[(d.getDay() + 6) % 7] + '<br />' + d.getDate() + '</th>').join('') +
      '<th>%</th></tr>';
    const rows = m.rows.map((r) => {
      const cells = r.cells.map((c) => {
        if (!c.scheduled) return '<td><span class="mark na">·</span></td>';
        if (c.done) return '<td><span class="mark on">✓</span></td>';
        if (c.partial) return '<td><span class="mark" title="Частично">•</span></td>';
        if (c.future) return '<td><span class="mark off">·</span></td>';
        return '<td><span class="mark off" title="Не выполнено">·</span></td>';
      }).join('');
      const sch = r.cells.filter((c) => c.scheduled).length;
      const dn = r.cells.filter((c) => c.done).length;
      const pct = sch ? Math.round(dn / sch * 100) : 0;
      return '<tr><td>' + RU.escapeHtml(r.habit.icon + ' ' + r.habit.name) + '</td>' + cells +
        '<td><b>' + pct + '%</b></td></tr>';
    }).join('');
    return '<div style="overflow-x:auto"><table class="week-table"><thead>' + head + '</thead><tbody>' + rows + '</tbody></table></div>';
  }

  /* ============================================================
     ЭКРАН «ПРОФИЛЬ»
     ============================================================ */

  function renderProfile() {
    const s = Store.state();
    const user = Store.currentUser();
    const initial = (user && user.name ? user.name : '?').trim().charAt(0).toUpperCase();
    const created = user ? RU.formatDate(new Date(user.createdAt)) : '—';
    const ach = Model.achievements();
    const unlocked = ach.filter((a) => a.unlockedAt).length;
    const cats = Model.categories();
    const cloud = Store.cloudConfig();

    const syncInfo = Store.isPersistent()
      ? 'Данные сохраняются автоматически в этом браузере.'
      : 'Внимание: браузер запретил локальное хранилище — данные будут потеряны при закрытии вкладки.';

    const achHTML = '<div class="ach-grid">' + ach.map((a) =>
      '<div class="ach-item' + (a.unlockedAt ? ' is-unlocked' : '') + '" title="' + RU.escapeHtml(a.desc) + '">' +
        '<span class="ach-item__ico" aria-hidden="true">' + (a.unlockedAt ? a.icon : '🔒') + '</span>' +
        '<b>' + RU.escapeHtml(a.title) + '</b>' +
        '<span>' + RU.escapeHtml(a.desc) + '</span>' +
      '</div>').join('') + '</div>';

    const catHTML = '<div class="cat-list">' + cats.map((c) =>
      '<div class="cat-item">' +
        '<span class="cat-item__swatch" style="background:' + c.color + '"></span>' +
        '<span class="cat-item__name">' + RU.escapeHtml(c.icon + ' ' + c.name) + '</span>' +
        '<span class="cat-item__count">' + Model.byCategory(c.id).length + '</span>' +
        '<button class="icon-btn icon-btn--sm" data-act="edit-category" data-id="' + c.id + '" aria-label="Изменить категорию">✎</button>' +
      '</div>').join('') + '</div>' +
      '<button class="btn btn--sm btn--block" style="margin-top:12px" data-act="new-category">+ Категория</button>';

    const themeSeg = '<div class="segments">' +
      [['auto', 'Авто', 'По системе'], ['light', 'Светлая', 'Дневной вид'], ['dark', 'Тёмная', 'Ночной вид']]
        .map((t) => '<button class="segments__opt' + (s.settings.theme === t[0] ? ' is-active' : '') +
          '" data-act="theme" data-value="' + t[0] + '">' + t[1] + '<small>' + t[2] + '</small></button>').join('') +
      '</div>';

    view().innerHTML =
      '<section class="profile-grid">' +

        '<div class="card" style="grid-column:1/-1">' +
          '<div class="profile-hero">' +
            '<span class="avatar" aria-hidden="true">' + RU.escapeHtml(initial) + '</span>' +
            '<div><h3>' + RU.escapeHtml(user ? user.name : 'Гость') + '</h3>' +
              '<p>@' + RU.escapeHtml(user ? user.login : '—') + ' · с ' + created + '</p>' +
              '<p style="margin-top:6px">' + unlocked + ' из ' + ach.length + ' достижений · ' +
                Model.active().length + ' активных привычек</p></div>' +
          '</div>' +
          '<div class="kpis" style="margin-top:18px">' +
            '<div class="kpi"><div class="kpi__val">' + Model.active().reduce((a, h) => a + Model.totalDone(h), 0) +
              '</div><div class="kpi__lab">выполнено дней всего</div></div>' +
            '<div class="kpi"><div class="kpi__val">' + Model.active().reduce((a, h) => a + Model.bestStreak(h), 0) +
              '</div><div class="kpi__lab">сумма лучших серий</div></div>' +
            '<div class="kpi"><div class="kpi__val">' + cats.length + '</div><div class="kpi__lab">категорий</div></div>' +
          '</div>' +
        '</div>' +

        '<div class="card"><div class="section-title"><h3>Оформление</h3></div>' +
          '<p class="form__hint" style="margin-bottom:12px">Тема меняется мгновенно. Режим «Авто» следует системным настройкам.</p>' +
          themeSeg +
          '<div class="setting-row" style="margin-top:16px">' +
            '<div class="setting-row__text"><b>Первый день недели</b><span>Влияет на аналитику и календарь</span></div>' +
            '<select class="field__select" style="width:150px" data-act="week-start">' +
              '<option value="1"' + (s.settings.weekStart === 1 ? ' selected' : '') + '>Понедельник</option>' +
              '<option value="0"' + (s.settings.weekStart === 0 ? ' selected' : '') + '>Воскресенье</option>' +
            '</select>' +
          '</div>' +
          '<div class="setting-row"><div class="setting-row__text"><b>Анимация конфетти</b>' +
            '<span>Празднование при закрытии дневной цели</span></div>' +
            toggleHTML('confetti', s.settings.confetti) + '</div>' +
          '<div class="setting-row"><div class="setting-row__text"><b>Звук отметки</b>' +
            '<span>Короткий сигнал при выполнении</span></div>' +
            toggleHTML('soundOnComplete', s.settings.soundOnComplete) + '</div>' +
        '</div>' +

        '<div class="card"><div class="section-title"><h3>Напоминания</h3></div>' +
          '<div class="setting-row">' +
            '<div class="setting-row__text"><b>Системные уведомления</b><span>' + permissionText() + '</span></div>' +
            toggleHTML('notifications', s.settings.notifications) +
          '</div>' +
          '<div class="setting-row">' +
            '<div class="setting-row__text"><b>Проверить разрешение</b>' +
              '<span>Браузер может запросить подтверждение</span></div>' +
            '<button class="btn btn--sm" data-act="ask-permission">Разрешить</button>' +
          '</div>' +
          '<div class="setting-row">' +
            '<div class="setting-row__text"><b>Тестовое уведомление</b><span>Проверить, что всё работает</span></div>' +
            '<button class="btn btn--sm" data-act="test-notify">Отправить</button>' +
          '</div>' +
          '<p class="form__hint" style="margin-top:12px">Напоминания срабатывают, пока приложение открыто на устройстве ' +
            '(в фоне или на экране). Время задаётся отдельно для каждой привычки.</p>' +
        '</div>' +

        '<div class="card"><div class="section-title"><h3>Категории</h3>' +
          '<span class="form__hint">' + cats.length + '</span></div>' + catHTML + '</div>' +

        '<div class="card" style="grid-column:1/-1"><div class="section-title"><h3>Достижения</h3>' +
          '<span class="chip chip--accent">' + unlocked + ' / ' + ach.length + '</span></div>' + achHTML + '</div>' +

        '<div class="card"><div class="section-title"><h3>Данные</h3></div>' +
          '<p class="form__hint" style="margin-bottom:12px">' + syncInfo + '</p>' +
          '<div class="data-actions">' +
            '<button class="btn btn--sm" data-act="export">⬇ Экспорт файла</button>' +
            '<button class="btn btn--sm" data-act="import">⬆ Импорт файла</button>' +
            '<button class="btn btn--sm" data-act="sync-code">🔗 Код синхронизации</button>' +
            '<button class="btn btn--sm" data-act="sync-import">⌨ Вставить код</button>' +
            '<button class="btn btn--sm" data-act="cloud">☁ Облако' + (Store.cloudEnabled() ? ' ✓' : '') + '</button>' +
          '</div>' +
          '<p class="form__hint" style="margin-top:12px">Экспорт сохраняет привычки, историю и настройки в один JSON-файл. ' +
            'Код синхронизации переносит данные на другое устройство без файлов.</p>' +
        '</div>' +

        '<div class="card"><div class="section-title"><h3>Аккаунт</h3></div>' +
          '<div class="data-actions">' +
            '<button class="btn btn--sm" data-act="edit-profile">Изменить имя</button>' +
            '<button class="btn btn--sm" data-act="logout">Выйти</button>' +
            '<button class="btn btn--sm btn--danger" data-act="reset">Сбросить данные</button>' +
            '<button class="btn btn--sm btn--danger" data-act="delete-account">Удалить аккаунт</button>' +
          '</div>' +
          '<p class="form__hint" style="margin-top:12px">Версия приложения 1.0 · «Ритм»</p>' +
        '</div>' +

      '</section>';
  }

  function toggleHTML(setting, on) {
    return '<label class="switch"><input type="checkbox" data-act="setting" data-value="' + setting + '"' +
      (on ? ' checked' : '') + ' /><span class="switch__track"></span></label>';
  }

  function permissionText() {
    const p = Notify.permission();
    if (p === 'granted') return 'Разрешение выдано — уведомления будут появляться';
    if (p === 'denied') return 'Разрешение отклонено, включите его в настройках браузера';
    if (p === 'unsupported') return 'Браузер не поддерживает системные уведомления';
    return 'Разрешение ещё не запрошено';
  }

  /* ============================================================
     Маршрутизация
     ============================================================ */

  UI.render = () => {
    if (!Store.state()) return;
    const mod = global.Modules && global.Modules.get(UI.route);
    if (mod) mod.mount(view());
    else if (UI.route === 'today') renderToday();
    else if (UI.route === 'habits') renderHabits();
    else if (UI.route === 'stats') renderStats();
    else renderProfile();
    updateChrome();
  };

  function updateChrome() {
    const today = new Date();
    const kick = document.getElementById('topbarKicker');
    const dateEl = document.getElementById('topbarDate');
    if (kick) {
      const mod = global.Modules && global.Modules.get(UI.route);
      kick.textContent = mod ? mod.label
        : UI.route === 'today' ? 'Сегодня'
        : UI.route === 'habits' ? 'Все привычки'
        : UI.route === 'stats' ? 'Аналитика' : 'Профиль';
    }
    if (dateEl) {
      const mod = global.Modules && global.Modules.get(UI.route);
      dateEl.textContent = mod ? (global.Modules.subtitle(UI.route) || '')
        : UI.route === 'today'
        ? RU.formatDate(today) + ' · ' + RU.weekdayName(today)
        : (UI.route === 'habits' ? RU.habitsWord(Model.active().length)
          : UI.route === 'stats' ? StatsHyphenRange() : 'Настройки и данные');
    }
    const badge = document.querySelector('[data-badge="today"]');
    if (badge) {
      const left = Model.daySummary(today).left;
      badge.textContent = left ? String(left) : '';
    }
    const user = Store.currentUser();
    const av = document.getElementById('userAvatar');
    if (av && user) av.textContent = (user.name || '?').trim().charAt(0).toUpperCase();

    const bell = document.getElementById('bellDot');
    const pending = Notify.countPendingToday();
    if (bell) bell.hidden = !(pending > 0 && Model.active().some((h) => h.reminder));
  }

  function StatsHyphenRange() {
    const r = Stats.range(uiState.range);
    return 'Период: ' + r.label;
  }

  UI.setRoute = (r) => {
    UI.route = r;
    RU.$$('.nav__item, .tabbar__item').forEach((n) => {
      n.classList.toggle('is-active', n.getAttribute('data-route') === r);
    });
    UI.render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  /* ============================================================
     ФОРМА ПРИВЫЧКИ
     ============================================================ */

  function freqSegmentsHTML(freq) {
    const opts = [
      ['daily', 'Ежедневно', 'Каждый день'],
      ['weekly', 'По дням', 'Выбранные дни недели'],
      ['interval', 'Интервал', 'Раз в N дней'],
      ['even', 'Чётные', '2, 4, 6, 8…'],
      ['odd', 'Нечётные', '1, 3, 5, 7…']
    ];
    return '<div class="segments" data-role="freq">' + opts.map((o) =>
      '<button type="button" class="segments__opt' + (freq.type === o[0] ? ' is-active' : '') +
      '" data-freq="' + o[0] + '">' + o[1] + '<small>' + o[2] + '</small></button>').join('') + '</div>';
  }

  function iconPickerHTML(selected) {
    return '<div class="picker" data-role="icons">' + RU.ICONS.map((i) =>
      '<button type="button" class="picker__icon' + (i === selected ? ' is-active' : '') +
      '" data-icon="' + i + '" aria-label="Иконка ' + i + '">' + i + '</button>').join('') + '</div>';
  }

  function colorPickerHTML(selected) {
    return '<div class="picker" data-role="colors">' + RU.PALETTE.map((c) =>
      '<button type="button" class="picker__color' + (c.toLowerCase() === String(selected).toLowerCase() ? ' is-active' : '') +
      '" data-color="' + c + '" style="background:' + c + '" aria-label="Цвет ' + c + '"></button>').join('') + '</div>';
  }

  function weekdayPickerHTML(freq) {
    const days = freq.days || [];
    const ws = Store.state().settings.weekStart;
    let html = '<div class="weekdays" data-role="weekdays">';
    for (let i = 0; i < 7; i++) {
      const d = (ws + i) % 7;
      html += '<button type="button" class="weekdays__day' + (days.indexOf(d) !== -1 ? ' is-active' : '') +
        '" data-day="' + d + '">' + RU.WEEKDAYS_SHORT[(d + 6) % 7] + '</button>';
    }
    return html + '</div>';
  }

  UI.openHabitEditor = (id) => {
    const habit = id ? Model.get(id) : null;
    const isNew = !habit;
    uiState.editId = habit ? habit.id : null;
    const draft = habit ? JSON.parse(JSON.stringify(habit)) : {
      name: '', description: '', categoryId: Model.categories()[0].id,
      icon: RU.ICONS[0], color: RU.PALETTE[0], target: 1, unit: '',
      freq: { type: 'daily' }, reminder: null
    };
    if (!draft.freq) draft.freq = { type: 'daily' };

    const catOptions = Model.categories().map((c) =>
      '<option value="' + c.id + '"' + (c.id === draft.categoryId ? ' selected' : '') + '>' +
      RU.escapeHtml(c.icon + ' ' + c.name) + '</option>').join('');

    const body =
      '<form id="habitForm" class="form" novalidate>' +
        '<label class="field"><span class="field__label">Название *</span>' +
          '<input class="field__input" name="name" maxlength="60" placeholder="Например, зарядка утром" value="' +
          RU.escapeHtml(draft.name) + '" required /></label>' +
        '<label class="field"><span class="field__label">Описание</span>' +
          '<textarea class="field__area" name="description" maxlength="300" placeholder="Зачем вам эта привычка?">' +
          RU.escapeHtml(draft.description) + '</textarea></label>' +

        '<div class="form__row">' +
          '<label class="field"><span class="field__label">Категория</span>' +
            '<select class="field__select" name="categoryId" data-role="category">' + catOptions + '</select></label>' +
          '<label class="field"><span class="field__label">Цель за день</span>' +
            '<input class="field__input" name="target" type="number" min="1" max="99" value="' + draft.target + '" /></label>' +
        '</div>' +

        '<label class="field"><span class="field__label">Единица измерения (если цель больше 1)</span>' +
          '<input class="field__input" name="unit" maxlength="20" placeholder="стаканов, страниц, минут" value="' +
          RU.escapeHtml(draft.unit || '') + '" /></label>' +

        '<div class="field"><span class="field__label">Иконка</span>' + iconPickerHTML(draft.icon) + '</div>' +
        '<div class="field"><span class="field__label">Цвет</span>' + colorPickerHTML(draft.color) + '</div>' +

        '<div class="field"><span class="field__label">Частота</span>' + freqSegmentsHTML(draft.freq) +
          '<div data-role="freq-extra" style="margin-top:10px"></div>' +
        '</div>' +

        '<div class="field"><span class="field__label">Напоминание</span>' +
          '<label class="switch" style="margin-bottom:8px">' +
            '<input type="checkbox" data-role="reminder-on"' + (draft.reminder ? ' checked' : '') + ' />' +
            '<span class="switch__track"></span>' +
            '<span style="font-size:14px;color:var(--ink-soft)">Включить напоминание</span>' +
          '</label>' +
          '<input class="field__input" type="time" name="reminder" value="' + (draft.reminder || '08:00') + '"' +
            (draft.reminder ? '' : ' disabled') + ' /></label>' +

        '<p class="form__error" data-role="error" role="alert"></p>' +
      '</form>';

    const foot = '<button class="btn btn--ghost" data-act="modal-close">Отмена</button>' +
      (isNew ? '' : '<button class="btn btn--danger" data-act="delete" data-id="' + habit.id + '">Удалить</button>') +
      '<button class="btn btn--primary" data-act="save-habit">' + (isNew ? 'Создать привычку' : 'Сохранить') + '</button>';

    UI.openModal({
      title: isNew ? 'Новая привычка' : 'Изменить привычку',
      body: body,
      foot: foot,
      onMount: () => {
        const form = document.getElementById('habitForm');
        const extra = form.querySelector('[data-role="freq-extra"]');
        const reminderOn = form.querySelector('[data-role="reminder-on"]');
        const reminderInput = form.querySelector('[name="reminder"]');

        function paintExtra() {
          if (draft.freq.type === 'weekly') {
            extra.innerHTML = '<p class="form__hint" style="margin-bottom:8px">Выберите дни недели</p>' + weekdayPickerHTML(draft.freq);
          } else if (draft.freq.type === 'interval') {
            extra.innerHTML = '<label class="field"><span class="field__label">Повторять каждые (дней)</span>' +
              '<input class="field__input" type="number" min="1" max="365" data-role="interval" value="' +
              (draft.freq.interval || 2) + '" /></label>' +
              '<p class="form__hint" style="margin-top:6px">Отсчёт начинается с сегодняшнего дня.</p>';
          } else {
            extra.innerHTML = '';
          }
        }
        paintExtra();

        form.querySelector('[data-role="freq"]').addEventListener('click', (e) => {
          const b = e.target.closest('[data-freq]');
          if (!b) return;
          draft.freq.type = b.getAttribute('data-freq');
          if (draft.freq.type === 'weekly' && !draft.freq.days) draft.freq.days = [1, 2, 3, 4, 5];
          if (draft.freq.type === 'interval' && !draft.freq.interval) draft.freq.interval = 2;
          form.querySelectorAll('[data-freq]').forEach((n) => n.classList.toggle('is-active', n === b));
          paintExtra();
        });

        extra.addEventListener('click', (e) => {
          const d = e.target.closest('[data-day]');
          if (!d) return;
          const day = Number(d.getAttribute('data-day'));
          draft.freq.days = draft.freq.days || [];
          const i = draft.freq.days.indexOf(day);
          if (i === -1) draft.freq.days.push(day); else draft.freq.days.splice(i, 1);
          d.classList.toggle('is-active', i === -1);
        });
        extra.addEventListener('input', (e) => {
          if (e.target.matches('[data-role="interval"]')) draft.freq.interval = RU.clamp(parseInt(e.target.value, 10) || 2, 1, 365);
        });

        form.querySelector('[data-role="icons"]').addEventListener('click', (e) => {
          const b = e.target.closest('[data-icon]');
          if (!b) return;
          draft.icon = b.getAttribute('data-icon');
          form.querySelectorAll('[data-icon]').forEach((n) => n.classList.toggle('is-active', n === b));
        });
        form.querySelector('[data-role="colors"]').addEventListener('click', (e) => {
          const b = e.target.closest('[data-color]');
          if (!b) return;
          draft.color = b.getAttribute('data-color');
          form.querySelectorAll('[data-color]').forEach((n) => n.classList.toggle('is-active', n === b));
        });

        reminderOn.addEventListener('change', () => {
          reminderInput.disabled = !reminderOn.checked;
          if (reminderOn.checked && !reminderInput.value) reminderInput.value = '08:00';
        });

        form.querySelector('[data-role="category"]').addEventListener('change', (e) => { draft.categoryId = e.target.value; });

        setTimeout(() => form.querySelector('[name="name"]').focus(), 40);
      }
    });
  };

  /** Сохранение привычки (вызывается из обработчика кнопки) */
  function saveHabit() {
    const form = document.getElementById('habitForm');
    if (!form) return;
    const err = form.querySelector('[data-role="error"]');
    const name = form.querySelector('[name="name"]').value.trim();
    if (!name) {
      err.textContent = 'Введите название привычки.';
      form.querySelector('[name="name"]').focus();
      return;
    }
    const reminderOn = form.querySelector('[data-role="reminder-on"]').checked;
    const reminderVal = form.querySelector('[name="reminder"]').value || '08:00';
    const activeFreq = form.querySelector('[data-freq].is-active');
    const freqType = activeFreq ? activeFreq.getAttribute('data-freq') : 'daily';
    const intervalInput = form.querySelector('[data-role="interval"]');

    const freq = { type: freqType };
    if (freqType === 'weekly') {
      freq.days = RU.$$('[data-day].is-active', form).map((n) => Number(n.getAttribute('data-day')));
      if (!freq.days.length) { err.textContent = 'Выберите хотя бы один день недели.'; return; }
    }
    if (freqType === 'interval') {
      freq.interval = RU.clamp(parseInt(intervalInput && intervalInput.value, 10) || 2, 1, 365);
    }

    const data = {
      name: name,
      description: form.querySelector('[name="description"]').value.trim(),
      categoryId: form.querySelector('[name="categoryId"]').value,
      target: RU.clamp(parseInt(form.querySelector('[name="target"]').value, 10) || 1, 1, 99),
      unit: form.querySelector('[name="unit"]').value.trim(),
      icon: (form.querySelector('[data-icon].is-active') || { getAttribute: () => RU.ICONS[0] }).getAttribute('data-icon'),
      color: (form.querySelector('[data-color].is-active') || { getAttribute: () => RU.PALETTE[0] }).getAttribute('data-color'),
      reminder: reminderOn ? reminderVal : null,
      freq: freq
    };

    if (uiState.editId) {
      Model.update(uiState.editId, data);
      UI.toast({ icon: '✏️', title: 'Привычка обновлена', text: data.name });
    } else {
      Model.create(data);
      UI.toast({ icon: '🌱', title: 'Привычка создана', text: data.name + ' — ' + Model.describeFrequency({ freq: freq }) });
    }
    Model.checkAchievements().forEach(announceAchievement);
    UI.closeModal();
    UI.render();
  }

  function announceAchievement(a) {
    UI.confetti(34);
    UI.toast({ icon: a.icon, title: 'Новое достижение: ' + a.title, text: a.desc, duration: 6000, kind: 'ok' });
  }

  /* ============================================================
     ДЕТАЛИ ПРИВЫЧКИ
     ============================================================ */

  function openHabitDetails(id) {
    const h = Model.get(id);
    if (!h) return;
    const snap = Model.habitSnapshot(h);
    const cat = Model.category(h.categoryId);
    const next = Model.nextScheduled(h, RU.addDays(new Date(), 1));
    const created = RU.formatDate(RU.fromKey(h.createdAtKey || h.createdAt.slice(0, 10)));

    const body =
      '<div class="detail-head" style="--habit-color:' + habitColor(h) + '">' +
        '<span class="habit-card__icon">' + RU.escapeHtml(h.icon) + '</span>' +
        '<div><h4 style="font-size:20px">' + RU.escapeHtml(h.name) + '</h4>' +
        '<p class="form__hint">' + (h.description ? RU.escapeHtml(h.description) : 'Без описания') + '</p></div>' +
      '</div>' +

      '<div class="chips" style="margin:16px 0">' +
        '<span class="chip">' + RU.escapeHtml(Model.describeFrequency(h)) + '</span>' +
        (cat ? '<span class="chip"><span class="chip__dot" style="background:' + cat.color + '"></span>' + RU.escapeHtml(cat.name) + '</span>' : '') +
        (h.reminder ? '<span class="chip">⏰ ' + h.reminder + '</span>' : '') +
        (h.target > 1 ? '<span class="chip">Цель: ' + h.target + (h.unit ? ' ' + RU.escapeHtml(h.unit) : '') + '</span>' : '') +
        '<span class="chip">С ' + created + '</span>' +
      '</div>' +

      '<div class="stat-cards" style="grid-template-columns:repeat(2,1fr);margin-bottom:16px">' +
        statCard('🔥', String(snap.streak), 'Текущая серия') +
        statCard('🏆', String(snap.best), 'Лучшая серия') +
        statCard('✅', String(snap.total), 'Всего выполнено') +
        statCard('📈', snap.month.rate + '<small>%</small>', 'Выполнение за месяц') +
      '</div>' +

      '<div class="panel" style="padding:0;border:0">' +
        '<p class="eyebrow" style="margin-bottom:10px">Последние 28 дней</p>' +
        Charts.miniGrid(h, 28) +
      '</div>' +

      '<div class="panel" style="padding:0;border:0;margin-top:18px">' +
        '<p class="eyebrow" style="margin-bottom:10px">Календарь за месяц</p>' +
        monthCalendarHTML(h) +
      '</div>' +

      (next ? '<p class="form__hint" style="margin-top:14px">Следующее выполнение по расписанию: ' +
        RU.formatDate(next) + '</p>' : '');

    const foot = '<button class="btn btn--ghost" data-act="modal-close">Закрыть</button>' +
      '<button class="btn" data-act="duplicate" data-id="' + h.id + '">Дублировать</button>' +
      '<button class="btn btn--primary" data-act="edit" data-id="' + h.id + '">Изменить</button>';

    UI.openModal({ title: 'Подробности привычки', body: body, foot: foot });
  }

  function monthCalendarHTML(habit) {
    const now = new Date();
    const first = RU.startOfMonth(now);
    const last = RU.endOfMonth(now);
    const ws = Store.state().settings.weekStart;
    const startPad = (first.getDay() - ws + 7) % 7;
    const days = [];

    days.push('<div class="cal-head">');
    for (let i = 0; i < 7; i++) days.push('<span>' + RU.WEEKDAYS_SHORT[(ws + i) % 7] + '</span>');
    days.push('</div><div class="cal-grid">');
    for (let i = 0; i < startPad; i++) days.push('<span class="cal-cell is-blank"></span>');

    for (let d = 1; d <= last.getDate(); d++) {
      const date = new Date(now.getFullYear(), now.getMonth(), d);
      const scheduled = Model.isScheduled(habit, date);
      const v = Model.value(habit.id, RU.key(date));
      const done = v >= (habit.target || 1);
      const cls = ['cal-cell'];
      if (done) cls.push('is-done');
      else if (v > 0) cls.push('is-partial');
      else if (scheduled) cls.push('is-missed');
      if (RU.key(date) === RU.today()) cls.push('is-today');
      days.push('<span class="' + cls.join(' ') + '" style="--habit-color:' + habitColor(habit) +
        '" title="' + RU.escapeHtml(RU.formatDate(date)) + '">' + d + '</span>');
    }
    days.push('</div>');
    return days.join('');
  }

  /* ============================================================
     КАТЕГОРИИ
     ============================================================ */

  function openCategoryEditor(id) {
    const cat = id ? Model.category(id) : null;
    const draft = cat ? Object.assign({}, cat) : { name: '', color: RU.PALETTE[5], icon: '⭐' };

    const body =
      '<form id="catForm" class="form" novalidate>' +
        '<label class="field"><span class="field__label">Название</span>' +
          '<input class="field__input" name="name" maxlength="32" value="' + RU.escapeHtml(draft.name) +
          '" placeholder="Например, Финансы" required /></label>' +
        '<div class="field"><span class="field__label">Иконка</span>' + iconPickerHTML(draft.icon) + '</div>' +
        '<div class="field"><span class="field__label">Цвет</span>' + colorPickerHTML(draft.color) + '</div>' +
        '<p class="form__error" data-role="error" role="alert"></p>' +
      '</form>';

    const foot = '<button class="btn btn--ghost" data-act="modal-close">Отмена</button>' +
      (cat && Model.categories().length > 1
        ? '<button class="btn btn--danger" data-act="delete-category" data-id="' + cat.id + '">Удалить</button>' : '') +
      '<button class="btn btn--primary" data-act="save-category">Сохранить</button>';

    UI.openModal({
      title: cat ? 'Категория' : 'Новая категория',
      body: body, foot: foot,
      onMount: (b) => {
        b.querySelector('[data-role="icons"]').addEventListener('click', (e) => {
          const btn = e.target.closest('[data-icon]');
          if (!btn) return;
          draft.icon = btn.getAttribute('data-icon');
          b.querySelectorAll('[data-icon]').forEach((n) => n.classList.toggle('is-active', n === btn));
        });
        b.querySelector('[data-role="colors"]').addEventListener('click', (e) => {
          const btn = e.target.closest('[data-color]');
          if (!btn) return;
          draft.color = btn.getAttribute('data-color');
          b.querySelectorAll('[data-color]').forEach((n) => n.classList.toggle('is-active', n === btn));
        });
      }
    });
  }

  function saveCategory() {
    const form = document.getElementById('catForm');
    if (!form) return;
    const err = form.querySelector('[data-role="error"]');
    const name = form.querySelector('[name="name"]').value.trim();
    if (!name) { err.textContent = 'Введите название категории.'; return; }
    const icon = (form.querySelector('[data-icon].is-active') || { getAttribute: () => '⭐' }).getAttribute('data-icon');
    const color = (form.querySelector('[data-color].is-active') || { getAttribute: () => RU.PALETTE[0] }).getAttribute('data-color');

    if (uiState.editId) Model.updateCategory(uiState.editId, { name: name, icon: icon, color: color });
    else Model.addCategory(name, color, icon);

    Model.checkAchievements().forEach(announceAchievement);
    UI.closeModal();
    UI.render();
    UI.toast({ icon: icon, title: 'Категория сохранена', text: name });
  }

  /* ============================================================
     ДАННЫЕ: экспорт, импорт, синхронизация
     ============================================================ */

  function openSyncCode() {
    const code = Store.makeSyncCode();
    UI.openModal({
      title: 'Код синхронизации',
      body: '<p class="form__hint" style="margin-bottom:10px">Скопируйте код и вставьте его на другом устройстве в разделе ' +
        '«Профиль → Код синхронизации → Вставить код». Код содержит привычки, историю и настройки без учётных данных.</p>' +
        '<textarea class="field__area" id="syncOut" readonly style="min-height:150px;font-family:var(--font-mono);font-size:12px">' +
        RU.escapeHtml(code) + '</textarea>' +
        '<p class="form__hint" style="margin-top:8px">Длина кода: ' + code.length + ' символов.</p>',
      foot: '<button class="btn btn--ghost" data-act="modal-close">Закрыть</button>' +
        '<button class="btn btn--primary" data-act="copy-code">Скопировать</button>',
      onMount: () => { const t = document.getElementById('syncOut'); if (t) t.select(); }
    });
  }

  function openSyncImport() {
    UI.openModal({
      title: 'Вставить код синхронизации',
      body: '<label class="field"><span class="field__label">Код</span>' +
        '<textarea class="field__area" id="syncIn" placeholder="RITM1.…" style="min-height:150px;font-family:var(--font-mono);font-size:12px"></textarea></label>' +
        '<p class="form__error" data-role="error" role="alert"></p>' +
        '<p class="form__hint">Текущие данные будут заменены данными из кода. Перед этим лучше сделать экспорт файла.</p>',
      foot: '<button class="btn btn--ghost" data-act="modal-close">Отмена</button>' +
        '<button class="btn btn--primary" data-act="apply-code">Применить</button>'
    });
  }

  function openCloud() {
    const cfg = Store.cloudConfig();
    UI.openModal({
      title: 'Облачная синхронизация',
      body: '<p class="form__hint" style="margin-bottom:14px">Укажите адрес REST-эндпоинта, который принимает и отдаёт JSON. ' +
        'Если сервер не нужен — пользуйтесь экспортом файла и кодом синхронизации.</p>' +
        '<div class="form">' +
          '<label class="field"><span class="field__label">Адрес эндпоинта</span>' +
            '<input class="field__input" id="cloudUrl" placeholder="https://example.com/api/ritm/{id}" value="' +
            RU.escapeHtml(cfg.url) + '" /></label>' +
          '<label class="field"><span class="field__label">Токен (необязательно)</span>' +
            '<input class="field__input" id="cloudToken" placeholder="Bearer-токен" value="' +
            RU.escapeHtml(cfg.token) + '" /></label>' +
          '<p class="form__hint">' + '{id}' + ' в адресе заменяется на идентификатор пользователя. ' +
            'Кнопка «Слить» объединяет серверные и локальные данные: привычки и отметки не теряются.</p>' +
        '</div>' +
        '<p class="form__error" data-role="error" role="alert"></p>',
      foot: '<button class="btn btn--ghost" data-act="modal-close">Закрыть</button>' +
        '<button class="btn btn--sm" data-act="cloud-pull">⬇ Загрузить</button>' +
        '<button class="btn btn--sm" data-act="cloud-push">⬆ Отправить</button>' +
        '<button class="btn btn--primary btn--sm" data-act="cloud-merge">⇄ Слить</button>'
    });
  }

  function saveCloudConfigFromModal() {
    const url = document.getElementById('cloudUrl');
    const token = document.getElementById('cloudToken');
    if (url) Store.setCloudConfig({ url: url.value, token: token ? token.value : '' });
  }

  function importFromFile() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.addEventListener('change', () => {
      const file = input.files && input.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          Store.importJSON(String(reader.result));
          Model.touch();
          UI.render();
          UI.toast({ icon: '📥', title: 'Данные загружены', text: file.name, kind: 'ok' });
        } catch (e) {
          UI.toast({ icon: '⚠️', title: 'Не удалось импортировать', text: e.message, kind: 'danger' });
        }
      };
      reader.readAsText(file);
    });
    input.click();
  }

  /* ============================================================
     ОБРАБОТЧИКИ СОБЫТИЙ
     ============================================================ */

  function bindActions() {
    document.addEventListener('click', (e) => {
      const closeBtn = e.target.closest('[data-close="modal"]');
      if (closeBtn) { UI.closeModal(); return; }

      const t = e.target.closest('[data-act]');
      if (!t) return;
      const act = t.getAttribute('data-act');
      const id = t.getAttribute('data-id');
      const value = t.getAttribute('data-value');

      switch (act) {
        /* --- сегодня --- */
        case 'toggle': toggleHabit(id, t); break;
        case 'inc': stepHabit(id, t, 1); break;
        case 'dec': stepHabit(id, t, -1); break;
        case 'open': openHabitDetails(id); break;
        case 'layout': {
          const s = Store.state().settings;
          s.homeLayout = s.homeLayout === 'compact' ? 'list' : 'compact';
          Store.save(true); UI.render(); break;
        }

        /* --- привычки --- */
        case 'new': uiState.editId = null; UI.openHabitEditor(null); break;
        case 'edit': uiState.editId = id; UI.openHabitEditor(id); break;
        case 'save-habit': saveHabit(); break;
        case 'delete': deleteHabit(id); break;
        case 'archive': Model.archive(id); UI.render(); UI.toast({ icon: '🗄', title: 'Привычка в архиве' }); break;
        case 'restore': Model.restore(id); UI.render(); UI.toast({ icon: '↩︎', title: 'Привычка возвращена' }); break;
        case 'duplicate': {
          const h = Model.duplicate(id);
          UI.closeModal(); UI.render();
          if (h) UI.toast({ icon: '📄', title: 'Создана копия', text: h.name });
          break;
        }
        case 'seed': {
          if (Model.seedDemo()) {
            Model.checkAchievements().forEach(announceAchievement);
            UI.render();
            UI.toast({ icon: '✨', title: 'Демо-данные загружены', text: 'Четыре привычки с историей за 6 недель', kind: 'ok' });
          }
          break;
        }
        case 'filter': uiState.filter = value; UI.render(); break;

        /* --- аналитика --- */
        case 'range': break;  // обрабатывается в change

        /* --- профиль --- */
        case 'theme': {
          Store.state().settings.theme = value;
          Store.save(true);
          UI.applyTheme(value);
          UI.render();
          break;
        }
        case 'setting': break;  // обрабатывается в change
        case 'ask-permission': {
          Notify.requestPermission().then((p) => {
            if (p === 'granted') {
              Store.state().settings.notifications = true;
              Store.save(true);
              UI.toast({ icon: '🔔', title: 'Уведомления разрешены', kind: 'ok' });
            } else {
              UI.toast({ icon: '🔕', title: 'Разрешение не выдано', text: permissionText(), kind: 'warn' });
            }
            UI.render();
          });
          break;
        }
        case 'test-notify': {
          Notify.requestPermission().then(() => {
            Notify.notify('Ритм на связи', 'Так будет выглядеть напоминание о привычке.');
            UI.toast({ icon: '📣', title: 'Тестовое уведомление отправлено' });
          });
          break;
        }
        case 'new-category': uiState.editId = null; openCategoryEditor(null); break;
        case 'edit-category': uiState.editId = id; openCategoryEditor(id); break;
        case 'save-category': saveCategory(); break;
        case 'delete-category': {
          uiState.editId = id;
          confirmDialog('Удалить категорию?', 'Привычки из неё перейдут в первую доступную категорию.', () => {
            if (Model.removeCategory(id)) {
              UI.closeModal(); UI.render();
              UI.toast({ icon: '🗑', title: 'Категория удалена' });
            }
          });
          break;
        }
        case 'export': Store.download(); UI.toast({ icon: '⬇️', title: 'Файл сохранён' }); break;
        case 'import': importFromFile(); break;
        case 'sync-code': openSyncCode(); break;
        case 'sync-import': openSyncImport(); break;
        case 'copy-code': {
          const ta = document.getElementById('syncOut');
          if (ta) {
            ta.select();
            try { document.execCommand('copy'); } catch (err) {}
            if (navigator.clipboard) navigator.clipboard.writeText(ta.value).catch(() => {});
            UI.toast({ icon: '📋', title: 'Код скопирован', kind: 'ok' });
          }
          break;
        }
        case 'apply-code': {
          const ta = document.getElementById('syncIn');
          const err = modalBody().querySelector('[data-role="error"]');
          try {
            Store.readSyncCode(ta.value);
            Model.touch();
            UI.closeModal();
            UI.render();
            UI.toast({ icon: '🔗', title: 'Данные синхронизированы', kind: 'ok' });
          } catch (err2) {
            if (err) err.textContent = err2.message;
          }
          break;
        }
        case 'cloud': openCloud(); break;
        case 'cloud-pull': cloudAction('pull'); break;
        case 'cloud-push': cloudAction('push'); break;
        case 'cloud-merge': cloudAction('merge'); break;
        case 'edit-profile': openProfileEditor(); break;
        case 'reset': {
          confirmDialog('Сбросить все данные?', 'Привычки, история и настройки будут удалены. Отменить это действие нельзя.', () => {
            Store.reset();
            Model.touch();
            UI.closeModal();
            UI.render();
            UI.toast({ icon: '🧨', title: 'Данные сброшены' });
          });
          break;
        }
        case 'delete-account': {
          confirmDialog('Удалить аккаунт?', 'Профиль и все данные будут удалены без возможности восстановления.', () => {
            Store.deleteAccount();
            UI.closeModal();
            global.App.showAuth();
          });
          break;
        }
        case 'logout': Store.logout(); global.App.showAuth(); break;
        case 'modal-close': UI.closeModal(); break;
        case 'confirm-yes': {
          const cb = uiState._confirm;
          UI.closeModal();
          if (typeof cb === 'function') cb();
          break;
        }
        case 'save-profile': saveProfile(); break;
        default: break;
      }
    });

    /* Служебные действия, требующие ввода */
    document.addEventListener('change', (e) => {
      const t = e.target.closest('[data-act]');
      if (!t) return;
      const act = t.getAttribute('data-act');
      if (act === 'range') { uiState.range = t.value; UI.render(); }
      else if (act === 'sort') { uiState.sort = t.value; UI.render(); }
      else if (act === 'setting') {
        const key = t.getAttribute('data-value');
        Store.state().settings[key] = t.checked;
        Store.save(true);
        if (key === 'notifications' && t.checked) {
          Notify.requestPermission().then((p) => {
            if (p !== 'granted') {
              Store.state().settings.notifications = false;
              Store.save(true);
              UI.toast({ icon: '🔕', title: 'Уведомления недоступны', text: permissionText(), kind: 'warn' });
            } else {
              UI.toast({ icon: '🔔', title: 'Напоминания включены', kind: 'ok' });
            }
            UI.render();
          });
        }
      }
      else if (act === 'week-start') {
        Store.state().settings.weekStart = Number(t.value);
        Store.save(true); UI.render();
      } else if (act === 'stats-habit') { uiState.statsHabit = t.value; UI.render(); }
    });

    document.addEventListener('input', (e) => {
      const t = e.target.closest('[data-act="search"]');
      if (!t) return;
      uiState.search = t.value;
      clearTimeout(uiState._searchTimer);
      uiState._searchTimer = setTimeout(() => {
        const v = uiState.search;
        UI.render();
        const box = view().querySelector('[data-act="search"]');
        if (box) { box.focus(); box.setSelectionRange(v.length, v.length); }
      }, 220);
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !modalEl().hidden) UI.closeModal();
    });
  }

  function toggleHabit(id, btn) {
    const h = Model.get(id);
    if (!h) return;
    const wasDone = Model.value(h.id, RU.today()) >= (h.target || 1);
    Model.toggle(h, new Date());
    const nowDone = !wasDone;

    if (btn) { btn.classList.add('is-bump'); setTimeout(() => btn.classList.remove('is-bump'), 440); }
    updateRowVisual(id);

    if (nowDone) {
      UI.beep();
      const sum = Model.daySummary(new Date());
      if (sum.total > 0 && sum.done === sum.total) {
        UI.confetti(46);
        UI.toast({ icon: '🎉', title: 'День закрыт полностью!', text: 'Все ' + sum.total + ' ' +
          RU.plural(sum.total, 'привычка', 'привычки', 'привычек') + ' выполнены. Отличная работа.', kind: 'ok', duration: 5200 });
      } else {
        UI.toast({ icon: h.icon, title: h.name, text: 'Отмечено. Так и продолжать!' });
      }
      const unlocked = Model.checkAchievements();
      unlocked.forEach((a) => setTimeout(() => announceAchievement(a), 350));
    }
    updateChrome();
  }

  function stepHabit(id, btn, dir) {
    const h = Model.get(id);
    if (!h) return;
    const target = h.target || 1;
    const cur = Model.value(h.id, RU.today());
    let next = cur + dir;
    if (next < 0) next = 0;
    if (next > target) next = target;
    if (next === cur) return;
    const wasDone = cur >= target;
    Model.setValue(h.id, RU.today(), next);
    const nowDone = next >= target;

    if (dir > 0) { btn.classList.add('is-bump'); setTimeout(() => btn.classList.remove('is-bump'), 440); }
    updateRowVisual(id);

    if (nowDone && !wasDone) {
      UI.beep();
      const sum = Model.daySummary(new Date());
      if (sum.total > 0 && sum.done === sum.total) {
        UI.confetti(46);
        UI.toast({ icon: '🎉', title: 'День закрыт полностью!', kind: 'ok', duration: 5200 });
      } else {
        UI.toast({ icon: h.icon, title: h.name, text: 'Цель дня достигнута!' });
      }
      Model.checkAchievements().forEach((a) => setTimeout(() => announceAchievement(a), 350));
    }
    updateChrome();
  }

  function deleteHabit(id) {
    const h = Model.get(id);
    if (!h) return;
    confirmDialog('Удалить привычку?', '«' + h.name + '» и вся история отметок будут удалены безвозвратно. ' +
      'Если хотите сохранить историю — отправьте привычку в архив.', () => {
      Model.remove(id);
      UI.closeModal();
      UI.render();
      UI.toast({ icon: '🗑', title: 'Привычка удалена' });
    });
  }

  function confirmDialog(title, text, onYes) {
    uiState._confirm = onYes;
    UI.openModal({
      title: title,
      body: '<p>' + RU.escapeHtml(text) + '</p>',
      foot: '<button class="btn btn--ghost" data-act="modal-close">Отмена</button>' +
        '<button class="btn btn--danger" data-act="confirm-yes">Подтвердить</button>'
    });
  }

  function openProfileEditor() {
    const user = Store.currentUser();
    UI.openModal({
      title: 'Профиль',
      body: '<form id="profileForm" class="form">' +
        '<label class="field"><span class="field__label">Имя</span>' +
        '<input class="field__input" name="name" maxlength="40" value="' + RU.escapeHtml(user ? user.name : '') + '" /></label>' +
        '<label class="field"><span class="field__label">Логин</span>' +
        '<input class="field__input" value="' + RU.escapeHtml(user ? user.login : '') + '" disabled /></label>' +
        '<p class="form__hint">Логин изменить нельзя: он используется для входа в этом браузере.</p>' +
        '</form>',
      foot: '<button class="btn btn--ghost" data-act="modal-close">Отмена</button>' +
        '<button class="btn btn--primary" data-act="save-profile">Сохранить</button>'
    });
  }

  function saveProfile() {
    const form = document.getElementById('profileForm');
    if (!form) return;
    const name = form.querySelector('[name="name"]').value.trim();
    if (!name) return;
    Store.updateUser({ name: name });
    UI.closeModal();
    UI.render();
    UI.toast({ icon: '👤', title: 'Имя обновлено' });
  }

  function cloudAction(kind) {
    saveCloudConfigFromModal();
    const err = modalBody().querySelector('[data-role="error"]');
    if (!Store.cloudEnabled()) {
      if (err) err.textContent = 'Укажите корректный адрес эндпоинта (http:// или https://).';
      return;
    }
    const p = kind === 'push' ? Store.cloudPush()
      : kind === 'pull' ? Store.cloudPull()
        : Store.cloudMerge();

    p.then((res) => {
      Model.touch();
      UI.closeModal();
      UI.render();
      UI.toast({
        icon: '☁️',
        title: kind === 'push' ? 'Отправлено в облако'
          : kind === 'pull' ? 'Загружено из облака' : 'Данные объединены',
        kind: 'ok'
      });
      return res;
    }).catch((e) => {
      if (err) err.textContent = 'Ошибка: ' + e.message;
      UI.toast({ icon: '⚠️', title: 'Синхронизация не удалась', text: e.message, kind: 'danger' });
    });
  }

  UI.bindGlobal = bindActions;
  UI.updateChrome = updateChrome;
  UI.renderToday = renderToday;

  global.UI = UI;
})(window);
