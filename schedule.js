/*
 * AVER: логіка розкладу й записів, спільна для сайту й адмінки.
 * ---------------------------------------------------------------
 * Тут немає роботи з базою чи сторінкою, лише обчислення:
 *   робочі години на дату, вільні слоти, накладки, вибір майстра, ціна з доплатами.
 * Головне правило: два активні записи (не скасовані) до одного майстра
 * не можуть перетинатися в часі. У Supabase те саме правило стоїть у базі
 * (constraint bookings_no_overlap), тут воно для демо й для підказок в інтерфейсі.
 *
 * Час: хвилини від початку доби (540 = 09:00). Дата: рядок "2026-11-18".
 * Працює і в браузері (window.AVERSchedule), і в Node (тести).
 */
(function (root) {
  const T = root.AVERText || (typeof require !== "undefined" ? require("./typo.js") : null);

  /* ---------- час і дати ---------- */

  function toMin(hhmm) {
    const [h, m] = String(hhmm).split(":").map(Number);
    return h * 60 + (m || 0);
  }

  function toHHMM(min) {
    return String(Math.floor(min / 60)).padStart(2, "0") + ":" + String(min % 60).padStart(2, "0");
  }

  function toISO(d) {
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }

  function fromISO(iso) {
    return new Date(iso + "T00:00:00");
  }

  function addDays(iso, n) {
    const d = fromISO(iso);
    d.setDate(d.getDate() + n);
    return toISO(d);
  }

  function weekday(iso) {
    return fromISO(iso).getDay(); // 0 = неділя
  }

  /* ---------- робочі години ---------- */

  /**
   * Години роботи салону на дату: [відкриття, закриття] у хвилинах або null (вихідний).
   * Виняток (closures) важливіший за звичайний розклад тижня.
   */
  function dayHours(iso, settings, closures) {
    const c = (closures || []).find((x) => x.date === iso);
    if (c) return c.open && c.close ? [toMin(c.open), toMin(c.close)] : null;
    const h = settings.hours[weekday(iso)];
    return h ? [toMin(h[0]), toMin(h[1])] : null;
  }

  function masterWorks(master, iso) {
    return (master.work_days || []).includes(weekday(iso));
  }

  /* ---------- накладки ---------- */

  const isActive = (b) => b.status !== "cancelled";

  function overlaps(aStart, aEnd, bStart, bEnd) {
    return aStart < bEnd && bStart < aEnd;
  }

  /**
   * Записи, з якими перетнеться новий/перенесений запис.
   * slot: { master_id, date, start_min, duration_min, id (свій id, щоб не конфліктувати з собою) }
   */
  function conflicts(bookings, slot) {
    const end = slot.start_min + slot.duration_min;
    return bookings.filter(
      (b) =>
        isActive(b) &&
        b.id !== slot.id &&
        b.master_id === slot.master_id &&
        b.date === slot.date &&
        overlaps(slot.start_min, end, b.start_min, b.start_min + b.duration_min)
    );
  }

  /**
   * Майстри, які виконують послугу. Порядок = порядок у адмінці.
   * onlyVisible: для сайту приховані майстри не пропонуються.
   */
  function mastersFor(masters, serviceId, onlyVisible) {
    return masters
      .filter((m) => (!onlyVisible || m.visible) && (m.service_ids || []).includes(serviceId))
      .sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0));
  }

  /**
   * Вільні слоти на дату.
   * o: { date, duration, masters (кандидати), bookings, settings, closures,
   *      now (Date, для "сьогодні не раніше ніж за lead_min"), excludeId }
   * Повертає [{ start, masters: [id, ...] }] — хто з кандидатів вільний у цей час.
   */
  function freeSlots(o) {
    const hours = dayHours(o.date, o.settings, o.closures);
    if (!hours) return [];
    // крок із бази міг прийти зламаним (імпорт, DevTools): 0 або мінус означав би вічний цикл
    const step = Math.max(5, Number(o.settings.slot_step) || 30);
    const working = o.masters.filter((m) => masterWorks(m, o.date));
    if (!working.length) return [];

    let earliest = -1;
    if (o.now && toISO(o.now) === o.date) {
      earliest = o.now.getHours() * 60 + o.now.getMinutes() + (o.settings.lead_min || 0);
    } else if (o.now && o.date < toISO(o.now)) {
      return []; // минулі дні
    }

    const out = [];
    for (let t = hours[0]; t + o.duration <= hours[1]; t += step) {
      if (t < earliest) continue;
      const free = working.filter(
        (m) => !conflicts(o.bookings, { id: o.excludeId, master_id: m.id, date: o.date, start_min: t, duration_min: o.duration }).length
      );
      if (free.length) out.push({ start: t, masters: free.map((m) => m.id) });
    }
    return out;
  }

  /**
   * Перевірка запису для адмінки: що не так із цим часом.
   * Повертає { conflicts: [...], closed, outside, masterOff, hours }
   * conflicts блокують збереження; решта лише попередження.
   */
  function check(o) {
    const hours = dayHours(o.slot.date, o.settings, o.closures);
    const end = o.slot.start_min + o.slot.duration_min;
    return {
      conflicts: conflicts(o.bookings, o.slot),
      closed: !hours,
      outside: !!hours && (o.slot.start_min < hours[0] || end > hours[1]),
      masterOff: !!o.master && !masterWorks(o.master, o.slot.date),
      hours,
    };
  }

  /* ---------- ціна й параметри ---------- */

  // choices: { groupId: індекс варіанта }; за замовчуванням перший варіант
  function priceFor(service, choices) {
    return (service.options || []).reduce((sum, g) => {
      const c = g.choices[(choices || {})[g.id] ?? 0] || g.choices[0];
      return sum + (c ? Number(c.add) || 0 : 0);
    }, Number(service.price) || 0);
  }

  function optionsText(service, choices) {
    const opts = service.options || [];
    if (!opts.length) return "без додаткових параметрів";
    return opts
      .map((g) => {
        const c = (g.choices[(choices || {})[g.id] ?? 0] || g.choices[0] || { label: "" }).label;
        return g.label + ": " + c.charAt(0).toLowerCase() + c.slice(1);
      })
      .join("; ");
  }

  /* ---------- текст годин роботи ---------- */

  const DAY_FULL = ["Неділя", "Понеділок", "Вівторок", "Середа", "Четвер", "П'ятниця", "Субота"];
  const DAY_EN = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
  const WEEK = [1, 2, 3, 4, 5, 6, 0];

  // Дні з однаковими годинами разом, у порядку тижня
  function hourGroups(settings) {
    const groups = [];
    WEEK.forEach((d) => {
      const h = settings.hours[d];
      const key = h ? h[0] + "-" + h[1] : "closed";
      const g = groups.find((x) => x.key === key);
      if (g) g.days.push(d);
      else groups.push({ key, hours: h || null, days: [d] });
    });
    return groups;
  }

  // ["Пн–Сб 09:00–20:00", "Неділя: вихідний"]; вихідні завжди в кінці
  function hoursLines(settings) {
    const groups = hourGroups(settings);
    return groups.filter((g) => g.hours).concat(groups.filter((g) => !g.hours)).map((g) => {
      if (g.hours) return T.dayRanges(g.days) + " " + g.hours[0] + "–" + g.hours[1];
      return g.days.length === 1 ? DAY_FULL[g.days[0]] + ": вихідний" : T.dayRanges(g.days) + ": вихідні";
    });
  }

  // Для schema.org: ["Mo-Sa 09:00-20:00"]
  function openingHours(settings) {
    return hourGroups(settings)
      .filter((g) => g.hours)
      .map((g) => {
        // послідовні дні як діапазон, інші через кому
        const runs = [];
        let run = [];
        WEEK.forEach((d) => {
          if (g.days.includes(d)) run.push(d);
          else if (run.length) {
            runs.push(run);
            run = [];
          }
        });
        if (run.length) runs.push(run);
        const days = runs.map((r) => (r.length > 1 ? DAY_EN[r[0]] + "-" + DAY_EN[r[r.length - 1]] : DAY_EN[r[0]])).join(",");
        return days + " " + g.hours[0] + "-" + g.hours[1];
      });
  }

  /**
   * Новий номер запису, якого ще немає серед taken (Set): "AV-1234".
   * Після 50 невдалих спроб (майже всі 9000 чотиризначних зайняті) переходимо
   * на шість цифр, щоб цикл точно завершився.
   */
  function newCode(taken) {
    for (let i = 0; i < 50; i++) {
      const code = "AV-" + Math.floor(1000 + Math.random() * 9000);
      if (!taken.has(code)) return code;
    }
    let code;
    do code = "AV-" + Math.floor(100000 + Math.random() * 900000);
    while (taken.has(code));
    return code;
  }

  const api = {
    toMin, toHHMM, toISO, fromISO, addDays, weekday,
    dayHours, masterWorks, isActive, overlaps, conflicts, mastersFor, freeSlots, check,
    priceFor, optionsText, hoursLines, openingHours, newCode, DAY_FULL,
  };
  root.AVERSchedule = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
