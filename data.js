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
    const [st, cl, categories, services, masters] = await Promise.all([
      AVERDB.single("settings"),
      AVERDB.list("closures"),
      AVERDB.list("categories"),
      AVERDB.list("services"),
      AVERDB.list("masters"),
    ]);
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
   * Записи читаються щоразу заново: хтось міг записатися хвилину тому.
   */
  AVER.freeSlots = async function (iso, serviceId, masterId) {
    await AVER.ready;
    const svc = rawServices.get(serviceId);
    if (!svc) return [];
    const bookings = await AVERDB.list("bookings");
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
   * Ціну, тривалість і опис параметрів рахуємо тут, а не беремо зі сторінки.
   * Перевірка вільного часу й запис ідуть в одній транзакції: два однакові записи
   * з різних вкладок не пройдуть. Якщо час уже зайнятий, кидає помилку з code = "slot_taken".
   * Повертає { id: "AV-1234", masterName }.
   */
  AVER.saveBooking = async function (b) {
    await AVER.ready;
    const svc = rawServices.get(b.serviceId);
    if (!svc) throw Object.assign(new Error("Послугу не знайдено"), { code: "service_not_found" });
    const masters = candidates(b.serviceId, b.masterId);
    const now = new Date().toISOString();

    return AVERDB.atomic("bookings", async (db) => {
      const all = await db.getAll("bookings");
      // той самий розрахунок, що й для показу слотів, але на свіжих даних усередині транзакції
      const slot = S.freeSlots({
        date: b.date, duration: svc.duration_min, masters, bookings: all, settings, closures, now: new Date(),
      }).find((x) => x.start === b.start);
      if (!slot) throw Object.assign(new Error("Цей час щойно зайняли"), { code: "slot_taken" });

      const masterId = slot.masters[0]; // обраний майстер або перший вільний
      const codes = new Set(all.map((x) => x.code));
      let code;
      do code = "AV-" + Math.floor(1000 + Math.random() * 9000);
      while (codes.has(code));

      await db.put("bookings", {
        id: AVERDB.newId(),
        code,
        service_id: svc.id,
        service_name: svc.name,
        options_text: S.optionsText(svc, b.choices),
        choices: b.choices || {},
        master_id: masterId,
        date: b.date,
        start_min: b.start,
        duration_min: svc.duration_min,
        price: S.priceFor(svc, b.choices),
        client_name: b.name,
        client_phone: b.phone,
        comment: b.comment || "",
        status: "new",
        source: "site",
        created_at: now,
        updated_at: now,
      });
      return { id: code, masterName: (rawMasters.find((m) => m.id === masterId) || {}).name || "" };
    });
  };
})();
