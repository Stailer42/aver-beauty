/*
 * Розділ «Розклад»: години роботи салону, налаштування онлайн-запису,
 * винятки (свята, скорочені дні), робочі дні майстрів.
 * Форма запису на сайті показує вільний час саме за цими правилами.
 */
(function () {
  const UI = AVERUI;
  const T = AVERText;
  const S = AVERSchedule;
  const { h } = UI;

  let data = null;
  let root = null;

  AVERAdmin.register("schedule", {
    async render(box) {
      root = box;
      await load();
      paint();
    },
  });

  async function load() {
    const [settings, closures, masters, bookings] = await Promise.all([
      AVERDB.single("settings"),
      AVERDB.list("closures"),
      AVERDB.list("masters"),
      AVERDB.list("bookings"),
    ]);
    closures.sort((a, b) => a.date.localeCompare(b.date));
    data = { settings, closures, masters, bookings };
  }

  async function reload() {
    await load();
    paint();
  }

  function paint() {
    UI.clear(root);
    UI.append(root, [
      UI.viewHead("Розклад", "Години роботи й винятки визначають, який час форма запису показує вільним."),
      h("div", { class: "adm-grid adm-grid--schedule" },
        hoursPanel(),
        closuresPanel(),
        bookingPanel(),
        mastersPanel()
      ),
    ]);
  }

  // Майбутні активні записи, які не вкладаються в розклад (після змін)
  function outsideCount(settings, closures, masters) {
    const today = UI.todayISO();
    const byId = new Map(masters.map((m) => [m.id, m]));
    return data.bookings.filter((b) => {
      if (b.status === "cancelled" || b.date < today) return false;
      const c = S.check({ slot: b, bookings: [], settings, closures, master: byId.get(b.master_id) });
      return c.closed || c.outside || c.masterOff;
    }).length;
  }

  function warnOutside(n) {
    if (!n) return;
    UI.toast("Увага: " + n + " " + T.plural(n, ["майбутній запис", "майбутні записи", "майбутніх записів"]) + " тепер поза розкладом. Перевірте їх у «Записах».", "error");
  }

  /* ---------- години салону ---------- */
  function hoursPanel() {
    const rows = T.WEEK_ORDER.map((d) => {
      const cur = data.settings.hours[d];
      const open = h("input", { type: "time", step: "900", value: cur ? cur[0] : "09:00", "aria-label": S.DAY_FULL[d] + ": відкриття" });
      const close = h("input", { type: "time", step: "900", value: cur ? cur[1] : "20:00", "aria-label": S.DAY_FULL[d] + ": закриття" });
      const works = UI.checkbox({ label: S.DAY_FULL[d], checked: !!cur });
      const times = h("div", { class: "adm-hours__times" }, open, h("span", { "aria-hidden": "true", text: "–" }), close);
      const sync = () => {
        times.classList.toggle("is-off", !works.checked());
        open.disabled = close.disabled = !works.checked();
      };
      works.input.addEventListener("change", sync);
      sync();
      return { d, works, open, close, el: h("li", { class: "adm-hours__row" }, works.el, times, h("span", { class: "adm-hours__off", text: "вихідний", "aria-hidden": "true" })) };
    });

    const err = h("p", { class: "adm-opts__error", role: "alert", hidden: true });
    const btn = UI.button({ label: "Зберегти години", variant: "solid", type: "submit" });
    const form = h("form", { class: "adm-hours", novalidate: true }, h("ul", { class: "adm-hours__list" }, rows.map((r) => r.el)), err, btn);

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      err.hidden = true;
      const hours = {};
      for (const r of rows) {
        r.open.removeAttribute("aria-invalid");
        r.close.removeAttribute("aria-invalid");
        if (!r.works.checked()) {
          hours[r.d] = null;
          continue;
        }
        if (!r.open.value || !r.close.value || S.toMin(r.open.value) >= S.toMin(r.close.value)) {
          r.open.setAttribute("aria-invalid", "true");
          r.close.setAttribute("aria-invalid", "true");
          err.textContent = S.DAY_FULL[r.d] + ": час закриття має бути пізніше за час відкриття.";
          err.hidden = false;
          r.close.focus();
          return;
        }
        hours[r.d] = [r.open.value, r.close.value];
      }
      if (Object.values(hours).every((x) => !x)) {
        err.textContent = "Хоча б один день має бути робочим, інакше онлайн-запис не покаже жодного вільного часу.";
        err.hidden = false;
        return;
      }
      const settings = { ...data.settings, hours };
      await AVERDB.saveSingle("settings", settings);
      UI.toast("Години роботи збережено. На сайті: " + S.hoursLines(settings).join(", "));
      const n = outsideCount(settings, data.closures, data.masters);
      await reload();
      setTimeout(() => warnOutside(n), n ? 2500 : 0);
    });

    return UI.panel("Години роботи салону", h("p", { class: "adm-note", text: "Ці ж години показуються у футері сайту." }), form);
  }

  /* ---------- онлайн-запис ---------- */
  function bookingPanel() {
    const st = data.settings;
    const step = UI.select({
      label: "Крок вибору часу",
      value: String(st.slot_step),
      options: [15, 20, 30, 60].map((v) => ({ value: String(v), label: v === 60 ? "1 година" : v + " хвилин" })),
      hint: "Через скільки хвилин пропонувати час: 09:00, 09:30, 10:00…",
    });
    const ahead = UI.field({ label: "Записуватися наперед, днів", type: "text", inputmode: "numeric", value: String(st.days_ahead), hint: "Скільки днів показує форма запису, від 1 до 60" });
    const lead = UI.select({
      label: "Найраніше на сьогодні",
      value: String(st.lead_min),
      options: [
        { value: "0", label: "одразу" },
        { value: "30", label: "за 30 хвилин" },
        { value: "60", label: "за 1 годину" },
        { value: "120", label: "за 2 години" },
        { value: "180", label: "за 3 години" },
        { value: "1440", label: "лише з завтрашнього дня" },
      ],
      hint: "Щоб майстер устиг підготуватися до запису «на зараз»",
    });
    const btn = UI.button({ label: "Зберегти", variant: "solid", type: "submit" });
    const form = h("form", { class: "form adm-form", novalidate: true }, step.el, ahead.el, lead.el, btn);
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      ahead.setError(null);
      const days = UI.int(ahead.value());
      if (days === null || days < 1 || days > 60) {
        ahead.setError("Ціле число від 1 до 60");
        ahead.input.focus();
        return;
      }
      await AVERDB.saveSingle("settings", { ...data.settings, slot_step: Number(step.value()), days_ahead: days, lead_min: Number(lead.value()) });
      UI.toast("Налаштування запису збережено");
      reload();
    });
    return UI.panel("Онлайн-запис", form);
  }

  /* ---------- винятки ---------- */
  function closuresPanel() {
    const today = UI.todayISO();
    const upcoming = data.closures.filter((c) => c.date >= today);

    const list = upcoming.length
      ? h("ul", { class: "adm-closures" }, upcoming.map((c) => h("li", { class: "adm-closures__row" },
          h("div", null,
            h("b", { text: longDate(c.date) }),
            h("span", { class: "adm-row__meta", text: (c.open ? "працюємо " + c.open + "–" + c.close : "вихідний") + (c.note ? " / " + c.note : "") })
          ),
          UI.button({
            label: "Видалити виняток " + longDate(c.date),
            icon: "trash",
            iconOnly: true,
            small: true,
            onClick: async () => {
              if (!(await UI.confirm({ title: "Видалити виняток?", text: longDate(c.date) + ": салон працюватиме за звичайним розкладом.", ok: "Видалити", danger: true }))) return;
              await AVERDB.remove("closures", c.id);
              UI.toast("Виняток видалено");
              reload();
            },
          })
        )))
      : UI.empty("Найближчим часом винятків немає: салон працює за звичайним розкладом.");

    const date = UI.field({ label: "Дата", type: "date", value: "" });
    date.input.min = today;
    const kindOff = h("input", { type: "radio", name: "cl-kind", value: "off", checked: true });
    const kindShort = h("input", { type: "radio", name: "cl-kind", value: "short" });
    const kinds = h("div", { class: "pills", role: "radiogroup", "aria-label": "Тип винятку" },
      h("label", { class: "pill" }, kindOff, h("span", null, "Вихідний")),
      h("label", { class: "pill" }, kindShort, h("span", null, "Інші години"))
    );
    const open = h("input", { type: "time", step: "900", value: "10:00", "aria-label": "Відкриття" });
    const close = h("input", { type: "time", step: "900", value: "16:00", "aria-label": "Закриття" });
    const times = h("div", { class: "adm-hours__times", hidden: true }, open, h("span", { "aria-hidden": "true", text: "–" }), close);
    [kindOff, kindShort].forEach((r) => r.addEventListener("change", () => (times.hidden = !kindShort.checked)));
    const note = UI.field({ label: "Причина, необов'язково", placeholder: "Наприклад, День Незалежності" });
    note.input.maxLength = 80;
    const err = h("p", { class: "adm-opts__error", role: "alert", hidden: true });
    const btn = UI.button({ label: "Додати виняток", icon: "plus", type: "submit" });
    const form = h("form", { class: "form adm-form adm-closures__add", novalidate: true }, date.el, kinds, times, note.el, err, btn);

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      date.setError(null);
      err.hidden = true;
      const d = date.value();
      if (!d) return bad(date, "Оберіть дату");
      if (d < today) return bad(date, "Дата вже минула");
      if (data.closures.some((c) => c.date === d)) return bad(date, "На цю дату виняток уже є");
      let o = null;
      let c = null;
      if (kindShort.checked) {
        if (!open.value || !close.value || S.toMin(open.value) >= S.toMin(close.value)) {
          err.textContent = "Час закриття має бути пізніше за час відкриття.";
          err.hidden = false;
          return;
        }
        o = open.value;
        c = close.value;
      }
      const row = { date: d, open: o, close: c, note: note.value().trim() };
      await AVERDB.put("closures", row);
      UI.toast("Виняток додано: " + longDate(d));
      const closures = data.closures.concat(row);
      const n = outsideCount(data.settings, closures, data.masters);
      await reload();
      setTimeout(() => warnOutside(n), n ? 2500 : 0);
    });

    function bad(f, msg) {
      f.setError(msg);
      f.input.focus();
    }

    return UI.panel("Свята й скорочені дні",
      h("p", { class: "adm-note", text: "Виняток важливіший за звичайні години: у вихідний запис закритий, у скорочений день форма покаже лише ці години." }),
      list,
      h("h3", { class: "adm-subtitle", text: "Новий виняток" }),
      form
    );
  }

  /* ---------- робочі дні майстрів ---------- */
  function mastersPanel() {
    const rows = data.masters.map((m) => {
      const days = T.WEEK_ORDER.map((d) => {
        const input = h("input", { type: "checkbox", checked: (m.work_days || []).includes(d), "aria-label": m.name + ": " + S.DAY_FULL[d] });
        input.addEventListener("change", async () => {
          // свіжий рядок із бази: після load() у data.masters уже інші об'єкти, ніж m у цьому замиканні
          const cur = (await AVERDB.get("masters", m.id)) || m;
          const work_days = [...(cur.work_days || []).filter((x) => x !== d), ...(input.checked ? [d] : [])].sort();
          m.work_days = work_days;
          await AVERDB.put("masters", { ...cur, work_days });
          const masters = data.masters.map((x) => (x.id === m.id ? { ...cur, work_days } : x));
          const n = input.checked ? 0 : outsideCount(data.settings, data.closures, masters);
          UI.toast(m.name + ": " + (work_days.length ? T.dayRanges(work_days) : "немає робочих днів"));
          await load();
          setTimeout(() => warnOutside(n), n ? 2500 : 0);
        });
        return h("label", { class: "adm-day" }, input, h("span", { text: T.DAYS_SHORT[d], "aria-hidden": "true" }));
      });
      return h("li", { class: "adm-mdays__row" + (m.visible ? "" : " is-hidden") },
        h("span", { class: "adm-mdays__name", text: m.name + (m.visible ? "" : " (прихований)") }),
        h("div", { class: "adm-days" }, days)
      );
    });
    return UI.panel("Робочі дні майстрів",
      h("p", { class: "adm-note", text: "Зміни зберігаються одразу. У неробочий день майстра не можна обрати у формі запису." }),
      data.masters.length ? h("ul", { class: "adm-mdays" }, rows) : UI.empty("Майстрів ще немає.")
    );
  }

  function longDate(iso) {
    return S.fromISO(iso).toLocaleDateString("uk-UA", { weekday: "short", day: "numeric", month: "long" });
  }
})();
