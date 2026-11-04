/* ============================================================
   notifications.js — напоминания, системные уведомления, тикер
   ============================================================ */
(function (global) {
  'use strict';

  const RU = global.RU;
  const Store = global.Store;
  const Model = global.Model;
  const N = {};

  const K = 'ritm.v1.notified.';
  let timer = 0;
  const listeners = [];

  N.supported = () => typeof global.Notification !== 'undefined';

  N.permission = () => (N.supported() ? global.Notification.permission : 'unsupported');

  N.requestPermission = () => {
    if (!N.supported()) return Promise.resolve('unsupported');
    if (global.Notification.permission === 'granted') return Promise.resolve('granted');
    if (global.Notification.permission === 'denied') return Promise.resolve('denied');
    return global.Notification.requestPermission();
  };

  /* ---------- Журнал отправленных за день ---------- */

  function journalKey() {
    return K + (Store.currentUserId() || 'anon') + '.' + RU.today();
  }
  function readJournal() {
    try { return JSON.parse(global.localStorage.getItem(journalKey()) || '[]'); }
    catch (e) { return []; }
  }
  function writeJournal(arr) {
    try { global.localStorage.setItem(journalKey(), JSON.stringify(arr.slice(-200))); }
    catch (e) {}
  }
  function alreadySent(tag) {
    return readJournal().indexOf(tag) !== -1;
  }
  function markSent(tag) {
    const j = readJournal();
    j.push(tag);
    writeJournal(j);
  }

  /* ---------- Подписка на события ---------- */

  N.subscribe = (fn) => { listeners.push(fn); return () => {
    const i = listeners.indexOf(fn); if (i > -1) listeners.splice(i, 1);
  }; };

  function emit(evt) { listeners.forEach((fn) => { try { fn(evt); } catch (e) {} }); }

  /* ---------- Системное уведомление ---------- */

  N.notify = (title, body, opts) => {
    const o = opts || {};
    emit({ type: 'notify', title: title, body: body, habitId: o.habitId });
    if (!N.supported() || global.Notification.permission !== 'granted') return Promise.resolve(false);
    const payload = {
      body: body,
      icon: 'icon.svg',
      badge: 'icon.svg',
      tag: o.tag || ('ritm-' + Date.now()),
      silent: !!o.silent,
      data: { habitId: o.habitId || null }
    };
    if (global.navigator && global.navigator.serviceWorker && global.navigator.serviceWorker.controller) {
      try {
        return global.navigator.serviceWorker.ready
          .then((reg) => reg.showNotification(title, payload))
          .then(() => true)
          .catch(() => { new global.Notification(title, payload); return true; });
      } catch (e) { /* уходим в фолбэк */ }
    }
    try { new global.Notification(title, payload); return Promise.resolve(true); }
    catch (e) { return Promise.resolve(false); }
  };

  /* ---------- Проверка напоминаний ---------- */

  function minutesOf(hhmm) {
    const p = String(hhmm || '').split(':');
    return (parseInt(p[0], 10) || 0) * 60 + (parseInt(p[1], 10) || 0);
  }

  N.check = () => {
    if (!Store.state()) return;
    const settings = Store.state().settings;
    const now = new Date();
    const nowMin = now.getHours() * 60 + now.getMinutes();
    const todayKey = RU.today();
    const due = [];

    Model.active().forEach((h) => {
      if (!h.reminder) return;
      if (!Model.isScheduled(h, now)) return;
      if (Model.value(h.id, todayKey) >= (h.target || 1)) return;
      const rm = minutesOf(h.reminder);
      if (nowMin < rm) return;
      if (nowMin - rm > 90) return;      // напоминание актуально 90 минут
      const tag = 'rem:' + h.id + ':' + todayKey;
      if (alreadySent(tag)) return;
      markSent(tag);
      due.push(h);
    });

    if (due.length) {
      const names = due.map((h) => h.name);
      const title = due.length === 1 ? 'Пора: ' + names[0] : 'Пора выполнить привычки';
      const body = due.length === 1
        ? (due[0].description || 'Отметьте выполнение в «Ритме».')
        : names.slice(0, 4).join(', ') + (names.length > 4 ? ' и ещё ' + (names.length - 4) : '');
      if (settings.notifications) N.notify(title, body);
      emit({ type: 'reminder', habits: due, title: title, body: body });
    }

    // Вечерняя сводка в 20:00
    if (settings.notifications && nowMin >= 20 * 60 && nowMin < 20 * 60 + 30) {
      const sum = Model.daySummary(now);
      const tag = 'evening:' + todayKey;
      if (sum.left > 0 && !alreadySent(tag)) {
        markSent(tag);
        N.notify('Остались незакрытые привычки',
          'Сегодня выполнено ' + sum.done + ' из ' + sum.total + '. Есть ещё время всё наверстать.');
      }
    }
  };

  N.start = () => {
    N.stop();
    N.check();
    timer = global.setInterval(N.check, 30000);
  };

  N.stop = () => {
    if (timer) { global.clearInterval(timer); timer = 0; }
  };

  /* ---------- Проверка «через сколько напоминание» (для подсказок в UI) ---------- */

  N.nextReminderToday = (habit) => {
    if (!habit || !habit.reminder) return null;
    const now = new Date();
    if (!Model.isScheduled(habit, now)) return null;
    if (Model.value(habit.id, RU.today()) >= (habit.target || 1)) return null;
    const [h, m] = habit.reminder.split(':').map(Number);
    const at = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m, 0, 0);
    return at;
  };

  N.countPendingToday = () => {
    const now = new Date();
    return Model.scheduleFor(now).filter((h) => Model.value(h.id, RU.today()) < (h.target || 1)).length;
  };

  global.Notify = N;
})(window);
