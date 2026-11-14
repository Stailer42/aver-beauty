# AVER: демо-сайт салона красоты

Тестовый сайт для портфолио. Две страницы: лендинг (`index.html`) и онлайн-запись (`booking.html`).
Все имена, цены, отзывы, адрес, e-mail и телефоны **выдуманы**. Телефоны в нерабочем формате `+380 00 000 00 00`.

Технологии: обычные HTML + CSS + JavaScript. Ничего не нужно устанавливать и собирать.

## Структура

```
aver.beauty/
├── index.html      главная (лендинг)
├── booking.html    онлайн-запись
├── styles.css      все стили обеих страниц
├── script.js       общее: шапка, меню, анимации, переходы между страницами
├── booking.js      логика записи (шаги, свободное время, форма)
├── data.js         ТЕСТОВЫЕ данные: услуги, цены, часы работы, "база" записей
├── assets/
│   ├── ph/         SVG-заглушки вместо фото
│   ├── favicon.svg иконка вкладки
│   └── og.png      картинка для превью ссылки в мессенджерах
└── README.md
```

## Как запустить у себя

Вариант 1, самый простой: двойной клик по `index.html`.

Вариант 2, как на настоящем сервере (рекомендую, так точно работают переходы между страницами):

```bash
cd /Applications/aver.beauty
python3 -m http.server 8000
```

Открыть в браузере: http://localhost:8000. Остановить: `Ctrl + C` в терминале.

## Как выложить в интернет бесплатно (GitHub Pages)

Репозиторий должен быть **публичным**: на бесплатном тарифе GitHub Pages работает только с публичными.

```bash
cd /Applications/aver.beauty
gh repo create Stailer42/aver-beauty --public --source=. --remote=origin --push
gh api -X POST repos/Stailer42/aver-beauty/pages -f "source[branch]=main" -f "source[path]=/"
```

Через 1-2 минуты сайт откроется по адресу: https://stailer42.github.io/aver-beauty/

Обновить сайт после правок:

```bash
git add .
git commit -m "Что поменял"
git push
```

Если репозиторий будет называться иначе, поправь адреса в `og:url` и `og:image` в `<head>` обеих страниц.

## Где менять цены и услуги

Только в `data.js`. Главная и страница записи берут данные оттуда.
- `AVER.services`: название, длительность (`min`), цена (`price`), `from: true` = «от ... ₴», параметры с доплатой (`options`).
- `AVER.categories`: категории и мастера.
- `AVER.hours`: часы работы по дням недели (`null` = выходной).

## Какие фото нужны (замена заглушек)

Положи фото в `assets/`, затем в HTML поменяй `src` с `assets/ph/....svg` на свой файл. Возле каждой картинки в коде есть комментарий `<!-- ФОТО: ... -->`.

| Заглушка | Что на фото | Размер |
|---|---|---|
| `hero-interior.svg` | интерьер салона, светлый зал | от 1920×1080, горизонталь |
| `hero-model.svg` | модель с ухоженными длинными волосами, спокойный фон | от 1200×1600, вертикаль |
| `work-1.svg` ... `work-6.svg` | работы: AirTouch, стрижка, маникюр, ламинирование ресниц, макияж, восстановление волос | 1080×1350 (4:5) |
| `salon-1.svg` ... `salon-4.svg` | зал стилистов, зона маникюра, кабинет ухода, лаунж | 1200×1500 (4:5) |
| `cta.svg` | атмосферное фото: волосы в тёплом свете | от 1920×1080, горизонталь |

Важно:
- Первый экран показывает фото на всю ширину, поэтому `hero-*` и `cta` нужны **качественные**, не из Instagram. Просить у клиента «файлом/документом», не фото: мессенджеры сжимают картинки.
- Фото без текста и водяных знаков. Сжимать в JPG/WebP, hero до ~300 КБ (например, через squoosh.app).
- Лучше заменять `.svg` на `.jpg` с тем же именем, чтобы не путаться.

## Как работает запись сейчас (демо)

- Занятое время генерируется в `data.js` (функция `AVER.getBusySlots`): у каждой даты своё, но всегда одинаковое расписание.
- Новая запись сохраняется функцией `AVER.saveBooking` в `localStorage` **только этого браузера**. Выбранное время после этого становится занятым. Никто, кроме тебя, эту запись не увидит.
- Очистить тестовые записи: в консоли браузера `localStorage.removeItem("aver-demo-bookings")`.

## Как потом подключить настоящую базу

Вся работа с данными собрана в двух функциях в конце `data.js`. Остальной код трогать не нужно.

**Самый простой бесплатный вариант: Google Таблица + Apps Script.**

1. Создать Google Таблицу. Столбец A (дата) перевести в формат «Обычный текст», иначе таблица превратит даты в свой формат.
2. «Расширения → Apps Script», вставить:

```js
function doGet(e) {
  const rows = SpreadsheetApp.getActiveSheet().getDataRange().getValues().slice(1);
  const busy = rows
    .filter((r) => r[0] === e.parameter.date && r[1] === e.parameter.cat)
    .map((r) => ({ start: Number(r[2]), end: Number(r[2]) + Number(r[3]) }));
  return ContentService.createTextOutput(JSON.stringify(busy)).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  const b = JSON.parse(e.postData.contents);
  const id = "AV-" + Math.floor(1000 + Math.random() * 9000);
  SpreadsheetApp.getActiveSheet().appendRow([
    b.date, b.category, b.start, b.duration, b.serviceName, b.options, b.price, b.name, b.phone, b.comment, id, new Date(),
  ]);
  return ContentService.createTextOutput(JSON.stringify({ id })).setMimeType(ContentService.MimeType.JSON);
}
```

3. «Развернуть → Новое развертывание → Веб-приложение», доступ «Все». Скопировать ссылку.
4. В `data.js` заменить две функции:

```js
const API = "https://script.google.com/macros/s/ВАШ_ID/exec";

AVER.getBusySlots = async (dateISO, categoryId) => {
  const r = await fetch(API + "?date=" + dateISO + "&cat=" + categoryId);
  return r.json();
};

AVER.saveBooking = async (booking) => {
  // без заголовка Content-Type браузер шлёт text/plain, так Google не блокирует запрос
  const r = await fetch(API, { method: "POST", body: JSON.stringify(booking) });
  return r.json();
};
```

Честно об ограничениях: такой вариант подходит для портфолио и маленького салона. Он не защищает от двух одновременных записей на одно время и от спама. Для реального бизнеса лучше Supabase (бесплатный тариф, настоящая база) или готовый сервис записи с виджетом.

## Что ещё заменить перед реальным запуском

- Телефоны, e-mail, адрес, ссылки на соцсети (сейчас ведут на главные страницы Instagram/Telegram/Facebook).
- Отзывы, имена мастеров, историю салона, цены.
- Данные в блоке `application/ld+json` в `<head>` `index.html` (это для Google).
- Пометку «Демо-сайт» в футере.

## Браузеры

- Плавный переход между страницами через View Transitions работает в Chrome/Edge 126+ и Safari 18.2+. В остальных браузерах вместо него розовая шторка.
- Если в системе включено «Уменьшение движения», анимации отключаются.
