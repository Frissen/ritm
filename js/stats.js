/* ============================================================
   stats.js — агрегированная аналитика
   ============================================================ */
(function (global) {
  'use strict';

  const RU = global.RU;
  const Store = global.Store;
  const Model = global.Model;
  const S = {};

  function settings() { return Store.state().settings; }

  /* ---------- Периоды ---------- */

  S.range = (type, ref) => {
    const d = ref ? new Date(ref) : new Date();
    const ws = settings().weekStart;
    let from, to, label, prevFrom, prevTo;

    if (type === 'week') {
      from = RU.startOfWeek(d, ws);
      to = RU.addDays(from, 6);
      const pFrom = RU.addDays(from, -7);
      prevFrom = pFrom; prevTo = RU.addDays(pFrom, 6);
      label = RU.formatDateShort(from) + ' — ' + RU.formatDateShort(to);
    } else if (type === 'month') {
      from = RU.startOfMonth(d);
      to = RU.endOfMonth(d);
      prevFrom = RU.startOfMonth(RU.addMonths(from, -1));
      prevTo = RU.endOfMonth(RU.addMonths(from, -1));
      label = RU.monthTitle(from);
    } else if (type === 'year') {
      from = RU.startOfYear(d);
      to = RU.endOfYear(d);
      prevFrom = RU.startOfYear(RU.addMonths(from, -12));
      prevTo = RU.endOfYear(RU.addMonths(from, -12));
      label = String(from.getFullYear());
    } else { // all
      const habits = Model.all();
      const created = habits.length
        ? habits.reduce((min, h) => {
            const c = RU.fromKey(h.createdAtKey || h.createdAt.slice(0, 10));
            return c < min ? c : min;
          }, RU.startOfDay(new Date()))
        : RU.startOfDay(new Date());
      from = created;
      to = RU.startOfDay(d);
      prevFrom = from; prevTo = from;
      label = 'Всё время';
    }
    return { type: type, from: from, to: to, prevFrom: prevFrom, prevTo: prevTo, label: label };
  };

  function inRange(dateKey, range) {
    const dk = RU.fromKey(dateKey);
    return RU.daysBetween(dk, range.from) >= 0 && RU.daysBetween(range.to, dk) >= 0;
  }

  /* ---------- Общая сводка ---------- */

  S.overview = (range) => {
    const habits = Model.active();
    let scheduled = 0, done = 0, partial = 0;
    const activeDays = new Set();

    habits.forEach((h) => {
      const p = Model.periodStats(h, range.from, range.to);
      scheduled += p.scheduled;
      done += p.done;
      const m = Store.state().logs[h.id] || {};
      const t = h.target || 1;
      Object.keys(m).forEach((k) => {
        if (!inRange(k, range)) return;
        activeDays.add(k);
        if (m[k] < t) partial++;
      });
    });

    let prevRate = 0;
    if (range.type !== 'all') {
      let ps = 0, pd = 0;
      habits.forEach((h) => {
        const p = Model.periodStats(h, range.prevFrom, range.prevTo);
        ps += p.scheduled; pd += p.done;
      });
      prevRate = ps ? Math.round(pd / ps * 100) : 0;
    }

    const rate = scheduled ? Math.round(done / scheduled * 100) : 0;
    return {
      scheduled: scheduled,
      done: done,
      missed: scheduled - done,
      partial: partial,
      rate: rate,
      prevRate: prevRate,
      delta: range.type === 'all' ? 0 : rate - prevRate,
      activeDays: activeDays.size,
      habits: habits.length
    };
  };

  /* ---------- Ряд по дням ---------- */

  S.dailySeries = (from, to) => {
    const habits = Model.active();
    const out = [];
    let d = RU.startOfDay(from);
    const end = RU.startOfDay(to);
    let guard = 0;
    while (RU.daysBetween(end, d) >= 0 && guard++ < 400) {
      const key = RU.key(d);
      let scheduled = 0, done = 0;
      habits.forEach((h) => {
        if (Model.isScheduled(h, d)) {
          scheduled++;
          if (Model.value(h.id, key) >= (h.target || 1)) done++;
        }
      });
      out.push({
        key: key, date: new Date(d), scheduled: scheduled, done: done,
        rate: scheduled ? Math.round(done / scheduled * 100) : 0
      });
      d = RU.addDays(d, 1);
    }
    return out;
  };

  /* ---------- Разбивка по категориям ---------- */

  S.byCategory = (range) => {
    const habits = Model.active();
    const map = {};
    Model.categories().forEach((c) => {
      map[c.id] = { id: c.id, name: c.name, color: c.color, icon: c.icon, habits: 0, scheduled: 0, done: 0, rate: 0 };
    });

    habits.forEach((h) => {
      const cid = map[h.categoryId] ? h.categoryId : 'other';
      if (!map[cid]) {
        map[cid] = { id: 'other', name: 'Без категории', color: '#8A6A4F', icon: '⭐', habits: 0, scheduled: 0, done: 0, rate: 0 };
      }
      const p = Model.periodStats(h, range.from, range.to);
      map[cid].habits++;
      map[cid].scheduled += p.scheduled;
      map[cid].done += p.done;
    });

    const list = Object.keys(map).map((k) => map[k]).filter((c) => c.habits > 0);
    list.forEach((c) => { c.rate = c.scheduled ? Math.round(c.done / c.scheduled * 100) : 0; });
    list.sort((a, b) => b.rate - a.rate);
    return list;
  };

  /* ---------- Тепловая карта ---------- */

  S.heatmap = (from, to) => {
    return S.dailySeries(from, to).map((d) => {
      let level = 0;
      if (d.scheduled > 0 && d.done > 0) {
        level = d.rate >= 100 ? 3 : (d.rate >= 60 ? 2 : 1);
      }
      return { key: d.key, date: d.date, level: level, rate: d.rate, done: d.done, scheduled: d.scheduled };
    });
  };

  /* ---------- Разбивка по дням недели ---------- */

  S.byWeekday = (from, to) => {
    const ws = settings().weekStart;
    const acc = [];
    for (let i = 0; i < 7; i++) acc.push({ idx: i, label: RU.WEEKDAYS_SHORT[(ws + i) % 7], scheduled: 0, done: 0, rate: 0 });
    S.dailySeries(from, to).forEach((d) => {
      const wi = (d.date.getDay() - ws + 7) % 7;
      acc[wi].scheduled += d.scheduled;
      acc[wi].done += d.done;
    });
    acc.forEach((a) => { a.rate = a.scheduled ? Math.round(a.done / a.scheduled * 100) : 0; });
    return acc;
  };

  /* ---------- Рейтинг серий ---------- */

  S.streakBoard = (limit) => {
    const list = Model.active().map((h) => ({
      habit: h,
      current: Model.currentStreak(h),
      best: Model.bestStreak(h),
      total: Model.totalDone(h)
    }));
    list.sort((a, b) => b.current - a.current || b.best - a.best);
    return limit ? list.slice(0, limit) : list;
  };

  /* ---------- Динамика выполнения ---------- */

  S.rateTrend = (from, to, bucket) => {
    const series = S.dailySeries(from, to).filter((d) => d.scheduled > 0);
    if (!bucket || bucket <= 1) {
      return series.map((d) => ({ label: RU.formatDateShort(d.date), value: d.rate, date: d.date }));
    }
    const out = [];
    for (let i = 0; i < series.length; i += bucket) {
      const chunk = series.slice(i, i + bucket);
      const s = chunk.reduce((a, x) => a + x.scheduled, 0);
      const dn = chunk.reduce((a, x) => a + x.done, 0);
      out.push({
        label: RU.formatDateShort(chunk[0].date),
        value: s ? Math.round(dn / s * 100) : 0,
        date: chunk[0].date
      });
    }
    return out;
  };

  /* ---------- Таблица недели ---------- */

  S.weekMatrix = (ref) => {
    const ws = settings().weekStart;
    const start = RU.startOfWeek(ref || new Date(), ws);
    const days = [];
    for (let i = 0; i < 7; i++) days.push(RU.addDays(start, i));
    const today = RU.startOfDay(new Date());
    const habits = Model.active().filter((h) => days.some((d) => Model.isScheduled(h, d)));
    const rows = habits.map((h) => ({
      habit: h,
      cells: days.map((d) => {
        const scheduled = Model.isScheduled(h, d);
        const key = RU.key(d);
        const v = Model.value(h.id, key);
        const t = h.target || 1;
        return {
          date: d, key: key, scheduled: scheduled,
          done: v >= t,
          partial: v > 0 && v < t,
          future: RU.daysBetween(d, today) < 0
        };
      })
    }));
    return { days: days, rows: rows };
  };

  /* ---------- Сравнение недель ---------- */

  S.weeklyComparison = (weeks) => {
    const out = [];
    const ws = settings().weekStart;
    const base = RU.startOfWeek(new Date(), ws);
    for (let i = weeks - 1; i >= 0; i--) {
      const from = RU.addDays(base, -7 * i);
      const to = RU.addDays(from, 6);
      const r = { from: from, to: to, label: RU.formatDateShort(from), scheduled: 0, done: 0, rate: 0 };
      Model.active().forEach((h) => {
        const p = Model.periodStats(h, from, to);
        r.scheduled += p.scheduled; r.done += p.done;
      });
      r.rate = r.scheduled ? Math.round(r.done / r.scheduled * 100) : 0;
      out.push(r);
    }
    return out;
  };

  global.Stats = S;
})(window);
