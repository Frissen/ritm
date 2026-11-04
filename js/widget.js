/* ============================================================
   widget.js — компактный виджет «Ритм» на рабочем столе
   Работает в отдельном окне и читает те же данные, что основное
   приложение (общий localStorage).
   ============================================================ */
(function (global) {
  'use strict';

  const RU = global.RU;
  const Store = global.Store;
  const Model = global.Model;
  const Charts = global.Charts;

  const root = document.getElementById('wRoot');
  const host = global.chrome && global.chrome.webview ? global.chrome.webview : null;

  let timer = 0;
  let lastSig = null;

  /* ---------- Тема ---------- */

  function applyTheme() {
    const st = Store.state();
    const choice = (st && st.settings.theme) || Store.themePref() || 'auto';
    const dark = global.matchMedia && global.matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.setAttribute('data-theme', choice === 'auto' ? (dark ? 'dark' : 'light') : choice);
  }

  /* ---------- Данные ---------- */

  function loggedIn() {
    return !!(Store.currentUserId() && Store.currentUser());
  }

  /** Подпись состояния: меняется только при реальном изменении данных */
  function signature() {
    const st = Store.state();
    if (!st) return '';
    const key = RU.today();
    let acc = (st.createdAt || '') + '|' + st.habits.length + '|';
    st.habits.forEach((h) => {
      const day = st.logs[h.id];
      acc += h.id + ':' + (day ? (day[key] || 0) : 0) + ':' + h.target + ';';
    });
    return acc;
  }

  function refresh(force) {
    applyTheme();

    if (!loggedIn()) {
      if (force || lastSig !== 'anon') {
        lastSig = 'anon';
        root.innerHTML =
          '<div class="w-empty">' +
            '<b>Ритм</b>' +
            '<p>Откройте приложение и войдите в аккаунт — привычки на сегодня появятся здесь.</p>' +
          '</div>' +
          '<div class="w-foot"><button class="w-open" data-act="open">Открыть Ритм</button></div>';
      }
      return;
    }

    Store.reload();
    Model.invalidate();

    const sig = signature();
    if (!force && sig === lastSig) return;
    lastSig = sig;
    paint();
  }

  /* ---------- Отрисовка ---------- */

  function paint() {
    const today = new Date();
    const key = RU.today();
    const list = Model.scheduleFor(today);
    const sum = Model.daySummary(today);
    const total = Model.active().length;

    if (!total) {
      root.innerHTML =
        '<div class="w-empty">' +
          '<b>Пока пусто</b>' +
          '<p>Добавьте первую привычку в приложении — и она появится в виджете.</p>' +
        '</div>' +
        '<div class="w-foot"><button class="w-open" data-act="open">Открыть Ритм</button></div>';
      return;
    }

    const best = list.reduce((m, h) => Math.max(m, Model.currentStreak(h)), 0);
    const doneAll = list.length > 0 && sum.done === list.length;

    const head =
      '<div class="w-top">' +
        '<div class="w-date">Сегодня · ' + RU.escapeHtml(RU.formatDateShort(today)) + '</div>' +
        '<div class="w-progress">' +
          '<div class="w-ring">' + Charts.ring(sum.rate, { size: 78, stroke: 8 }) +
            '<div class="w-ring-num">' + sum.rate + '<span>%</span></div>' +
          '</div>' +
          '<div class="w-figures">' +
            '<div class="w-count">' + sum.done + ' из ' + sum.total + '</div>' +
            '<div class="w-sub">' + (doneAll ? 'план на день закрыт' : 'выполнено сегодня') + '</div>' +
            (best > 0 ? '<div class="w-streak">🔥 ' + RU.daysWord(best) + ' подряд</div>' : '') +
          '</div>' +
        '</div>' +
      '</div>';

    const rows = list.slice().sort((a, b) => {
      const da = Model.isDone(a, today) ? 1 : 0;
      const db = Model.isDone(b, today) ? 1 : 0;
      if (da !== db) return da - db;
      return (a.order || 0) - (b.order || 0);
    });

    const body = rows.length
      ? rows.map((h) => rowHTML(h, key)).join('')
      : '<div class="w-empty"><b>Отдых</b><p>На сегодня привычек по расписанию нет.</p></div>';

    root.innerHTML =
      head +
      '<div class="w-list">' + body + '</div>' +
      '<div class="w-foot">' +
        '<button class="w-open" data-act="open">' + (doneAll ? 'Всё готово — открыть Ритм' : 'Открыть Ритм') + '</button>' +
      '</div>';
  }

  function rowHTML(h, key) {
    const target = h.target || 1;
    const v = Model.value(h.id, key);
    const done = v >= target;
    const partial = !done && v > 0;
    const streak = Model.currentStreak(h);

    const meta = [];
    if (streak > 0) meta.push('🔥 ' + streak);
    if (h.reminder) meta.push('⏰ ' + h.reminder);
    if (target > 1) meta.push(v + ' из ' + target);
    if (!meta.length) meta.push(Model.describeFrequency(h));

    let chip = '';
    if (done) chip = '✓';
    else if (target > 1) chip = v + '/' + target;

    return '' +
      '<button class="w-row' + (done ? ' is-done' : '') + (partial ? ' is-part' : '') + '"' +
        ' data-id="' + h.id + '" title="' + RU.escapeHtml(h.name) + '">' +
        '<span class="w-ico" style="background:' + RU.alpha(h.color || '#F0512A', .14) + ';border-color:' + RU.alpha(h.color || '#F0512A', .35) + '">' + h.icon + '</span>' +
        '<span class="w-mid">' +
          '<span class="w-name">' + RU.escapeHtml(h.name) + '</span>' +
          '<span class="w-meta">' + RU.escapeHtml(meta.join(' · ')) + '</span>' +
        '</span>' +
        '<span class="w-check">' + chip + '</span>' +
      '</button>';
  }

  /* ---------- Действия ---------- */

  function toggle(id) {
    Store.reload();
    Model.invalidate();
    const h = Model.get(id);
    if (!h) return;

    const key = RU.today();
    const target = h.target || 1;
    const cur = Model.value(id, key);
    const next = target > 1 ? (cur >= target ? 0 : cur + 1) : (cur >= target ? 0 : target);

    Model.setValue(id, key, next);
    Store.save(true);           // сразу на диск, чтобы основное окно увидело изменение
    refresh(true);

    const chip = root.querySelector('.w-row[data-id="' + id + '"] .w-check');
    if (chip && next > 0) chip.classList.add('w-pulse');
  }

  function openApp() {
    if (host) host.postMessage('open-app');
    else global.open('index.html', '_blank');
  }

  root.addEventListener('click', (e) => {
    const row = e.target.closest('.w-row');
    if (row) { toggle(row.getAttribute('data-id')); return; }
    if (e.target.closest('[data-act="open"]')) openApp();
  });

  /* ---------- Жизненный цикл ---------- */

  function boot() {
    refresh(true);
    timer = setInterval(() => {
      if (document.visibilityState === 'visible') refresh(false);
    }, 2500);
  }

  global.addEventListener('storage', () => refresh(false));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') refresh(false);
  });
  if (global.matchMedia) {
    const mq = global.matchMedia('(prefers-color-scheme: dark)');
    const onScheme = () => applyTheme();
    if (mq.addEventListener) mq.addEventListener('change', onScheme);
    else if (mq.addListener) mq.addListener(onScheme);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window);
