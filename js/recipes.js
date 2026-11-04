/* ============================================================
   recipes.js — раздел «Рецепты»: каталог блюд с фильтрацией
   по категориям, калорийности и времени приготовления,
   избранным и собственными рецептами.

   Публичный интерфейс:
     window.Recipes = { route, label, subtitle(), mount(host), all }
   ============================================================ */
(function (global) {
  'use strict';

  const RU = global.RU;
  const Store = global.Store;
  const UI = global.UI;

  /* ============================================================
     Категории
     ============================================================ */

  const CATS = [
    { id: 'breakfast', name: 'Завтрак', icon: '🍳' },
    { id: 'lunch',     name: 'Обед',    icon: '🍱' },
    { id: 'dinner',    name: 'Ужин',    icon: '🍽' },
    { id: 'salad',     name: 'Салаты',  icon: '🥗' },
    { id: 'soup',      name: 'Супы',    icon: '🍲' },
    { id: 'dessert',   name: 'Десерты', icon: '🍰' },
    { id: 'drink',     name: 'Напитки', icon: '🥤' },
    { id: 'snack',     name: 'Перекусы', icon: '🥨' }
  ];
  const CAT_BY_ID = {};
  CATS.forEach((c) => { CAT_BY_ID[c.id] = c; });

  /* ============================================================
     Каталог рецептов
     ============================================================ */

  const RECIPES = [
    { id: 'r-oatmeal', title: 'Овсяная каша с ягодами', cat: 'breakfast', icon: '🥣', kcal: 320, minutes: 15, servings: 2,
      ingredients: ['Овсяные хлопья — 100 г', 'Молоко или вода — 300 мл', 'Ягоды — 100 г', 'Мёд — 1 ч. л.', 'Щепотка соли'],
      steps: ['Доведите молоко до кипения, добавьте соль.', 'Всыпьте хлопья и варите 7–8 минут, помешивая.', 'Снимите с огня и дайте настояться 3 минуты.', 'Подавайте с ягодами и ложкой мёда.'] },
    { id: 'r-omelet', title: 'Омлет со шпинатом', cat: 'breakfast', icon: '🍳', kcal: 280, minutes: 12, servings: 1,
      ingredients: ['Яйца — 3 шт.', 'Шпинат — 60 г', 'Молоко — 40 мл', 'Сыр — 30 г', 'Соль, перец'],
      steps: ['Взбейте яйца с молоком и специями.', 'Обжарьте шпинат 1 минуту на среднем огне.', 'Залейте яйцами, готовьте под крышкой 4 минуты.', 'Посыпьте сыром и сложите пополам.'] },
    { id: 'r-syrniki', title: 'Сырники из творога', cat: 'breakfast', icon: '🥞', kcal: 420, minutes: 25, servings: 3,
      ingredients: ['Творог 5% — 400 г', 'Яйцо — 1 шт.', 'Мука — 3 ст. л.', 'Сахар — 1 ст. л.', 'Соль, ванилин'],
      steps: ['Разомните творог, смешайте с яйцом и сахаром.', 'Добавьте муку, замесите мягкое тесто.', 'Слепите лепёшки и обваляйте в муке.', 'Обжарьте по 3 минуты с каждой стороны.'] },
    { id: 'r-greek', title: 'Греческий салат', cat: 'salad', icon: '🥗', kcal: 250, minutes: 15, servings: 2,
      ingredients: ['Огурец — 1 шт.', 'Помидоры — 2 шт.', 'Фета — 80 г', 'Оливки — 60 г', 'Оливковое масло — 2 ст. л.'],
      steps: ['Нарежьте овощи крупными кубиками.', 'Добавьте оливки и фету.', 'Заправьте маслом, посолите и поперчите.', 'Аккуратно перемешайте перед подачей.'] },
    { id: 'r-borsch', title: 'Классический борщ', cat: 'soup', icon: '🍲', kcal: 380, minutes: 90, servings: 6,
      ingredients: ['Говядина — 500 г', 'Свёкла — 2 шт.', 'Капуста — 300 г', 'Картофель — 3 шт.', 'Томатная паста — 2 ст. л.'],
      steps: ['Сварите бульон из мяса (60 минут).', 'Обжарьте свёклу с томатной пастой.', 'Добавьте картофель и капусту в бульон.', 'Соедините всё, варите 20 минут, дайте настояться.'] },
    { id: 'r-chickensoup', title: 'Куриный суп с лапшой', cat: 'soup', icon: '🍜', kcal: 340, minutes: 45, servings: 4,
      ingredients: ['Куриные бёдра — 400 г', 'Морковь — 1 шт.', 'Лук — 1 шт.', 'Лапша — 80 г', 'Зелень'],
      steps: ['Залейте курицу водой, варите 25 минут.', 'Добавьте нарезанные морковь и лук.', 'Всыпьте лапшу и варите 7 минут.', 'Посолите, добавьте зелень.'] },
    { id: 'r-lentil', title: 'Чечевичный суп', cat: 'soup', icon: '🥣', kcal: 300, minutes: 40, servings: 4,
      ingredients: ['Красная чечевица — 200 г', 'Морковь — 1 шт.', 'Лук — 1 шт.', 'Томаты — 2 шт.', 'Куркума, зира'],
      steps: ['Обжарьте лук и морковь.', 'Добавьте чечевицу и 1,5 л воды.', 'Варите 20 минут до мягкости.', 'Пробейте блендером, добавьте специи.'] },
    { id: 'r-pumpkinsoup', title: 'Овощной суп-пюре', cat: 'soup', icon: '🥕', kcal: 210, minutes: 30, servings: 4,
      ingredients: ['Тыква — 500 г', 'Морковь — 2 шт.', 'Картофель — 2 шт.', 'Сливки 10% — 100 мл', 'Соль, мускат'],
      steps: ['Нарежьте овощи и залейте водой.', 'Варите 20 минут до мягкости.', 'Пробейте блендером до однородности.', 'Влейте сливки и прогрейте, не кипятя.'] },
    { id: 'r-pasta', title: 'Паста с томатами и базиликом', cat: 'dinner', icon: '🍝', kcal: 520, minutes: 25, servings: 2,
      ingredients: ['Спагетти — 200 г', 'Томаты в собственном соку — 400 г', 'Чеснок — 2 зуб.', 'Базилик', 'Оливковое масло'],
      steps: ['Отварите спагетти до аль денте.', 'Обжарьте чеснок, добавьте томаты.', 'Тушите соус 10 минут.', 'Соедините с пастой и базиликом.'] },
    { id: 'r-fish', title: 'Запечённая рыба с овощами', cat: 'dinner', icon: '🐟', kcal: 430, minutes: 40, servings: 2,
      ingredients: ['Филе трески — 400 г', 'Кабачок — 1 шт.', 'Перец — 1 шт.', 'Лимон — 1 шт.', 'Оливковое масло'],
      steps: ['Разогрейте духовку до 200 °C.', 'Выложите овощи и рыбу на противень.', 'Сбрызните маслом, посолите.', 'Запекайте 25 минут, подавайте с лимоном.'] },
    { id: 'r-chicken', title: 'Куриная грудка с гречкой', cat: 'lunch', icon: '🍗', kcal: 480, minutes: 35, servings: 2,
      ingredients: ['Куриная грудка — 400 г', 'Гречка — 150 г', 'Лук — 1 шт.', 'Соевый соус — 2 ст. л.', 'Специи'],
      steps: ['Отварите гречку до готовности.', 'Замаринуйте курицу в соевом соусе.', 'Обжарьте курицу по 5 минут с каждой стороны.', 'Подавайте с гречкой и зеленью.'] },
    { id: 'r-burger', title: 'Бургер с индейкой', cat: 'dinner', icon: '🍔', kcal: 610, minutes: 30, servings: 2,
      ingredients: ['Фарш индейки — 400 г', 'Булочки — 2 шт.', 'Сыр — 2 ломтика', 'Томат, салат', 'Соус по вкусу'],
      steps: ['Слепите котлеты и обжарьте по 5 минут.', 'Подсушите булочки на сухой сковороде.', 'Соберите бургер: соус, салат, котлета, сыр.', 'Подавайте сразу, пока сыр плавится.'] },
    { id: 'r-salmon', title: 'Стейк из лосося', cat: 'dinner', icon: '🍣', kcal: 560, minutes: 25, servings: 2,
      ingredients: ['Лосось — 400 г', 'Лимон — 1 шт.', 'Сливочное масло — 20 г', 'Розмарин', 'Соль, перец'],
      steps: ['Обсушите стейки и посолите.', 'Растопите масло с розмарином.', 'Обжарьте рыбу по 4 минуты с каждой стороны.', 'Полейте соком лимона перед подачей.'] },
    { id: 'r-hummus', title: 'Хумус домашний', cat: 'snack', icon: '🧆', kcal: 260, minutes: 15, servings: 4,
      ingredients: ['Нут консервированный — 400 г', 'Тахини — 2 ст. л.', 'Чеснок — 1 зуб.', 'Лимон — 1 шт.', 'Оливковое масло'],
      steps: ['Слейте жидкость из нута, оставив немного.', 'Пробейте нут с тахини и чесноком.', 'Добавьте лимонный сок и масло.', 'Взбейте до кремовой текстуры.'] },
    { id: 'r-avocado', title: 'Тост с авокадо и яйцом', cat: 'breakfast', icon: '🥑', kcal: 340, minutes: 10, servings: 1,
      ingredients: ['Хлеб цельнозерновой — 2 ломтика', 'Авокадо — 1 шт.', 'Яйцо — 1 шт.', 'Лимонный сок', 'Соль, перец'],
      steps: ['Подсушите хлеб в тостере.', 'Разомните авокадо с солью и лимоном.', 'Сварите яйцо-пашот или вкрутую.', 'Выложите авокадо на тост, сверху яйцо.'] },
    { id: 'r-cheesecake', title: 'Творожная запеканка', cat: 'dessert', icon: '🍰', kcal: 350, minutes: 50, servings: 6,
      ingredients: ['Творог — 500 г', 'Яйца — 2 шт.', 'Сахар — 60 г', 'Манка — 3 ст. л.', 'Изюм — 50 г'],
      steps: ['Смешайте все ингредиенты до однородности.', 'Оставьте на 15 минут для набухания манки.', 'Вылейте в форму и разровняйте.', 'Запекайте 35 минут при 180 °C.'] },
    { id: 'r-brownie', title: 'Брауни без сахара', cat: 'dessert', icon: '🍫', kcal: 290, minutes: 40, servings: 8,
      ingredients: ['Какао — 40 г', 'Банан — 2 шт.', 'Яйца — 2 шт.', 'Овсяная мука — 60 г', 'Разрыхлитель'],
      steps: ['Разомните бананы в пюре.', 'Смешайте с яйцами и какао.', 'Добавьте муку и разрыхлитель.', 'Выпекайте 25 минут при 180 °C.'] },
    { id: 'r-muffins', title: 'Тыквенные маффины', cat: 'dessert', icon: '🧁', kcal: 240, minutes: 35, servings: 8,
      ingredients: ['Тыквенное пюре — 250 г', 'Мука — 180 г', 'Яйца — 2 шт.', 'Мёд — 50 г', 'Корица, сода'],
      steps: ['Смешайте пюре, яйца и мёд.', 'Добавьте муку, соду и корицу.', 'Разложите по формочкам.', 'Выпекайте 22 минуты при 180 °C.'] },
    { id: 'r-smoothie', title: 'Смузи с бананом и шпинатом', cat: 'drink', icon: '🥤', kcal: 190, minutes: 7, servings: 2,
      ingredients: ['Банан — 1 шт.', 'Шпинат — 50 г', 'Яблоко — 1 шт.', 'Вода — 200 мл', 'Лёд'],
      steps: ['Очистите банан и яблоко.', 'Сложите всё в блендер.', 'Взбейте до однородности.', 'Подавайте сразу, со льдом.'] },
    { id: 'r-lemonade', title: 'Лимонад с мятой', cat: 'drink', icon: '🍋', kcal: 90, minutes: 10, servings: 4,
      ingredients: ['Лимоны — 3 шт.', 'Мята — пучок', 'Мёд — 2 ст. л.', 'Вода — 1 л', 'Лёд'],
      steps: ['Выжмите сок из лимонов.', 'Смешайте с водой и мёдом.', 'Добавьте мяту и лёд.', 'Дайте настояться 10 минут в холодильнике.'] },
    { id: 'r-broccoli-soup', title: 'Крем-суп из брокколи со сливками', cat: 'soup', icon: '🥦', kcal: 260, minutes: 35, servings: 4,
      ingredients: ['Брокколи — 500 г', 'Картофель — 2 шт.', 'Лук — 1 шт.', 'Сливки 20% — 150 мл', 'Овощной бульон — 700 мл', 'Оливковое масло — 1 ст. л.', 'Соль, перец, мускатный орех'],
      steps: ['Разберите брокколи на соцветия, нарежьте картофель кубиками, лук — мелко.',
        'Разогрейте масло и пассеруйте лук 3 минуты до прозрачности.',
        'Добавьте картофель и бульон, варите 10 минут.',
        'Всыпьте брокколи и варите ещё 8–10 минут до мягкости.',
        'Пробейте суп блендером до однородной кремовой текстуры.',
        'Влейте сливки, прогрейте 2 минуты без кипения, приправьте мускатным орехом и подавайте.'] },
    { id: 'r-tofu-bowl', title: 'Боул с тофу и киноа', cat: 'lunch', icon: '🥗', kcal: 470, minutes: 30, servings: 2,
      ingredients: ['Киноа — 150 г', 'Тофу — 300 г', 'Морковь — 1 шт.', 'Огурец — 1 шт.', 'Авокадо — 1 шт.', 'Соевый соус — 3 ст. л.', 'Сок лайма, кунжут'],
      steps: ['Промойте киноа и отварите в подсоленной воде 15 минут, дайте настояться под крышкой.',
        'Нарежьте тофу кубиками, обжарьте на сухой сковороде до золотистой корочки.',
        'Добавьте к тофу соевый соус и сок лайма, прогрейте 1 минуту.',
        'Нарежьте морковь, огурец и авокадо тонкими ломтиками.',
        'Разложите киноа по мискам, сверху выложите тофу и овощи рядами.',
        'Посыпьте кунжутом и полейте заправкой из соевого соуса и лайма.'] },
    { id: 'r-turkey-meatballs', title: 'Тефтели из индейки в томатном соусе', cat: 'dinner', icon: '🍅', kcal: 420, minutes: 50, servings: 4,
      ingredients: ['Фарш индейки — 600 г', 'Рис — 100 г', 'Лук — 2 шт.', 'Яйцо — 1 шт.', 'Томаты в собственном соку — 500 г', 'Чеснок — 2 зуб.', 'Соль, паприка, зелень'],
      steps: ['Отварите рис до полуготовности и остудите.',
        'Смешайте фарш, рис, мелко нарезанный лук, яйцо и специи до однородности.',
        'Сформируйте тефтели размером с грецкий орех.',
        'Обжарьте их по 2 минуты с каждой стороны до лёгкой корочки.',
        'Приготовьте соус: обжарьте чеснок, добавьте томаты и тушите 10 минут.',
        'Выложите тефтели в соус, накройте крышкой и тушите 15 минут, подавайте с зеленью.'] },
    { id: 'r-oat-pancakes', title: 'Овсяноблины с творогом и ягодами', cat: 'breakfast', icon: '🥞', kcal: 300, minutes: 20, servings: 2,
      ingredients: ['Овсяные хлопья — 120 г', 'Яйца — 2 шт.', 'Молоко — 120 мл', 'Творог 5% — 150 г', 'Ягоды — 100 г', 'Мёд — 1 ст. л.', 'Разрыхлитель — ½ ч. л.'],
      steps: ['Измельчите хлопья в блендере до состояния муки.',
        'Смешайте овсяную муку, яйца, молоко и разрыхлитель до однородного теста.',
        'Дайте тесту постоять 5 минут, чтобы хлопья набухли.',
        'Жарьте тонкие блинчики на разогретой сухой сковороде по 1–2 минуты с каждой стороны.',
        'Промажьте каждый блин творогом и выложите горкой.',
        'Украсьте ягодами и полейте мёдом перед подачей.'] }
  ];

  /* ============================================================
     Состояние и данные
     ============================================================ */

  const rs = { fav: false, cat: 'all', kcal: 'all', time: 'all', q: '' };

  const data = () => Store.state().recipes;

  function all() { return data().custom.concat(RECIPES); }

  function byId(id) { return all().find((r) => r.id === id) || null; }

  function isFav(id) { return data().favorites.indexOf(id) !== -1; }

  function toggleFav(id) {
    const favs = data().favorites;
    const i = favs.indexOf(id);
    if (i === -1) favs.push(id); else favs.splice(i, 1);
    Store.save(true);
    return i === -1;
  }

  function inRange(value, range) {
    if (range === 'all') return true;
    if (range.slice(-1) === '-') return value >= parseInt(range, 10);
    const parts = range.split('-');
    return value >= +parts[0] && value <= +parts[1];
  }

  function filtered() {
    const q = rs.q.trim().toLowerCase();
    return all().filter((r) => {
      if (rs.fav && !isFav(r.id)) return false;
      if (rs.cat !== 'all' && r.cat !== rs.cat) return false;
      if (!inRange(r.kcal, rs.kcal)) return false;
      if (!inRange(r.minutes, rs.time)) return false;
      if (q && (r.title.toLowerCase().indexOf(q) === -1 &&
        (r.ingredients || []).join(' ').toLowerCase().indexOf(q) === -1)) return false;
      return true;
    });
  }

  /* ============================================================
     Разметка
     ============================================================ */

  const KCAL_OPTS = [['all', 'любая'], ['0-200', 'до 200'], ['200-400', '200–400'], ['400-600', '400–600'], ['600-', 'от 600']];
  const TIME_OPTS = [['all', 'любое'], ['0-15', 'до 15 мин'], ['15-30', '15–30 мин'], ['30-60', '30–60 мин'], ['60-', 'от 60 мин']];

  function chipGroup(kind, opts, active) {
    return opts.map((o) =>
      '<button type="button" class="filter-chip' + (active === o[0] ? ' is-active' : '') +
      '" data-rc="' + kind + '" data-val="' + o[0] + '">' + o[1] + '</button>').join('');
  }

  function toolbar() {
    const cats = '<button type="button" class="filter-chip' + (rs.cat === 'all' ? ' is-active' : '') +
        '" data-rc="cat" data-val="all">Все блюда</button>' +
      CATS.map((c) => '<button type="button" class="filter-chip' + (rs.cat === c.id ? ' is-active' : '') +
        '" data-rc="cat" data-val="' + c.id + '">' + c.icon + ' ' + c.name + '</button>').join('');

    return '<div class="rc-toolbar">' +
      '<div class="rc-toolbar__row">' +
        '<input class="field__input rc-search" type="search" data-rc="q" placeholder="Поиск по названию или ингредиентам…" value="' + RU.escapeHtml(rs.q) + '">' +
        '<button type="button" class="btn btn--sm' + (rs.fav ? ' btn--accent' : '') +
          '" data-rc="fav" aria-pressed="' + rs.fav + '">★ Избранное (' + data().favorites.length + ')</button>' +
        '<button type="button" class="btn btn--sm" data-rc="new">+ Свой рецепт</button>' +
      '</div>' +
      '<div class="rc-toolbar__row"><span class="rc-flab">Категория</span><div class="filters">' + cats + '</div></div>' +
      '<div class="rc-toolbar__row"><span class="rc-flab">Калорийность</span><div class="filters">' + chipGroup('kcal', KCAL_OPTS, rs.kcal) + '</div></div>' +
      '<div class="rc-toolbar__row"><span class="rc-flab">Время</span><div class="filters">' + chipGroup('time', TIME_OPTS, rs.time) + '</div></div>' +
    '</div>';
  }

  function card(r) {
    const cat = CAT_BY_ID[r.cat] || { name: '—', icon: '🍽' };
    const fav = isFav(r.id);
    return '<article class="rc-card" data-rc="open" data-id="' + r.id + '" tabindex="0">' +
      '<div class="rc-card__ico">' + r.icon + '</div>' +
      '<button type="button" class="rc-star' + (fav ? ' is-on' : '') + '" data-rc="fav-toggle" data-id="' + r.id +
        '" aria-label="В избранное" aria-pressed="' + fav + '">' + (fav ? '★' : '☆') + '</button>' +
      '<h3 class="rc-card__title">' + RU.escapeHtml(r.title) + '</h3>' +
      '<p class="rc-card__cat">' + cat.icon + ' ' + RU.escapeHtml(cat.name) +
        (r.source === 'custom' ? ' · мой рецепт' : '') + '</p>' +
      '<div class="rc-card__meta">' +
        '<span>🔥 ' + r.kcal + ' ккал</span>' +
        '<span>⏱ ' + r.minutes + ' мин</span>' +
        '<span>🍽 ' + r.servings + ' порц.</span>' +
      '</div>' +
    '</article>';
  }

  function list() {
    const items = filtered();
    if (!items.length) {
      return '<div class="empty"><div class="empty__icon">🍽</div>' +
        '<h3>Ничего не найдено</h3>' +
        '<p>Измените фильтры или добавьте собственный рецепт.</p></div>';
    }
    const word = RU.plural(items.length, 'рецепт', 'рецепта', 'рецептов');
    return '<p class="rc-count">Найдено ' + items.length + ' ' + word + '</p>' +
      '<div class="rc-grid">' + items.map(card).join('') + '</div>';
  }

  function template() {
    return '<div class="rc">' + toolbar() + '<div class="rc__list" id="rcList">' + list() + '</div></div>';
  }

  function paint(host) {
    const q = host.querySelector('[data-rc="q"]');
    const caret = q ? q.selectionStart : null;
    host.innerHTML = template();
    bind(host);
    if (caret !== null) {
      const nq = host.querySelector('[data-rc="q"]');
      if (nq) { nq.focus(); nq.setSelectionRange(caret, caret); }
    }
  }

  /* ============================================================
     Детали и формы
     ============================================================ */

  function openRecipe(host, id) {
    const r = byId(id);
    if (!r) return;
    const cat = CAT_BY_ID[r.cat] || { name: '—', icon: '🍽' };
    const fav = isFav(r.id);
    const body =
      '<div class="rc-recipe">' +
        '<div class="rc-recipe__meta">' +
          '<span class="chip chip--accent">' + cat.icon + ' ' + RU.escapeHtml(cat.name) + '</span>' +
          '<span class="chip">🔥 ' + r.kcal + ' ккал</span>' +
          '<span class="chip">⏱ ' + r.minutes + ' мин</span>' +
          '<span class="chip">🍽 ' + r.servings + ' порц.</span>' +
        '</div>' +
        '<h4>Ингредиенты</h4>' +
        '<ul class="rc-ing">' + r.ingredients.map((i) => '<li>' + RU.escapeHtml(i) + '</li>').join('') + '</ul>' +
        '<h4>Приготовление</h4>' +
        '<ol class="rc-steps">' + r.steps.map((s) => '<li>' + RU.escapeHtml(s) + '</li>').join('') + '</ol>' +
      '</div>';
    const foot =
      '<button class="btn btn--ghost" data-close="modal">Закрыть</button>' +
      (r.source === 'custom' ? '<button class="btn btn--danger" id="rcDel">Удалить</button>' : '') +
      '<button class="btn ' + (fav ? 'btn--ghost' : 'btn--accent') + '" id="rcFav">' +
      (fav ? '★ В избранном' : '☆ В избранное') + '</button>';
    UI.openModal({
      title: r.icon + ' ' + r.title, body: body, noFocus: true, foot: foot,
      onMount: (b, f) => {
        f.querySelector('#rcFav').addEventListener('click', () => {
          const added = toggleFav(r.id);
          UI.closeModal();
          UI.toast({ icon: added ? '★' : '☆', title: added ? 'Добавлено в избранное' : 'Убрано из избранного', text: r.title });
          paint(host);
        });
        const del = f.querySelector('#rcDel');
        if (del) del.addEventListener('click', () => {
          UI.closeModal();
          const d = data();
          d.custom = d.custom.filter((x) => x.id !== id);
          d.favorites = d.favorites.filter((x) => x !== id);
          Store.save(true);
          UI.toast({ icon: '🗑', title: 'Рецепт удалён' });
          paint(host);
        });
      }
    });
  }

  function openNewForm(host) {
    const catOpts = CATS.map((c) => '<option value="' + c.id + '">' + c.icon + ' ' + c.name + '</option>').join('');
    const body =
      '<form id="rcForm" class="form" novalidate>' +
        '<label class="field"><span class="field__label">Название *</span>' +
          '<input class="field__input" name="title" maxlength="70" placeholder="Например, овощное рагу" required></label>' +
        '<div class="form__row">' +
          '<label class="field"><span class="field__label">Категория</span>' +
            '<select class="field__select" name="cat">' + catOpts + '</select></label>' +
          '<label class="field"><span class="field__label">Иконка</span>' +
            '<input class="field__input" name="icon" maxlength="4" value="🍽"></label>' +
        '</div>' +
        '<div class="form__row">' +
          '<label class="field"><span class="field__label">Калорий на порцию</span>' +
            '<input class="field__input" name="kcal" type="number" min="1" max="3000" value="300"></label>' +
          '<label class="field"><span class="field__label">Время, мин</span>' +
            '<input class="field__input" name="minutes" type="number" min="1" max="600" value="30"></label>' +
        '</div>' +
        '<label class="field"><span class="field__label">Порций</span>' +
          '<input class="field__input" name="servings" type="number" min="1" max="20" value="2"></label>' +
        '<label class="field"><span class="field__label">Ингредиенты (каждый с новой строки)</span>' +
          '<textarea class="field__area" name="ingredients" placeholder="Мука — 200 г&#10;Яйцо — 1 шт."></textarea></label>' +
        '<label class="field"><span class="field__label">Шаги приготовления (каждый с новой строки)</span>' +
          '<textarea class="field__area" name="steps" placeholder="Смешайте ингредиенты&#10;Запекайте 20 минут"></textarea></label>' +
      '</form>';
    UI.openModal({
      title: 'Свой рецепт', body: body, noFocus: false,
      foot: '<button class="btn btn--ghost" data-close="modal">Отмена</button>' +
        '<button class="btn btn--accent" id="rcSave">Сохранить</button>',
      onMount: (b, f) => {
        f.querySelector('#rcSave').addEventListener('click', () => {
          const form = b.querySelector('#rcForm');
          const q = (n) => form.querySelector('[name="' + n + '"]');
          const titleEl = q('title');
          const title = titleEl.value.trim();
          if (!title) { titleEl.focus(); return; }
          const lines = (v) => v.split('\n').map((s) => s.trim()).filter(Boolean);
          const rec = {
            id: 'u-' + RU.uid(),
            source: 'custom',
            title: title,
            cat: q('cat').value,
            icon: q('icon').value.trim() || '🍽',
            kcal: +q('kcal').value || 0,
            minutes: +q('minutes').value || 0,
            servings: +q('servings').value || 1,
            ingredients: lines(q('ingredients').value),
            steps: lines(q('steps').value)
          };
          if (!rec.ingredients.length) rec.ingredients = ['—'];
          if (!rec.steps.length) rec.steps = ['—'];
          data().custom.unshift(rec);
          Store.save(true);
          UI.closeModal();
          UI.confetti(24);
          UI.toast({ icon: '🍽', title: 'Рецепт добавлен', text: rec.title, kind: 'ok' });
          paint(host);
        });
      }
    });
  }

  /* ============================================================
     Привязка событий
     ============================================================ */

  function bind(host) {
    const root = host.querySelector('.rc');

    const q = root.querySelector('[data-rc="q"]');
    if (q) {
      const onInput = RU.debounce(() => { rs.q = q.value; renderList(host); }, 220);
      q.addEventListener('input', onInput);
    }

    root.addEventListener('click', (e) => {
      const el = e.target.closest('[data-rc]');
      if (!el) return;
      const act = el.getAttribute('data-rc');
      const val = el.getAttribute('data-val');
      const id = el.getAttribute('data-id');

      if (act === 'cat') { rs.cat = val; rs.fav = false; paint(host); }
      else if (act === 'kcal') { rs.kcal = val; paint(host); }
      else if (act === 'time') { rs.time = val; paint(host); }
      else if (act === 'fav') { rs.fav = !rs.fav; paint(host); }
      else if (act === 'new') openNewForm(host);
      else if (act === 'open') openRecipe(host, id);
      else if (act === 'fav-toggle') {
        const added = toggleFav(id);
        UI.toast({ icon: added ? '★' : '☆', title: added ? 'В избранном' : 'Убрано из избранного' });
        paint(host);
      }
    });

    root.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      const card = e.target.closest('[data-rc="open"]');
      if (card) openRecipe(host, card.getAttribute('data-id'));
    });
  }

  /* Обновление только списка — без потери фокуса в поиске */
  function renderList(host) {
    const box = host.querySelector('#rcList');
    if (box) box.innerHTML = list();
  }

  /* ============================================================
     Публичный объект модуля
     ============================================================ */

  global.Recipes = {
    route: 'recipes',
    label: 'Рецепты',
    subtitle() {
      const n = data().favorites.length;
      return n ? ('В избранном: ' + n + ' ' + RU.plural(n, 'рецепт', 'рецепта', 'рецептов'))
        : 'Каталог блюд с фильтрами';
    },
    mount(host) {
      rs.fav = false; rs.cat = 'all'; rs.kcal = 'all'; rs.time = 'all'; rs.q = '';
      host.innerHTML = template();
      bind(host);
    },
    all: all,
    categories: CATS
  };
})(window);
