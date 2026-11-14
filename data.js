/*
 * AVER: ТЕСТОВІ ДАНІ ДЛЯ ДЕМО
 * ---------------------------------------------------------------
 * Усі послуги, ціни, майстри та зайнятий час тут вигадані.
 * Щоб змінити ціну чи назву послуги, правте лише цей файл:
 * головна сторінка і сторінка запису беруть дані звідси.
 *
 * Робота з "базою" зібрана у двох функціях унизу:
 *   getBusySlots(dateISO, categoryId)  -> зайняті проміжки
 *   saveBooking(booking)               -> зберегти запис
 * Щоб підключити справжню базу, замініть лише їх (див. README.md).
 */

const AVER = {
  // Робочі години: 0 = неділя, 1 = понеділок ... 6 = субота. null = вихідний
  hours: {
    0: null,
    1: [9 * 60, 20 * 60],
    2: [9 * 60, 20 * 60],
    3: [9 * 60, 20 * 60],
    4: [9 * 60, 20 * 60],
    5: [9 * 60, 20 * 60],
    6: [9 * 60, 20 * 60],
  },
  slotStep: 30, // крок вибору часу, хвилин
  daysAhead: 14, // на скільки днів уперед можна записатися

  categories: [
    { id: "hair", name: "Волосся", masters: "Олена Бондар, Марія Коваленко" },
    { id: "nails", name: "Нігті", masters: "Софія Мельник" },
    { id: "face", name: "Обличчя та макіяж", masters: "Анна Ткаченко, Ірина Лисенко" },
    { id: "brows", name: "Брови та вії", masters: "Дарина Шевчук" },
  ],

  // Набори додаткових параметрів, які повторюються в кількох послугах
  optionSets: {},

  services: [],
};

// Набори параметрів (add = доплата в гривнях)
AVER.optionSets = {
  hairLength: (adds) => ({
    id: "length",
    label: "Довжина волосся",
    choices: [
      { label: "Коротке, до плечей", add: adds[0] },
      { label: "Середнє, до лопаток", add: adds[1] },
      { label: "Довге, до талії", add: adds[2] },
      { label: "Дуже довге, нижче талії", add: adds[3] },
    ],
  }),
  nailDesign: {
    id: "design",
    label: "Дизайн",
    choices: [
      { label: "Без дизайну", add: 0 },
      { label: "Мінімалістичний", add: 150 },
      { label: "Складний", add: 350 },
    ],
  },
  removal: {
    id: "removal",
    label: "Старе покриття",
    choices: [
      { label: "Немає, нігті чисті", add: 0 },
      { label: "Потрібно зняти", add: 200 },
    ],
  },
};

const L = AVER.optionSets;

AVER.services = [
  // Волосся
  { id: "haircut-women", cat: "hair", name: "Жіноча стрижка", min: 60, price: 900, from: true, options: [L.hairLength([0, 200, 400, 600])] },
  { id: "haircut-men", cat: "hair", name: "Чоловіча стрижка", min: 45, price: 600, options: [] },
  { id: "color-one", cat: "hair", name: "Фарбування в один тон", min: 120, price: 1800, from: true, options: [L.hairLength([0, 600, 1200, 1800])] },
  { id: "color-airtouch", cat: "hair", name: "Складне фарбування AirTouch", min: 240, price: 4200, from: true, options: [L.hairLength([0, 1000, 2000, 3000])] },
  { id: "care-botox", cat: "hair", name: "Відновлення та ботокс для волосся", min: 90, price: 1800, from: true, options: [L.hairLength([0, 400, 800, 1200])] },
  { id: "styling", cat: "hair", name: "Укладання", min: 45, price: 700, from: true, options: [L.hairLength([0, 150, 300, 450])] },

  // Нігті
  { id: "manicure", cat: "nails", name: "Манікюр з покриттям", min: 90, price: 750, options: [L.nailDesign, L.removal] },
  { id: "pedicure", cat: "nails", name: "Педикюр з покриттям", min: 90, price: 900, options: [L.removal] },
  {
    id: "nail-extension", cat: "nails", name: "Нарощування нігтів", min: 150, price: 1300,
    options: [
      { id: "length", label: "Довжина нігтів", choices: [
        { label: "Коротка", add: 0 }, { label: "Середня", add: 200 }, { label: "Довга", add: 400 },
      ] },
      L.nailDesign,
    ],
  },
  { id: "nail-removal", cat: "nails", name: "Зняття покриття", min: 30, price: 200, options: [] },

  // Обличчя та макіяж
  { id: "face-cleaning", cat: "face", name: "Комбінована чистка обличчя", min: 75, price: 1400, options: [] },
  { id: "peeling", cat: "face", name: "Пілінг", min: 45, price: 1200, options: [] },
  { id: "face-massage", cat: "face", name: "Масаж обличчя", min: 45, price: 600, options: [] },
  {
    id: "makeup", cat: "face", name: "Вечірній макіяж", min: 60, price: 1500,
    options: [
      { id: "lashes", label: "Вії", choices: [
        { label: "Без накладних вій", add: 0 }, { label: "Накладні пучки", add: 200 },
      ] },
    ],
  },

  // Брови та вії
  {
    id: "brow-lamination", cat: "brows", name: "Ламінування брів", min: 60, price: 700,
    options: [
      { id: "tint", label: "Фарбування", choices: [
        { label: "Без фарбування", add: 0 }, { label: "З фарбуванням", add: 200 },
      ] },
    ],
  },
  { id: "lash-lamination", cat: "brows", name: "Ламінування вій", min: 60, price: 850, options: [] },
  {
    id: "lash-extension", cat: "brows", name: "Нарощування вій", min: 120, price: 1100,
    options: [
      { id: "volume", label: "Об'єм", choices: [
        { label: "Класика", add: 0 }, { label: "2D", add: 200 }, { label: "3D", add: 400 },
      ] },
    ],
  },
];

/* ---------- допоміжні функції ---------- */

// "1 200 ₴" з нерозривними пробілами
AVER.formatPrice = (n) => n.toLocaleString("uk-UA").replace(/\s/g, " ") + " ₴";

// "1 год 30 хв"
AVER.formatDuration = (min) => {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return [h ? h + " год" : "", m ? m + " хв" : ""].filter(Boolean).join(" ");
};

// Детермінований генератор випадкових чисел: однакова дата = однакові зайняті слоти
function seededRandom(seedText) {
  let h = 2166136261;
  for (let i = 0; i < seedText.length; i++) {
    h ^= seedText.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h += 0x6d2b79f5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const STORAGE_KEY = "aver-demo-bookings";

function readLocalBookings() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch (e) {
    return [];
  }
}

/* ---------- "БАЗА ДАНИХ" (демо) ---------- */

/**
 * Повертає зайняті проміжки на дату для категорії послуг.
 * Формат: [{ start: 600, end: 690 }, ...] у хвилинах від початку доби.
 * ДЕМО: частину часу "займає" генератор, частину ваші тестові записи з localStorage.
 */
AVER.getBusySlots = async function (dateISO, categoryId) {
  const day = new Date(dateISO + "T00:00:00").getDay();
  const hours = AVER.hours[day];
  if (!hours) return [];

  const rnd = seededRandom(dateISO + categoryId);
  const busy = [];
  const blocks = 3 + Math.floor(rnd() * 4); // 3-6 зайнятих проміжків
  for (let i = 0; i < blocks; i++) {
    const len = (2 + Math.floor(rnd() * 4)) * 30; // 1-2.5 години
    const slots = (hours[1] - hours[0] - len) / 30;
    const start = hours[0] + Math.floor(rnd() * slots) * 30;
    busy.push({ start, end: start + len });
  }

  readLocalBookings()
    .filter((b) => b.date === dateISO && b.category === categoryId)
    .forEach((b) => busy.push({ start: b.start, end: b.start + b.duration }));

  return busy;
};

/**
 * Зберігає запис. ДЕМО: лише у localStorage цього браузера.
 * Повертає { id } номера запису.
 */
AVER.saveBooking = async function (booking) {
  const id = "AV-" + Math.floor(1000 + Math.random() * 9000);
  const all = readLocalBookings();
  all.push({ ...booking, id, createdAt: new Date().toISOString() });
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch (e) {
    /* приватний режим: запис не збережеться, але демо продовжиться */
  }
  return { id };
};
