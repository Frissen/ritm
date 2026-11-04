/* ============================================================
   model.js — привычки, расписания, отметки, серии, достижения
   ============================================================ */
(function (global) {
  'use strict';

  const RU = global.RU;
  const Store = global.Store;
  const M = {};

  let version = 0;              // растёт при каждом изменении данных
  const memo = new Map();

  function st() { return Store.state(); }
  function cached(key, fn) {
    const k = key + '@' + version;
    if (memo.has(k)) return memo.get(k);
    const v = fn();
    if (memo.size > 400) memo.clear();
    memo.set(k, v);
    return v;
  }
  /** Сбросить кеши расчётов (после внешнего изменения данных) */
  M.invalidate = () => {
    version++;
    memo.clear();
  };

  function touch() {
    M.invalidate();
    Store.save();
  }
  M.touch = touch;
  M.version = () => version;

  /* ============================================================
     Привычки
     ============================================================ */

  M.all = () => st().habits.slice();

  M.active = () => st().habits.filter((h) => !h.archived);

  M.archived = () => st().habits.filter((h) => h.archived);

  M.get = (id) => st().habits.find((h) => h.id === id) || null;

  M.byCategory = (catId) => st().habits.filter((h) => h.categoryId === catId);

  const FREQ_LABELS = {
    daily: 'Ежедневно',
    weekly: 'По дням недели',
    interval: 'С интервалом',
    even: 'По чётным числам',
    odd: 'По нечётным числам'
  };
  M.FREQ_LABELS = FREQ_LABELS;

  M.describeFrequency = (habit) => {
    const f = habit.freq || { type: 'daily' };
    switch (f.type) {
      case 'weekly': {
        const days = (f.days || []).slice().sort();
        if (!days.length) return 'Дни не выбраны';
        if (days.length === 7) return 'Ежедневно';
        if (days.join(',') === '1,2,3,4,5') return 'По будням';
        if (days.join(',') === '0,6') return 'По выходным';
        return days.map((d) => RU.WEEKDAYS_SHORT[(d + 6) % 7]).join(', ');
      }
      case 'interval':
        return 'Каждые ' + RU.daysWord(Math.max(1, f.interval || 2));
      case 'even': return 'По чётным числам';
      case 'odd': return 'По нечётным числам';
      default: return 'Ежедневно';
    }
  };

  M.create = (data) => {
    const now = new Date().toISOString();
    const habit = {
      id: RU.uid(),
      name: String(data.name || '').trim() || 'Без названия',
      description: String(data.description || '').trim(),
      categoryId: data.categoryId || 'c-other',
      icon: data.icon || '⭐',
      color: data.color || '#F0512A',
      target: Math.max(1, parseInt(data.target, 10) || 1),
      unit: String(data.unit || '').trim(),
      freq: normalizeFreq(data.freq),
      reminder: data.reminder || null,      // 'HH:MM' или null
      createdAt: now,
      createdAtKey: RU.today(),
      updatedAt: now,
      archived: false,
      order: st().habits.length
    };
    st().habits.push(habit);
    touch();
    return habit;
  };

  M.update = (id, patch) => {
    const h = M.get(id);
    if (!h) return null;
    Object.keys(patch).forEach((k) => {
      if (k === 'freq') h.freq = normalizeFreq(patch.freq);
      else h[k] = patch[k];
    });
    if (patch.name != null) h.name = String(patch.name).trim() || h.name;
    if (patch.target != null) h.target = Math.max(1, parseInt(patch.target, 10) || 1);
    h.updatedAt = new Date().toISOString();
    touch();
    return h;
  };

  M.archive = (id) => M.update(id, { archived: true });
  M.restore = (id) => M.update(id, { archived: false });

  M.remove = (id) => {
    const s = st();
    s.habits = s.habits.filter((h) => h.id !== id);
    delete s.logs[id];
    touch();
  };

  M.duplicate = (id) => {
    const h = M.get(id);
    if (!h) return null;
    return M.create({
      name: h.name + ' (копия)', description: h.description,
      categoryId: h.categoryId, icon: h.icon, color: h.color,
      target: h.target, unit: h.unit, freq: h.freq, reminder: h.reminder
    });
  };

  M.reorder = (id, dir) => {
    const list = st().habits;
    const i = list.findIndex((h) => h.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= list.length) return;
    const tmp = list[i]; list[i] = list[j]; list[j] = tmp;
    list.forEach((h, idx) => { h.order = idx; });
    touch();
  };

  function normalizeFreq(f) {
    const out = { type: 'daily' };
    if (!f) return out;
    out.type = FREQ_LABELS[f.type] ? f.type : 'daily';
    if (out.type === 'weekly') {
      out.days = (Array.isArray(f.days) ? f.days : [])
        .map(Number).filter((d) => d >= 0 && d <= 6)
        .filter((d, i, a) => a.indexOf(d) === i).sort();
    }
    if (out.type === 'interval') {
      out.interval = RU.clamp(parseInt(f.interval, 10) || 2, 1, 365);
      out.anchor = f.anchor || RU.today();
    }
    return out;
  }

  /* ============================================================
     Расписание
     ============================================================ */

  /** Запланирована ли привычка на конкретную дату */
  M.isScheduled = (habit, date) => {
    if (!habit) return false;
    if (habit.archived) return false;
    const created = RU.fromKey(habit.createdAtKey || habit.createdAt.slice(0, 10));
    if (RU.startOfDay(date) < RU.startOfDay(created)) return false;
    const f = habit.freq || { type: 'daily' };
    switch (f.type) {
      case 'weekly':
        return (f.days || []).indexOf(date.getDay()) !== -1;
      case 'even':
        return date.getDate() % 2 === 0;
      case 'odd':
        return date.getDate() % 2 !== 0;
      case 'interval': {
        const n = Math.max(1, f.interval || 1);
        const anchor = RU.fromKey(f.anchor || habit.createdAtKey);
        const diff = RU.daysBetween(date, anchor);
        return diff >= 0 && diff % n === 0;
      }
      default:
        return true;
    }
  };

  /** Привычки, запланированные на дату */
  M.scheduleFor = (date, includeArchived) => {
    return st().habits.filter((h) => (includeArchived || !h.archived) && M.isScheduled(h, date));
  };

  /** Ближайшая запланированная дата (для «следующий раз ...») */
  M.nextScheduled = (habit, from) => {
    let d = RU.startOfDay(from || new Date());
    for (let i = 0; i < 400; i++) {
      if (M.isScheduled(habit, d)) return d;
      d = RU.addDays(d, 1);
    }
    return null;
  };

  /* ============================================================
     Отметки
     ============================================================ */

  M.value = (habitId, dateKey) => {
    const m = st().logs[habitId];
    if (!m) return 0;
    return m[dateKey] || 0;
  };

  M.isDone = (habit, date) => {
    const v = M.value(habit.id, RU.key(date));
    return v >= (habit.target || 1);
  };

  M.setValue = (habitId, dateKey, value) => {
    const s = st();
    const habit = M.get(habitId);
    if (!habit) return 0;
    const target = habit.target || 1;
    const v = RU.clamp(Math.round(Number(value) || 0), 0, target);
    if (v <= 0) {
      if (s.logs[habitId]) {
        delete s.logs[habitId][dateKey];
        if (!Object.keys(s.logs[habitId]).length) delete s.logs[habitId];
      }
    } else {
      s.logs[habitId] = s.logs[habitId] || {};
      s.logs[habitId][dateKey] = v;
    }
    touch();
    return v;
  };

  M.toggle = (habit, date) => {
    const key = RU.key(date || new Date());
    const done = M.value(habit.id, key) >= (habit.target || 1);
    M.setValue(habit.id, key, done ? 0 : (habit.target || 1));
    return !done;
  };

  M.increment = (habit, date) => {
    const key = RU.key(date || new Date());
    const cur = M.value(habit.id, key);
    const target = habit.target || 1;
    const next = cur >= target ? 0 : cur + 1;
    M.setValue(habit.id, key, next);
    return next;
  };

  M.clearDay = (habitId, dateKey) => M.setValue(habitId, dateKey, 0);

  /* ============================================================
     Серии и статистика привычки
     ============================================================ */

  /** Текущая серия (дни подряд по расписанию) */
  M.currentStreak = (habit, ref) => {
    return cached('cs:' + habit.id, () => {
      const from = RU.startOfDay(ref || new Date());
      const created = RU.fromKey(habit.createdAtKey || habit.createdAt.slice(0, 10));
      let d = from;
      let streak = 0;
      // если сегодня запланировано и не выполнено — сегодня ещё не «сгорел»
      if (M.isScheduled(habit, d) && !M.isDone(habit, d)) d = RU.addDays(d, -1);
      let guard = 0;
      while (RU.daysBetween(d, created) >= 0 && guard++ < 3660) {
        if (M.isScheduled(habit, d)) {
          if (M.isDone(habit, d)) streak++;
          else break;
        }
        d = RU.addDays(d, -1);
      }
      return streak;
    });
  };

  /** Лучшая серия за всё время */
  M.bestStreak = (habit) => {
    return cached('bs:' + habit.id, () => {
      const created = RU.fromKey(habit.createdAtKey || habit.createdAt.slice(0, 10));
      const today = RU.startOfDay(new Date());
      let d = created, run = 0, best = 0, guard = 0;
      while (RU.daysBetween(today, d) >= 0 && guard++ < 4000) {
        if (M.isScheduled(habit, d)) {
          if (M.isDone(habit, d)) { run++; if (run > best) best = run; }
          else run = 0;
        }
        d = RU.addDays(d, 1);
      }
      return best;
    });
  };

  M.totalDone = (habit) => {
    return cached('td:' + habit.id, () => {
      const m = st().logs[habit.id];
      if (!m) return 0;
      const target = habit.target || 1;
      return Object.keys(m).reduce((acc, k) => acc + (m[k] >= target ? 1 : 0), 0);
    });
  };

  /** Произвольный период: { scheduled, done, rate } */
  M.periodStats = (habit, from, to) => {
    let scheduled = 0, done = 0;
    let d = RU.startOfDay(from);
    const end = RU.startOfDay(to);
    let guard = 0;
    while (RU.daysBetween(end, d) >= 0 && guard++ < 4000) {
      if (M.isScheduled(habit, d)) {
        scheduled++;
        if (M.isDone(habit, d)) done++;
      }
      d = RU.addDays(d, 1);
    }
    return { scheduled: scheduled, done: done, rate: scheduled ? Math.round(done / scheduled * 100) : 0 };
  };

  /** Всего дней с отметкой (без учёта расписания) */
  M.activeDays = (habit) => {
    const m = st().logs[habit.id];
    if (!m) return 0;
    const target = habit.target || 1;
    return Object.keys(m).filter((k) => m[k] >= target).length;
  };

  /* ============================================================
     Категории
     ============================================================ */

  M.categories = () => st().categories.slice();

  M.category = (id) => st().categories.find((c) => c.id === id) || null;

  M.categoryName = (id) => {
    const c = M.category(id);
    return c ? c.name : 'Без категории';
  };

  M.categoryColor = (id) => {
    const c = M.category(id);
    return c ? c.color : '#8A6A4F';
  };

  M.addCategory = (name, color, icon) => {
    const cat = {
      id: 'c-' + RU.uid(),
      name: String(name || '').trim() || 'Новая категория',
      color: color || RU.PALETTE[0],
      icon: icon || '⭐'
    };
    st().categories.push(cat);
    touch();
    return cat;
  };

  M.updateCategory = (id, patch) => {
    const c = M.category(id);
    if (!c) return null;
    Object.assign(c, patch);
    touch();
    return c;
  };

  M.removeCategory = (id) => {
    const s = st();
    if (s.categories.length <= 1) return false;
    s.categories = s.categories.filter((c) => c.id !== id);
    s.habits.forEach((h) => { if (h.categoryId === id) h.categoryId = s.categories[0].id; });
    touch();
    return true;
  };

  /* ============================================================
     Сводки по дню
     ============================================================ */

  M.daySummary = (date) => {
    const list = M.scheduleFor(date);
    let done = 0, partial = 0;
    list.forEach((h) => {
      const v = M.value(h.id, RU.key(date));
      if (v >= (h.target || 1)) done++;
      else if (v > 0) partial++;
    });
    return {
      total: list.length,
      done: done,
      partial: partial,
      left: list.length - done,
      rate: list.length ? Math.round(done / list.length * 100) : 0
    };
  };

  /** Данные для карточки привычки: серия, неделя, месяц, всего */
  M.habitSnapshot = (habit, ref) => {
    const d = ref || new Date();
    const week = { from: RU.startOfWeek(d, st().settings.weekStart), to: RU.addDays(RU.startOfWeek(d, st().settings.weekStart), 6) };
    const month = { from: RU.startOfMonth(d), to: RU.endOfMonth(d) };
    const year = { from: RU.startOfYear(d), to: RU.endOfYear(d) };
    const clampTo = (p) => ({ from: p.from, to: new Date(Math.min(p.to.getTime(), RU.startOfDay(d).getTime())) });
    return {
      streak: M.currentStreak(habit, d),
      best: M.bestStreak(habit),
      total: M.totalDone(habit),
      week: M.periodStats(habit, week.from, clampTo(week).to),
      month: M.periodStats(habit, month.from, clampTo(month).to),
      year: M.periodStats(habit, year.from, clampTo(year).to)
    };
  };

  /* ============================================================
     Достижения
     ============================================================ */

  const ACHIEVEMENTS = [
    { id: 'first',  icon: '🌱', title: 'Первый шаг',        desc: 'Отметить первую привычку',            check: (g) => g.totalDone >= 1 },
    { id: 'week',   icon: '🔥', title: 'Неделя подряд',     desc: 'Серия из 7 дней',                     check: (g) => g.bestStreak >= 7 },
    { id: 'month',  icon: '🏔️', title: 'Месяц силы',        desc: 'Серия из 30 дней',                    check: (g) => g.bestStreak >= 30 },
    { id: 'perfect',icon: '💎', title: 'Идеальная неделя',  desc: '100% выполнения за неделю',           check: (g) => g.weekRate === 100 && g.weekScheduled >= 5 },
    { id: 'five',   icon: '🧩', title: 'Пять направлений',  desc: 'Пять активных привычек',              check: (g) => g.habits >= 5 },
    { id: 'hun',    icon: '💯', title: 'Сотня отметок',     desc: '100 выполненных дней',                check: (g) => g.totalDone >= 100 },
    { id: 'cats',   icon: '🎨', title: 'Разносторонний',    desc: 'Привычки в 3+ категориях',            check: (g) => g.categories >= 3 },
    { id: 'year',   icon: '🚀', title: 'Марафонец',         desc: '365 выполненных дней',                check: (g) => g.totalDone >= 365 }
  ];
  M.ACHIEVEMENTS = ACHIEVEMENTS;

  M.achievementStats = () => {
    const habits = M.active();
    let totalDone = 0, bestStreak = 0;
    habits.forEach((h) => {
      totalDone += M.totalDone(h);
      const b = M.bestStreak(h);
      if (b > bestStreak) bestStreak = b;
    });
    const today = new Date();
    const from = RU.startOfWeek(today, st().settings.weekStart);
    const weekScheduled = habits.reduce((a, h) => a + M.periodStats(h, from, today).scheduled, 0);
    const weekDone = habits.reduce((a, h) => a + M.periodStats(h, from, today).done, 0);
    return {
      habits: habits.length,
      totalDone: totalDone,
      bestStreak: bestStreak,
      weekScheduled: weekScheduled,
      weekRate: weekScheduled ? Math.round(weekDone / weekScheduled * 100) : 0,
      categories: new Set(habits.map((h) => h.categoryId)).size
    };
  };

  /** Проверить и выдать новые достижения. Возвращает массив новых. */
  M.checkAchievements = () => {
    const s = st();
    const g = M.achievementStats();
    const unlocked = [];
    ACHIEVEMENTS.forEach((a) => {
      if (s.achievements[a.id]) return;
      let ok = false;
      try { ok = !!a.check(g); } catch (e) { ok = false; }
      if (ok) {
        s.achievements[a.id] = new Date().toISOString();
        unlocked.push(a);
      }
    });
    if (unlocked.length) touch();
    return unlocked;
  };

  M.achievements = () => ACHIEVEMENTS.map((a) => ({
    id: a.id, icon: a.icon, title: a.title, desc: a.desc,
    unlockedAt: st().achievements[a.id] || null
  }));

  /* ============================================================
     Демо-данные (для быстрого знакомства)
     ============================================================ */

  M.seedDemo = () => {
    const s = st();
    if (s.habits.length) return false;
    const mk = (name, desc, cat, icon, color, freq, target, unit, reminder) => M.create({
      name: name, description: desc, categoryId: cat, icon: icon, color: color,
      freq: freq, target: target, unit: unit, reminder: reminder
    });

    const h1 = mk('Утренняя зарядка', '15 минут растяжки и лёгкой гимнастики', 'c-body', '🏃', '#F0512A', { type: 'daily' }, 1, '', '07:30');
    const h2 = mk('Вода', '8 стаканов чистой воды', 'c-health', '💧', '#1B8FA8', { type: 'daily' }, 8, 'стаканов', null);
    const h3 = mk('Чтение', '30 минут книги перед сном', 'c-mind', '📚', '#6B5BD2', { type: 'weekly', days: [1, 3, 5] }, 1, '', '21:30');
    const h4 = mk('Без соцсетей', 'День без ленты новостей', 'c-mind', '📵', '#7FA616', { type: 'even' }, 1, '', null);

    // История за 6 недель для наглядной аналитики
    const today = new Date();
    const set = (h, d, v) => {
      const k = RU.key(d);
      s.logs[h.id] = s.logs[h.id] || {};
      s.logs[h.id][k] = v;
    };
    for (let i = 45; i >= 0; i--) {
      const d = RU.addDays(today, -i);
      // зарядка — 78% выполнения, серия не рвётся в последние дни
      if (M.isScheduled(h1, d)) {
        const rnd = Math.random();
        if (i < 12 || rnd > 0.22) set(h1, d, 1);
      }
      // вода — почти всегда, целевое значение 8
      if (M.isScheduled(h2, d)) set(h2, d, Math.random() > 0.15 ? 8 : (Math.random() > 0.5 ? 5 : 3));
      // чтение по расписанию пн/ср/пт
      if (M.isScheduled(h3, d) && Math.random() > 0.25) set(h3, d, 1);
      // без соцсетей по чётным — реже
      if (M.isScheduled(h4, d) && Math.random() > 0.45) set(h4, d, 1);
    }
    touch();
    return true;
  };

  global.Model = M;
})(window);
