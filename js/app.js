/* ============================================================
   app.js — точка входа: авторизация, навигация, инициализация
   ============================================================ */
(function (global) {
  'use strict';

  const RU = global.RU;
  const Store = global.Store;
  const Model = global.Model;
  const UI = global.UI;
  const Notify = global.Notify;

  const App = {};
  const authScreen = () => document.getElementById('authScreen');
  const appEl = () => document.getElementById('app');
  const boot = () => document.getElementById('boot');

  /* ---------- Переключение экранов ---------- */

  App.showAuth = () => {
    Notify.stop();
    appEl().hidden = true;
    authScreen().hidden = false;
    UI.applyTheme(Store.themePref());
    setTimeout(() => {
      const f = authScreen().querySelector('input[name="login"]');
      if (f) f.focus();
    }, 80);
  };

  App.showApp = () => {
    authScreen().hidden = true;
    appEl().hidden = false;
    UI.applyTheme();
    UI.setRoute('today');
    Notify.start();
    Store.autoBackup();
  };

  /* ---------- Авторизация ---------- */

  function bindAuth() {
    RU.$$('[data-authtab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const tab = btn.getAttribute('data-authtab');
        RU.$$('[data-authtab]').forEach((b) => b.classList.toggle('is-active', b === btn));
        document.getElementById('loginForm').hidden = tab !== 'login';
        document.getElementById('registerForm').hidden = tab !== 'register';
        const err = document.querySelector('[data-error="' + tab + '"]');
        if (err) err.textContent = '';
      });
    });

    document.getElementById('loginForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const form = e.currentTarget;
      const err = form.querySelector('[data-error="login"]');
      err.textContent = '';
      const btn = form.querySelector('button[type="submit"]');
      btn.disabled = true;
      Store.login(form.login.value, form.password.value)
        .then(() => {
          form.reset();
          App.showApp();
          UI.toast({ icon: '👋', title: 'С возвращением!', text: 'Продолжайте свою серию.' });
        })
        .catch((ex) => { err.textContent = ex.message; })
        .then(() => { btn.disabled = false; });
    });

    document.getElementById('registerForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const form = e.currentTarget;
      const err = form.querySelector('[data-error="register"]');
      err.textContent = '';
      const btn = form.querySelector('button[type="submit"]');
      btn.disabled = true;
      Store.register(form.name.value, form.login.value, form.password.value)
        .then(() => {
          form.reset();
          App.showApp();
          UI.toast({ icon: '🎉', title: 'Аккаунт создан', text: 'Начните с одной небольшой привычки.', kind: 'ok' });
        })
        .catch((ex) => { err.textContent = ex.message; })
        .then(() => { btn.disabled = false; });
    });
  }

  /* ---------- Навигация и общие действия ---------- */

  function bindChrome() {
    document.addEventListener('click', (e) => {
      const routeBtn = e.target.closest('[data-route]');
      if (routeBtn) {
        UI.setRoute(routeBtn.getAttribute('data-route'));
        return;
      }
      const action = e.target.closest('[data-action]');
      if (!action) return;
      const name = action.getAttribute('data-action');
      if (name === 'toggle-theme') UI.toggleTheme();
      else if (name === 'new-habit') { UI.route = 'today'; UI.openHabitEditor(null); }
      else if (name === 'toggle-bell') {
        const s = Store.state().settings;
        if (!s.notifications) {
          Notify.requestPermission().then((p) => {
            if (p === 'granted') {
              s.notifications = true; Store.save(true);
              UI.toast({ icon: '🔔', title: 'Напоминания включены', text: 'Уведомления будут появляться по расписанию.', kind: 'ok' });
            } else {
              UI.toast({ icon: '🔕', title: 'Разрешение не выдано', text: 'Откройте настройки браузера, чтобы включить уведомления.', kind: 'warn' });
            }
            UI.render();
          });
        } else {
          const pending = Model.scheduleFor(new Date()).filter((h) => Model.value(h.id, RU.today()) < (h.target || 1));
          UI.setRoute('today');
          UI.toast({
            icon: pending.length ? '📋' : '✅',
            title: pending.length ? 'Осталось сегодня: ' + pending.length : 'Всё выполнено',
            text: pending.slice(0, 3).map((h) => h.icon + ' ' + h.name).join(', ')
          });
        }
      }
    });
  }

  /* ---------- Реакция на уведомления ---------- */

  function bindNotify() {
    Notify.subscribe((evt) => {
      if (evt.type === 'reminder') {
        UI.toast({ icon: '⏰', title: evt.title, text: evt.body, duration: 7000, kind: 'warn' });
        if (Store.state().settings.notifications) UI.confetti(12);
      }
    });
  }

  /* ---------- Service worker (офлайн-режим) ---------- */

  function registerSW() {
    if (!('serviceWorker' in navigator)) return;
    if (location.protocol !== 'http:' && location.protocol !== 'https:') return; // file:// не поддерживает SW
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  /* ---------- Переключение системной темы ---------- */

  function bindSystemTheme() {
    if (!global.matchMedia) return;
    const mq = global.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => {
      const pref = (Store.state() && Store.state().settings.theme) || Store.themePref();
      if (pref === 'auto') UI.applyTheme('auto');
    };
    if (mq.addEventListener) mq.addEventListener('change', handler);
    else if (mq.addListener) mq.addListener(handler);
  }

  /* ---------- Смена суток ---------- */

  function bindDayChange() {
    let current = RU.today();
    setInterval(() => {
      if (!Store.state()) return;
      const now = RU.today();
      if (now !== current) {
        current = now;
        UI.render();
        UI.toast({ icon: '🌅', title: 'Новый день', text: 'План на сегодня обновлён.' });
      }
    }, 60000);
  }

  /* ---------- Быстрые ссылки из манифеста ---------- */

  function applyDeepLink() {
    const hash = (location.hash || '').replace('#', '');
    if (hash === 'stats') UI.setRoute('stats');
    else if (hash === 'new') UI.openHabitEditor(null);
  }

  /* ---------- Старт ---------- */

  function start() {
    bindAuth();
    bindChrome();
    bindNotify();
    bindSystemTheme();
    bindDayChange();
    UI.bindGlobal();
    registerSW();

    const uid = Store.currentUserId();
    const user = Store.currentUser();

    if (uid && user) {
      Store.openSession(uid);
      App.showApp();
      applyDeepLink();
    } else {
      App.showAuth();
    }

    // Скрываем заставку
    setTimeout(() => {
      const b = boot();
      if (b) {
        b.classList.add('is-gone');
        setTimeout(() => b.remove(), 600);
      }
    }, 320);

    // Сохраняем перед уходом со страницы
    global.addEventListener('beforeunload', () => Store.flush());

    // Изменения из другого окна (виджет на рабочем столе)
    global.addEventListener('storage', (e) => {
      if (!e.key || e.key.indexOf('ritm.v1.data.') !== 0) return;
      if (!Store.state()) return;
      Store.reload();
      UI.applyTheme();
      UI.render();
    });

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        if (Store.state()) { UI.render(); Notify.check(); }
      } else {
        Store.flush();
      }
    });
  }

  global.App = App;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})(window);
