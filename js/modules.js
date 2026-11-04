/* ============================================================
   modules.js — реестр дополнительных разделов приложения.
   Каждый модуль регистрирует себя как window.<Name> с интерфейсом:
     { route, label, subtitle(), mount(host) }
   ui.js обращается к реестру при отрисовке неизвестных маршрутов.
   ============================================================ */
(function (global) {
  'use strict';

  const items = [global.Chess, global.Blackjack, global.Training, global.Recipes, global.Music, global.Nutrition]
    .filter((m) => m && m.route && typeof m.mount === 'function');

  const Modules = {
    items: items,
    get: (route) => items.find((m) => m.route === route) || null,
    has: (route) => !!Modules.get(route),
    /** Отрисовать раздел в контейнере */
    render: (route, host) => {
      const m = Modules.get(route);
      if (!m) return false;
      m.mount(host);
      return true;
    },
    /** Короткий заголовок для верхней панели */
    label: (route) => (Modules.get(route) || {}).label || '',
    /** Подзаголовок-описание для верхней панели */
    subtitle: (route) => {
      const m = Modules.get(route);
      return m && typeof m.subtitle === 'function' ? m.subtitle() : '';
    }
  };

  global.Modules = Modules;
})(window);
