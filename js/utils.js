/* ============================================================
   utils.js — даты, DOM, вспомогательные функции
   Глобальное пространство имён: window.RU
   ============================================================ */
(function (global) {
  'use strict';

  const U = {};

  /* ---------- Даты ---------- */

  const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
    'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
  const MONTHS_NOM = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
    'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
  const MONTHS_SHORT = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн',
    'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
  const WEEKDAYS_SHORT = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
  const WEEKDAYS_FULL = ['воскресенье', 'понедельник', 'вторник', 'среда',
    'четверг', 'пятница', 'суббота'];

  U.MONTHS = MONTHS;
  U.MONTHS_NOM = MONTHS_NOM;
  U.MONTHS_SHORT = MONTHS_SHORT;
  U.WEEKDAYS_SHORT = WEEKDAYS_SHORT;

  U.pad2 = (n) => String(n).padStart(2, '0');

  /** Date -> 'YYYY-MM-DD' */
  U.key = (d) => d.getFullYear() + '-' + U.pad2(d.getMonth() + 1) + '-' + U.pad2(d.getDate());

  /** 'YYYY-MM-DD' -> Date (локальная полночь) */
  U.fromKey = (k) => {
    const p = String(k).split('-');
    return new Date(+p[0], +p[1] - 1, +p[2]);
  };

  U.today = () => U.key(new Date());

  U.startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

  U.addDays = (d, n) => {
    const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    x.setDate(x.getDate() + n);
    return x;
  };

  /** Разница в целых днях между датами (календарная) */
  U.daysBetween = (a, b) => Math.round((U.startOfDay(a) - U.startOfDay(b)) / 86400000);

  U.isSameDay = (a, b) => U.key(a) === U.key(b);

  /** Понедельник текущей недели (weekStart: 0=вс, 1=пн) */
  U.startOfWeek = (d, weekStart) => {
    const ws = weekStart === 0 ? 0 : 1;
    const x = U.startOfDay(d);
    const shift = (x.getDay() - ws + 7) % 7;
    return U.addDays(x, -shift);
  };

  U.endOfWeek = (d, weekStart) => U.addDays(U.startOfWeek(d, weekStart), 6);

  U.startOfMonth = (d) => new Date(d.getFullYear(), d.getMonth(), 1);
  U.endOfMonth = (d) => new Date(d.getFullYear(), d.getMonth() + 1, 0);
  U.startOfYear = (d) => new Date(d.getFullYear(), 0, 1);
  U.endOfYear = (d) => new Date(d.getFullYear(), 11, 31);

  /** Сдвиг месяца с сохранением дня (без переполнения) */
  U.addMonths = (d, n) => {
    const day = d.getDate();
    const x = new Date(d.getFullYear(), d.getMonth() + n, 1);
    const last = new Date(x.getFullYear(), x.getMonth() + 1, 0).getDate();
    x.setDate(Math.min(day, last));
    return x;
  };

  U.formatDate = (d) => d.getDate() + ' ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear();
  U.formatDateShort = (d) => d.getDate() + ' ' + MONTHS_SHORT[d.getMonth()];
  U.weekdayName = (d) => WEEKDAYS_FULL[d.getDay()];
  U.monthTitle = (d) => MONTHS_NOM[d.getMonth()] + ' ' + d.getFullYear();

  U.plural = (n, one, few, many) => {
    const abs = Math.abs(n) % 100;
    const last = abs % 10;
    if (abs > 10 && abs < 20) return many;
    if (last > 1 && last < 5) return few;
    if (last === 1) return one;
    return many;
  };

  /** «5 дней», «1 день», «2 дня» */
  U.daysWord = (n) => n + ' ' + U.plural(n, 'день', 'дня', 'дней');

  /** «3 привычки» */
  U.habitsWord = (n) => n + ' ' + U.plural(n, 'привычка', 'привычки', 'привычек');

  U.clamp = (v, min, max) => Math.min(max, Math.max(min, v));

  U.uid = () => {
    const rnd = (global.crypto && global.crypto.getRandomValues)
      ? Array.from(global.crypto.getRandomValues(new Uint8Array(8)))
          .map((b) => b.toString(16).padStart(2, '0')).join('')
      : Math.random().toString(16).slice(2, 18);
    return Date.now().toString(36) + '-' + rnd;
  };

  U.escapeHtml = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  U.debounce = (fn, wait) => {
    let t = 0;
    return function () {
      const args = arguments, ctx = this;
      clearTimeout(t);
      t = setTimeout(() => fn.apply(ctx, args), wait);
    };
  };

  /* ---------- Хеширование пароля (WebCrypto + фолбэк) ---------- */

  U.hash = async (text) => {
    const salt = 'ritm::v1::';
    try {
      if (global.crypto && global.crypto.subtle && global.TextEncoder) {
        const buf = await global.crypto.subtle.digest('SHA-256',
          new TextEncoder().encode(salt + text));
        return Array.from(new Uint8Array(buf))
          .map((b) => b.toString(16).padStart(2, '0')).join('');
      }
    } catch (e) { /* переходим к фолбэку */ }
    // Фолбэк FNV-1a (не криптостойкий — только для локального демо-хранилища)
    let h = 0x811c9dc5;
    const s = salt + text;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = (h * 0x01000193) >>> 0;
    }
    return 'fnv' + h.toString(16);
  };

  /* ---------- DOM ---------- */

  U.$ = (sel, root) => (root || document).querySelector(sel);
  U.$$ = (sel, root) => Array.prototype.slice.call((root || document).querySelectorAll(sel));

  U.el = (tag, cls, html) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  };

  U.on = (target, event, handler, opts) => {
    if (!target) return () => {};
    target.addEventListener(event, handler, opts);
    return () => target.removeEventListener(event, handler, opts);
  };

  /** Делегирование событий по селектору */
  U.delegate = (root, event, selector, handler) => {
    return U.on(root, event, function (e) {
      const match = e.target.closest(selector);
      if (match && root.contains(match)) handler(e, match);
    });
  };

  /* ---------- Цвета ---------- */

  U.PALETTE = [
    '#F0512A', '#E8890C', '#C8880B', '#7FA616',
    '#178A5B', '#0E7C66', '#1B8FA8', '#2F6FD0',
    '#6B5BD2', '#A64AC9', '#D4417A', '#8A6A4F'
  ];

  U.ICONS = [
    '🏃', '💪', '🧘', '🚴', '🏊', '⚽', '🥗', '💧',
    '😴', '📚', '✍️', '🎧', '🎨', '🎸', '🧠', '💻',
    '🧹', '🌱', '☀️', '🌙', '💰', '📵', '🚭', '🙏',
    '🦷', '🚿', '🐶', '☕', '🍎', '🎯', '❤️', '⭐'
  ];

  /** hex -> rgba с прозрачностью */
  U.alpha = (hex, a) => {
    const h = hex.replace('#', '');
    const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
    const num = parseInt(full, 16);
    return 'rgba(' + ((num >> 16) & 255) + ',' + ((num >> 8) & 255) + ',' + (num & 255) + ',' + a + ')';
  };

  global.RU = Object.assign(global.RU || {}, U);
})(window);
