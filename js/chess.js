/* ============================================================
   chess.js — шахматный модуль «Ритм».
   Полные правила (рокировка, взятие на проходе, превращение),
   определение шаха/мата/пата/ничьей, ИИ (негамакс с альфа-бета),
   нотация SAN, интерфейс доски, статистика партий.

   Публичный интерфейс модуля:
     window.Chess = { route, label, subtitle(), mount(host), engine }
   Движок доступен как Chess.engine для автотестов:
     Chess.engine.initial(), .legalMoves(st), .make/.unmake,
     .attacked(st,idx,color), .status(st), .san(st,move),
     .idxToAlg(i), .findMove(st,from,to,promo)
   ============================================================ */
(function (global) {
  'use strict';

  const RU = global.RU;
  const Store = global.Store;
  const UI = global.UI;

  const FILES = 'abcdefgh';
  const GLYPH = { k: '\u265A', q: '\u265B', r: '\u265C', b: '\u265D', n: '\u265E', p: '\u265F' };
  const START_COUNT = { p: 8, n: 2, b: 2, r: 2, q: 1 };

  const idxToAlg = (i) => FILES[i % 8] + (8 - Math.floor(i / 8));
  const algToIdx = (a) => (8 - parseInt(a[1], 10)) * 8 + FILES.indexOf(a[0]);
  const isWhite = (p) => !!p && p === p.toUpperCase();
  const colorOf = (p) => (isWhite(p) ? 'w' : 'b');
  const opp = (c) => (c === 'w' ? 'b' : 'w');

  /* ============================================================
     Позиция и правила
     ============================================================ */

  function key(st) {
    return st.board.map((p) => p || '.').join('') + st.turn +
      (st.castling.wk ? 'K' : '') + (st.castling.wq ? 'Q' : '') +
      (st.castling.bk ? 'k' : '') + (st.castling.bq ? 'q' : '');
  }

  function initial() {
    const b = new Array(64).fill(null);
    const back = ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'];
    for (let f = 0; f < 8; f++) {
      b[f] = back[f];
      b[8 + f] = 'p';
      b[48 + f] = 'P';
      b[56 + f] = back[f].toUpperCase();
    }
    const st = {
      board: b, turn: 'w',
      castling: { wk: true, wq: true, bk: true, bq: true },
      ep: null, halfmove: 0, fullmove: 1,
      undoStack: [], positions: []
    };
    st.positions.push(key(st));
    return st;
  }

  function kingIndex(board, color) {
    const k = color === 'w' ? 'K' : 'k';
    for (let i = 0; i < 64; i++) if (board[i] === k) return i;
    return -1;
  }

  /** Атакована ли клетка target фигурами цвета by */
  function attacked(st, target, by) {
    const b = st.board;
    const tf = target % 8;
    const tr = (target - tf) / 8;

    // пешки
    const pr = by === 'w' ? tr + 1 : tr - 1;
    const pp = by === 'w' ? 'P' : 'p';
    if (pr >= 0 && pr < 8) {
      if (tf - 1 >= 0 && b[pr * 8 + tf - 1] === pp) return true;
      if (tf + 1 < 8 && b[pr * 8 + tf + 1] === pp) return true;
    }
    // кони
    const KN = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
    const kn = by === 'w' ? 'N' : 'n';
    for (let i = 0; i < 8; i++) {
      const r = tr + KN[i][0], f = tf + KN[i][1];
      if (r >= 0 && r < 8 && f >= 0 && f < 8 && b[r * 8 + f] === kn) return true;
    }
    // король
    const kg = by === 'w' ? 'K' : 'k';
    for (let dr = -1; dr <= 1; dr++) {
      for (let df = -1; df <= 1; df++) {
        if (!dr && !df) continue;
        const r = tr + dr, f = tf + df;
        if (r >= 0 && r < 8 && f >= 0 && f < 8 && b[r * 8 + f] === kg) return true;
      }
    }
    // дальнобойные
    const DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [-1, 1], [1, -1], [1, 1]];
    for (let d = 0; d < 8; d++) {
      const dr = DIRS[d][0], df = DIRS[d][1];
      let r = tr + dr, f = tf + df;
      while (r >= 0 && r < 8 && f >= 0 && f < 8) {
        const p = b[r * 8 + f];
        if (p) {
          if (colorOf(p) === by) {
            const lc = p.toLowerCase();
            const orth = (dr === 0 || df === 0);
            if (lc === 'q' || (orth ? lc === 'r' : lc === 'b')) return true;
          }
          break;
        }
        r += dr; f += df;
      }
    }
    return false;
  }

  function inCheck(st, color) {
    const ki = kingIndex(st.board, color);
    return ki >= 0 && attacked(st, ki, opp(color));
  }

  function addPawnMoves(out, from, to, promoRow, row, cap) {
    if (row === promoRow) {
      ['q', 'r', 'b', 'n'].forEach((pr) => out.push({ from, to, promo: pr, capture: cap }));
    } else {
      out.push({ from, to, capture: cap });
    }
  }

  function genPseudo(st, color) {
    const b = st.board;
    const out = [];
    const up = color === 'w';
    for (let i = 0; i < 64; i++) {
      const p = b[i];
      if (!p || colorOf(p) !== color) continue;
      const t = p.toLowerCase();
      const r = Math.floor(i / 8), f = i % 8;

      if (t === 'p') {
        const dr = up ? -1 : 1;
        const startR = up ? 6 : 1;
        const promoR = up ? 0 : 7;
        const nr = r + dr;
        if (nr >= 0 && nr < 8) {
          if (!b[nr * 8 + f]) {
            addPawnMoves(out, i, nr * 8 + f, promoR, nr, false);
            if (r === startR && !b[(r + 2 * dr) * 8 + f]) out.push({ from: i, to: (r + 2 * dr) * 8 + f, double: true });
          }
          for (let df = -1; df <= 1; df += 2) {
            const nf = f + df;
            if (nf < 0 || nf > 7) continue;
            const t2 = nr * 8 + nf;
            if (b[t2] && colorOf(b[t2]) !== color) addPawnMoves(out, i, t2, promoR, nr, true);
            else if (!b[t2] && st.ep === t2) out.push({ from: i, to: t2, ep: true, capture: true });
          }
        }
      } else if (t === 'n' || t === 'k') {
        const OFF = t === 'n'
          ? [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]]
          : [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
        for (let k = 0; k < OFF.length; k++) {
          const nr2 = r + OFF[k][0], nf2 = f + OFF[k][1];
          if (nr2 < 0 || nr2 > 7 || nf2 < 0 || nf2 > 7) continue;
          const tgt = nr2 * 8 + nf2;
          if (!b[tgt] || colorOf(b[tgt]) !== color) out.push({ from: i, to: tgt, capture: !!b[tgt] });
        }
        // рокировка
        if (t === 'k' && !attacked(st, i, opp(color))) {
          if (color === 'w' && i === 60) {
            if (st.castling.wk && b[63] === 'R' && !b[61] && !b[62] &&
              !attacked(st, 61, 'b') && !attacked(st, 62, 'b')) out.push({ from: 60, to: 62, castle: 'k' });
            if (st.castling.wq && b[56] === 'R' && !b[57] && !b[58] && !b[59] &&
              !attacked(st, 59, 'b') && !attacked(st, 58, 'b')) out.push({ from: 60, to: 58, castle: 'q' });
          } else if (color === 'b' && i === 4) {
            if (st.castling.bk && b[7] === 'r' && !b[5] && !b[6] &&
              !attacked(st, 5, 'w') && !attacked(st, 6, 'w')) out.push({ from: 4, to: 6, castle: 'k' });
            if (st.castling.bq && b[0] === 'r' && !b[1] && !b[2] && !b[3] &&
              !attacked(st, 3, 'w') && !attacked(st, 2, 'w')) out.push({ from: 4, to: 2, castle: 'q' });
          }
        }
      } else {
        const DIRS = t === 'b'
          ? [[-1, -1], [-1, 1], [1, -1], [1, 1]]
          : t === 'r' ? [[-1, 0], [1, 0], [0, -1], [0, 1]]
            : [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [-1, 1], [1, -1], [1, 1]];
        for (let d = 0; d < DIRS.length; d++) {
          let r2 = r + DIRS[d][0], f2 = f + DIRS[d][1];
          while (r2 >= 0 && r2 < 8 && f2 >= 0 && f2 < 8) {
            const tgt = r2 * 8 + f2;
            if (!b[tgt]) out.push({ from: i, to: tgt });
            else {
              if (colorOf(b[tgt]) !== color) out.push({ from: i, to: tgt, capture: true });
              break;
            }
            r2 += DIRS[d][0]; f2 += DIRS[d][1];
          }
        }
      }
    }
    return out;
  }

  function make(st, m) {
    const b = st.board;
    const piece = b[m.from];
    const color = colorOf(piece);
    const u = {
      move: m, piece, captured: null, capIdx: -1,
      castling: Object.assign({}, st.castling),
      ep: st.ep, halfmove: st.halfmove, fullmove: st.fullmove, key: st.positions.pop()
    };
    b[m.from] = null;

    if (m.ep) {
      const capIdx = m.to + (color === 'w' ? 8 : -8);
      u.captured = b[capIdx]; u.capIdx = capIdx; b[capIdx] = null;
    } else if (b[m.to]) {
      u.captured = b[m.to]; u.capIdx = m.to;
    }
    b[m.to] = m.promo ? (color === 'w' ? m.promo.toUpperCase() : m.promo) : piece;

    if (m.castle === 'k') { b[m.to - 1] = b[m.to + 1]; b[m.to + 1] = null; }
    else if (m.castle === 'q') { b[m.to + 1] = b[m.to - 2]; b[m.to - 2] = null; }

    const c = st.castling;
    if (piece === 'K') { c.wk = c.wq = false; }
    if (piece === 'k') { c.bk = c.bq = false; }
    if (m.from === 63 || m.to === 63) c.wk = false;
    if (m.from === 56 || m.to === 56) c.wq = false;
    if (m.from === 7 || m.to === 7) c.bk = false;
    if (m.from === 0 || m.to === 0) c.bq = false;

    st.ep = null;
    if (m.double) st.ep = (m.from + m.to) / 2;
    if (piece.toLowerCase() === 'p' || u.captured) st.halfmove = 0; else st.halfmove++;
    if (color === 'b') st.fullmove++;
    st.turn = opp(color);

    st.undoStack.push(u);
    st.positions.push(key(st));
    return u;
  }

  function unmake(st) {
    const u = st.undoStack.pop();
    if (!u) return;
    const m = u.move, b = st.board;
    b[m.from] = u.piece;
    b[m.to] = null;
    if (u.capIdx >= 0) b[u.capIdx] = u.captured;
    if (m.castle === 'k') { b[m.to + 1] = b[m.to - 1]; b[m.to - 1] = null; }
    else if (m.castle === 'q') { b[m.to - 2] = b[m.to + 1]; b[m.to + 1] = null; }
    st.castling = u.castling;
    st.ep = u.ep;
    st.halfmove = u.halfmove;
    st.fullmove = u.fullmove;
    st.turn = colorOf(u.piece);
    st.positions.pop();
    st.positions.push(u.key);
  }

  function legalMoves(st) {
    const color = st.turn;
    const res = [];
    const pseudo = genPseudo(st, color);
    for (let i = 0; i < pseudo.length; i++) {
      make(st, pseudo[i]);
      const ki = kingIndex(st.board, color);
      const bad = ki < 0 || attacked(st, ki, opp(color));
      unmake(st);
      if (!bad) res.push(pseudo[i]);
    }
    return res;
  }

  function insufficientMaterial(st) {
    const pieces = [];
    for (let i = 0; i < 64; i++) {
      const p = st.board[i];
      if (p && p.toLowerCase() !== 'k') pieces.push({ p: p.toLowerCase(), i, c: colorOf(p) });
    }
    if (!pieces.length) return true;                                   // K vs K
    if (pieces.length === 1 && (pieces[0].p === 'b' || pieces[0].p === 'n')) return true;
    if (pieces.length === 2 && pieces[0].p === 'b' && pieces[1].p === 'b') {
      const cc = (x) => (((x.i % 8) + Math.floor(x.i / 8)) % 2);
      if (pieces[0].c !== pieces[1].c && cc(pieces[0]) === cc(pieces[1])) return true;
    }
    return false;
  }

  function repetitionCount(st) {
    const k = st.positions[st.positions.length - 1];
    let n = 0;
    for (let i = 0; i < st.positions.length; i++) if (st.positions[i] === k) n++;
    return n;
  }

  /** Текущий статус партии */
  function status(st) {
    const moves = legalMoves(st);
    const check = inCheck(st, st.turn);
    if (!moves.length) {
      return check
        ? { over: true, result: opp(st.turn), reason: 'мат' }
        : { over: true, result: 'draw', reason: 'пат' };
    }
    if (st.halfmove >= 100) return { over: true, result: 'draw', reason: 'правило 50 ходов' };
    if (insufficientMaterial(st)) return { over: true, result: 'draw', reason: 'недостаточно фигур' };
    if (repetitionCount(st) >= 3) return { over: true, result: 'draw', reason: 'троекратное повторение' };
    return { over: false, result: null, reason: check ? 'шах' : '' };
  }

  function findMove(st, from, to, promo) {
    const list = legalMoves(st);
    for (let i = 0; i < list.length; i++) {
      const m = list[i];
      if (m.from === from && m.to === to && (!m.promo || m.promo === promo)) return m;
    }
    return null;
  }

  /** Нотация SAN для хода (ход должен быть легальным) */
  function san(st, m) {
    if (m.castle) return m.castle === 'k' ? 'O-O' : 'O-O-O';
    const piece = st.board[m.from];
    const t = piece.toLowerCase();
    let s = '';
    if (t === 'p') {
      if (m.capture) s += FILES[m.from % 8] + 'x';
      s += idxToAlg(m.to);
      if (m.promo) s += '=' + m.promo.toUpperCase();
    } else {
      s += t.toUpperCase();
      const others = legalMoves(st).filter((o) => o.to === m.to && o.from !== m.from &&
        st.board[o.from] && st.board[o.from].toLowerCase() === t);
      if (others.length) {
        const fromF = m.from % 8, fromR = Math.floor(m.from / 8);
        const sameFile = others.some((o) => o.from % 8 === fromF);
        const sameRank = others.some((o) => Math.floor(o.from / 8) === fromR);
        if (!sameFile) s += FILES[fromF];
        else if (!sameRank) s += String(8 - fromR);
        else s += FILES[fromF] + String(8 - fromR);
      }
      if (m.capture) s += 'x';
      s += idxToAlg(m.to);
    }
    make(st, m);
    const ck = inCheck(st, st.turn);
    const noMoves = legalMoves(st).length === 0;
    unmake(st);
    if (ck) s += noMoves ? '#' : '+';
    return s;
  }

  /* ============================================================
     ИИ: негамакс с альфа-бета отсечением
     ============================================================ */

  const VAL = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };
  const PST = {
    p: [0,0,0,0,0,0,0,0, 50,50,50,50,50,50,50,50, 10,10,20,30,30,20,10,10, 5,5,10,25,25,10,5,5,
        0,0,0,20,20,0,0,0, 5,-5,-10,0,0,-10,-5,5, 5,10,10,-20,-20,10,10,5, 0,0,0,0,0,0,0,0],
    n: [-50,-40,-30,-30,-30,-30,-40,-50, -40,-20,0,0,0,0,-20,-40, -30,0,10,15,15,10,0,-30,
        -30,5,15,20,20,15,5,-30, -30,0,15,20,20,15,0,-30, -30,5,10,15,15,10,5,-30,
        -40,-20,0,5,5,0,-20,-40, -50,-40,-30,-30,-30,-30,-40,-50],
    b: [-20,-10,-10,-10,-10,-10,-10,-20, -10,0,0,0,0,0,0,-10, -10,0,5,10,10,5,0,-10,
        -10,5,5,10,10,5,5,-10, -10,0,10,10,10,10,0,-10, -10,10,10,10,10,10,10,-10,
        -10,5,0,0,0,0,5,-10, -20,-10,-10,-10,-10,-10,-10,-20],
    r: [0,0,0,0,0,0,0,0, 5,10,10,10,10,10,10,5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5,
        -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, 0,0,0,5,5,0,0,0],
    q: [-20,-10,-10,-5,-5,-10,-10,-20, -10,0,0,0,0,0,0,-10, -10,0,5,5,5,5,0,-10,
        -5,0,5,5,5,5,0,-5, 0,0,5,5,5,5,0,-5, -10,5,5,5,5,5,0,-10,
        -10,0,5,0,0,0,0,-10, -20,-10,-10,-5,-5,-10,-10,-20],
    k: [-30,-40,-40,-50,-50,-40,-40,-30, -30,-40,-40,-50,-50,-40,-40,-30, -30,-40,-40,-50,-50,-40,-40,-30,
        -30,-40,-40,-50,-50,-40,-40,-30, -20,-30,-30,-40,-40,-30,-30,-20, -10,-20,-20,-20,-20,-20,-20,-10,
        20,20,0,0,0,0,20,20, 20,30,10,0,0,10,30,20]
  };
  const mirror = (i) => (7 - Math.floor(i / 8)) * 8 + (i % 8);

  function evaluate(st) {
    let s = 0;
    for (let i = 0; i < 64; i++) {
      const p = st.board[i];
      if (!p) continue;
      const w = isWhite(p);
      const t = p.toLowerCase();
      const v = VAL[t] + (PST[t] ? PST[t][w ? i : mirror(i)] : 0);
      s += w ? v : -v;
    }
    return s;
  }

  const evalSide = (st) => (st.turn === 'w' ? 1 : -1) * evaluate(st);
  const MATE = 1000000;

  function search(st, depth, alpha, beta, ctx) {
    ctx.nodes++;
    const moves = legalMoves(st);
    if (!moves.length) return inCheck(st, st.turn) ? -MATE + (10 - depth) * 1000 : 0;
    if (depth <= 0 || ctx.nodes > ctx.cap) return evalSide(st);

    moves.sort((a, b) => scoreMove(st, b) - scoreMove(st, a));
    let best = -Infinity;
    for (let i = 0; i < moves.length; i++) {
      make(st, moves[i]);
      const sc = -search(st, depth - 1, -beta, -alpha, ctx);
      unmake(st);
      if (sc > best) best = sc;
      if (best > alpha) alpha = best;
      if (alpha >= beta) break;
    }
    return best;
  }

  function scoreMove(st, m) {
    let s = 0;
    if (m.capture) s += 10 + (st.board[m.to] ? VAL[st.board[m.to].toLowerCase()] / 10 : 1);
    if (m.promo) s += 90;
    return s;
  }

  /** Лучший ход для стороны, которая ходит. randomTail — для лёгких уровней */
  function bestMove(st, depth, randomTail) {
    const moves = legalMoves(st);
    if (!moves.length) return null;
    moves.sort((a, b) => scoreMove(st, b) - scoreMove(st, a));
    const ctx = { nodes: 0, cap: 160000 };
    let best = null, bestScore = -Infinity;
    const scored = [];
    for (let i = 0; i < moves.length; i++) {
      make(st, moves[i]);
      const sc = -search(st, depth - 1, -Infinity, Infinity, ctx);
      unmake(st);
      scored.push({ m: moves[i], sc });
      if (sc > bestScore) { bestScore = sc; best = moves[i]; }
    }
    if (randomTail) {
      const pool = scored.filter((x) => x.sc >= bestScore - randomTail);
      best = pool[(Math.random() * pool.length) | 0].m;
    }
    return best;
  }

  /* ============================================================
     Интерфейс
     ============================================================ */

  const ui = {
    st: null, selected: -1, moves: [], flip: false, level: 2,
    playerColor: 'w', sideChoice: 'w', thinking: false, timer: 0,
    lastMove: null, log: [], hint: null, recordedEntry: null
  };

  const aiColor = () => opp(ui.playerColor);
  const sideName = (c) => (c === 'w' ? 'белые' : 'чёрные');
  const pieceCls = (c) => (c === 'w' ? 'is-w' : 'is-b');

  function store() { return Store.state().chess; }

  function capturedList() {
    const counts = {};
    for (let i = 0; i < 64; i++) {
      const p = ui.st.board[i];
      if (!p || p.toLowerCase() === 'k') continue;
      const k = colorOf(p) + p.toLowerCase();
      counts[k] = (counts[k] || 0) + 1;
    }
    const out = { w: [], b: [] };   // что потеряно
    ['w', 'b'].forEach((c) => {
      ['q', 'r', 'b', 'n', 'p'].forEach((t) => {
        const lost = START_COUNT[t] - (counts[c + t] || 0);
        for (let i = 0; i < lost; i++) out[c].push(t);
      });
    });
    return out;
  }

  function materialScore() {
    let s = 0;
    for (let i = 0; i < 64; i++) {
      const p = ui.st.board[i];
      if (!p) continue;
      const v = VAL[p.toLowerCase()];
      s += isWhite(p) ? v : -v;
    }
    return Math.round(s / 100 * 10) / 10;
  }

  /* ---------- Разметка ---------- */

  function opt(value, label, current) {
    return '<option value="' + value + '"' +
      (String(value) === String(current) ? ' selected' : '') + '>' + label + '</option>';
  }

  function template() {
    return '' +
      '<div class="ch">' +
        '<div class="ch__main">' +
          '<div class="ch__head">' +
            '<span class="ch__turn" id="chTurn">—</span>' +
            '<span class="ch__eval" id="chEval"></span>' +
          '</div>' +
          '<div class="ch-board" id="chBoard" role="grid" aria-label="Шахматная доска"></div>' +
          '<div class="ch__bar">' +
            '<button class="btn btn--sm btn--accent" data-ch="new">Новая партия</button>' +
            '<button class="btn btn--sm btn--ghost" data-ch="undo">Отменить</button>' +
            '<button class="btn btn--sm btn--ghost" data-ch="hint">Подсказка</button>' +
            '<button class="btn btn--sm btn--ghost" data-ch="flip">Перевернуть</button>' +
          '</div>' +
        '</div>' +
        '<aside class="ch__side">' +
          '<section class="card ch-panel">' +
            '<h3>Соперник</h3>' +
            '<label class="field"><span class="field__label">Уровень</span>' +
              '<select class="ch-select" data-ch="level">' +
                opt(1, 'Новичок', ui.level) +
                opt(2, 'Любитель', ui.level) +
                opt(3, 'Клубный игрок', ui.level) +
              '</select></label>' +
            '<label class="field"><span class="field__label">Играю за</span>' +
              '<select class="ch-select" data-ch="side">' +
                opt('w', 'Белые', ui.sideChoice) +
                opt('b', 'Чёрные', ui.sideChoice) +
                opt('r', 'Случайно', ui.sideChoice) +
              '</select></label>' +
            '<p class="ch-note" id="chNote">Вы играете за <b>' + sideName(ui.playerColor) +
              '</b>. Уровень влияет на глубину расчёта ИИ.</p>' +
          '</section>' +
          '<section class="card ch-panel">' +
            '<h3>Статистика</h3>' +
            '<div class="ch-stats" id="chStats"></div>' +
          '</section>' +
          '<section class="card ch-panel">' +
            '<h3>Взятые фигуры</h3>' +
            '<div class="ch-cap" id="chCaptured"></div>' +
          '</section>' +
          '<section class="card ch-panel ch-moves">' +
            '<h3>История ходов</h3>' +
            '<div class="ch-movelist" id="chMoves"></div>' +
          '</section>' +
        '</aside>' +
      '</div>';
  }

  function pieceHTML(p) {
    return '<span class="ch-piece ' + (isWhite(p) ? 'is-w' : 'is-b') + '">' + GLYPH[p.toLowerCase()] + '</span>';
  }

  function renderBoard(host) {
    const boardEl = host.querySelector('#chBoard');
    const st = ui.st;
    const order = [];
    for (let i = 0; i < 64; i++) order.push(i);
    if (ui.flip) order.reverse();

    const checkKi = inCheck(st, st.turn) ? kingIndex(st.board, st.turn) : -1;
    let html = '';
    for (let n = 0; n < 64; n++) {
      const i = order[n];
      const r = Math.floor(i / 8), f = i % 8;
      const light = (r + f) % 2 === 0;
      const p = st.board[i];
      const cls = ['ch-sq', light ? 'is-light' : 'is-dark'];
      if (i === ui.selected) cls.push('is-sel');
      if (ui.lastMove && (i === ui.lastMove.from || i === ui.lastMove.to)) cls.push('is-last');
      if (ui.hint && (i === ui.hint.from || i === ui.hint.to)) cls.push('is-hint');
      if (i === checkKi) cls.push('is-check');
      if (ui.moves.some((m) => m.to === i)) cls.push(p || ui.st.ep === i ? 'is-cap' : 'is-move');
      let inner = '';
      if (p) inner += pieceHTML(p);
      if (!ui.flip && f === 0) inner += '<span class="ch-coord ch-coord--rank">' + (8 - r) + '</span>';
      if (ui.flip && f === 7) inner += '<span class="ch-coord ch-coord--rank">' + (8 - r) + '</span>';
      if (!ui.flip && r === 7) inner += '<span class="ch-coord ch-coord--file">' + FILES[f] + '</span>';
      if (ui.flip && r === 0) inner += '<span class="ch-coord ch-coord--file">' + FILES[f] + '</span>';
      html += '<button type="button" class="' + cls.join(' ') + '" data-sq="' + i + '" ' +
        'aria-label="' + idxToAlg(i) + '">' + inner + '</button>';
    }
    boardEl.innerHTML = html;
  }

  function renderSide(host) {
    const st = ui.st;
    const stt = status(st);

    const turnEl = host.querySelector('#chTurn');
    if (stt.over) {
      turnEl.textContent = stt.result === 'draw' ? 'Ничья — ' + stt.reason
        : (stt.result === ui.playerColor ? 'Вы победили — ' + stt.reason : 'Вы проиграли — ' + stt.reason);
      turnEl.className = 'ch__turn is-over';
    } else if (ui.thinking) {
      turnEl.textContent = 'Соперник думает…';
      turnEl.className = 'ch__turn is-think';
    } else if (st.turn === ui.playerColor) {
      turnEl.textContent = stt.reason === 'шах' ? 'Вам шах!' : 'Ваш ход';
      turnEl.className = 'ch__turn' + (stt.reason === 'шах' ? ' is-check' : '');
    } else {
      turnEl.textContent = 'Ход соперника';
      turnEl.className = 'ch__turn';
    }

    const evalEl = host.querySelector('#chEval');
    const m = materialScore();
    evalEl.textContent = (m > 0 ? '+' : '') + (m === 0 ? 'равенство' : m);

    const s = store().stats;
    host.querySelector('#chStats').innerHTML =
      '<div class="ch-stat"><b>' + s.wins + '</b><span>побед</span></div>' +
      '<div class="ch-stat"><b>' + s.draws + '</b><span>ничьих</span></div>' +
      '<div class="ch-stat"><b>' + s.losses + '</b><span>поражений</span></div>';

    const cap = capturedList();
    const capHTML = (arr, cls) => arr.length
      ? arr.map((t) => '<span class="ch-cap__p ' + cls + '">' + GLYPH[t] + '</span>').join('')
      : '<span class="ch-cap__none">—</span>';
    // «Вы» — фигуры, которые вы взяли (их потерял соперник), цвет соперника.
    // «Соперник» — фигуры, которые он взял (их потеряли вы), ваш цвет.
    host.querySelector('#chCaptured').innerHTML =
      '<div class="ch-cap__row"><span class="ch-cap__lab">Вы</span>' +
      '<span class="ch-cap__num">' + cap[aiColor()].length + '</span>' +
      '</div><div class="ch-cap__row ch-cap__row--pieces">' + capHTML(cap[aiColor()], pieceCls(aiColor())) + '</div>' +
      '<div class="ch-cap__row"><span class="ch-cap__lab">Соперник</span>' +
      '<span class="ch-cap__num">' + cap[ui.playerColor].length + '</span>' +
      '</div><div class="ch-cap__row ch-cap__row--pieces">' + capHTML(cap[ui.playerColor], pieceCls(ui.playerColor)) + '</div>';

    const note = host.querySelector('#chNote');
    if (note) note.innerHTML = 'Вы играете за <b>' + sideName(ui.playerColor) +
      '</b>. Уровень влияет на глубину расчёта ИИ.';

    const list = host.querySelector('#chMoves');
    if (!ui.log.length) list.innerHTML = '<p class="ch-movelist__empty">Ходов пока нет</p>';
    else {
      let rows = '';
      for (let i = 0; i < ui.log.length; i += 2) {
        const no = i / 2 + 1;
        rows += '<div class="ch-mv__row"><span class="ch-mv__no">' + no + '.</span>' +
          '<span class="ch-mv__w">' + RU.escapeHtml(ui.log[i] || '') + '</span>' +
          '<span class="ch-mv__b">' + RU.escapeHtml(ui.log[i + 1] || '') + '</span></div>';
      }
      list.innerHTML = rows;
      list.scrollTop = list.scrollHeight;
    }
  }

  function syncControls(host) {
    const lvl = host.querySelector('[data-ch="level"]');
    if (lvl) lvl.value = String(ui.level);
    const side = host.querySelector('[data-ch="side"]');
    if (side) side.value = ui.sideChoice;
  }

  function render(host) {
    renderBoard(host);
    renderSide(host);
    syncControls(host);
  }

  /* ---------- Логика игры ---------- */

  function newGame(host, choice) {
    if (choice) ui.sideChoice = choice;
    ui.playerColor = ui.sideChoice === 'r'
      ? (Math.random() < 0.5 ? 'w' : 'b') : ui.sideChoice;
    if (ui.timer) { clearTimeout(ui.timer); ui.timer = 0; }
    ui.st = initial();
    ui.selected = -1;
    ui.moves = [];
    ui.lastMove = null;
    ui.log = [];
    ui.hint = null;
    ui.thinking = false;
    ui.recordedEntry = null;
    ui.flip = ui.playerColor === 'b';
    render(host);
    if (ui.st.turn === aiColor()) scheduleAI(host);
  }

  function scheduleAI(host) {
    if (ui.thinking) return;
    if (ui.st.turn !== aiColor()) return;
    if (status(ui.st).over) return;
    ui.thinking = true;
    renderSide(host);
    ui.timer = setTimeout(() => {
      ui.timer = 0;
      if (ui.st.turn !== aiColor()) { ui.thinking = false; renderSide(host); return; }
      const depth = ui.level;
      const randomTail = ui.level === 1 ? 90 : 0;
      let m = null;
      try {
        m = bestMove(ui.st, depth, randomTail);
      } catch (err) {
        m = null;
      } finally {
        ui.thinking = false;
      }
      if (m) applyMove(host, m);
      else render(host);
    }, 260);
  }

  function applyMove(host, m) {
    ui.log.push(san(ui.st, m));
    make(ui.st, m);
    ui.lastMove = { from: m.from, to: m.to };
    ui.selected = -1;
    ui.moves = [];
    ui.hint = null;
    render(host);
    const stt = status(ui.st);
    if (stt.over) finishGame(host, stt);
    else if (ui.st.turn === aiColor()) scheduleAI(host);
    else UI.beep();
  }

  function finishGame(host, stt) {
    if (ui.recordedEntry) return;
    const data = store();
    if (stt.result === 'draw') data.stats.draws++;
    else if (stt.result === ui.playerColor) { data.stats.wins++; UI.confetti(34); }
    else data.stats.losses++;
    const entry = {
      at: new Date().toISOString(),
      result: stt.result, reason: stt.reason,
      level: ui.level, side: ui.playerColor,
      moves: ui.log.slice()
    };
    data.games.unshift(entry);
    if (data.games.length > 20) data.games.length = 20;
    ui.recordedEntry = entry;
    Store.save(true);
    renderSide(host);
    UI.toast({
      icon: stt.result === ui.playerColor ? '🏆' : stt.result === 'draw' ? '🤝' : '♟',
      title: stt.result === 'draw' ? 'Ничья' : (stt.result === ui.playerColor ? 'Победа!' : 'Поражение'),
      text: 'Причина: ' + stt.reason,
      kind: stt.result === ui.playerColor ? 'ok' : undefined
    });
  }

  function onSquare(host, i) {
    if (ui.thinking) return;
    const stt = status(ui.st);
    if (stt.over || ui.st.turn !== ui.playerColor) return;
    const p = ui.st.board[i];

    if (ui.selected >= 0 && ui.moves.some((m) => m.to === i)) {
      const cand = ui.moves.filter((m) => m.to === i);
      if (cand.length > 1 && cand[0].promo) {
        askPromotion(host, cand);
      } else {
        applyMove(host, cand[0]);
      }
      return;
    }
    if (p && colorOf(p) === ui.playerColor) {
      ui.selected = i;
      ui.moves = legalMoves(ui.st).filter((m) => m.from === i);
      ui.hint = null;
      renderBoard(host);
    } else {
      ui.selected = -1;
      ui.moves = [];
      renderBoard(host);
    }
  }

  function askPromotion(host, cand) {
    const cls = pieceCls(ui.playerColor);
    const body = '<div class="ch-promo">' + ['q', 'r', 'b', 'n'].map((t) =>
      '<button type="button" class="ch-promo__btn" data-promo="' + t + '">' +
      '<span class="ch-piece ' + cls + '">' + GLYPH[t] + '</span></button>').join('') + '</div>';
    UI.openModal({
      title: 'Превращение пешки', body: body, noFocus: true,
      onMount: (b) => {
        b.querySelectorAll('[data-promo]').forEach((btn) => {
          btn.addEventListener('click', () => {
            const t = btn.getAttribute('data-promo');
            UI.closeModal();
            const m = cand.find((x) => x.promo === t);
            if (m) applyMove(host, m);
          });
        });
      }
    });
  }

  function undo(host) {
    if (ui.thinking || !ui.st.undoStack.length) return;
    // Если партия уже завершена и записана в статистику, откатываем и запись,
    // иначе после «Отменить» счётчик побед/поражений разойдётся с доской.
    if (ui.recordedEntry) {
      const data = store();
      const idx = data.games.indexOf(ui.recordedEntry);
      if (idx >= 0) data.games.splice(idx, 1);
      const r = ui.recordedEntry.result;
      if (r === 'draw') data.stats.draws = Math.max(0, data.stats.draws - 1);
      else if (r === ui.playerColor) data.stats.wins = Math.max(0, data.stats.wins - 1);
      else data.stats.losses = Math.max(0, data.stats.losses - 1);
      ui.recordedEntry = null;
      Store.save(true);
    }
    // отменяем до хода игрока включительно
    unmake(ui.st);
    if (ui.log.length) ui.log.pop();
    if (ui.st.turn !== ui.playerColor && ui.st.undoStack.length) {
      unmake(ui.st);
      if (ui.log.length) ui.log.pop();
    }
    ui.selected = -1;
    ui.moves = [];
    ui.hint = null;
    ui.lastMove = ui.st.undoStack.length
      ? ui.st.undoStack[ui.st.undoStack.length - 1].move : null;
    render(host);
  }

  function hint(host) {
    if (ui.thinking || ui.st.turn !== ui.playerColor) return;
    const m = bestMove(ui.st, 2, 0);
    if (!m) return;
    ui.hint = { from: m.from, to: m.to };
    renderBoard(host);
    UI.toast({ icon: '💡', title: 'Подсказка', text: 'Рекомендуемый ход подсвечен.' });
  }

  function bind(host) {
    host.querySelector('#chBoard').addEventListener('click', (e) => {
      const sq = e.target.closest('[data-sq]');
      if (sq) onSquare(host, +sq.getAttribute('data-sq'));
    });
    host.querySelector('.ch__bar').addEventListener('click', (e) => {
      const b = e.target.closest('[data-ch]');
      if (!b) return;
      const a = b.getAttribute('data-ch');
      if (a === 'new') newGame(host);
      else if (a === 'undo') undo(host);
      else if (a === 'hint') hint(host);
      else if (a === 'flip') { ui.flip = !ui.flip; renderBoard(host); }
    });
    host.querySelector('[data-ch="level"]').addEventListener('change', (e) => {
      ui.level = +e.target.value;
    });
    host.querySelector('[data-ch="side"]').addEventListener('change', (e) => {
      newGame(host, e.target.value);
    });
  }

  /* ============================================================
     Публичный объект модуля
     ============================================================ */

  const Chess = {
    route: 'chess',
    label: 'Шахматы',
    subtitle() {
      const s = Store.state() && Store.state().chess.stats;
      if (!s) return 'Игра против компьютера';
      const total = s.wins + s.draws + s.losses;
      return total ? ('Партий: ' + total + ' · побед ' + s.wins) : 'Игра против компьютера';
    },
    mount(host) {
      if (ui.timer) { clearTimeout(ui.timer); ui.timer = 0; }
      ui.st = initial();
      ui.selected = -1; ui.moves = []; ui.log = []; ui.lastMove = null;
      ui.thinking = false; ui.hint = null; ui.flip = false;
      ui.playerColor = 'w'; ui.sideChoice = 'w'; ui.level = 2;
      ui.recordedEntry = null;
      host.innerHTML = template();
      bind(host);
      render(host);
    },
    /* Движок — для автотестов */
    engine: {
      initial, legalMoves, make, unmake, attacked, kingIndex, status, san,
      inCheck, insufficientMaterial, bestMove, evaluate,
      idxToAlg, algToIdx, findMove, colorOf, isWhite, opp
    }
  };

  global.Chess = Chess;
})(window);
