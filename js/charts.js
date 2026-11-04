/* ============================================================
   charts.js — генераторы SVG/HTML-диаграмм (без внешних зависимостей)
   ============================================================ */
(function (global) {
  'use strict';

  const RU = global.RU;
  const Charts = {};

  /* ---------- Кольцевой прогресс ---------- */

  Charts.ring = (percent, opts) => {
    const o = opts || {};
    const size = o.size || 160;
    const stroke = o.stroke || 13;
    const r = (size - stroke) / 2;
    const c = 2 * Math.PI * r;
    const pct = RU.clamp(percent || 0, 0, 100);
    const off = c - (pct / 100) * c;
    const color = o.color || 'var(--accent)';
    return '' +
      '<svg viewBox="0 0 ' + size + ' ' + size + '" width="100%" height="100%" aria-hidden="true">' +
        '<circle class="ring-bg" cx="' + size / 2 + '" cy="' + size / 2 + '" r="' + r +
          '" fill="none" stroke-width="' + stroke + '"/>' +
        '<circle class="ring-fg" cx="' + size / 2 + '" cy="' + size / 2 + '" r="' + r +
          '" fill="none" stroke="' + color + '" stroke-width="' + stroke +
          '" stroke-linecap="round" stroke-dasharray="' + c.toFixed(2) +
          '" stroke-dashoffset="' + off.toFixed(2) + '"/>' +
      '</svg>';
  };

  /* ---------- Вертикальные столбцы (выполнено / пропущено) ---------- */

  Charts.bars = (rows, opts) => {
    const o = opts || {};
    const max = Math.max(1, o.max || rows.reduce((m, r) => Math.max(m, r.scheduled || 0), 0));
    return '<div class="bars">' + rows.map((r) => {
      const total = r.scheduled || 0;
      const done = r.done || 0;
      const miss = Math.max(0, total - done);
      const hDone = total ? (done / max) * 100 : 0;
      const hMiss = total ? (miss / max) * 100 : 0;
      return '<div class="bars__col" title="' + RU.escapeHtml(r.title || r.label) + '">' +
        (o.showValues ? '<span class="bars__val">' + r.rate + '%</span>' : '') +
        '<div class="bars__stack">' +
          (hMiss > 0 ? '<span class="bars__seg bars__seg--miss" style="height:' + hMiss + '%"></span>' : '') +
          (hDone > 0 ? '<span class="bars__seg bars__seg--ok" style="height:' + hDone + '%"></span>' : '') +
        '</div>' +
        '<span class="bars__lab">' + RU.escapeHtml(r.label) + '</span>' +
      '</div>';
    }).join('') + '</div>';
  };

  /* ---------- Горизонтальные полосы (категории, дни недели) ---------- */

  Charts.hbars = (rows) => {
    return '<div class="hbars">' + rows.map((r) => {
      const color = r.color || 'var(--teal)';
      return '<div class="hbar">' +
        '<div class="hbar__head">' +
          '<span>' + (r.icon ? '<span aria-hidden="true">' + r.icon + '</span> ' : '') +
            RU.escapeHtml(r.name) +
            (r.note ? ' <span style="color:var(--muted);font-size:12px">' + RU.escapeHtml(r.note) + '</span>' : '') +
          '</span>' +
          '<b>' + (r.value != null ? r.value : r.rate) + '%</b>' +
        '</div>' +
        '<div class="hbar__track"><span class="hbar__fill" style="width:' + RU.clamp(r.rate || 0, 0, 100) +
          '%;background:' + color + '"></span></div>' +
      '</div>';
    }).join('') + '</div>';
  };

  /* ---------- Тепловая карта (календарь) ---------- */

  Charts.heatmap = (cells, pad) => {
    if (!cells.length) return '<p class="form__hint">Нет данных за выбранный период.</p>';
    const today = RU.today();
    const blanks = new Array(Math.max(0, pad || 0)).fill('<span class="heat-cell is-empty"></span>').join('');
    return '<div class="heatmap">' + blanks + cells.map((c) => {
      const cls = 'heat-cell ' + (c.level ? 'lvl-' + c.level : 'lvl-0') + (c.key === today ? ' is-today' : '');
      const title = RU.formatDate(c.date) + (c.scheduled ? ' — ' + c.done + ' из ' + c.scheduled : ' — нет привычек');
      return '<span class="' + cls + '" title="' + RU.escapeHtml(title) + '"></span>';
    }).join('') + '</div>' +
    '<div class="heat-legend"><span>меньше</span>' +
      '<i style="background:var(--bg-tint)"></i>' +
      '<i style="background:color-mix(in srgb, var(--teal) 33%, var(--bg-tint))"></i>' +
      '<i style="background:color-mix(in srgb, var(--teal) 62%, var(--bg-tint))"></i>' +
      '<i style="background:var(--teal)"></i>' +
      '<span>больше</span></div>';
  };

  /* ---------- Мини-сетка привычки (последние N дней) ---------- */

  Charts.miniGrid = (habit, days) => {
    const n = days || 28;
    const out = [];
    const today = new Date();
    for (let i = n - 1; i >= 0; i--) {
      const d = RU.addDays(today, -i);
      const scheduled = global.Model.isScheduled(habit, d);
      const v = global.Model.value(habit.id, RU.key(d));
      const t = habit.target || 1;
      let cls = '';
      if (scheduled && v >= t) cls = 'lvl-3';
      else if (v > 0) cls = 'lvl-2';
      else if (scheduled) cls = 'lvl-1';
      out.push('<i class="' + cls + '" title="' + RU.escapeHtml(RU.formatDateShort(d)) + '"></i>');
    }
    return '<div class="mini-grid">' + out.join('') + '</div>';
  };

  /* ---------- Линейный график (спарклайн) ---------- */

  Charts.spark = (points) => {
    if (!points || points.length < 2) {
      return '<p class="form__hint" style="padding:40px 0;text-align:center">Нужно минимум два дня с данными для графика.</p>';
    }
    const W = 620, H = 150, padX = 10, padY = 18;
    const minV = 0, maxV = 100;
    const stepX = (W - padX * 2) / (points.length - 1);
    const y = (v) => H - padY - ((v - minV) / (maxV - minV)) * (H - padY * 2);
    const x = (i) => padX + i * stepX;

    let line = '';
    points.forEach((p, i) => { line += (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(p.value).toFixed(1) + ' '; });
    const area = line + 'L' + x(points.length - 1).toFixed(1) + ' ' + (H - padY) + ' L' + padX + ' ' + (H - padY) + ' Z';

    const grid = [0, 50, 100].map((g) =>
      '<line class="grid-line" x1="' + padX + '" y1="' + y(g).toFixed(1) + '" x2="' + (W - padX) +
      '" y2="' + y(g).toFixed(1) + '"/><text x="' + (W - padX) + '" y="' + (y(g) - 4).toFixed(1) +
      '" text-anchor="end" font-size="9" fill="var(--muted)" font-family="var(--font-mono)">' + g + '%</text>'
    ).join('');

    const dots = points.map((p, i) =>
      '<circle cx="' + x(i).toFixed(1) + '" cy="' + y(p.value).toFixed(1) + '" r="3.4"><title>' +
      RU.escapeHtml(p.label + ': ' + p.value + '%') + '</title></circle>'
    ).join('');

    const last = x(points.length - 1).toFixed(1), lastY = y(points[points.length - 1].value).toFixed(1);

    return '<svg class="spark" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" role="img" aria-label="Динамика выполнения">' +
      '<defs><linearGradient id="sparkGrad" x1="0" y1="0" x2="0" y2="1">' +
        '<stop offset="0%" stop-color="var(--accent)" stop-opacity=".30"/>' +
        '<stop offset="100%" stop-color="var(--accent)" stop-opacity="0"/>' +
      '</linearGradient></defs>' +
      grid +
      '<path class="area" d="' + area + '"/>' +
      '<path class="line" d="' + line + '"/>' +
      dots +
      '<circle cx="' + last + '" cy="' + lastY + '" r="5" fill="var(--accent)" stroke="none" opacity=".25"/>' +
    '</svg>';
  };

  global.Charts = Charts;
})(window);
