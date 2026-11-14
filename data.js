/*
 * AVER: дані для сторінок сайту.
 * ---------------------------------------------------------------
 * Послуги, ціни, майстри, розклад і записи редагуються в адмінці (/admin/).
 * Тут вони лише читаються з бази (db-local.js) і перетворюються у формат,
 * зручний для сторінок. Обчислення часу: schedule.js. Тестові дані: seed.js.
 *
 * Сторінки чекають на AVER.ready, а потім беруть:
 *   AVER.categories, AVER.services, AVER.masters, AVER.daysAhead
 *   AVER.mastersFor(serviceId)                  -> хто з майстрів виконує послугу
 *   AVER.dayHours(dateISO)                      -> години салону на дату або null
 *   AVER.freeSlots(dateISO, serviceId, masterId) -> вільний час (хвилини від початку доби)
 *   AVER.saveBooking({...})                     -> зберегти запис (атомарно, без накладок)
 *   AVER.hoursLines(), AVER.openingHours()      -> години роботи для футера й Google
 *   AVER.content                                -> тексти, контакти, соцмережі
 *   AVER.works, AVER.salon, AVER.reviews        -> видимі фото робіт, зони салону, відгуки
 *
 * Supabase: freeSlots читатиме функцію busy_slots(date), saveBooking викликатиме
 * create_booking(...) (див. supabase/schema.sql), сторінки не зміняться.
 */

const AVER = {
  daysAhead: 14,
  categories: [],
  services: [],
  masters: [],
  formatPrice: AVERText.formatPrice,
  formatDuration: AVERText.formatDuration,
};

(function () {
  const S = AVERSchedule;
  let settings = null;
  let closures = [];
  let rawServices = new Map(); // id -> рядок таблиці services (для ціни й параметрів)
  let rawMasters = []; // видимі майстри у форматі таблиці (для schedule.js)

  AVER.ready = (async function load() {
    const [st, cl, categories, services, masters, content, photos, reviews] = await Promise.all([
      AVERDB.single("settings"),
      AVERDB.list("closures"),
      AVERDB.list("categories"),
      AVERDB.list("services"),
      AVERDB.list("masters"),
      AVERDB.single("content"),
      AVERDB.list("photos"),
      AVERDB.list("reviews"),
    ]);
    AVER.content = content;
    AVER.reviews = reviews.filter((r) => r.visible).map((r) => ({ author: r.author, service: r.service_label, text: r.text }));
    const masterNames = new Map(masters.map((m) => [m.id, m.name]));
    const toPhoto = async (p) => ({
      src: await AVERDB.fileUrl(p.src),
      width: p.width,
      height: p.height,
      alt: p.alt,
      focus: p.focus_y ?? 50,
      caption: p.caption || "",
      master: p.master_id ? masterNames.get(p.master_id) || "" : "",
      title: p.title || "",
      text: p.text || "",
    });
    AVER.works = await Promise.all(photos.filter((p) => p.album === "works" && p.visible).map(toPhoto));
    AVER.salon = await Promise.all(photos.filter((p) => p.album === "salon" && p.visible).map(toPhoto));
    settings = st;
    closures = cl;
    AVER.daysAhead = st.days_ahead;
    rawServices = new Map(services.map((s) => [s.id, s]));
    rawMasters = masters.filter((m) => m.visible);

    const visibleCats = categories.filter((c) => c.visible);
    const catOrder = new Map(visibleCats.map((c, i) => [c.id, i]));

    AVER.services = services
      .filter((s) => s.visible && catOrder.has(s.category_id))
      .sort((a, b) => catOrder.get(a.category_id) - catOrder.get(b.category_id) || a.sort - b.sort)
      .map((s) => {
        const masterIds = S.mastersFor(rawMasters, s.id, true).filter((m) => (m.work_days || []).length).map((m) => m.id);
        return {
          id: s.id,
          cat: s.category_id,
          name: s.name,
          description: s.description || "",
          min: s.duration_min,
          price: s.price,
          from: !!s.price_from,
          options: s.options || [],
          // онлайн записатися можна, лише якщо послугу виконує хоч один майстер із робочими днями
          bookable: masterIds.length > 0,
          masterIds,
        };
      });

    AVER.masters = await Promise.all(rawMasters.map(async (m) => ({
      id: m.id,
      name: m.name,
      role: m.role || "",
      specialty: m.specialty || "",
      experience: m.experience_years || 0,
      photo: await AVERDB.fileUrl(m.photo),
    })));

    // Категорії без жодної видимої послуги не показуємо
    AVER.categories = visibleCats
      .filter((c) => AVER.services.some((s) => s.cat === c.id))
      .map((c) => {
        const ids = new Set(AVER.services.filter((s) => s.cat === c.id).map((s) => s.id));
        const names = rawMasters.filter((m) => (m.service_ids || []).some((id) => ids.has(id))).map((m) => m.name);
        return { id: c.id, name: c.name, masters: names.join(", ") };
      });
  })();

  AVER.ready.catch((err) => console.error("AVER: не вдалося завантажити дані", err));

  AVER.mastersFor = (serviceId) => {
    const s = AVER.services.find((x) => x.id === serviceId);
    return s ? s.masterIds.map((id) => AVER.masters.find((m) => m.id === id)) : [];
  };

  AVER.dayHours = (iso) => S.dayHours(iso, settings, closures);
  AVER.hoursLines = () => S.hoursLines(settings);
  AVER.openingHours = () => S.openingHours(settings);

  function candidates(serviceId, masterId) {
    return S.mastersFor(rawMasters, serviceId, true).filter((m) => !masterId || m.id === masterId);
  }

  /**
   * Вільний час на дату для послуги: [600, 630, ...].
   * masterId = null: будь-який майстер, що виконує послугу.
   * Беремо лише зайняті проміжки (без імен і телефонів) і щоразу заново:
   * хтось міг записатися хвилину тому.
   */
  AVER.freeSlots = async function (iso, serviceId, masterId) {
    await AVER.ready;
    const svc = rawServices.get(serviceId);
    if (!svc) return [];
    const busy = await AVERDB.busySlots(iso);
    const bookings = busy.map((b, i) => ({
      id: "busy-" + i, master_id: b.master_id, date: iso, start_min: b.start_min, duration_min: b.end_min - b.start_min, status: "confirmed",
    }));
    return S.freeSlots({
      date: iso,
      duration: svc.duration_min,
      masters: candidates(serviceId, masterId),
      bookings,
      settings,
      closures,
      now: new Date(),
    }).map((x) => x.start);
  };

  /**
   * Зберігає запис із сайту зі статусом "нова".
   * b: { serviceId, masterId (null = будь-який), date, start, choices, name, phone, comment }
   * Ціну, тривалість, майстра й перевірку вільного часу робить AVERDB.createBooking
   * (у Supabase це серверна функція create_booking), а не сторінка.
   * Якщо час уже зайнятий, кидає помилку з code = "slot_taken".
   * Повертає { id: "AV-1234", masterName }.
   */
  AVER.saveBooking = async function (b) {
    await AVER.ready;
    const r = await AVERDB.createBooking({
      service_id: b.serviceId,
      master_id: b.masterId || null,
      date: b.date,
      start_min: b.start,
      choices: b.choices || {},
      client_name: b.name,
      client_phone: b.phone,
      comment: b.comment || "",
    });
    return { id: r.code, masterName: (rawMasters.find((m) => m.id === r.master_id) || {}).name || "" };
  };
})();
