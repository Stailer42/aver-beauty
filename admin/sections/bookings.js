/*
 * Розділ «Записи»: список із фільтрами, календар по майстрах, створення вручну,
 * підтвердження, скасування, перенесення.
 * Накладка двох активних записів до одного майстра заборонена: перевірка
 * в момент збереження, в одній транзакції з записом (як constraint у Supabase).
 */
(function () {
  const UI = AVERUI;
  const T = AVERText;
  const S = AVERSchedule;
  const { h } = UI;

  const VIEW_KEY = "aver-admin-bk-view";
  const STATUS = { new: "нова", confirmed: "підтверджена", cancelled: "скасована" };
  const PPM = 1.2; // пікселів на хвилину в календарі (30 хв = 36px)

  const state = { view: "list", status: "all", period: "upcoming", master: "", q: "", date: null, calMaster: null };
  let data = null;
  let root = null;
  let resultsBox = null;

  AVERAdmin.register("bookings", {
    async render(box) {
      root = box;
      try {
        state.view = sessionStorage.getItem(VIEW_KEY) || "list";
      } catch (e) { /* немає сховища */ }
      if (!state.date) state.date = UI.todayISO();
      await load();
      paint();
    },
  });

  // зміни з іншої вкладки (наприклад, новий запис із сайту) одразу видно тут
  AVERDB.onChange(async (msg) => {
    if (!root || !root.isConnected || !(msg.tables || []).includes("bookings")) return;
    const open = document.querySelector("dialog[open]");
    if (open) {
      // не заважаємо редагуванню, але оновимо список, щойно діалог закриють
      if (!open.dataset.refreshQueued) {
        open.dataset.refreshQueued = "1";
        open.addEventListener("close", async () => {
          if (!root || !root.isConnected) return;
          await load();
          paint();
        }, { once: true });
      }
      return;
    }
    await load();
    paint();
  });

  async function load() {
    const [bookings, masters, services, categories, settings, closures] = await Promise.all([
      AVERDB.list("bookings"),
      AVERDB.list("masters"),
      AVERDB.list("services"),
      AVERDB.list("categories"),
      AVERDB.single("settings"),
      AVERDB.list("closures"),
    ]);
    data = {
      bookings,
      masters,
      services,
      categories,
      settings,
      closures,
      master: new Map(masters.map((m) => [m.id, m])),
      service: new Map(services.map((s) => [s.id, s])),
    };
    AVERAdmin.refreshBadges();
  }

  async function reload() {
    await load();
    paint();
  }

  const hm = S.toHHMM;
  const range = (b) => hm(b.start_min) + "–" + hm(b.start_min + b.duration_min);
  const masterName = (id) => (data.master.get(id) || {}).name || "майстра видалено";

  function dayTitle(iso) {
    const today = UI.todayISO();
    const rel = iso === today ? "Сьогодні, " : iso === S.addDays(today, 1) ? "Завтра, " : iso === S.addDays(today, -1) ? "Вчора, " : "";
    const s = S.fromISO(iso).toLocaleDateString("uk-UA", { weekday: rel ? "long" : "long", day: "numeric", month: "long" });
    return rel + s;
  }

  /* ---------- каркас ---------- */
  function paint() {
    const today = UI.todayISO();
    const todays = data.bookings.filter((b) => b.date === today && b.status !== "cancelled").length;
    const fresh = data.bookings.filter((b) => b.status === "new" && b.date >= today).length;

    const views = h("div", { class: "tabs adm-tabs adm-views", role: "group", "aria-label": "Вигляд" },
      [["list", "Список"], ["calendar", "Календар"]].map(([id, label]) => h("button", {
        class: "tab",
        type: "button",
        "aria-pressed": String(state.view === id),
        on: {
          click: () => {
            state.view = id;
            try {
              sessionStorage.setItem(VIEW_KEY, id);
            } catch (e) { /* немає сховища */ }
            paint();
          },
        },
      }, label))
    );

    UI.clear(root);
    UI.append(root, [
      UI.viewHead("Записи",
        "Сьогодні " + todays + " " + T.plural(todays, ["запис", "записи", "записів"]) + (fresh ? ", нових на підтвердження: " + fresh : ", нових немає") + ".",
        [UI.button({ label: "Записати клієнта", icon: "plus", variant: "solid", small: true, onClick: () => openBooking(null, {}) })]
      ),
      views,
      state.view === "calendar" ? calendarView() : listView(),
    ]);
  }

  /* ---------- список ---------- */
  function listView() {
    const counts = { all: 0, new: 0, confirmed: 0, cancelled: 0 };
    data.bookings.filter(byPeriod).forEach((b) => {
      counts.all++;
      counts[b.status]++;
    });

    const statusTabs = h("div", { class: "tabs adm-tabs", role: "group", "aria-label": "Статус" },
      [["all", "Усі"], ["new", "Нові"], ["confirmed", "Підтверджені"], ["cancelled", "Скасовані"]].map(([id, label]) =>
        h("button", {
          class: "tab",
          type: "button",
          "aria-pressed": String(state.status === id),
          on: { click: () => { state.status = id; paint(); } },
        }, label, h("span", { class: "adm-tab__count", text: String(counts[id]) }))
      )
    );

    const period = UI.select({
      label: "Період",
      value: state.period,
      options: [
        { value: "today", label: "Сьогодні" },
        { value: "tomorrow", label: "Завтра" },
        { value: "week", label: "Найближчі 7 днів" },
        { value: "upcoming", label: "Усі майбутні" },
        { value: "past", label: "Минулі" },
        { value: "all", label: "За весь час" },
      ],
    });
    period.input.addEventListener("change", () => {
      state.period = period.value();
      paint();
    });
    const master = UI.select({
      label: "Майстер",
      value: state.master,
      options: [{ value: "", label: "Усі майстри" }].concat(data.masters.map((m) => ({ value: m.id, label: m.name }))),
    });
    master.input.addEventListener("change", () => {
      state.master = master.value();
      drawList();
    });
    const search = UI.field({ label: "Пошук", type: "search", value: state.q, placeholder: "Ім'я, телефон або AV-1234" });
    let t = 0;
    search.input.addEventListener("input", () => {
      clearTimeout(t);
      t = setTimeout(() => {
        state.q = search.value();
        drawList();
      }, 200);
    });

    resultsBox = h("div", { class: "adm-bklist", "aria-live": "polite" });
    drawList();
    return h("div", null,
      statusTabs,
      h("div", { class: "adm-filters" }, period.el, master.el, search.el),
      resultsBox
    );
  }

  function byPeriod(b) {
    const today = UI.todayISO();
    switch (state.period) {
      case "today": return b.date === today;
      case "tomorrow": return b.date === S.addDays(today, 1);
      case "week": return b.date >= today && b.date < S.addDays(today, 7);
      case "upcoming": return b.date >= today;
      case "past": return b.date < today;
      default: return true;
    }
  }

  function filtered() {
    const q = state.q.trim().toLowerCase();
    const qDigits = q.replace(/\D/g, "");
    const list = data.bookings.filter((b) => {
      if (!byPeriod(b)) return false;
      if (state.status !== "all" && b.status !== state.status) return false;
      if (state.master && b.master_id !== state.master) return false;
      if (q) {
        const hit =
          b.client_name.toLowerCase().includes(q) ||
          b.code.toLowerCase().includes(q) ||
          (qDigits.length >= 3 && b.client_phone.replace(/\D/g, "").includes(qDigits));
        if (!hit) return false;
      }
      return true;
    });
    const dir = state.period === "past" ? -1 : 1;
    return list.sort((a, b) => dir * (a.date.localeCompare(b.date) || a.start_min - b.start_min));
  }

  function drawList() {
    const list = filtered();
    UI.clear(resultsBox);
    if (!list.length) {
      resultsBox.appendChild(UI.empty(state.q ? "Нічого не знайдено. Перевірте ім'я чи номер." : "Записів за цими фільтрами немає."));
      return;
    }
    let curDate = null;
    let ul = null;
    list.forEach((b) => {
      if (b.date !== curDate) {
        curDate = b.date;
        const n = list.filter((x) => x.date === b.date).length;
        resultsBox.appendChild(h("h2", { class: "adm-bkday" }, dayTitle(b.date), h("span", { class: "adm-tab__count", text: String(n) })));
        ul = h("ul", { class: "adm-list" });
        resultsBox.appendChild(ul);
      }
      ul.appendChild(bookingRow(b));
    });
  }

  function bookingRow(b) {
    const tools = h("div", { class: "adm-row__tools" });
    if (b.status === "new") {
      tools.appendChild(UI.button({
        label: "Підтвердити запис: " + b.client_name + ", " + range(b),
        icon: "check",
        iconOnly: true,
        small: true,
        onClick: () => setStatus(b, "confirmed"),
      }));
    }
    return h("li", { class: "adm-row adm-bk is-" + b.status },
      h("button", { class: "adm-row__main", type: "button", on: { click: () => openBooking(b) } },
        h("span", { class: "adm-bk__time", text: range(b) }),
        h("span", { class: "adm-row__text" },
          h("span", { class: "adm-row__title" }, h("span", { class: "adm-bk__name", text: b.client_name }), b.status !== "confirmed" ? h("span", { class: "adm-chip adm-chip--" + b.status, text: STATUS[b.status] }) : null),
          h("span", { class: "adm-row__meta", text: [b.service_name, masterName(b.master_id), T.formatPrice(b.price)].join(" / ") })
        )
      ),
      tools
    );
  }

  async function setStatus(b, status) {
    if (status !== "cancelled") {
      // відновлення скасованого: час міг уже зайняти хтось інший
      const all = await AVERDB.list("bookings");
      const c = S.conflicts(all, b);
      if (status && b.status === "cancelled" && c.length) {
        UI.toast("Не можна відновити: у " + masterName(b.master_id) + " цей час уже зайнятий (" + c[0].client_name + ", " + range(c[0]) + ").", "error");
        return false;
      }
    }
    try {
      await AVERDB.atomic("bookings", async (db) => {
        const all = await db.getAll("bookings");
        const cur = all.find((x) => x.id === b.id);
        if (!cur) throw new Error("Запис не знайдено");
        if (status !== "cancelled" && cur.status === "cancelled" && S.conflicts(all, cur).length) {
          throw Object.assign(new Error("slot"), { code: "slot_taken" });
        }
        await db.put("bookings", { ...cur, status, updated_at: new Date().toISOString() });
      });
    } catch (err) {
      UI.toast(err.code === "slot_taken" ? "Цей час уже зайнятий" : "Не вдалося змінити статус", "error");
      return false;
    }
    UI.toast(status === "confirmed" ? b.client_name + ": запис підтверджено" : status === "cancelled" ? b.client_name + ": запис скасовано, час звільнився" : "Запис відновлено");
    await reload();
    return true;
  }

  /* ---------- календар ---------- */
  function calendarView() {
    const date = state.date;
    const today = UI.todayISO();
    // тиждень з понеділка
    const monday = S.addDays(date, -((S.weekday(date) + 6) % 7));
    const week = Array.from({ length: 7 }, (_, i) => S.addDays(monday, i));

    const strip = h("div", { class: "adm-week" },
      UI.button({ label: "Попередній тиждень", icon: "chevron-left", iconOnly: true, small: true, onClick: () => go(S.addDays(date, -7)) }),
      h("ul", { class: "adm-week__days" }, week.map((d) => {
        const n = data.bookings.filter((b) => b.date === d && b.status !== "cancelled").length;
        const closed = !S.dayHours(d, data.settings, data.closures);
        return h("li", null, h("button", {
          class: "adm-week__day" + (d === today ? " is-today" : "") + (closed ? " is-closed" : ""),
          type: "button",
          "aria-pressed": String(d === date),
          "aria-label": dayTitle(d) + (closed ? ", вихідний" : "") + ", записів: " + n,
          on: { click: () => go(d) },
        },
          h("span", { class: "adm-week__wd", text: T.DAYS_SHORT[S.weekday(d)] }),
          h("span", { class: "adm-week__num", text: String(S.fromISO(d).getDate()) }),
          h("span", { class: "adm-week__n", text: closed && !n ? "вих." : String(n) })
        ));
      })),
      UI.button({ label: "Наступний тиждень", icon: "chevron-right", iconOnly: true, small: true, onClick: () => go(S.addDays(date, 7)) })
    );

    const hours = S.dayHours(date, data.settings, data.closures);
    const closure = data.closures.find((c) => c.date === date);
    const dayBookings = data.bookings.filter((b) => b.date === date && b.status !== "cancelled");

    // колонки: видимі майстри + усі, в кого є записи цього дня
    const cols = data.masters.filter((m) => m.visible || dayBookings.some((b) => b.master_id === m.id));
    if (dayBookings.some((b) => !data.master.has(b.master_id))) cols.push({ id: null, name: "Без майстра", work_days: [] });
    if (!cols.some((m) => m.id === state.calMaster)) state.calMaster = cols[0] ? cols[0].id : null;

    // межі сітки: години салону, розширені під записи, округлені до годин
    let from = hours ? hours[0] : 9 * 60;
    let to = hours ? hours[1] : 20 * 60;
    dayBookings.forEach((b) => {
      from = Math.min(from, b.start_min);
      to = Math.max(to, b.start_min + b.duration_min);
    });
    from = Math.floor(from / 60) * 60;
    to = Math.ceil(to / 60) * 60;
    const height = (to - from) * PPM;

    const info = h("div", { class: "adm-calinfo" },
      h("h2", { class: "adm-bkday", text: dayTitle(date) }),
      h("p", { class: "adm-row__meta", text: !hours ? "Салон не працює" + (closure && closure.note ? ": " + closure.note : "") : (closure ? "Особливі години " : "Працюємо ") + hm(hours[0]) + "–" + hm(hours[1]) + (closure && closure.note ? " / " + closure.note : "") }),
      date !== today ? UI.button({ label: "Сьогодні", small: true, onClick: () => go(today) }) : null
    );

    // вкладки майстрів (лише на телефоні: там видно одну колонку)
    const tabs = h("div", { class: "tabs adm-tabs adm-cal__tabs", role: "group", "aria-label": "Майстер" },
      cols.map((m) => h("button", {
        class: "tab",
        type: "button",
        "aria-pressed": String(m.id === state.calMaster),
        on: { click: () => { state.calMaster = m.id; paint(); } },
      }, m.name.split(" ")[0], h("span", { class: "adm-tab__count", text: String(dayBookings.filter((b) => b.master_id === m.id).length) })))
    );

    if (!cols.length) return h("div", null, strip, info, UI.empty("Майстрів ще немає."));

    const axis = h("div", { class: "adm-cal__axis", style: "height:" + height + "px" });
    for (let t = from; t <= to; t += 60) {
      axis.appendChild(h("span", { class: "adm-cal__hour", style: "top:" + (t - from) * PPM + "px", text: hm(t) }));
    }

    const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
    const head = h("div", { class: "adm-cal__head" }, h("span", { class: "adm-cal__corner" }));
    const body = h("div", { class: "adm-cal__body" }, axis);

    cols.forEach((m) => {
      const off = !hours || (m.id && !S.masterWorks(m, date));
      const current = m.id === state.calMaster ? " is-current" : "";
      head.appendChild(h("div", { class: "adm-cal__colhead" + current },
        h("b", { text: m.name }),
        h("span", { class: "adm-row__meta", text: off ? "вихідний" : dayBookings.filter((b) => b.master_id === m.id).length + " зап." })
      ));
      const col = h("div", {
        class: "adm-cal__col" + current + (off ? " is-off" : ""),
        style: "height:" + height + "px;--hour:" + 60 * PPM + "px",
        "data-master": m.id || "",
      });
      // робочі години салону підсвічені, решта сіра
      if (hours && !off) {
        col.appendChild(h("span", { class: "adm-cal__work", style: "top:" + (hours[0] - from) * PPM + "px;height:" + (hours[1] - hours[0]) * PPM + "px", "aria-hidden": "true" }));
      }
      if (m.id) {
        col.addEventListener("click", (e) => {
          if (e.target !== col && !e.target.classList.contains("adm-cal__work")) return;
          const y = e.clientY - col.getBoundingClientRect().top;
          const step = data.settings.slot_step || 30;
          const start = from + Math.floor(y / PPM / step) * step;
          openBooking(null, { master_id: m.id, date, start_min: start });
        });
      }
      dayBookings.filter((b) => b.master_id === m.id || (!m.id && !data.master.has(b.master_id))).forEach((b) => {
        col.appendChild(h("button", {
          class: "adm-ev is-" + b.status,
          type: "button",
          style: "top:" + (b.start_min - from) * PPM + "px;height:" + Math.max(24, b.duration_min * PPM - 3) + "px",
          "aria-label": range(b) + ", " + b.client_name + ", " + b.service_name + ", " + STATUS[b.status],
          on: { click: () => openBooking(b) },
        },
          h("span", { class: "adm-ev__time", text: range(b) + (b.status === "new" ? " / нова" : "") }),
          h("span", { class: "adm-ev__who", text: b.client_name }),
          h("span", { class: "adm-ev__svc", text: b.service_name })
        ));
      });
      if (date === today && nowMin > from && nowMin < to) {
        col.appendChild(h("span", { class: "adm-cal__now", style: "top:" + (nowMin - from) * PPM + "px", "aria-hidden": "true" }));
      }
      body.appendChild(col);
    });

    const grid = h("div", { class: "adm-cal", style: "--cols:" + cols.length },
      head,
      body
    );

    return h("div", null,
      strip,
      info,
      tabs,
      h("p", { class: "adm-cal__hint", text: "Натисніть на вільне місце в колонці майстра, щоб записати клієнта на цей час." }),
      h("div", { class: "adm-cal__scroll" }, grid)
    );
  }

  function go(date) {
    state.date = date;
    paint();
  }

  /* ---------- форма запису ---------- */
  function openBooking(b, preset) {
    const isNew = !b;
    const today = UI.todayISO();
    const services = data.services;
    const firstSvc = services.find((s) => s.visible) || services[0];
    const row = b ? { ...b } : {
      client_name: "",
      client_phone: "",
      service_id: firstSvc ? firstSvc.id : "",
      master_id: preset.master_id || null,
      date: preset.date || today,
      start_min: preset.start_min ?? null,
      duration_min: firstSvc ? firstSvc.duration_min : 60,
      price: firstSvc ? firstSvc.price : 0,
      comment: "",
      status: "confirmed", // адміністратор записує, вже поговоривши з клієнтом
      choices: {},
    };
    // з календаря на конкретного майстра: перша його послуга
    if (isNew && preset.master_id) {
      const m = data.master.get(preset.master_id);
      const s = m && services.find((x) => (m.service_ids || []).includes(x.id) && x.visible);
      if (s) {
        row.service_id = s.id;
        row.duration_min = s.duration_min;
        row.price = s.price;
      }
    }
    let choices = { ...(row.choices || {}) };
    let dirty = false;
    let priceTouched = !isNew; // у збереженого запису ціну не перераховуємо, доки не змінять послугу чи параметри
    // назву послуги й текст параметрів переписуємо лише тоді, коли їх справді змінили:
    // інакше редагування коментаря перетерло б історію (послугу могли відтоді змінити)
    let svcTouched = isNew;

    /* клієнт */
    const name = UI.field({ label: "Ім'я клієнта", value: row.client_name, autocomplete: "off" });
    name.input.maxLength = 60;
    const phone = UI.field({ label: "Телефон", type: "tel", inputmode: "tel", value: row.client_phone, placeholder: "+380 67 123 45 67" });
    const callLink = h("a", { class: "ulink adm-call", href: T.phoneHref(row.client_phone), hidden: !row.client_phone }, UI.icon("phone"), "Зателефонувати");
    phone.input.addEventListener("input", () => {
      const p = T.normalizePhone(phone.value());
      callLink.hidden = !p.ok;
      if (p.ok) callLink.href = T.phoneHref(p.text);
    });
    phone.input.addEventListener("blur", () => {
      const p = T.normalizePhone(phone.value());
      if (p.ok) phone.input.value = p.text;
    });

    /* послуга */
    const svcSelect = h("select", { id: "bk-svc" });
    data.categories.forEach((c) => {
      const items = services.filter((s) => s.category_id === c.id);
      if (!items.length) return;
      svcSelect.appendChild(h("optgroup", { label: c.name }, items.map((s) =>
        h("option", { value: s.id, text: s.name + (s.visible ? "" : " (прихована)"), selected: s.id === row.service_id })
      )));
    });
    const svcGone = row.service_id && !data.service.has(row.service_id);
    if (svcGone || !row.service_id) {
      const text = row.service_id ? (row.service_name || "Послуга") + " (видалена)" : "Послуг ще немає, додайте їх у розділі «Послуги»";
      svcSelect.insertBefore(h("option", { value: row.service_id || "", text, selected: true }), svcSelect.firstChild);
    }
    const svcField = h("div", { class: "field field--select" }, h("label", { for: "bk-svc", text: "Послуга" }), svcSelect);
    const optsBox = h("div", { class: "adm-bkopts" });

    /* майстер */
    const masterSelect = h("select", { id: "bk-master" });
    const masterField = h("div", { class: "field field--select" }, h("label", { for: "bk-master", text: "Майстер" }), masterSelect);

    /* час */
    const date = UI.field({ label: "Дата", type: "date", value: row.date });
    const time = UI.field({ label: "Початок", type: "time", value: row.start_min != null ? hm(row.start_min) : "" });
    time.input.step = "300";
    const dur = UI.field({ label: "Тривалість, хв", type: "text", inputmode: "numeric", value: String(row.duration_min) });
    const price = UI.field({ label: "Ціна, ₴", type: "text", inputmode: "numeric", value: String(row.price) });
    price.input.addEventListener("input", () => (priceTouched = true));
    const avail = h("div", { class: "adm-avail", "aria-live": "polite" });
    const comment = UI.field({ label: "Коментар", multiline: true, rows: 2, value: row.comment });

    /* статус */
    const statusBox = h("div", { class: "pills", role: "radiogroup", "aria-label": "Статус запису" },
      Object.entries(STATUS).map(([id, label]) => h("label", { class: "pill" },
        h("input", { type: "radio", name: "bk-status", value: id, checked: row.status === id }),
        h("span", null, label.charAt(0).toUpperCase() + label.slice(1))
      ))
    );
    const statusValue = () => statusBox.querySelector("input:checked").value;

    function currentService() {
      return data.service.get(svcSelect.value) || null;
    }

    function drawMasters() {
      const svc = currentService();
      UI.clear(masterSelect);
      const doing = svc ? S.mastersFor(data.masters, svc.id, false) : [];
      doing.forEach((m) => masterSelect.appendChild(h("option", { value: m.id, text: m.name + (m.visible ? "" : " (прихований)") })));
      const cur = data.master.get(row.master_id);
      if (cur && !doing.includes(cur)) {
        masterSelect.appendChild(h("option", { value: cur.id, text: cur.name + " (не виконує цю послугу)" }));
      }
      if (!masterSelect.options.length) masterSelect.appendChild(h("option", { value: "", text: "Ніхто з майстрів не виконує цю послугу" }));
      masterSelect.value = row.master_id && [...masterSelect.options].some((o) => o.value === row.master_id) ? row.master_id : masterSelect.options[0].value;
      row.master_id = masterSelect.value || null;
    }

    function drawOptions() {
      UI.clear(optsBox);
      const svc = currentService();
      if (!svc) return;
      svc.options.forEach((g) => {
        const id = "bk-opt-" + g.id;
        const sel = h("select", { id },
          g.choices.map((c, i) => h("option", { value: String(i), text: c.label + (c.add ? " (+" + T.formatPrice(c.add) + ")" : ""), selected: (choices[g.id] ?? 0) === i }))
        );
        sel.addEventListener("change", () => {
          choices[g.id] = Number(sel.value);
          svcTouched = true;
          recalcPrice(true);
        });
        optsBox.appendChild(h("div", { class: "field field--select" }, h("label", { for: id, text: g.label }), sel));
      });
    }

    function recalcPrice(force) {
      const svc = currentService();
      if (!svc) return;
      if (force) priceTouched = false;
      if (!priceTouched) price.input.value = String(S.priceFor(svc, choices));
    }

    svcSelect.addEventListener("change", () => {
      const svc = currentService();
      choices = {};
      svcTouched = true;
      if (svc) dur.input.value = String(svc.duration_min);
      drawMasters();
      drawOptions();
      recalcPrice(true);
      evaluate();
    });
    masterSelect.addEventListener("change", () => {
      row.master_id = masterSelect.value || null;
      evaluate();
    });
    [date.input, time.input, dur.input].forEach((el) => el.addEventListener("input", evaluate));
    statusBox.addEventListener("change", evaluate);

    drawMasters();
    drawOptions();

    // поточний слот із форми; null, якщо чогось бракує
    function slotFromForm() {
      const start = time.value() ? S.toMin(time.value()) : null;
      const d = UI.int(dur.value());
      if (!date.value() || start === null || !d || !masterSelect.value) return null;
      return { id: row.id, master_id: masterSelect.value, date: date.value(), start_min: start, duration_min: d };
    }

    let lastCheck = null;
    function evaluate() {
      UI.clear(avail);
      lastCheck = null;
      const mId = masterSelect.value;
      const m = data.master.get(mId);
      const d = UI.int(dur.value());
      if (!mId || !date.value()) return;

      // вільні «вікна» майстра цього дня
      if (d && d > 0) {
        const free = S.freeSlots({ date: date.value(), duration: d, masters: m ? [m] : [], bookings: data.bookings, settings: data.settings, closures: data.closures, excludeId: row.id });
        const box = h("div", { class: "adm-avail__free" });
        if (free.length) {
          box.appendChild(h("p", { class: "adm-avail__label", text: "Вільний час майстра цього дня:" }));
          box.appendChild(h("div", { class: "adm-avail__slots" }, free.slice(0, 16).map((f) => h("button", {
            class: "adm-slot",
            type: "button",
            "aria-pressed": String(time.value() === hm(f.start)),
            text: hm(f.start),
            on: {
              click: () => {
                time.input.value = hm(f.start);
                dirty = true;
                evaluate();
              },
            },
          })), free.length > 16 ? h("span", { class: "adm-row__meta", text: "і ще " + (free.length - 16) }) : null));
        } else {
          box.appendChild(h("p", { class: "adm-avail__label", text: "Вільних вікон на цю тривалість цього дня немає." }));
        }
        avail.appendChild(box);
      }

      const slot = slotFromForm();
      if (!slot) return;
      if (slot.duration_min < 5 || slot.duration_min > 720) return;
      const res = S.check({ slot, bookings: data.bookings, settings: data.settings, closures: data.closures, master: m });
      lastCheck = res;
      const msgs = [];
      if (statusValue() === "cancelled") {
        msgs.push(h("p", { class: "adm-avail__ok" }, UI.icon("check"), "Скасований запис не займає час."));
      } else if (res.conflicts.length) {
        res.conflicts.forEach((c) => msgs.push(h("p", { class: "adm-avail__bad" }, UI.icon("alert"),
          "Зайнято: " + range(c) + ", " + c.client_name + " (" + c.service_name + "). Оберіть інший час або майстра.")));
      } else {
        msgs.push(h("p", { class: "adm-avail__ok" }, UI.icon("check"), "Час вільний: " + hm(slot.start_min) + "–" + hm(slot.start_min + slot.duration_min)));
      }
      if (res.closed) msgs.push(h("p", { class: "adm-avail__warn" }, UI.icon("alert"), "Салон у цей день не працює."));
      else if (res.outside) msgs.push(h("p", { class: "adm-avail__warn" }, UI.icon("alert"), "Поза годинами роботи (" + hm(res.hours[0]) + "–" + hm(res.hours[1]) + ")."));
      if (res.masterOff) msgs.push(h("p", { class: "adm-avail__warn" }, UI.icon("alert"), "У майстра цей день вихідний."));
      avail.prepend(...msgs);
    }
    evaluate();

    const metaLine = !isNew ? h("p", { class: "adm-note" },
      "Створено " + new Date(row.created_at).toLocaleString("uk-UA", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }) +
      (row.source === "site" ? " клієнтом на сайті" : " в адмінці") +
      (row.updated_at && row.updated_at !== row.created_at ? ", змінено " + new Date(row.updated_at).toLocaleString("uk-UA", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }) : "") + "."
    ) : null;

    const formErr = h("p", { class: "adm-opts__error", role: "alert", hidden: true });
    const form = h("form", { class: "form adm-form", novalidate: true },
      metaLine,
      h("fieldset", { class: "adm-fieldset adm-fieldset--first" }, h("legend", { text: "Клієнт" }), name.el, phone.el, callLink),
      h("fieldset", { class: "adm-fieldset" }, h("legend", { text: "Процедура" }), svcField, optsBox, masterField),
      h("fieldset", { class: "adm-fieldset" }, h("legend", { text: "Дата й час" }),
        h("div", { class: "adm-form__row" }, date.el, time.el),
        avail,
        h("div", { class: "adm-form__row" }, dur.el, price.el)
      ),
      h("fieldset", { class: "adm-fieldset" }, h("legend", { text: "Статус" }), statusBox, comment.el),
      formErr
    );
    form.addEventListener("input", () => (dirty = true));
    form.addEventListener("change", () => (dirty = true));
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      save();
    });

    const saveBtn = UI.button({ label: isNew ? "Записати" : "Зберегти", variant: "solid", onClick: () => save() });
    const actions = [UI.button({ label: isNew ? "Скасувати" : "Закрити", onClick: () => dlg.tryClose() }), saveBtn];
    if (!isNew && row.status !== "cancelled") {
      actions.unshift(UI.button({
        label: "Скасувати запис",
        icon: "calendar-x",
        class: "adm-dialog__danger",
        onClick: async () => {
          if (!(await UI.confirm({ title: "Скасувати запис?", text: row.client_name + ", " + dayTitle(row.date) + " о " + hm(row.start_min) + ". Час звільниться для інших клієнтів.", ok: "Скасувати запис", cancel: "Ні", danger: true }))) return;
          dirty = false;
          dlg.close();
          setStatus(row, "cancelled");
        },
      }));
    }

    const dlg = UI.dialog({
      title: isNew ? "Новий запис" : "Запис " + row.code,
      body: form,
      actions,
      wide: true,
      isDirty: () => dirty,
    });
    if (isNew) name.input.focus();

    async function save() {
      [name, phone, date, time, dur, price].forEach((f) => f.setError(null));
      formErr.hidden = true;
      let first = null;
      const bad = (f, msg) => {
        f.setError(msg);
        first = first || f.input;
      };
      const n = name.value().trim().replace(/\s+/g, " ");
      if (n.length < 2) bad(name, "Введіть ім'я клієнта");
      const p = T.normalizePhone(phone.value());
      if (!p.ok) bad(phone, "Номер з 9 цифр після +380, наприклад +380 67 123 45 67");
      if (!date.value()) bad(date, "Оберіть дату");
      if (!time.value()) bad(time, "Вкажіть час");
      const d = UI.int(dur.value());
      if (d === null || d < 5 || d > 720) bad(dur, "Від 5 до 720 хвилин");
      const pr = UI.int(price.value());
      if (pr === null || pr < 0 || pr > 200000) bad(price, "Ціле число від 0");
      if (!masterSelect.value) {
        formErr.textContent = "Оберіть майстра. Якщо список порожній, призначте послугу майстру в розділі «Майстри».";
        formErr.hidden = false;
        first = first || masterSelect;
      }
      if (first) {
        first.focus();
        return;
      }

      const status = statusValue();
      const slot = slotFromForm();
      const res = S.check({ slot, bookings: data.bookings, settings: data.settings, closures: data.closures, master: data.master.get(slot.master_id) });
      if (status !== "cancelled" && res.conflicts.length) {
        evaluate();
        time.setError("Цей час у майстра зайнятий");
        time.input.focus();
        return;
      }
      if (status !== "cancelled" && (res.closed || res.outside || res.masterOff)) {
        const why = [res.closed && "салон не працює", res.outside && "поза годинами роботи", res.masterOff && "у майстра вихідний"].filter(Boolean).join(", ");
        const ok = await UI.confirm({ title: "Записати поза розкладом?", text: "Обраний час: " + why + ". Записати все одно?", ok: "Так, записати", cancel: "Змінити час" });
        if (!ok) return;
      }

      const svc = svcTouched ? currentService() : null;
      const now = new Date().toISOString();
      const out = {
        ...row,
        client_name: n,
        client_phone: p.text,
        service_id: svc ? svc.id : row.service_id,
        service_name: svc ? svc.name : row.service_name,
        options_text: svc ? S.optionsText(svc, choices) : row.options_text,
        choices: svc ? choices : row.choices || {},
        master_id: slot.master_id,
        date: slot.date,
        start_min: slot.start_min,
        duration_min: slot.duration_min,
        price: pr,
        comment: comment.value().trim(),
        status,
        updated_at: now,
      };
      if (isNew) {
        out.id = AVERDB.newId();
        out.source = "admin";
        out.created_at = now;
      }

      saveBtn.disabled = true;
      let final = out;
      try {
        await AVERDB.atomic("bookings", async (db) => {
          const all = await db.getAll("bookings");
          if (isNew) {
            out.code = S.newCode(new Set(all.map((x) => x.code)));
          } else {
            // запис могли змінити в іншій вкладці, поки форма була відкрита:
            // беремо свіжий рядок і переносимо в нього лише те, що змінили тут
            const cur = all.find((x) => x.id === out.id);
            if (!cur) throw Object.assign(new Error("gone"), { code: "gone" });
            final = { ...cur };
            Object.keys(out).forEach((k) => {
              if (JSON.stringify(out[k]) !== JSON.stringify(b[k])) final[k] = out[k];
            });
          }
          // перевірка ще раз, на свіжих даних, у тій самій транзакції, що й запис
          if (final.status !== "cancelled" && S.conflicts(all, final).length) throw Object.assign(new Error("slot"), { code: "slot_taken" });
          await db.put("bookings", final);
        });
      } catch (err) {
        saveBtn.disabled = false;
        if (err.code === "gone") {
          dirty = false;
          dlg.close();
          UI.toast("Цей запис щойно видалили в іншій вкладці", "error");
          reload();
          return;
        }
        if (err.code === "slot_taken") {
          await load();
          evaluate();
          time.setError("Цей час щойно зайняли (можливо, запис із сайту). Оберіть інший.");
          time.input.focus();
        } else {
          console.error(err);
          UI.toast("Не вдалося зберегти. Спробуйте ще раз.", "error");
        }
        return;
      }
      dirty = false;
      dlg.close();
      const moved = !isNew && (b.date !== out.date || b.start_min !== out.start_min || b.master_id !== out.master_id);
      UI.toast(isNew ? n + ": записано на " + dayTitle(out.date).toLowerCase() + " о " + hm(out.start_min) : moved ? "Запис перенесено на " + dayTitle(out.date).toLowerCase() + " о " + hm(out.start_min) : "Зміни збережено");
      state.date = out.date;
      reload();
    }
  }
})();
