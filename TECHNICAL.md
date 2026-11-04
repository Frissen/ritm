# Ритм — техническая документация

Версия приложения: **1.4** · Схема данных: **v1**

Документ предназначен для разработчиков, которые будут поддерживать и развивать проект.

---

## 1. Обзор

«Ритм» — одностраничное приложение (SPA) на **чистом JavaScript без фреймворков и сборщиков**. Внешних зависимостей нет; подключение к интернету требуется только для подгрузки шрифтов Google Fonts (при недоступности используются системные шрифты).

Ключевые принципы:

- **Нулевая сборка** — файлы подключаются напрямую через `<script>`; проект запускается открытием `index.html`.
- **Модульность через IIFE и глобальные пространства имён** — каждый модуль добавляет себя в `window` под своим именем.
- **Прогрессивное улучшение** — при недоступности API (localStorage, WebCrypto, Service Worker, Notification) работают безопасные фолбэки.
- **Русскоязычный интерфейс** с корректными склонениями (`RU.plural`).

---

## 2. Структура проекта

```
habit-tracker/
├── index.html          # каркас: заставка, экран входа, приложение, модальное окно, тосты, конфетти
├── manifest.json       # PWA-манифест (иконки, ярлыки, standalone)
├── sw.js               # service worker: офлайн-кэш, push, клик по уведомлению
├── icon.svg            # иконка приложения
├── css/
│   ├── styles.css      # дизайн-система: токены, темы, компоненты, адаптивность, печать
│   ├── chess.css       # стили раздела «Шахматы»
│   ├── training.css    # стили раздела «Тренировки»
│   ├── recipes.css     # стили раздела «Рецепты»
│   ├── music.css       # стили раздела «Музыка»
│   ├── nutrition.css   # стили раздела «Питание»
│   └── blackjack.css   # стили раздела «Блэкджек»
├── js/
│   ├── utils.js            # window.RU     — даты, DOM, строки, хеширование, палитра, иконки
│   ├── storage.js          # window.Store  — хранилище, пользователи, сессия, экспорт/импорт, облако
│   ├── model.js            # window.Model  — привычки, расписания, отметки, серии, достижения
│   ├── stats.js            # window.Stats  — агрегированная аналитика
│   ├── charts.js           # window.Charts — SVG/HTML-диаграммы
│   ├── notifications.js    # window.Notify — напоминания и системные уведомления
│   ├── ui.js               # window.UI     — экраны, формы, модалки, тосты, тема
│   ├── chess.js            # window.Chess    — шахматный движок и интерфейс партии
│   ├── training.js         # window.Training — программы, личные планы, журнал
│   ├── recipes.js          # window.Recipes  — каталог рецептов, фильтры, избранное
│   ├── music.js            # window.Music    — локальный аудиоплеер (IndexedDB)
│   ├── nutrition.js        # window.Nutrition— калории, БЖУ, база продуктов, дневник
│   ├── blackjack.js        # window.Blackjack— карточная игра против дилера
│   ├── modules.js          # window.Modules  — реестр дополнительных разделов
│   └── app.js              # window.App    — точка входа: авторизация, навигация, старт
├── desktop/
│   ├── Ritm.cs         # хост WebView2 (главное окно + режим виджета --widget)
│   ├── build.ps1       # сборка dist\Ritm.exe со встроенными ресурсами (ASCII)
│   └── …
└── tests/
    └── uitest.html     # автотесты в iframe (278 проверок)
```

### Порядок загрузки и зависимости

```html
utils.js → storage.js → model.js → stats.js → charts.js → notifications.js → ui.js
         → chess.js → training.js → recipes.js → music.js → nutrition.js → blackjack.js → modules.js → app.js
```

Зависимости однонаправленные: `UI` опирается на `RU/Store/Model/Stats/Charts/Notify`, `Model` — на `RU/Store`, и т.д. Дополнительные разделы (`chess/training/recipes/music/nutrition/blackjack`) регистрируются в реестре `Modules`; `ui.js` при неизвестном маршруте обращается к `Modules.get(route)`. `app.js` — последний, запускает всё после `DOMContentLoaded` (или сразу, если DOM уже готов).

---

## 3. Схема данных

Состояние одного пользователя (`Store.state()`) хранится как JSON:

```js
{
  version: 1,
  createdAt: "ISO",
  updatedAt: "ISO",
  settings: {
    theme: 'auto',          // auto | light | dark
    accent: '#F0512A',
    weekStart: 1,           // 1 = понедельник, 0 = воскресенье
    notifications: false,
    soundOnComplete: true,
    confetti: true,
    homeLayout: 'list',     // list | compact
    reminderOffset: 0
  },
  categories: [ { id, name, color, icon } ],   // 6 предустановленных
  habits: [ Habit ],
  logs: { [habitId]: { 'YYYY-MM-DD': number } },
  achievements: { [achievementId]: 'ISO' },
  chess: {
    stats: { wins: 0, losses: 0, draws: 0 },
    games: [ { result, reason, level, moves, at } ]   // до 20 партий
  },
  training: {
    lessons: { 'programId/lessonId': 'ISO' },   // отметки занятий
    plans: [ { id, name, goal, createdAt, items: [ { id, title, minutes, done } ] } ],
    sessions: [ { id, at, title, minutes } ]     // журнал, до 200 записей
  },
  recipes: {
    favorites: [ recipeId ],
    custom: [ Recipe ]                            // собственные рецепты
  },
  music: {
    tracks: [ { id, title, artist, seconds, kind: 'file' } ],  // метаданные (аудио — в IndexedDB)
    playlists: [ { id, name, trackIds: [] } ],
    favorites: [ trackId ],
    recent: [ trackId ]
  },
  nutrition: {
    profile: { sex: 'f', age: 30, height: 170, weight: 70, activity: 1.375, goal: 'keep' },
    custom: [ { id, name, cat, kcal, p, f, c } ],   // свои продукты (на 100 г)
    entries: [ { id, date, meal, foodId, name, grams, kcal, p, f, c } ],  // дневник, до 2000
    water: { 'YYYY-MM-DD': cups }                    // вода, стаканы по 250 мл
  },
  blackjack: {
    chips: 1000,             // банк фишек
    bet: 50,                 // последняя ставка
    stats: { hands: 0, wins: 0, losses: 0, pushes: 0, blackjacks: 0, best: 0 },
    history: [ { result, bet, payout, net, at } ]    // последние раздачи
  }
}
```

**Habit:**

```js
{
  id, name, description, categoryId,
  icon, color,
  target: 1,               // цель за день (>= 1)
  unit: '',                // «стаканов», «страниц»…
  freq: { type, days?, interval?, anchor? },
  reminder: 'HH:MM' | null,
  createdAt: 'ISO', createdAtKey: 'YYYY-MM-DD',
  updatedAt: 'ISO',
  archived: false,
  order: 0
}
```

**freq.type:** `daily` · `weekly` (`days: [0..6]`) · `interval` (`interval: N`, `anchor: 'YYYY-MM-DD'`) · `even` · `odd`.

Значение в `logs[habitId][dateKey]` — число (для цели 1 это 0/1). Привычка считается выполненной, если `value >= target`.

---

## 4. Ключи localStorage

Все ключи имеют префикс `ritm.v1`:

| Ключ | Назначение |
|---|---|
| `ritm.v1.users` | массив пользователей (id, name, login, pass (хеш), createdAt) |
| `ritm.v1.session` | id текущего пользователя |
| `ritm.v1.data.<userId>` | состояние пользователя (см. §3) |
| `ritm.v1.theme` | тема до входа (для экрана логина) |
| `ritm.v1.cloud` | конфигурация облака `{ url, token }` |
| `ritm.v1.backup.<userId>.<date>` | автоматический бэкап (по одному в день, до 7) |
| `ritm.v1.notified.<userId>.<date>` | журнал отправленных напоминаний за день |

**Устойчивость:** при недоступности localStorage (приватный режим, `file://` с ограничениями) включается фолбэк в память (`memory`), а `Store.isPersistent()` возвращает `false` — интерфейс предупреждает, что данные не сохранятся. При переполнении квоты сначала удаляются старые бэкапы.

**Хеширование пароля** (`RU.hash`): SHA-256 через WebCrypto с солью `ritm::v1::`; при отсутствии WebCrypto — FNV-1a с префиксом `fnv` (не криптостойкий, только для локального демо-хранилища).

---

## 5. Алгоритмы ядра (`model.js`)

### 5.1. Расписание (`Model.isScheduled(habit, date)`)

Возвращает `false`, если привычка в архиве или дата раньше `createdAtKey`. Далее по типу частоты:

- `daily` — всегда `true`;
- `weekly` — `date.getDay()` входит в `freq.days`;
- `even` / `odd` — чётность `date.getDate()`;
- `interval` — `diff = daysBetween(date, anchor)`, запланировано при `diff >= 0 && diff % N === 0` (якорь — дата создания или `freq.anchor`).

### 5.2. Серии

- **`currentStreak(habit, ref)`** — идёт от `ref` (по умолчанию сегодня) назад, считая подряд выполненные **запланированные** дни. Если сегодня запланировано, но ещё не выполнено — день не считается пропуском (серия не «сгорает»). Останавливается при первом пропуске.
- **`bestStreak(habit)`** — проход от `createdAtKey` до сегодня, отслеживание максимального непрерывного участка.

Обе функции кешируются в `memo` по ключу `id@version` (см. §8).

### 5.3. Статистика периода

`periodStats(habit, from, to)` → `{ scheduled, done, rate }`: идёт по дням, считает запланированные и выполненные.

`daySummary(date)` → `{ total, done, partial, left, rate }` по всем привычкам дня.

### 5.4. Достижения

Массив из 8 описаний с функцией `check(aggregate)`. `achievementStats()` агрегирует `totalDone`, `bestStreak`, `weekScheduled`, `weekRate`, число активных привычек и категорий. `checkAchievements()` записывает новые в `state.achievements` и возвращает их список.

---

## 6. Аналитика (`stats.js`)

- `Stats.range(type, ref)` — границы периода (`week`/`month`/`year`/`all`) + предыдущий период для тренда.
- `Stats.overview(range)` — `{ scheduled, done, missed, partial, rate, prevRate, delta, activeDays, habits }`.
- `Stats.dailySeries(from, to)` — ряд по дням `{ key, date, scheduled, done, rate }`.
- `Stats.byCategory(range)` — разбивка по категориям, сортировка по проценту.
- `Stats.heatmap(from, to)` — уровни 0–3 (100% → 3, ≥60% → 2, >0 → 1).
- `Stats.byWeekday(from, to)` — 7 строк с учётом `weekStart`.
- `Stats.streakBoard(limit)` — рейтинг серий (сортировка: текущая, затем лучшая).
- `Stats.rateTrend(from, to, bucket)` — точки графика (bucket > 1 — агрегация по неделям).
- `Stats.weekMatrix(ref)` — матрица текущей недели для таблицы.
- `Stats.weeklyComparison(weeks)` — сравнение последних недель.

Диаграммы (`charts.js`) — чистые функции, возвращающие строки HTML/SVG: `ring`, `bars`, `hbars`, `heatmap(cells, pad)`, `miniGrid(habit, days)`, `spark(points)`.

---

## 7. Интерфейс (`ui.js`)

- **Маршруты:** `today`, `habits`, `stats`, `profile` — встроенные; `chess`, `training`, `recipes`, `music`, `nutrition`, `blackjack` — из реестра `Modules`. `UI.setRoute(route)` переключает активный пункт навигации, вызывает `UI.render()` и прокручивает вверх. Текущий маршрут — `UI.route`.
- **Рендеринг:** `renderToday` / `renderHabits` / `renderStats` / `renderProfile` формируют HTML и записывают в `#view`.
- **Делегирование событий:** один обработчик `click`/`change`/`input`/`keydown` на `document`; действия помечаются атрибутом `data-act` (маршруты — `data-route`, сервисные действия — `data-action`).
- **Частичное обновление:** `updateRowVisual(id)` заменяет только строку привычки и блок hero после отметки — без полной перерисовки экрана.
- **Модальные окна:** `UI.openModal({ title, body, foot, onMount })`, закрытие `UI.closeModal()` (Escape, клик по фону, крестик).
- **Тема:** `UI.applyTheme(pref)` устанавливает `data-theme` на `<html>`, обновляет `theme-color`; `UI.toggleTheme()` переключает светлая/тёмная; режим `auto` реагирует на `prefers-color-scheme`.
- **Обратная связь:** `UI.toast(...)`, `UI.confetti(n)`, `UI.beep()`.
- **Состояние интерфейса** (`UI.state`, не сохраняется): `range`, `filter`, `search`, `sort`, `statsHabit`, `editId`.

### Форма привычки

`UI.openHabitEditor(id)` — id `null` создаёт, иначе редактирует (внутри выставляется `uiState.editId`). Частота переключается сегментами; для `weekly`/`interval` динамически отрисовывается дополнительный блок. `saveHabit()` валидирует название (и дни недели для `weekly`) и вызывает `Model.create` / `Model.update`.

### Реестр дополнительных разделов (`modules.js`)

Дополнительные разделы подключаются единообразно. Каждый модуль экспортирует объект:

```js
window.SomeModule = { route, label, subtitle(), mount(host) }
```

`modules.js` собирает их в `window.Modules = { items, get, has, render, label, subtitle }`. `UI.render()` при неизвестном встроенном маршруте вызывает `Modules.get(UI.route).mount(view())`. Все модули — IIFE, пишут в своё пространство имён и хранят состояние в своём срезе `Store.state()`.

**`chess.js`** — движок на массиве из 64 клеток: генерация псевдолегальных ходов, фильтр легальности через атаку на короля, рокировка, взятие на проходе, превращение; проверка шаха/мата/пата и ничьих (50 ходов, недостаточный материал, троекратное повторение); нотация SAN; ИИ — негамакс с альфа-бета отсечением и таблицами позиционной оценки (PST). Публичный `Chess.engine` (для тестов): `initial, legalMoves, make, unmake, attacked, kingIndex, status, san, inCheck, insufficientMaterial, bestMove, evaluate, idxToAlg, algToIdx, findMove, colorOf, isWhite, opp`.

**`training.js`** — массив из 14 встроенных программ, размеченных уровнем сложности (`lvl` — beginner/middle/advanced) и целью (`goal` — lose/mass/keep), с занятиями и шагами; фильтры по уровню и цели. Три вкладки (Программы / Мои планы / Журнал). Прогресс занятий в `training.lessons['pid/lid']`, личные планы в `training.plans`, журнал в `training.sessions`. Публичный `Training.levels` и `Training.goals` (для тестов и фильтров).

**`recipes.js`** — каталог из 24 рецептов + 8 категорий; фильтры по категории, калорийности и времени, поиск (дебаунс 220 мс, перерисовывается только список — фокус в поле не теряется), избранное и свои рецепты.

**`music.js`** — локальный плеер: аудиофайлы хранятся в IndexedDB (`ritm-music` / `files`), метаданные — в состоянии; демо- и чарт-композиции синтезируются в браузере в WAV. Публичный `Music.synth` (для тестов): `renderSamples, encodeWav, demoBlob, DEMO`.

**`nutrition.js`** — калькулятор калорий и БЖУ и дневник питания. Расчёты: базовый метаболизм по формуле Миффлина — Сан-Жеора (`bmr`), суточный расход (`tdee = bmr × активность`), целевая калорийность (`targetKcal` с дельтой цели), нормы БЖУ (`macros`), ИМТ, норма воды, здоровый вес. Три вкладки (Калькулятор / Дневник / Продукты). База `FOODS` — 100+ продуктов с КБЖУ на 100 г и 13 категориями; `portion(food, g)` пересчитывает на массу, `dayTotals(date)` суммирует за день. Публичный `Nutrition` (для тестов): `foods, categories, meals, activityLevels, goals, calc, portion, dayTotals`.

**`blackjack.js`** — карточная игра против дилера по стандартным правилам. Ядро — набор чистых функций: `rankValue`, `handValue` (мягкие/жёсткие комбинации, туз 1/11), `isBlackjack` (только с 2 карт), `dealerShouldHit` (S17), `newShoe(numDecks, rng)` (шуз из 6 колод, 312 карт), `settle(player, dealer, bet)` (определение исхода: блэкджек платит 3:2, победа 1:1, ничья — возврат). При перетасовке по достижении порога (`reshuffleAt`) шуз пересобирается. Состояние фазы: `bet` → `player` → `done`; действия игрока — «Ещё» (`hit`), «Хватит» (`stand`), «Удвоить» (`doubleDown`). Банк фишек, статистика (`hands/wins/losses/pushes/blackjacks/best`) и история раздач хранятся в срезе `Store.state().blackjack`. Правила вынесены в `Blackjack.rules`; публичный `Blackjack.core` (для тестов): `rules`, `rankValue, handValue, isBlackjack, dealerShouldHit, newShoe, settle`.

> Прямое подключение внешних стриминговых сервисов (например, Яндекс.Музыки) не реализовано: у них нет публичного API для сторонних приложений, контент защищён авторским правом. Раздел работает как собственный плеер с локальной библиотекой; в интерфейсе есть соответствующее пояснение.

---

## 8. Производительность

- **Мемоизация:** в `model.js` — `Map` `memo` ключом `id@version`; `version` растёт при каждом изменении данных (`touch()`), что сбрасывает кеш. При переполнении (`> 400` записей) кеш очищается.
- **Отложенная запись:** `Store.save()` без аргумента откладывает запись в localStorage на 180 мс (дебаунс), снижая нагрузку при серии изменений. `Store.save(true)` и `Store.flush()` пишут немедленно.
- **Частичная перерисовка:** `updateRowVisual` вместо полного `render`.
- **Поиск** в списке привычек дебаунсится (220 мс).
- Ориентир: создание 120 привычек и 400 отметок, пересчёт аналитики — укладывается в доли секунды (проверяется автотестом с бюджетом 3 с / 1.5 с).

---

## 9. Напоминания (`notifications.js`)

Цепочка доставки: **Service Worker** (`reg.showNotification`) → **Notification API** → **внутренний алерт** (событие `reminder` через `Notify.subscribe`, показывается тостом).

- `Notify.start()`/`stop()` — тикер раз в 30 с вызывает `Notify.check()`.
- `Notify.check()` — для активных привычек с напоминанием, запланированных на сегодня и невыполненных, срабатывает в окне **[время, время + 90 мин]** и только один раз в день (журнал `ritm.v1.notified.*`).
- Вечерняя сводка (20:00–20:30) — если есть незакрытые привычки и включены уведомления.
- `Notify.nextReminderToday(habit)` и `Notify.countPendingToday()` — для подсказок в интерфейсе.

Регистрация SW (`app.js` → `registerSW`) выполняется только для `http:`/`https:` (на `file://` не поддерживается).

---

## 10. Синхронизация

### Код синхронизации
`Store.makeSyncCode()` сериализует `exportObject()` в JSON → UTF-8 → base64, с префиксом `RITM1.`. `Store.readSyncCode(code)` выполняет обратное преобразование и вызывает `importJSON`.

### Облако (REST)
- Адрес из `Store.cloudConfig().url`, подстановка `{id}` → id пользователя; необязательный `Authorization: Bearer <token>`.
- `cloudPush` (POST), `cloudPull` (GET), `cloudMerge` (GET + слияние + POST).
- **`mergeStates(a, b)`:** привычки сопоставляются по `id`, при конфликте берётся более свежая по `updatedAt`; для отметок — максимум значения за день; категории берутся из более свежего состояния; достижения объединяются.

Эндпоинт должен принимать и возвращать JSON (`{ data: <state> }` или сам `<state>`), отвечать `2xx` (или `204` без тела).

---

## 11. PWA и офлайн

- `manifest.json` — `display: standalone`, иконки, ярлыки `#new` и `#stats`.
- `sw.js` — стратегия «сеть в приоритете, кэш при сбое»: успешные ответы кладутся в кэш `ritm-v1.4.0`; при отсутствии сети отдаётся кэш или `index.html`. Сторонние источники (шрифты) не кэшируются.
- При активации удаляются старые версии кэша; при обновлении файлов **не забудьте поднять версию** `CACHE` в `sw.js`, иначе пользователи останутся на старой оболочке.
- Обработаны события `push` и `notificationclick` (фокус окна или открытие приложения).
- Быстрые ссылки обрабатываются `App.applyDeepLink()` по `location.hash`.

---

## 12. Стили и адаптивность (`css/styles.css`)

- **Токены** в `:root` (цвета, тени, радиусы, отступы, шрифты). Тёмная тема — через `[data-theme="dark"]` и/или `@media (prefers-color-scheme: dark)`; цветовые миксы используют `color-mix()`.
- **Типографика:** Bricolage Grotesque (заголовки), Instrument Sans (текст), JetBrains Mono (числа, код). При недоступности — системные фолбэки.
- **Компоненты:** `btn`, `card`, `chip`, `tabs`, `field`, `switch`, `picker`, `weekdays`, `segments`, `habit-row`, `habit-card`, `stat-card`, `panel`, `heatmap`, `bars`, `hbars`, `spark`, `mini-grid`, `toast`, `modal`, `confetti`, `calendar`.
- **Брейкпоинты:** ~1500 px (широкие сетки), 1080 px, 860 px (скрытие сайдбара → нижняя навигация), 520 px (мобильные). Есть стили для печати (`@media print`).
- Учитывается `prefers-reduced-motion` (отключение конфетти/анимаций).

---

## 13. Тестирование

Автотесты — `tests/uitest.html`: страница с `<iframe src="../index.html">`, которая поднимает приложение и прогоняет **278 проверок** (авторизация, создание привычек всех типов частоты, отметки и степпер, серии, аналитика за все периоды, отрисовка экранов, фильтры, архив, редактор, валидация, категории, тема, экспорт/импорт, код синхронизации, localStorage, пароли, напоминания, демо-данные, производительность). Отдельные проверки покрывают дополнительные разделы: движок шахмат (ходы, SAN, мат «детский мат», ничья по материалу, выбор хода ИИ), тренировки (14 программ, фильтры по уровню и цели, отметка занятий и журнал, личный план; новые программы разной интенсивности), рецепты (каталог из 24 блюд, фильтры, избранное, поиск, детализация новых рецептов), музыку (синтез демо- и чарт-треков в WAV, плеер, избранное, вкладки), питание (база продуктов с КБЖУ, формула Миффлина — Сан-Жеора, TDEE и целевая калорийность, нормы БЖУ, пересчёт порции и дневника, интерфейс вкладок, добавление записи и учёт воды) и блэкджек (подсчёт очков и мягкие комбинации, стоимость карт, блэкджек с 2 карт, правила дилера S17, исходы `settle` включая выплату 3:2, отрисовка стола, раздача, ставки, история, статистика). Результат печатается в `#SELFTEST`, отдельно выводится число ошибок консоли.

Запуск в headless-браузере (пример для Microsoft Edge в Windows):

```powershell
& "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" `
  --headless=new --allow-file-access-from-files `
  --user-data-dir="$env:TEMP\ritm-test" `
  --virtual-time-budget=90000 --dump-dom `
  "C:\путь\к\habit-tracker\tests\uitest.html"
```

В выводе найдите строку `✅ ВСЕ ТЕСТЫ ПРОЙДЕНЫ — пройдено 278 из 278`. Аналогично работает любой Chromium-браузер (Chrome, Edge). Для ручной проверки просто откройте `tests/uitest.html` в браузере.

---

## 14. Расширение

**Новый тип частоты:** добавьте метку в `Model.FREQ_LABELS`, ветку в `normalizeFreq` и `isScheduled`, вариант в `freqSegmentsHTML` и, при необходимости, блок настроек в `paintExtra()` (`ui.js`).

**Новое достижение:** добавьте запись в массив `ACHIEVEMENTS` (`model.js`) с функцией `check(aggregate)`; при необходимости расширьте `achievementStats()`.

**Новая диаграмма:** добавьте функцию в `charts.js` и встройте её в `renderStats()`.

**Новая настройка:** добавьте поле в `blankState().settings`, элемент управления с `data-act="setting" data-value="<key>"` (переключатель) и обработку в `change`-слушателе `ui.js`.

**Новый раздел-модуль:** создайте `js/<name>.js` и `css/<name>.css`. Модуль — IIFE, экспортирующий объект с интерфейсом:

```js
window.Example = {
  route: 'example',              // маршрут (совпадает с data-route в навигации)
  label: 'Раздел',               // подпись в сайдбаре и tabbar
  subtitle() { return '…'; },    // подзаголовок шапки раздела
  mount(host) { host.innerHTML = '…'; /* … отрисовка и обработчики … */ }
};
```

Затем зарегистрируйте его в `modules.js` (`Modules.register(window.Example)`), подключите `<script>` в `index.html` перед `app.js`, добавьте `data-route="example"` в навигацию и внесите свои срезы в `blankState()`/`migrate()` (`storage.js`). `ui.js` при неизвестном маршруте вызывает `Modules.get(UI.route).mount(view())`.

---

## 15. Известные ограничения

- Нет серверной части — синхронизация между устройствами возможна через файл, код или пользовательский REST-эндпоинт.
- Push-уведомления при полностью закрытом приложении требуют внешнего push-сервера (в проекте реализован только обработчик `push` в SW).
- localStorage ограничен квотой (~5 МБ на домен); при больших объёмах истории возможна деградация до памяти.
- Пароль защищает локально и базово (хранилище не шифруется).
- Раздел «Музыка» не подключён к внешним стриминговым сервисам: у Яндекс.Музыки нет публичного API, поэтому плеер работает с локальными аудиофайлами (IndexedDB) и офлайн-синтезированными демо-треками.
