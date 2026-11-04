/* ============================================================
   blackjack.js — раздел «Блэкджек»: классическая игра против
   дилера по стандартным правилам.

   Правила:
     • шуз из 6 колод (312 карт), тасуется заново, когда карт мало;
     • игрок и дилер получают по две карты, карта дилера закрыта;
     • стоимость: 2–10 по номиналу, J/Q/K = 10, туз = 1 или 11;
     • блэкджек (туз + «десятка» с раздачи) оплачивается 3:2;
     • дилер добирает до 17 и останавливается на любых 17 (S17);
     • ходы игрока: «Ещё» (hit), «Хватит» (stand), «Удвоить» (double);
     • перебор (>21) — проигрыш; равенство очков — ничья (push).

   Публичный интерфейс:
     window.Blackjack = { route, label, subtitle(), mount(host), core, rules, state }
   Чистое ядро доступно как Blackjack.core для автотестов.
   ============================================================ */
(function (global) {
  'use strict';

  const RU = global.RU;
  const Store = global.Store;
  const UI = global.UI;

  const SUITS = ['\u2660', '\u2665', '\u2666', '\u2663'];      // ♠ ♥ ♦ ♣
  const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

  const RULES = {
    decks: 6,
    blackjackPays: 1.5,
    dealerStandsSoft17: true,
    reshuffleAt: 26,
    minBet: 5,
    startChips: 1000
  };

  /* ============================================================
     Ядро (чистые функции)
     ============================================================ */

  function rankValue(rank) {
    if (rank === 'A') return 11;
    if (rank === 'J' || rank === 'Q' || rank === 'K' || rank === '10') return 10;
    return parseInt(rank, 10);
  }

  /** Сумма очков руки с учётом понижения тузов 11 → 1 */
  function handValue(cards) {
    let total = 0, aces = 0;
    for (let i = 0; i < cards.length; i++) {
      const v = rankValue(cards[i].rank);
      total += v;
      if (v === 11) aces++;
    }
    while (total > 21 && aces > 0) { total -= 10; aces--; }
    return { total: total, soft: aces > 0 };
  }

  const isBlackjack = (cards) => cards.length === 2 && handValue(cards).total === 21;

  function dealerShouldHit(cards) {
    const h = handValue(cards);
    if (h.total < 17) return true;
    if (h.total === 17 && h.soft && !RULES.dealerStandsSoft17) return true;
    return false;
  }

  /** Создаёт и тасует шуз. rng можно подменить в тестах. */
  function newShoe(numDecks, rng) {
    rng = rng || Math.random;
    const n = numDecks || RULES.decks;
    const cards = [];
    for (let d = 0; d < n; d++) {
      for (let s = 0; s < SUITS.length; s++) {
        for (let r = 0; r < RANKS.length; r++) cards.push({ rank: RANKS[r], suit: SUITS[s] });
      }
    }
    for (let i = cards.length - 1; i > 0; i--) {
      const j = (rng() * (i + 1)) | 0;
      const t = cards[i]; cards[i] = cards[j]; cards[j] = t;
    }
    return cards;
  }

  /**
   * Определяет исход раунда. Чистая функция.
   * bet уже списан со счёта; payout — сколько вернуть на счёт.
   */
  function settle(player, dealer, bet) {
    const p = handValue(player).total;
    const d = handValue(dealer).total;
    const pBJ = isBlackjack(player);
    const dBJ = isBlackjack(dealer);
    let result, payout, msg;

    if (p > 21) { result = 'lose'; payout = 0; msg = 'Перебор у игрока'; }
    else if (pBJ && !dBJ) { result = 'blackjack'; payout = Math.round(bet * (1 + RULES.blackjackPays)); msg = 'Блэкджек!'; }
    else if (dBJ && !pBJ) { result = 'lose'; payout = 0; msg = 'Блэкджек у дилера'; }
    else if (pBJ && dBJ) { result = 'push'; payout = bet; msg = 'Блэкджек у обоих — ничья'; }
    else if (d > 21) { result = 'win'; payout = bet * 2; msg = 'Перебор у дилера'; }
    else if (p > d) { result = 'win'; payout = bet * 2; msg = 'У вас больше очков'; }
    else if (p < d) { result = 'lose'; payout = 0; msg = 'У дилера больше очков'; }
    else { result = 'push'; payout = bet; msg = 'Равные очки — ничья'; }

    return { result: result, payout: payout, msg: msg, playerTotal: p, dealerTotal: d, net: payout - bet };
  }

  /* ============================================================
     Состояние раунда
     ============================================================ */

  const bj = {
    shoe: [],
    phase: 'bet',        // bet | player | done
    player: [],
    dealer: [],
    selectedBet: 50,     // ставка для следующего раунда
    bet: 0,              // фактически поставлено в текущем раунде
    doubled: false,
    result: null,
    finished: false
  };

  let hostEl = null;
  const data = () => Store.state().blackjack;

  const RESULT_LABEL = { win: 'Победа', lose: 'Поражение', push: 'Ничья', blackjack: 'Блэкджек' };

  /* ============================================================
     Раздача и ходы
     ============================================================ */

  function ensureShoe() {
    if (!bj.shoe.length || bj.shoe.length < RULES.reshuffleAt) bj.shoe = newShoe(RULES.decks);
  }

  function draw() {
    ensureShoe();
    return bj.shoe.pop();
  }

  function startRound() {
    const d = data();
    if (bj.phase === 'player') return;
    if (d.chips < RULES.minBet) {
      UI.toast({ icon: '💳', title: 'Недостаточно фишек', text: 'Пополните счёт, чтобы играть.', kind: 'warn' });
      return;
    }
    let bet = Math.min(bj.selectedBet || d.bet || 50, d.chips);
    if (bet < RULES.minBet) bet = Math.min(50, d.chips);
    bet = Math.round(bet);

    d.chips -= bet;
    d.bet = bet;
    bj.selectedBet = bet;
    bj.bet = bet;
    bj.doubled = false;
    bj.result = null;
    bj.finished = false;
    bj.player = [draw(), draw()];
    bj.dealer = [draw(), draw()];
    bj.phase = 'player';
    Store.save(true);

    if (isBlackjack(bj.player) || isBlackjack(bj.dealer)) { finish(); return; }
    render();
  }

  function hit() {
    if (bj.phase !== 'player') return;
    bj.player.push(draw());
    if (handValue(bj.player).total > 21) { finish(); return; }
    if (handValue(bj.player).total === 21) { stand(); return; }
    render();
  }

  function stand() {
    if (bj.phase !== 'player') return;
    finish();
  }

  function doubleDown() {
    const d = data();
    if (bj.phase !== 'player' || bj.player.length !== 2 || bj.doubled) return;
    if (d.chips < bj.bet) {
      UI.toast({ icon: '💳', title: 'Недостаточно фишек', text: 'Для удвоения нужно ещё ' + bj.bet + '.', kind: 'warn' });
      return;
    }
    d.chips -= bj.bet;
    bj.bet *= 2;
    bj.doubled = true;
    bj.player.push(draw());
    if (handValue(bj.player).total > 21) { finish(); return; }
    stand();
  }

  function finish() {
    if (bj.finished) return;
    bj.finished = true;
    const d = data();

    const pTotal = handValue(bj.player).total;
    const pBJ = isBlackjack(bj.player);
    const dBJ = isBlackjack(bj.dealer);
    // Дилер доигрывает только если игрок не перебрал и ни у кого нет
    // «натурального» блэкджека с раздачи.
    if (pTotal <= 21 && !pBJ && !dBJ) {
      while (dealerShouldHit(bj.dealer)) bj.dealer.push(draw());
    }

    const s = settle(bj.player, bj.dealer, bj.bet);

    d.chips += s.payout;
    d.stats.hands++;
    if (s.result === 'blackjack') d.stats.blackjacks++;
    if (s.result === 'win' || s.result === 'blackjack') d.stats.wins++;
    else if (s.result === 'lose') d.stats.losses++;
    else d.stats.pushes++;
    if (s.net > d.stats.best) d.stats.best = s.net;

    d.history.unshift({
      at: new Date().toISOString(),
      bet: bj.bet,
      result: s.result,
      net: s.net,
      player: s.playerTotal,
      dealer: s.dealerTotal,
      doubled: bj.doubled
    });
    if (d.history.length > 30) d.history.length = 30;

    bj.phase = 'done';
    bj.result = s;
    Store.save(true);

    if (s.result === 'blackjack' || s.result === 'win') UI.confetti(s.result === 'blackjack' ? 34 : 22);
    else if (s.result === 'lose') UI.beep();
    else UI.toast({ icon: '🤝', title: 'Ничья', text: s.msg });

    render();
  }

  /* ============================================================
     Разметка
     ============================================================ */

  function cardHTML(card, hidden) {
    if (hidden) return '<div class="bj-card is-back" aria-hidden="true"></div>';
    const red = card.suit === '\u2665' || card.suit === '\u2666';
    return '<div class="bj-card' + (red ? ' is-red' : '') + '">' +
      '<span class="bj-card__r">' + card.rank + '</span>' +
      '<span class="bj-card__s">' + card.suit + '</span>' +
      '</div>';
  }

  function scoreHTML(cards, hideSecond) {
    if (hideSecond) {
      const first = cards.slice(0, 1);
      return '<span class="bj-score">' + handValue(first).total + '+</span>';
    }
    const h = handValue(cards);
    return '<span class="bj-score' + (h.total > 21 ? ' is-bust' : h.total === 21 ? ' is-21' : '') + '">' +
      h.total + (h.soft ? '<em> мягк.</em>' : '') + '</span>';
  }

  function handHTML(cards, hideSecond) {
    if (!cards.length) return '<div class="bj-hand bj-hand--empty"><span>Ожидание раздачи</span></div>';
    let html = '<div class="bj-hand">';
    for (let i = 0; i < cards.length; i++) html += cardHTML(cards[i], hideSecond && i === 1);
    html += '</div>';
    return html;
  }

  function tableHTML() {
    const hideHole = bj.phase === 'player';
    const d = data();
    let msg = '';
    if (bj.phase === 'bet') msg = 'Сделайте ставку и нажмите «Раздать».';
    else if (bj.phase === 'player') {
      const h = handValue(bj.player);
      msg = h.total === 21 ? 'У вас 21 — можно остановиться.' : 'Ваш ход: «Ещё», «Хватит» или «Удвоить».';
    } else if (bj.phase === 'done' && bj.result) {
      msg = bj.result.msg + ' · ставка ' + bj.bet + ' · итог ' +
        (bj.result.net > 0 ? '+' : '') + bj.result.net;
    }
    const msgCls = bj.phase === 'done' && bj.result
      ? ' bj-msg--' + (bj.result.result === 'lose' ? 'lose' : bj.result.result === 'push' ? 'push' : 'win')
      : '';

    return '' +
      '<div class="bj-seat bj-seat--dealer">' +
        '<div class="bj-seat__head"><span class="bj-seat__label">Дилер</span>' +
          scoreHTML(bj.dealer, hideHole) + '</div>' +
        handHTML(bj.dealer, hideHole) +
      '</div>' +
      '<div class="bj-msg' + msgCls + '">' + msg + '</div>' +
      '<div class="bj-seat bj-seat--player">' +
        '<div class="bj-seat__head"><span class="bj-seat__label">Вы</span>' +
          (bj.player.length ? scoreHTML(bj.player) : '<span class="bj-score">—</span>') + '</div>' +
        handHTML(bj.player) +
      '</div>' +
      '<div class="bj-pot">Банк: <b>' + (bj.bet || 0) + '</b>' +
        (bj.doubled ? ' · удвоено' : '') + '</div>';
  }

  function betButtonsHTML() {
    const d = data();
    const opts = [10, 25, 50, 100, 250, 500];
    return opts.map((v) =>
      '<button class="bj-chip" data-bj="bet" data-val="' + v + '"' +
      (v > d.chips ? ' disabled' : '') +
      (v === bj.selectedBet ? ' aria-pressed="true"' : '') + '>' + v + '</button>').join('');
  }

  function controlsHTML() {
    const d = data();
    if (bj.phase === 'player') {
      const canDouble = bj.player.length === 2 && !bj.doubled && d.chips >= bj.bet;
      return '' +
        '<button class="btn btn--accent bj-act" data-bj="hit">Ещё</button>' +
        '<button class="btn bj-act" data-bj="stand">Хватит</button>' +
        '<button class="btn btn--ghost bj-act" data-bj="double"' + (canDouble ? '' : ' disabled') + '>Удвоить</button>';
    }
    const low = d.chips < RULES.minBet;
    return '' +
      '<div class="bj-betrow">' + betButtonsHTML() + '</div>' +
      '<div class="bj-betline">Текущая ставка: <b>' + (bj.selectedBet || d.bet || 0) + '</b></div>' +
      '<button class="btn btn--accent bj-act" data-bj="deal"' + (low ? ' disabled' : '') + '>' +
        (bj.phase === 'done' ? 'Новая раздача' : 'Раздать') + '</button>' +
      (low ? '<button class="btn btn--ghost bj-act" data-bj="topup">Пополнить +500</button>' : '');
  }

  function sideHTML() {
    const d = data();
    const s = d.stats;
    const hist = d.history.slice(0, 6).map((h) =>
      '<div class="bj-hist__row bj-hist__row--' + h.result + '">' +
        '<span class="bj-hist__r">' + RESULT_LABEL[h.result] + '</span>' +
        '<span class="bj-hist__s">' + h.player + ' / ' + h.dealer + '</span>' +
        '<span class="bj-hist__n">' + (h.net > 0 ? '+' : '') + h.net + '</span>' +
      '</div>').join('') || '<p class="bj-empty">Партий пока нет</p>';

    return '' +
      '<section class="card bj-bank">' +
        '<h3>Счёт</h3>' +
        '<div class="bj-bank__val">' + d.chips + '<span>фишек</span></div>' +
      '</section>' +
      '<section class="card bj-panel">' +
        '<h3>Ставка и ход</h3>' +
        '<div class="bj-controls">' + controlsHTML() + '</div>' +
      '</section>' +
      '<section class="card bj-panel">' +
        '<h3>Статистика</h3>' +
        '<div class="bj-stats">' +
          '<div class="bj-stat"><b>' + s.hands + '</b><span>раздач</span></div>' +
          '<div class="bj-stat"><b>' + s.wins + '</b><span>побед</span></div>' +
          '<div class="bj-stat"><b>' + s.losses + '</b><span>пораж.</span></div>' +
          '<div class="bj-stat"><b>' + s.pushes + '</b><span>ничьих</span></div>' +
          '<div class="bj-stat"><b>' + s.blackjacks + '</b><span>блэкдж.</span></div>' +
          '<div class="bj-stat"><b>' + (s.best > 0 ? '+' + s.best : s.best) + '</b><span>лучший</span></div>' +
        '</div>' +
      '</section>' +
      '<section class="card bj-panel">' +
        '<h3>Последние раздачи</h3>' +
        '<div class="bj-hist">' + hist + '</div>' +
      '</section>';
  }

  function template() {
    return '' +
      '<div class="bj">' +
        '<div class="bj__table card">' +
          '<div class="bj-table__inner" id="bjTable"></div>' +
        '</div>' +
        '<aside class="bj__side" id="bjSide"></aside>' +
      '</div>';
  }

  function render() {
    if (!hostEl) return;
    const t = hostEl.querySelector('#bjTable');
    const s = hostEl.querySelector('#bjSide');
    if (t) t.innerHTML = tableHTML();
    if (s) s.innerHTML = sideHTML();
  }

  function bind() {
    const root = hostEl.querySelector('.bj');
    if (!root) return;
    root.addEventListener('click', (e) => {
      const b = e.target.closest('[data-bj]');
      if (!b || b.disabled) return;
      const a = b.getAttribute('data-bj');
      if (a === 'deal') startRound();
      else if (a === 'hit') hit();
      else if (a === 'stand') stand();
      else if (a === 'double') doubleDown();
      else if (a === 'bet') {
        const v = +b.getAttribute('data-val');
        const d = data();
        if (v <= d.chips) { bj.selectedBet = v; d.bet = v; Store.save(true); render(); }
      } else if (a === 'topup') {
        const d = data();
        d.chips += 500;
        Store.save(true);
        UI.toast({ icon: '💳', title: 'Счёт пополнен', text: '+500 фишек' });
        render();
      }
    });
  }

  /* ============================================================
     Публичный объект модуля
     ============================================================ */

  const Blackjack = {
    route: 'blackjack',
    label: 'Блэкджек',
    subtitle() {
      const d = Store.state() && Store.state().blackjack;
      if (!d) return 'Игра против дилера';
      const s = d.stats;
      return s.hands ? ('Раздач: ' + s.hands + ' · побед ' + s.wins + ' · счёт ' + d.chips)
        : 'Игра против дилера';
    },
    mount(host) {
      hostEl = host;
      const d = data();
      if (!bj.shoe.length) ensureShoe();
      bj.selectedBet = d.bet || 50;
      bj.phase = 'bet';
      bj.player = [];
      bj.dealer = [];
      bj.result = null;
      bj.finished = false;
      bj.doubled = false;
      host.innerHTML = template();
      bind();
      render();
    },
    rules: RULES,
    core: {
      rankValue,
      handValue,
      isBlackjack,
      dealerShouldHit,
      newShoe,
      settle
    },
    state: () => Store.state().blackjack
  };

  global.Blackjack = Blackjack;
})(window);
