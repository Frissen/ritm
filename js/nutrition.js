/* ============================================================
   nutrition.js — раздел «Питание»:
     1) структурированная база продуктов (БЖУ и калорийность на 100 г);
     2) точный расчёт нормы калорий по индивидуальным параметрам
        (пол, возраст, рост, вес, уровень активности, цель);
     3) дневник питания с подсчётом съеденного за день.

   Формула базового обмена — Миффлина — Сан-Жеора, коэффициент
   активности — стандартные множители Харриса — Бенедикта.

   Публичный интерфейс:
     window.Nutrition = {
       route, label, subtitle(), mount(host),
       foods, categories, meals, activityLevels, goals, calc
     }
   ============================================================ */
(function (global) {
  'use strict';

  const RU = global.RU;
  const Store = global.Store;
  const UI = global.UI;

  /* ============================================================
     База продуктов: значения на 100 г
     ============================================================ */

  const CATS = [
    { id: 'meat',    label: 'Мясо и птица',        icon: '🍗' },
    { id: 'fish',    label: 'Рыба и морепродукты', icon: '🐟' },
    { id: 'dairy',   label: 'Молочные продукты',   icon: '🥛' },
    { id: 'eggs',    label: 'Яйца',                icon: '🥚' },
    { id: 'grains',  label: 'Крупы и злаки',       icon: '🍚' },
    { id: 'veg',     label: 'Овощи',               icon: '🥦' },
    { id: 'fruit',   label: 'Фрукты и ягоды',      icon: '🍎' },
    { id: 'nuts',    label: 'Орехи и семена',      icon: '🥜' },
    { id: 'legumes', label: 'Бобовые',             icon: '🫘' },
    { id: 'oils',    label: 'Масла и жиры',        icon: '🫒' },
    { id: 'drinks',  label: 'Напитки',             icon: '🥤' },
    { id: 'sweets',  label: 'Сладкое и снеки',     icon: '🍫' },
    { id: 'other',   label: 'Прочее',              icon: '🍽' }
  ];

  const CAT_ICON = {};
  CATS.forEach((c) => { CAT_ICON[c.id] = c.icon; });

  /* { id, name, cat, kcal, p, f, c } — на 100 г продукта */
  const FOODS = [
    /* --- Мясо и птица --- */
    { id: 'f-chicken',   name: 'Куриная грудка',        cat: 'meat', kcal: 165, p: 31.0, f: 3.6,  c: 0 },
    { id: 'f-thigh',     name: 'Куриное бедро',         cat: 'meat', kcal: 209, p: 26.0, f: 10.9, c: 0 },
    { id: 'f-turkey',    name: 'Индейка (грудка)',      cat: 'meat', kcal: 135, p: 29.0, f: 1.5,  c: 0 },
    { id: 'f-beef',      name: 'Говядина (тушёная)',    cat: 'meat', kcal: 232, p: 26.0, f: 14.0, c: 0 },
    { id: 'f-mince',     name: 'Говяжий фарш (10%)',    cat: 'meat', kcal: 217, p: 26.0, f: 11.7, c: 0 },
    { id: 'f-pork',      name: 'Свинина (жареная)',     cat: 'meat', kcal: 242, p: 27.0, f: 14.0, c: 0 },
    { id: 'f-bacon',     name: 'Бекон',                 cat: 'meat', kcal: 541, p: 37.0, f: 42.0, c: 1.4 },
    { id: 'f-sausage',   name: 'Колбаса варёная',       cat: 'meat', kcal: 257, p: 12.0, f: 22.0, c: 2.0 },
    { id: 'f-liver',     name: 'Куриная печень',        cat: 'meat', kcal: 167, p: 24.0, f: 6.5,  c: 0.9 },
    /* --- Рыба и морепродукты --- */
    { id: 'f-salmon',    name: 'Лосось',                cat: 'fish', kcal: 208, p: 20.0, f: 13.0, c: 0 },
    { id: 'f-tuna',      name: 'Тунец (в с/с)',         cat: 'fish', kcal: 116, p: 26.0, f: 1.0,  c: 0 },
    { id: 'f-cod',       name: 'Треска',                cat: 'fish', kcal: 82,  p: 18.0, f: 0.7,  c: 0 },
    { id: 'f-mackerel',  name: 'Скумбрия',              cat: 'fish', kcal: 205, p: 19.0, f: 13.9, c: 0 },
    { id: 'f-shrimp',    name: 'Креветки',              cat: 'fish', kcal: 99,  p: 24.0, f: 0.3,  c: 0.2 },
    { id: 'f-herring',   name: 'Сельдь',                cat: 'fish', kcal: 158, p: 18.0, f: 9.0,  c: 0 },
    { id: 'f-squid',     name: 'Кальмар',               cat: 'fish', kcal: 92,  p: 15.6, f: 1.4,  c: 3.1 },
    { id: 'f-caviar',    name: 'Икра красная',          cat: 'fish', kcal: 264, p: 24.6, f: 17.9, c: 4.0 },
    /* --- Молочные продукты --- */
    { id: 'f-milk',      name: 'Молоко 2.5%',           cat: 'dairy', kcal: 52,  p: 2.8, f: 2.5,   c: 4.7 },
    { id: 'f-kefir',     name: 'Кефир 1%',              cat: 'dairy', kcal: 40,  p: 3.0, f: 1.0,   c: 4.0 },
    { id: 'f-curd',      name: 'Творог 5%',             cat: 'dairy', kcal: 121, p: 17.0, f: 5.0,  c: 3.0 },
    { id: 'f-curd0',     name: 'Творог обезжиренный',   cat: 'dairy', kcal: 79,  p: 18.0, f: 0.5,  c: 1.5 },
    { id: 'f-yogurt',    name: 'Йогурт натуральный 3.2%', cat: 'dairy', kcal: 66, p: 5.0, f: 3.2, c: 3.5 },
    { id: 'f-smetana',   name: 'Сметана 15%',           cat: 'dairy', kcal: 158, p: 2.6, f: 15.0, c: 3.6 },
    { id: 'f-cheese',    name: 'Сыр твёрдый',           cat: 'dairy', kcal: 364, p: 25.0, f: 29.0, c: 0 },
    { id: 'f-mozz',      name: 'Моцарелла',             cat: 'dairy', kcal: 280, p: 22.0, f: 17.0, c: 2.2 },
    { id: 'f-creamcheese', name: 'Сыр творожный',       cat: 'dairy', kcal: 253, p: 6.0, f: 24.0, c: 4.0 },
    { id: 'f-ryazhenka', name: 'Ряженка 4%',            cat: 'dairy', kcal: 67,  p: 3.0, f: 4.0,  c: 4.2 },
    /* --- Яйца --- */
    { id: 'f-egg',       name: 'Яйцо куриное',          cat: 'eggs', kcal: 143, p: 12.6, f: 9.5,  c: 0.7 },
    { id: 'f-egg-boil',  name: 'Яйцо варёное',          cat: 'eggs', kcal: 155, p: 12.6, f: 10.6, c: 1.1 },
    { id: 'f-white',     name: 'Белок яйца',            cat: 'eggs', kcal: 52,  p: 11.0, f: 0.2,  c: 0.7 },
    { id: 'f-yolk',      name: 'Желток яйца',           cat: 'eggs', kcal: 322, p: 16.0, f: 27.0, c: 3.6 },
    /* --- Крупы и злаки --- */
    { id: 'f-rice',      name: 'Рис белый варёный',     cat: 'grains', kcal: 130, p: 2.7, f: 0.3, c: 28.0 },
    { id: 'f-brownrice', name: 'Рис бурый варёный',     cat: 'grains', kcal: 111, p: 2.6, f: 0.9, c: 23.0 },
    { id: 'f-buckwheat', name: 'Гречка варёная',        cat: 'grains', kcal: 92,  p: 3.4, f: 0.6, c: 20.0 },
    { id: 'f-oatmeal',   name: 'Овсянка на воде',       cat: 'grains', kcal: 88,  p: 3.0, f: 1.7, c: 15.0 },
    { id: 'f-pasta',     name: 'Макароны варёные',      cat: 'grains', kcal: 131, p: 5.0, f: 1.1, c: 25.0 },
    { id: 'f-bulgur',    name: 'Булгур варёный',        cat: 'grains', kcal: 83,  p: 3.1, f: 0.2, c: 19.0 },
    { id: 'f-quinoa',    name: 'Киноа варёная',         cat: 'grains', kcal: 120, p: 4.4, f: 1.9, c: 21.0 },
    { id: 'f-bread-wg',  name: 'Хлеб цельнозерновой',   cat: 'grains', kcal: 247, p: 13.0, f: 3.4, c: 41.0 },
    { id: 'f-bread-w',   name: 'Хлеб белый',            cat: 'grains', kcal: 265, p: 9.0, f: 3.2, c: 49.0 },
    { id: 'f-corn',      name: 'Кукуруза варёная',      cat: 'grains', kcal: 96,  p: 3.4, f: 1.5, c: 21.0 },
    /* --- Овощи --- */
    { id: 'f-cucumber',  name: 'Огурец',                cat: 'veg', kcal: 15, p: 0.8, f: 0.1, c: 3.6 },
    { id: 'f-tomato',    name: 'Помидор',               cat: 'veg', kcal: 18, p: 0.9, f: 0.2, c: 3.9 },
    { id: 'f-cabbage',   name: 'Капуста белокочанная',  cat: 'veg', kcal: 25, p: 1.3, f: 0.1, c: 5.8 },
    { id: 'f-broccoli',  name: 'Брокколи',              cat: 'veg', kcal: 34, p: 2.8, f: 0.4, c: 6.6 },
    { id: 'f-carrot',    name: 'Морковь',               cat: 'veg', kcal: 41, p: 0.9, f: 0.2, c: 9.6 },
    { id: 'f-beet',      name: 'Свёкла',                cat: 'veg', kcal: 43, p: 1.6, f: 0.2, c: 9.6 },
    { id: 'f-potato',    name: 'Картофель варёный',     cat: 'veg', kcal: 87, p: 1.9, f: 0.1, c: 20.0 },
    { id: 'f-zucchini',  name: 'Кабачок',               cat: 'veg', kcal: 17, p: 1.2, f: 0.3, c: 3.1 },
    { id: 'f-pepper',    name: 'Перец болгарский',      cat: 'veg', kcal: 31, p: 1.0, f: 0.3, c: 6.0 },
    { id: 'f-onion',     name: 'Лук репчатый',          cat: 'veg', kcal: 40, p: 1.1, f: 0.1, c: 9.3 },
    { id: 'f-spinach',   name: 'Шпинат',                cat: 'veg', kcal: 23, p: 2.9, f: 0.4, c: 3.6 },
    { id: 'f-avocado',   name: 'Авокадо',               cat: 'veg', kcal: 160, p: 2.0, f: 14.7, c: 8.5 },
    { id: 'f-mushroom',  name: 'Шампиньоны',            cat: 'veg', kcal: 22, p: 3.1, f: 0.3, c: 3.3 },
    /* --- Фрукты и ягоды --- */
    { id: 'f-apple',     name: 'Яблоко',                cat: 'fruit', kcal: 52, p: 0.3, f: 0.2, c: 14.0 },
    { id: 'f-banana',    name: 'Банан',                 cat: 'fruit', kcal: 89, p: 1.1, f: 0.3, c: 22.8 },
    { id: 'f-orange',    name: 'Апельсин',              cat: 'fruit', kcal: 47, p: 0.9, f: 0.1, c: 11.8 },
    { id: 'f-pear',      name: 'Груша',                 cat: 'fruit', kcal: 57, p: 0.4, f: 0.1, c: 15.0 },
    { id: 'f-grapes',    name: 'Виноград',              cat: 'fruit', kcal: 69, p: 0.7, f: 0.2, c: 18.1 },
    { id: 'f-strawberry', name: 'Клубника',             cat: 'fruit', kcal: 32, p: 0.7, f: 0.3, c: 7.7 },
    { id: 'f-blueberry', name: 'Черника',               cat: 'fruit', kcal: 57, p: 0.7, f: 0.3, c: 14.5 },
    { id: 'f-watermelon', name: 'Арбуз',                cat: 'fruit', kcal: 30, p: 0.6, f: 0.2, c: 7.6 },
    { id: 'f-kiwi',      name: 'Киви',                  cat: 'fruit', kcal: 61, p: 1.1, f: 0.5, c: 14.7 },
    { id: 'f-mango',     name: 'Манго',                 cat: 'fruit', kcal: 60, p: 0.8, f: 0.4, c: 15.0 },
    /* --- Орехи и семена --- */
    { id: 'f-almond',    name: 'Миндаль',               cat: 'nuts', kcal: 579, p: 21.0, f: 50.0, c: 22.0 },
    { id: 'f-walnut',    name: 'Грецкий орех',          cat: 'nuts', kcal: 654, p: 15.0, f: 65.0, c: 14.0 },
    { id: 'f-hazelnut',  name: 'Фундук',                cat: 'nuts', kcal: 628, p: 15.0, f: 61.0, c: 17.0 },
    { id: 'f-peanut',    name: 'Арахис',                cat: 'nuts', kcal: 567, p: 26.0, f: 49.0, c: 16.0 },
    { id: 'f-sunflower', name: 'Семена подсолнечника',  cat: 'nuts', kcal: 584, p: 21.0, f: 51.0, c: 20.0 },
    { id: 'f-chia',      name: 'Семена чиа',            cat: 'nuts', kcal: 486, p: 17.0, f: 31.0, c: 42.0 },
    { id: 'f-cashew',    name: 'Кешью',                 cat: 'nuts', kcal: 553, p: 18.0, f: 44.0, c: 30.0 },
    /* --- Бобовые --- */
    { id: 'f-beans',     name: 'Фасоль варёная',        cat: 'legumes', kcal: 127, p: 8.7, f: 0.5, c: 23.0 },
    { id: 'f-lentil',    name: 'Чечевица варёная',      cat: 'legumes', kcal: 116, p: 9.0, f: 0.4, c: 20.0 },
    { id: 'f-peas',      name: 'Горох варёный',         cat: 'legumes', kcal: 81,  p: 5.4, f: 0.4, c: 14.0 },
    { id: 'f-chickpea',  name: 'Нут варёный',           cat: 'legumes', kcal: 164, p: 8.9, f: 2.6, c: 27.0 },
    { id: 'f-tofu',      name: 'Тофу',                  cat: 'legumes', kcal: 76,  p: 8.1, f: 4.8, c: 1.9 },
    /* --- Масла и жиры --- */
    { id: 'f-olive-oil', name: 'Масло оливковое',       cat: 'oils', kcal: 884, p: 0, f: 100.0, c: 0 },
    { id: 'f-sun-oil',   name: 'Масло подсолнечное',    cat: 'oils', kcal: 884, p: 0, f: 100.0, c: 0 },
    { id: 'f-butter',    name: 'Масло сливочное',       cat: 'oils', kcal: 717, p: 0.9, f: 81.0, c: 0.1 },
    { id: 'f-margarine', name: 'Маргарин',              cat: 'oils', kcal: 717, p: 0.2, f: 80.0, c: 1.0 },
    { id: 'f-lard',      name: 'Сало',                  cat: 'oils', kcal: 797, p: 2.4, f: 89.0, c: 0 },
    /* --- Напитки --- */
    { id: 'f-coffee',    name: 'Кофе чёрный',           cat: 'drinks', kcal: 2, p: 0.1, f: 0, c: 0 },
    { id: 'f-tea',       name: 'Чай без сахара',        cat: 'drinks', kcal: 1, p: 0, f: 0, c: 0 },
    { id: 'f-juice',     name: 'Сок апельсиновый',      cat: 'drinks', kcal: 45, p: 0.7, f: 0.2, c: 10.4 },
    { id: 'f-cola',      name: 'Кола',                  cat: 'drinks', kcal: 42, p: 0, f: 0, c: 10.6 },
    { id: 'f-water',     name: 'Вода',                  cat: 'drinks', kcal: 0, p: 0, f: 0, c: 0 },
    /* --- Сладкое и снеки --- */
    { id: 'f-dark-choc', name: 'Шоколад тёмный 70%',    cat: 'sweets', kcal: 598, p: 7.8, f: 43.0, c: 46.0 },
    { id: 'f-milk-choc', name: 'Шоколад молочный',      cat: 'sweets', kcal: 535, p: 7.6, f: 30.0, c: 59.0 },
    { id: 'f-cookie',    name: 'Печенье',               cat: 'sweets', kcal: 417, p: 5.0, f: 14.0, c: 71.0 },
    { id: 'f-chips',     name: 'Чипсы',                 cat: 'sweets', kcal: 536, p: 7.0, f: 35.0, c: 53.0 },
    { id: 'f-honey',     name: 'Мёд',                   cat: 'sweets', kcal: 304, p: 0.3, f: 0, c: 82.4 },
    { id: 'f-sugar',     name: 'Сахар',                 cat: 'sweets', kcal: 387, p: 0, f: 0, c: 100.0 },
    { id: 'f-icecream',  name: 'Мороженое',             cat: 'sweets', kcal: 207, p: 3.5, f: 11.0, c: 24.0 },
    { id: 'f-pizza',     name: 'Пицца',                 cat: 'sweets', kcal: 266, p: 11.0, f: 10.0, c: 33.0 },
    { id: 'f-cake',      name: 'Торт',                  cat: 'sweets', kcal: 371, p: 4.7, f: 15.0, c: 55.0 },
    /* --- Прочее --- */
    { id: 'f-mayo',      name: 'Майонез',               cat: 'other', kcal: 680, p: 1.0, f: 75.0, c: 0.6 },
    { id: 'f-ketchup',   name: 'Кетчуп',                cat: 'other', kcal: 93, p: 1.3, f: 0.1, c: 22.0 },
    { id: 'f-soy',       name: 'Соевый соус',           cat: 'other', kcal: 53, p: 8.1, f: 0.1, c: 4.9 },
    { id: 'f-olives',    name: 'Оливки',                cat: 'other', kcal: 145, p: 1.0, f: 15.0, c: 3.8 },
    { id: 'f-granola',   name: 'Гранола',               cat: 'other', kcal: 471, p: 10.0, f: 20.0, c: 64.0 },
    { id: 'f-protein-bar', name: 'Протеиновый батончик', cat: 'other', kcal: 350, p: 30.0, f: 10.0, c: 40.0 },
    { id: 'f-hummus',    name: 'Хумус',                 cat: 'other', kcal: 166, p: 7.9, f: 9.6, c: 14.3 }
  ];

  const MEALS = [
    { id: 'breakfast', label: 'Завтрак' },
    { id: 'lunch', label: 'Обед' },
    { id: 'dinner', label: 'Ужин' },
    { id: 'snack', label: 'Перекус' }
  ];
  const MEAL_LABEL = {};
  MEALS.forEach((m) => { MEAL_LABEL[m.id] = m.label; });

  const ACTIVITY = [
    { coef: 1.2,   label: 'Минимальная',    hint: 'сидячий образ жизни, без тренировок' },
    { coef: 1.375, label: 'Небольшая',      hint: '1–3 тренировки в неделю' },
    { coef: 1.55,  label: 'Средняя',        hint: '3–5 тренировок в неделю' },
    { coef: 1.725, label: 'Высокая',        hint: '6–7 тренировок в неделю' },
    { coef: 1.9,   label: 'Очень высокая',  hint: 'физическая работа и 2 тренировки в день' }
  ];

  const GOALS = [
    { id: 'lose', label: 'Похудение',    delta: -0.20, protein: 2.0, fat: 0.8 },
    { id: 'keep', label: 'Поддержание',  delta: 0,     protein: 1.6, fat: 0.9 },
    { id: 'gain', label: 'Набор массы',  delta: 0.15,  protein: 1.8, fat: 1.0 }
  ];

  const goalById = (id) => GOALS.find((g) => g.id === id) || GOALS[1];

  /* ============================================================
     Расчёты
     ============================================================ */

  const clampNum = (v, lo, hi, dflt) => {
    const n = Number(v);
    if (!isFinite(n)) return dflt;
    return Math.min(hi, Math.max(lo, n));
  };

  /** Приводим профиль к допустимым значениям */
  function normProfile(pr) {
    const p = pr || {};
    return {
      sex: p.sex === 'm' ? 'm' : 'f',
      age: Math.round(clampNum(p.age, 10, 100, 30)),
      height: Math.round(clampNum(p.height, 100, 250, 170)),
      weight: Math.round(clampNum(p.weight, 30, 300, 70) * 10) / 10,
      activity: clampNum(p.activity, 1.0, 2.2, 1.375),
      goal: GOALS.some((g) => g.id === p.goal) ? p.goal : 'keep'
    };
  }

  /** Базовый метаболизм, формула Миффлина — Сан-Жеора */
  function bmr(pr) {
    const p = normProfile(pr);
    const base = 10 * p.weight + 6.25 * p.height - 5 * p.age;
    return Math.round(p.sex === 'm' ? base + 5 : base - 161);
  }

  /** Суточный расход с учётом активности (TDEE) */
  function tdee(pr) {
    const p = normProfile(pr);
    return Math.round(bmr(p) * p.activity);
  }

  /** Целевая калорийность под выбранную цель */
  function targetKcal(pr) {
    const p = normProfile(pr);
    return Math.round(tdee(p) * (1 + goalById(p.goal).delta));
  }

  /** Норма БЖУ в граммах под цель */
  function macros(pr) {
    const p = normProfile(pr);
    const g = goalById(p.goal);
    const kcal = targetKcal(p);
    const protein = Math.round(p.weight * g.protein);
    const fat = Math.round(p.weight * g.fat);
    const carbs = Math.round(Math.max(0, kcal - protein * 4 - fat * 9) / 4);
    return { kcal: kcal, p: protein, f: fat, c: carbs };
  }

  function bmi(pr) {
    const p = normProfile(pr);
    return Math.round((p.weight / Math.pow(p.height / 100, 2)) * 10) / 10;
  }

  function bmiCategory(v) {
    if (v < 18.5) return 'недостаточный вес';
    if (v < 25) return 'норма';
    if (v < 30) return 'избыточный вес';
    return 'ожирение';
  }

  /** Норма воды, мл (30 мл на кг) */
  function waterMl(pr) {
    const p = normProfile(pr);
    return Math.round(p.weight * 30);
  }

  function idealWeight(pr) {
    const p = normProfile(pr);
    const h = p.height / 100;
    return { min: Math.round(18.5 * h * h), max: Math.round(24.9 * h * h) };
  }

  const calc = {
    normProfile: normProfile, bmr: bmr, tdee: tdee, targetKcal: targetKcal,
    macros: macros, bmi: bmi, bmiCategory: bmiCategory, waterMl: waterMl,
    idealWeight: idealWeight
  };

  /* ============================================================
     Данные и состояние интерфейса
     ============================================================ */

  const data = () => Store.state().nutrition;

  const ns = { tab: 'calc', date: null, cat: 'all', q: '', meal: 'breakfast' };

  function todayKey() { return ns.date || RU.today(); }

  function profile() { return data().profile; }

  function allFoods() {
    const custom = (data().custom || []).map((f) => Object.assign({ custom: true }, f));
    return FOODS.concat(custom);
  }

  function foodById(id) { return allFoods().find((f) => f.id === id) || null; }

  function round1(v) { return Math.round(v * 10) / 10; }

  /** Пересчёт продукта на нужную массу */
  function portion(food, grams) {
    const k = (Number(grams) || 0) / 100;
    return {
      kcal: Math.round(food.kcal * k),
      p: round1(food.p * k), f: round1(food.f * k), c: round1(food.c * k)
    };
  }

  function dayEntries(date) {
    return data().entries.filter((e) => e.date === date);
  }

  function dayTotals(date) {
    const t = { kcal: 0, p: 0, f: 0, c: 0 };
    dayEntries(date).forEach((e) => {
      t.kcal += e.kcal; t.p += e.p; t.f += e.f; t.c += e.c;
    });
    return { kcal: Math.round(t.kcal), p: round1(t.p), f: round1(t.f), c: round1(t.c) };
  }

  function waterCups(date) { return (data().water[date] || 0); }

  /* ============================================================
     Разметка
     ============================================================ */

  const fmt = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

  function bar(percent, cls) {
    const v = Math.max(0, Math.min(100, Math.round(percent)));
    return '<div class="nt-bar"><span class="nt-bar__fill ' + (cls || '') +
      '" style="width:' + v + '%"></span></div>';
  }

  function template() {
    return '<div class="nt">' +
      '<div class="segments nt-tabs">' +
        tabBtn('calc', 'Калькулятор') +
        tabBtn('diary', 'Дневник') +
        tabBtn('foods', 'Продукты') +
      '</div>' +
      '<div class="nt__body" id="ntBody">' + bodyHTML() + '</div>' +
    '</div>';
  }

  function tabBtn(id, label) {
    return '<button type="button" class="segments__opt' + (ns.tab === id ? ' is-active' : '') +
      '" data-nt="tab" data-val="' + id + '">' + label + '</button>';
  }

  function bodyHTML() {
    if (ns.tab === 'diary') return diaryHTML();
    if (ns.tab === 'foods') return foodsHTML();
    return calcHTML();
  }

  /* ---------- Калькулятор ---------- */

  function optionList(list, value, valKey, labelKey, hintKey) {
    return list.map((o) => {
      const v = o[valKey];
      return '<option value="' + v + '"' + (String(v) === String(value) ? ' selected' : '') + '>' +
        o[labelKey] + (hintKey && o[hintKey] ? ' — ' + o[hintKey] : '') + '</option>';
    }).join('');
  }

  function calcHTML() {
    const p = normProfile(profile());
    return '<div class="nt-calc">' +
      '<section class="card nt-form">' +
        '<h3>Ваши параметры</h3>' +
        '<form id="ntForm" class="form" novalidate>' +
          '<div class="form__row">' +
            '<label class="field"><span class="field__label">Пол</span>' +
              '<select class="field__input" name="sex">' +
                '<option value="f"' + (p.sex === 'f' ? ' selected' : '') + '>Женский</option>' +
                '<option value="m"' + (p.sex === 'm' ? ' selected' : '') + '>Мужской</option>' +
              '</select></label>' +
            '<label class="field"><span class="field__label">Возраст, лет</span>' +
              '<input class="field__input" name="age" type="number" min="10" max="100" value="' + p.age + '"></label>' +
          '</div>' +
          '<div class="form__row">' +
            '<label class="field"><span class="field__label">Рост, см</span>' +
              '<input class="field__input" name="height" type="number" min="100" max="250" value="' + p.height + '"></label>' +
            '<label class="field"><span class="field__label">Вес, кг</span>' +
              '<input class="field__input" name="weight" type="number" min="30" max="300" step="0.5" value="' + p.weight + '"></label>' +
          '</div>' +
          '<label class="field"><span class="field__label">Уровень активности</span>' +
            '<select class="field__input" name="activity">' +
              optionList(ACTIVITY, p.activity, 'coef', 'label', 'hint') +
            '</select></label>' +
          '<label class="field"><span class="field__label">Цель</span>' +
            '<select class="field__input" name="goal">' +
              optionList(GOALS, p.goal, 'id', 'label') +
            '</select></label>' +
        '</form>' +
      '</section>' +
      '<section class="nt-results" id="ntResults">' + resultsHTML() + '</section>' +
    '</div>';
  }

  function resultsHTML() {
    const p = normProfile(profile());
    const g = goalById(p.goal);
    const m = macros(p);
    const t = tdee(p);
    const b = bmr(p);
    const bmiV = bmi(p);
    const ideal = idealWeight(p);
    const water = waterMl(p);
    const deltaPct = Math.round(g.delta * 100);

    return '<div class="nt-hero">' +
        '<div class="nt-hero__main">' +
          '<span class="nt-hero__label">Ваша норма в день</span>' +
          '<span class="nt-hero__val">' + fmt(m.kcal) + '<small> ккал</small></span>' +
          '<span class="nt-hero__sub">' + g.label +
            (deltaPct ? ' · ' + (deltaPct > 0 ? '+' : '') + deltaPct + '% к расходу' : ' · без дефицита') + '</span>' +
        '</div>' +
        '<div class="nt-hero__mini">' +
          '<div class="nt-mini"><b>' + fmt(b) + '</b><span>базовый обмен</span></div>' +
          '<div class="nt-mini"><b>' + fmt(t) + '</b><span>с активностью</span></div>' +
        '</div>' +
      '</div>' +

      '<div class="nt-macros">' +
        macroCard('Белки', m.p, 'var(--teal)') +
        macroCard('Жиры', m.f, 'var(--gold)') +
        macroCard('Углеводы', m.c, 'var(--accent)') +
      '</div>' +

      '<section class="card nt-facts">' +
        '<h3>Дополнительно</h3>' +
        '<div class="nt-fact"><span>Индекс массы тела</span><b>' + bmiV + ' · ' + bmiCategory(bmiV) + '</b></div>' +
        '<div class="nt-fact"><span>Здоровый вес при вашем росте</span><b>' + ideal.min + '–' + ideal.max + ' кг</b></div>' +
        '<div class="nt-fact"><span>Норма воды</span><b>' + fmt(water) + ' мл (≈' + Math.round(water / 250) + ' стаканов)</b></div>' +
        '<p class="nt-note">Расчёт по формуле Миффлина — Сан-Жеора с коэффициентом активности. ' +
          'Это ориентир, а не медицинская рекомендация — при необходимости уточните норму у специалиста.</p>' +
      '</section>';
  }

  function macroCard(label, grams, color) {
    const kcal = Math.round(grams * (label === 'Жиры' ? 9 : 4));
    const pct = grams > 0 ? Math.round(grams * (label === 'Жиры' ? 9 : 4)) : 0;
    return '<article class="card nt-macro" style="--nt-color:' + color + '">' +
      '<span class="nt-macro__lab">' + label + '</span>' +
      '<span class="nt-macro__val">' + grams + '<small> г</small></span>' +
      '<span class="nt-macro__kcal">' + kcal + ' ккал</span>' +
      '<span class="nt-macro__pct">' + pct + '%</span>' +
    '</article>';
  }

  /* ---------- Дневник ---------- */

  function diaryHTML() {
    const date = todayKey();
    const d = RU.fromKey(date);
    const tot = dayTotals(date);
    const m = macros(profile());
    const entries = dayEntries(date);

    const nav = '<div class="nt-datenav">' +
        '<button type="button" class="icon-btn" data-nt="day-prev" aria-label="Предыдущий день">←</button>' +
        '<button type="button" class="nt-datenav__label" data-nt="day-today">' +
          RU.formatDateShort(d) + ' · ' + RU.weekdayName(d) + '</button>' +
        '<button type="button" class="icon-btn" data-nt="day-next" aria-label="Следующий день">→</button>' +
      '</div>';

    const summary = '<section class="card nt-sum">' +
        '<div class="nt-sum__head">' +
          '<span>Съедено: <b>' + fmt(tot.kcal) + '</b> из ' + fmt(m.kcal) + ' ккал</span>' +
          '<span class="nt-sum__left">Осталось: <b>' + fmt(Math.max(0, m.kcal - tot.kcal)) + '</b></span>' +
        '</div>' +
        bar(m.kcal ? (tot.kcal / m.kcal) * 100 : 0, 'is-kcal') +
        '<div class="nt-sum__macros">' +
          sumMacro('Б', tot.p, m.p, 'is-p') +
          sumMacro('Ж', tot.f, m.f, 'is-f') +
          sumMacro('У', tot.c, m.c, 'is-c') +
        '</div>' +
        waterHTML(date) +
      '</section>';

    const meals = '<div class="nt-meals">' + MEALS.map((meal) => {
      const list = entries.filter((e) => e.meal === meal.id);
      const kcal = list.reduce((s, e) => s + e.kcal, 0);
      return '<section class="card nt-meal">' +
        '<div class="nt-meal__head">' +
          '<h3>' + meal.label + '</h3>' +
          '<span class="nt-meal__kcal">' + (kcal ? fmt(kcal) + ' ккал' : '—') + '</span>' +
          '<button type="button" class="btn btn--sm btn--ghost" data-nt="add" data-meal="' + meal.id + '">+</button>' +
        '</div>' +
        (list.length
          ? '<div class="nt-meal__list">' + list.map((e) => entryRow(e)).join('') + '</div>'
          : '<p class="nt-muted">Ничего не добавлено</p>') +
      '</section>';
    }).join('') + '</div>';

    return nav + summary + meals;
  }

  function sumMacro(label, cur, goal, cls) {
    const pct = goal ? (cur / goal) * 100 : 0;
    return '<div class="nt-sm">' +
      '<div class="nt-sm__top"><span>' + label + '</span><b>' + cur + ' / ' + goal + ' г</b></div>' +
      bar(pct, cls) +
    '</div>';
  }

  function waterHTML(date) {
    const cups = waterCups(date);
    const ml = cups * 250;
    const goalCups = Math.max(1, Math.round(waterMl(profile()) / 250));
    return '<div class="nt-water">' +
      '<div class="nt-water__info"><span>💧 Вода</span><b>' + fmt(ml) + ' мл · ' + cups + ' из ' + goalCups + '</b></div>' +
      '<div class="nt-water__btns">' +
        '<button type="button" class="icon-btn" data-nt="water-dec" aria-label="Меньше воды">−</button>' +
        '<button type="button" class="btn btn--sm btn--ghost" data-nt="water-add">+ стакан</button>' +
      '</div>' +
      bar((cups / goalCups) * 100, 'is-water') +
    '</div>';
  }

  function entryRow(e) {
    const icon = e.foodId && foodById(e.foodId) ? CAT_ICON[foodById(e.foodId).cat] : '🍽';
    return '<div class="nt-entry">' +
      '<span class="nt-entry__ico" aria-hidden="true">' + icon + '</span>' +
      '<div class="nt-entry__t"><strong>' + RU.escapeHtml(e.name) + '</strong>' +
        '<span>' + e.grams + ' г · Б ' + e.p + ' · Ж ' + e.f + ' · У ' + e.c + '</span></div>' +
      '<span class="nt-entry__kcal">' + e.kcal + ' ккал</span>' +
      '<button type="button" class="icon-btn nt-del" data-nt="del" data-id="' + e.id +
        '" aria-label="Удалить">🗑</button>' +
    '</div>';
  }

  /* ---------- База продуктов ---------- */

  function foodsHTML() {
    const q = ns.q.trim().toLowerCase();
    const list = allFoods().filter((f) => {
      if (ns.cat !== 'all' && f.cat !== ns.cat) return false;
      if (q && f.name.toLowerCase().indexOf(q) === -1) return false;
      return true;
    });
    const chips = '<div class="nt-chips">' +
      chip('all', 'Все', '🍽') +
      CATS.map((c) => chip(c.id, c.label, c.icon)).join('') +
    '</div>';
    const head = '<div class="nt-foods__head">' +
        '<input class="field__input nt-search" data-nt="q" placeholder="Поиск продукта…" value="' +
          RU.escapeHtml(ns.q) + '">' +
        '<button type="button" class="btn btn--sm btn--accent" data-nt="new-food">+ Свой продукт</button>' +
      '</div>';
    const rows = list.length
      ? '<div class="nt-table">' +
          '<div class="nt-table__head"><span>Продукт</span><span>Ккал</span><span>Б</span><span>Ж</span><span>У</span><span></span></div>' +
          list.map(foodRow).join('') +
        '</div>'
      : '<div class="empty"><div class="empty__icon">🔍</div><h3>Ничего не найдено</h3>' +
        '<p>Измените запрос или выберите другую категорию.</p></div>';
    return head + chips + '<p class="nt-muted nt-count">Найдено: ' + list.length +
      ' ' + RU.plural(list.length, 'продукт', 'продукта', 'продуктов') +
      ' · значения на 100 г</p>' + rows;
  }

  function chip(id, label, icon) {
    return '<button type="button" class="nt-chip' + (ns.cat === id ? ' is-active' : '') +
      '" data-nt="cat" data-val="' + id + '">' + icon + ' ' + label + '</button>';
  }

  function foodRow(f) {
    return '<div class="nt-table__row">' +
      '<span class="nt-table__name">' + CAT_ICON[f.cat] + ' ' + RU.escapeHtml(f.name) +
        (f.custom ? '<em class="nt-tag">свой</em>' : '') + '</span>' +
      '<span class="nt-table__num is-kcal">' + f.kcal + '</span>' +
      '<span class="nt-table__num">' + f.p + '</span>' +
      '<span class="nt-table__num">' + f.f + '</span>' +
      '<span class="nt-table__num">' + f.c + '</span>' +
      '<button type="button" class="nt-add-btn" data-nt="pick" data-id="' + f.id +
        '" aria-label="Добавить в дневник">＋</button>' +
    '</div>';
  }

  /* ============================================================
     Действия
     ============================================================ */

  function paint(host) {
    host.innerHTML = template();
    bind(host);
  }

  function saveProfile(host) {
    const form = host.querySelector('#ntForm');
    if (!form) return;
    const v = (n) => form.querySelector('[name="' + n + '"]').value;
    const cur = profile();
    cur.sex = v('sex');
    cur.age = v('age');
    cur.height = v('height');
    cur.weight = v('weight');
    cur.activity = v('activity');
    cur.goal = v('goal');
    const fixed = normProfile(cur);
    Object.keys(fixed).forEach((k) => { cur[k] = fixed[k]; });
    Store.save();
    const res = host.querySelector('#ntResults');
    if (res) res.innerHTML = resultsHTML();
  }

  function addEntry(host, food, grams, meal, date) {
    const g = clampNum(grams, 1, 3000, 100);
    const part = portion(food, g);
    data().entries.unshift({
      id: RU.uid(), date: date || todayKey(), meal: meal || ns.meal,
      foodId: food.custom ? null : food.id, name: food.name, grams: Math.round(g),
      kcal: part.kcal, p: part.p, f: part.f, c: part.c
    });
    if (data().entries.length > 2000) data().entries.length = 2000;
    Store.save(true);
    UI.toast({ icon: '🥗', title: 'Добавлено', text: food.name + ' · ' + Math.round(g) + ' г', kind: 'ok' });
    paint(host);
  }

  function openAdd(host, meal, preset) {
    ns.meal = meal || ns.meal;
    let picked = preset || null;

    const mealSel = '<label class="field"><span class="field__label">Приём пищи</span>' +
      '<select class="field__input" id="ntMeal">' +
      MEALS.map((m) => '<option value="' + m.id + '"' + (m.id === ns.meal ? ' selected' : '') + '>' +
        m.label + '</option>').join('') + '</select></label>';

    const body = '<div class="nt-add">' +
      mealSel +
      '<div id="ntAddPick">' + (picked ? '<p class="nt-add__picked">' + CAT_ICON[picked.cat] + ' <b>' +
        RU.escapeHtml(picked.name) + '</b> · ' + picked.kcal + ' ккал на 100 г</p>' : '') + '</div>' +
      '<div class="form__row">' +
        '<label class="field"><span class="field__label">Порция, г</span>' +
          '<input class="field__input" id="ntGrams" type="number" min="1" max="3000" value="100"></label>' +
        '<div class="field"><span class="field__label">Итого</span>' +
          '<p class="nt-add__tot" id="ntTot">—</p></div>' +
      '</div>' +
      (picked ? '' : '<label class="field"><span class="field__label">Продукт</span>' +
        '<input class="field__input" id="ntPickQ" placeholder="Начните вводить название…"></label>' +
        '<div class="nt-pick" id="ntPickList"></div>') +
    '</div>';

    UI.openModal({
      title: 'Добавить в дневник', body: body, noFocus: false,
      foot: '<button class="btn btn--ghost" data-close="modal">Отмена</button>' +
        '<button class="btn btn--accent" id="ntAddSave"' + (picked ? '' : ' disabled') + '>Добавить</button>',
      onMount: (b, f) => {
        const gramsEl = b.querySelector('#ntGrams');
        const totEl = b.querySelector('#ntTot');
        const saveBtn = f.querySelector('#ntAddSave');

        const refreshTot = () => {
          if (!picked) { totEl.textContent = '—'; return; }
          const part = portion(picked, gramsEl.value);
          totEl.textContent = part.kcal + ' ккал · Б ' + part.p + ' · Ж ' + part.f + ' · У ' + part.c;
        };
        gramsEl.addEventListener('input', refreshTot);
        refreshTot();

        b.querySelector('#ntMeal').addEventListener('change', (e) => { ns.meal = e.target.value; });

        if (!picked) {
          const qEl = b.querySelector('#ntPickQ');
          const listEl = b.querySelector('#ntPickList');
          const draw = () => {
            const q = qEl.value.trim().toLowerCase();
            const res = allFoods().filter((x) => !q || x.name.toLowerCase().indexOf(q) !== -1).slice(0, 40);
            listEl.innerHTML = res.length ? res.map((x) =>
              '<button type="button" class="nt-pick__row" data-food="' + x.id + '">' +
                '<span>' + CAT_ICON[x.cat] + ' ' + RU.escapeHtml(x.name) + '</span>' +
                '<span class="nt-pick__k">' + x.kcal + ' ккал</span></button>').join('')
              : '<p class="nt-muted">Ничего не найдено.</p>';
          };
          qEl.addEventListener('input', draw);
          listEl.addEventListener('click', (e) => {
            const el = e.target.closest('[data-food]');
            if (!el) return;
            picked = foodById(el.getAttribute('data-food'));
            saveBtn.removeAttribute('disabled');
            b.querySelector('.nt-add__picked') && b.querySelector('.nt-add__picked').remove();
            const pc = document.createElement('p');
            pc.className = 'nt-add__picked';
            pc.innerHTML = CAT_ICON[picked.cat] + ' <b>' + RU.escapeHtml(picked.name) + '</b> · ' +
              picked.kcal + ' ккал на 100 г';
            b.querySelector('#ntAddPick').appendChild(pc);
            listEl.innerHTML = '';
            qEl.value = picked.name;
            refreshTot();
          });
          draw();
        }

        saveBtn.addEventListener('click', () => {
          if (!picked) return;
          const mealId = b.querySelector('#ntMeal').value;
          UI.closeModal();
          addEntry(host, picked, gramsEl.value, mealId);
        });
      }
    });
  }

  function openNewFood(host) {
    const body = '<form id="ntFoodForm" class="form" novalidate>' +
      '<label class="field"><span class="field__label">Название *</span>' +
        '<input class="field__input" name="name" maxlength="60" placeholder="Например, домашний йогурт"></label>' +
      '<div class="form__row">' +
        '<label class="field"><span class="field__label">Категория</span>' +
          '<select class="field__input" name="cat">' +
          CATS.map((c) => '<option value="' + c.id + '">' + c.icon + ' ' + c.label + '</option>').join('') +
          '</select></label>' +
        '<label class="field"><span class="field__label">Ккал / 100 г</span>' +
          '<input class="field__input" name="kcal" type="number" min="0" max="1000" value="0"></label>' +
      '</div>' +
      '<div class="form__row">' +
        '<label class="field"><span class="field__label">Белки / 100 г</span>' +
          '<input class="field__input" name="p" type="number" min="0" max="100" step="0.1" value="0"></label>' +
        '<label class="field"><span class="field__label">Жиры / 100 г</span>' +
          '<input class="field__input" name="f" type="number" min="0" max="100" step="0.1" value="0"></label>' +
        '<label class="field"><span class="field__label">Углеводы / 100 г</span>' +
          '<input class="field__input" name="c" type="number" min="0" max="100" step="0.1" value="0"></label>' +
      '</div>' +
      '<p class="nt-note">Значения указываются на 100 г продукта.</p>' +
    '</form>';
    UI.openModal({
      title: 'Свой продукт', body: body, noFocus: false,
      foot: '<button class="btn btn--ghost" data-close="modal">Отмена</button>' +
        '<button class="btn btn--accent" id="ntFoodSave">Сохранить</button>',
      onMount: (b, f) => {
        f.querySelector('#ntFoodSave').addEventListener('click', () => {
          const form = b.querySelector('#ntFoodForm');
          const q = (n) => form.querySelector('[name="' + n + '"]');
          const nameEl = q('name');
          const name = nameEl.value.trim();
          if (!name) { nameEl.focus(); return; }
          data().custom = data().custom || [];
          data().custom.unshift({
            id: 'c-' + RU.uid(), name: name, cat: q('cat').value,
            kcal: Math.round(clampNum(q('kcal').value, 0, 1000, 0)),
            p: clampNum(q('p').value, 0, 100, 0),
            f: clampNum(q('f').value, 0, 100, 0),
            c: clampNum(q('c').value, 0, 100, 0)
          });
          Store.save(true);
          UI.closeModal();
          UI.toast({ icon: '🥗', title: 'Продукт добавлен', text: name, kind: 'ok' });
          paint(host);
        });
      }
    });
  }

  /* ============================================================
     Привязка событий
     ============================================================ */

  function bind(host) {
    host.querySelector('.nt-tabs').addEventListener('click', (e) => {
      const b = e.target.closest('[data-val]');
      if (!b) return;
      ns.tab = b.getAttribute('data-val');
      paint(host);
    });

    const form = host.querySelector('#ntForm');
    if (form) {
      form.addEventListener('input', () => saveProfile(host));
      form.addEventListener('change', () => saveProfile(host));
    }

    const search = host.querySelector('[data-nt="q"]');
    if (search) {
      search.addEventListener('input', (e) => {
        ns.q = e.target.value;
        const body = host.querySelector('#ntBody');
        body.innerHTML = foodsHTML();
        const s = host.querySelector('[data-nt="q"]');
        if (s) { s.focus(); s.setSelectionRange(s.value.length, s.value.length); }
      });
    }

    host.querySelector('#ntBody').addEventListener('click', (e) => {
      const el = e.target.closest('[data-nt]');
      if (!el) return;
      const act = el.getAttribute('data-nt');
      const date = todayKey();

      if (act === 'cat') { ns.cat = el.getAttribute('data-val'); paint(host); }
      else if (act === 'new-food') openNewFood(host);
      else if (act === 'pick') openAdd(host, ns.meal, foodById(el.getAttribute('data-id')));
      else if (act === 'add') openAdd(host, el.getAttribute('data-meal'), null);
      else if (act === 'day-prev') { ns.date = RU.key(RU.addDays(RU.fromKey(date), -1)); paint(host); }
      else if (act === 'day-next') { ns.date = RU.key(RU.addDays(RU.fromKey(date), 1)); paint(host); }
      else if (act === 'day-today') { ns.date = null; paint(host); }
      else if (act === 'del') {
        const d = data();
        d.entries = d.entries.filter((x) => x.id !== el.getAttribute('data-id'));
        Store.save(true);
        paint(host);
      }
      else if (act === 'water-add') {
        const w = data().water;
        w[date] = (w[date] || 0) + 1;
        Store.save(true);
        paint(host);
      }
      else if (act === 'water-dec') {
        const w = data().water;
        w[date] = Math.max(0, (w[date] || 0) - 1);
        Store.save(true);
        paint(host);
      }
    });
  }

  /* ============================================================
     Публичный объект модуля
     ============================================================ */

  global.Nutrition = {
    route: 'nutrition',
    label: 'Питание',
    subtitle() {
      const m = macros(profile());
      return 'Норма: ' + fmt(m.kcal) + ' ккал · продуктов в базе: ' + allFoods().length;
    },
    mount(host) {
      ns.tab = 'calc';
      ns.date = null;
      ns.q = '';
      ns.cat = 'all';
      ns.meal = 'breakfast';
      paint(host);
    },
    foods: FOODS,
    categories: CATS,
    meals: MEALS,
    activityLevels: ACTIVITY,
    goals: GOALS,
    calc: calc,
    /* для автотестов */
    portion: portion,
    dayTotals: dayTotals
  };
})(window);
