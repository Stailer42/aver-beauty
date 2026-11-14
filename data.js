/*
 * AVER: дані для сторінок сайту.
 * ---------------------------------------------------------------
 * Послуги, ціни, майстри й години роботи редагуються в адмінці (/admin/).
 * Тут вони лише читаються з бази (db-local.js) і перетворюються у формат,
 * зручний для сторінок. Тестові дані для першого запуску: seed.js.
 *
 * Сторінки чекають на AVER.ready, а потім беруть:
 *   AVER.categories, AVER.services, AVER.hours, AVER.slotStep, AVER.daysAhead
 *   AVER.getBusySlots(dateISO, categoryId)  -> зайняті проміжки
 *   AVER.saveBooking(booking)               -> зберегти запис
 */

const AVER = {
  hours: {},
  slotStep: 30,
  daysAhead: 14,
  leadMin: 60,
  categories: [],
  services: [],
  formatPrice: AVERText.formatPrice,
  formatDuration: AVERText.formatDuration,
};

// "09:00" -> 540
AVER.toMin = (hhmm) => {
  const [h, m] = String(hhmm).split(":").map(Number);
  return h * 60 + (m || 0);
};

let allServices = new Map(); // включно з прихованими: для старих записів

AVER.ready = (async function load() {
  const [settings, categories, services, masters] = await Promise.all([
    AVERDB.single("settings"),
    AVERDB.list("categories"),
    AVERDB.list("services"),
    AVERDB.list("masters"),
  ]);

  // Робочі години: 0 = неділя ... 6 = субота, [початок, кінець] у хвилинах або null
  for (let d = 0; d < 7; d++) {
    const h = settings.hours[d];
    AVER.hours[d] = h ? [AVER.toMin(h[0]), AVER.toMin(h[1])] : null;
  }
  AVER.slotStep = settings.slot_step;
  AVER.daysAhead = settings.days_ahead;
  AVER.leadMin = settings.lead_min;

  allServices = new Map(services.map((s) => [s.id, s]));
  const visibleMasters = masters.filter((m) => m.visible);
  const visibleCats = categories.filter((c) => c.visible);
  const catOrder = new Map(visibleCats.map((c, i) => [c.id, i]));

  AVER.services = services
    .filter((s) => s.visible && catOrder.has(s.category_id))
    .sort((a, b) => catOrder.get(a.category_id) - catOrder.get(b.category_id) || a.sort - b.sort)
    .map((s) => ({
      id: s.id,
      cat: s.category_id,
      name: s.name,
      description: s.description || "",
      min: s.duration_min,
      price: s.price,
      from: !!s.price_from,
      options: s.options || [],
    }));

  // Категорії без жодної видимої послуги не показуємо
  AVER.categories = visibleCats
    .filter((c) => AVER.services.some((s) => s.cat === c.id))
    .map((c) => {
      const ids = new Set(AVER.services.filter((s) => s.cat === c.id).map((s) => s.id));
      const names = visibleMasters.filter((m) => (m.service_ids || []).some((id) => ids.has(id))).map((m) => m.name);
      return { id: c.id, name: c.name, masters: names.join(", ") };
    });
})();

AVER.ready.catch((err) => console.error("AVER: не вдалося завантажити дані", err));

/* ---------- зайнятий час і збереження запису ---------- */

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

/**
 * Повертає зайняті проміжки на дату для категорії послуг.
 * Формат: [{ start: 600, end: 690 }, ...] у хвилинах від початку доби.
 * ДЕМО (до етапу 3): частину часу "займає" генератор, частину записи з бази.
 */
AVER.getBusySlots = async function (dateISO, categoryId) {
  await AVER.ready;
  const day = new Date(dateISO + "T00:00:00").getDay();
  const hours = AVER.hours[day];
  if (!hours) return [];

  const rnd = seededRandom(dateISO + categoryId);
  const busy = [];
  const blocks = 2 + Math.floor(rnd() * 3); // 2-4 зайнятих проміжки
  for (let i = 0; i < blocks; i++) {
    const len = (2 + Math.floor(rnd() * 3)) * 30; // 1-2 години
    const slots = (hours[1] - hours[0] - len) / 30;
    const start = hours[0] + Math.floor(rnd() * slots) * 30;
    busy.push({ start, end: start + len });
  }

  const bookings = await AVERDB.list("bookings");
  bookings
    .filter((b) => b.date === dateISO && b.status !== "cancelled")
    .filter((b) => (allServices.get(b.service_id) || {}).category_id === categoryId)
    .forEach((b) => busy.push({ start: b.start_min, end: b.start_min + b.duration_min }));

  return busy;
};

/**
 * Зберігає запис із сайту зі статусом "нова". Повертає { id } (номер запису AV-1234).
 */
AVER.saveBooking = async function (booking) {
  await AVER.ready;
  const now = new Date().toISOString();
  return AVERDB.atomic("bookings", async (db) => {
    const codes = new Set((await db.getAll("bookings")).map((b) => b.code));
    let code;
    do code = "AV-" + Math.floor(1000 + Math.random() * 9000);
    while (codes.has(code));
    await db.put("bookings", {
      id: AVERDB.newId(),
      code,
      service_id: booking.service,
      service_name: booking.serviceName,
      options_text: booking.options,
      master_id: null,
      date: booking.date,
      start_min: booking.start,
      duration_min: booking.duration,
      price: booking.price,
      client_name: booking.name,
      client_phone: booking.phone,
      comment: booking.comment,
      status: "new",
      source: "site",
      created_at: now,
      updated_at: now,
    });
    return { id: code };
  });
};
