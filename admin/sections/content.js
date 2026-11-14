/*
 * Розділ «Тексти й контакти»: перший екран, заголовки й вступи секцій, історія,
 * «Чому AVER», контакти, соцмережі.
 * Під час збереження короткі слова («в», «і», «на»…) і числа автоматично
 * склеюються нерозривним пробілом (typo.js), а новий рядок у заголовку = перенос на сайті.
 */
(function () {
  const UI = AVERUI;
  const T = AVERText;
  const { h } = UI;

  let content = null;
  let root = null;

  AVERAdmin.register("content", {
    async render(box) {
      root = box;
      content = await AVERDB.single("content");
      paint();
    },
  });

  const plain = (s) => String(s || "").replace(/ /g, " ");
  // прибрати зайві пробіли в кожному рядку, порожні рядки викинути, поставити нерозривні пробіли
  const clean = (s) => T.nbsp(String(s || "").split("\n").map((l) => l.trim().replace(/[ \t]+/g, " ")).filter(Boolean).join("\n"));

  // зберегти частину рядка content, не чіпаючи решту (могли змінити в іншій вкладці)
  async function savePart(patch, msg) {
    const fresh = await AVERDB.single("content");
    content = { ...fresh, ...patch };
    await AVERDB.saveSingle("content", content);
    UI.toast(msg || "Збережено. Оновіть сайт, щоб побачити зміни.");
  }

  function paint() {
    UI.clear(root);
    UI.append(root, [
      UI.viewHead("Тексти й контакти", "Тексти головної сторінки. Новий рядок у заголовку = перенос рядка на сайті.", [
        h("a", { class: "btn btn--ghost btn--sm", href: "../index.html", target: "_blank", rel: "noopener" },
          h("span", { class: "btn__fill" }), UI.icon("external"), h("span", { class: "btn__label", text: "Подивитися на сайті" })),
      ]),
      h("div", { class: "adm-grid adm-grid--content" },
        heroPanel(),
        contactsPanel(),
        sectionsPanel(),
        socialsPanel(),
        storyPanel(),
        whyPanel()
      ),
    ]);
  }

  // універсальна форма-панель
  function formPanel(title, note, fields, onSave, saveLabel) {
    const btn = UI.button({ label: saveLabel || "Зберегти", variant: "solid", type: "submit" });
    const form = h("form", { class: "form adm-form", novalidate: true }, fields, btn);
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      btn.disabled = true;
      try {
        await onSave();
      } finally {
        btn.disabled = false;
      }
    });
    return UI.panel(title, note ? h("p", { class: "adm-note", text: note }) : null, form);
  }

  function lengthCheck(field, max, maxLines) {
    const v = field.value().trim();
    if (v.length > max) return field.setError("Задовго: " + v.length + " з " + max + " символів"), false;
    if (maxLines && v.split("\n").filter((l) => l.trim()).length > maxLines) return field.setError("Не більше " + maxLines + " рядків"), false;
    return true;
  }

  /* ---------- перший екран ---------- */
  function heroPanel() {
    const c = content.hero || {};
    const label = UI.field({ label: "Підпис над назвою", value: plain(c.label), hint: "Дрібні великі літери над AVER. Якщо змінили адресу, оновіть і тут." });
    const sub = UI.field({ label: "Підзаголовок", multiline: true, rows: 2, value: plain(c.sub), hint: "1–2 рядки. Enter = перенос рядка на сайті." });
    const note = UI.field({ label: "Підпис під кнопками", value: plain(c.note), hint: "Коротко й правдиво, напр. «Онлайн-запис за 1 хвилину»" });
    return formPanel("Перший екран", null, [label.el, sub.el, note.el], async () => {
      [label, sub, note].forEach((f) => f.setError(null));
      if (!sub.value().trim()) return sub.setError("Підзаголовок не може бути порожнім"), sub.input.focus();
      if (!lengthCheck(label, 70) || !lengthCheck(sub, 120, 2) || !lengthCheck(note, 50)) return;
      await savePart({ hero: { label: clean(label.value()), sub: clean(sub.value()), note: clean(note.value()) } });
    });
  }

  /* ---------- заголовки секцій ---------- */
  const SECTIONS = [
    ["services", "Послуги", ["title", "lead", "note"]],
    ["works", "Роботи", ["title", "lead"]],
    ["salon", "Салон", ["title", "lead"]],
    ["reviews", "Відгуки", ["title", "lead"]],
    ["why", "Чому AVER", ["title"]],
    ["team", "Команда", ["title", "lead"]],
    ["cta", "Фінальний заклик", ["title", "lead"]],
  ];
  const FIELD_LABEL = { title: "Заголовок", lead: "Вступ", note: "Примітка під списком" };

  function sectionsPanel() {
    const secs = content.sections || {};
    const fields = {};
    const groups = SECTIONS.map(([id, name, keys], i) => {
      fields[id] = {};
      const inner = keys.map((k) => {
        const f = UI.field({
          label: FIELD_LABEL[k],
          multiline: true,
          rows: k === "title" ? 2 : 3,
          value: plain((secs[id] || {})[k]),
          hint: k === "title" ? "До 2 рядків, Enter = перенос" : null,
        });
        fields[id][k] = f;
        return f.el;
      });
      return h("details", { class: "adm-details", open: i === 0 }, h("summary", null, h("span", { text: String(i + 1).padStart(2, "0") + " / " + name })), h("div", { class: "adm-details__body" }, inner));
    });
    return formPanel("Заголовки й вступи розділів", "Розгорніть розділ, щоб змінити його тексти.", groups, async () => {
      const out = {};
      let first = null;
      for (const [id, name, keys] of SECTIONS) {
        out[id] = { ...(secs[id] || {}) };
        for (const k of keys) {
          const f = fields[id][k];
          f.setError(null);
          if (k === "title" && !f.value().trim()) f.setError("Заголовок не може бути порожнім");
          else if (!lengthCheck(f, k === "title" ? 60 : 300, k === "title" ? 2 : 0)) { /* помилку показано */ }
          if (f.el.classList.contains("is-invalid")) {
            first = first || f;
            f.el.closest("details").open = true;
          }
          out[id][k] = clean(f.value());
        }
      }
      if (first) return first.input.focus();
      await savePart({ sections: out });
    });
  }

  /* ---------- історія ---------- */
  function storyPanel() {
    const story = UI.field({ label: "Текст у футері", multiline: true, rows: 5, value: plain(content.story) });
    return formPanel("Історія салону", "Коротко, 2–3 речення: з'являється у футері поруч із контактами.", [story.el], async () => {
      story.setError(null);
      if (!lengthCheck(story, 400)) return story.input.focus();
      await savePart({ story: clean(story.value()) });
    });
  }

  /* ---------- чому AVER ---------- */
  function whyPanel() {
    const items = (content.why || []).map((w) => ({ id: w.id, title: plain(w.title), text: plain(w.text) }));
    const box = h("div", { class: "adm-why" });

    function draw(focusIndex) {
      UI.clear(box);
      items.forEach((w, i) => {
        const t = h("input", { type: "text", value: w.title, maxlength: "60", "aria-label": "Пункт " + (i + 1) + ": заголовок", placeholder: "Заголовок" });
        t.addEventListener("input", () => (w.title = t.value));
        const d = h("textarea", { rows: "3", maxlength: "220", "aria-label": "Пункт " + (i + 1) + ": текст", placeholder: "Текст" });
        d.value = w.text;
        d.addEventListener("input", () => (w.text = d.value));
        box.appendChild(h("div", { class: "adm-why__item" },
          h("span", { class: "adm-why__num", text: String(i + 1).padStart(2, "0"), "aria-hidden": "true" }),
          h("div", { class: "adm-why__fields" }, t, d),
          h("div", { class: "adm-row__tools adm-why__tools" },
            UI.button({ label: "Вище: пункт " + (i + 1), icon: "chevron-up", iconOnly: true, small: true, disabled: i === 0, onClick: () => move(i, -1) }),
            UI.button({ label: "Нижче: пункт " + (i + 1), icon: "chevron-down", iconOnly: true, small: true, disabled: i === items.length - 1, onClick: () => move(i, 1) }),
            UI.button({ label: "Прибрати пункт " + (i + 1), icon: "trash", iconOnly: true, small: true, onClick: () => { items.splice(i, 1); draw(); } })
          )
        ));
        if (i === focusIndex) setTimeout(() => t.focus(), 0);
      });
      if (items.length < 8) {
        box.appendChild(UI.button({ label: "Додати пункт", icon: "plus", small: true, onClick: () => { items.push({ id: AVERDB.newId(), title: "", text: "" }); draw(items.length - 1); } }));
      }
    }
    function move(i, dir) {
      [items[i], items[i + dir]] = [items[i + dir], items[i]];
      draw();
    }
    draw();

    const err = h("p", { class: "adm-opts__error", role: "alert", hidden: true });
    return formPanel("Чому AVER", "3–6 пунктів із номерами 01, 02… Пункти без заголовка не зберігаються.", [box, err], async () => {
      err.hidden = true;
      const out = items
        .map((w) => ({ id: w.id || AVERDB.newId(), title: clean(w.title), text: clean(w.text) }))
        .filter((w) => w.title);
      if (out.some((w, i) => !w.text)) {
        err.textContent = "У кожного пункту має бути текст.";
        err.hidden = false;
        return;
      }
      await savePart({ why: out }, out.length ? "Збережено: " + out.length + " " + T.plural(out.length, ["пункт", "пункти", "пунктів"]) : "Збережено. Без пунктів блок «Чому AVER» на сайті сховано.");
      content.why = out;
      items.splice(0, items.length, ...out.map((w) => ({ ...w, title: plain(w.title), text: plain(w.text) })));
      draw();
    });
  }

  /* ---------- контакти ---------- */
  function contactsPanel() {
    const c = content.contacts || {};
    const p1 = UI.field({ label: "Основний телефон", type: "tel", value: (c.phones || [])[0] || "", hint: "Кнопки «Зателефонувати» на сайті" });
    const p2 = UI.field({ label: "Другий телефон, необов'язково", type: "tel", value: (c.phones || [])[1] || "" });
    const email = UI.field({ label: "E-mail, необов'язково", type: "email", value: c.email || "" });
    const city = UI.field({ label: "Місто", value: c.city || "" });
    const street = UI.field({ label: "Вулиця й будинок", value: c.street || "", placeholder: "вул. Тестова, 12" });
    const map = UI.field({ label: "Посилання на мапу, необов'язково", type: "url", value: c.map_url || "", hint: "Google Maps → «Поділитися» → скопіювати. Порожньо = пошук адреси на мапі." });
    return formPanel("Контакти", null, [p1.el, p2.el, email.el, city.el, street.el, map.el], async () => {
      [p1, p2, email, city, street, map].forEach((f) => f.setError(null));
      let first = null;
      const bad = (f, m) => (f.setError(m), (first = first || f));
      const n1 = T.normalizePhone(p1.value());
      if (!n1.ok) bad(p1, "Номер з 9 цифр після +380");
      const n2 = p2.value().trim() ? T.normalizePhone(p2.value()) : { ok: true, text: "" };
      if (!n2.ok) bad(p2, "Номер з 9 цифр після +380 або порожньо");
      const em = email.value().trim();
      if (em && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(em)) bad(email, "Перевірте адресу, наприклад hello@salon.ua");
      if (!city.value().trim()) bad(city, "Вкажіть місто");
      if (!street.value().trim()) bad(street, "Вкажіть вулицю й будинок");
      const mu = map.value().trim();
      if (mu && !isUrl(mu)) bad(map, "Посилання має починатися з https://");
      if (first) return first.input.focus();
      await savePart({
        contacts: {
          phones: [n1.text, n2.text].filter(Boolean),
          email: em,
          city: city.value().trim().replace(/\s+/g, " "),
          street: street.value().trim().replace(/\s+/g, " "),
          map_url: mu,
        },
      }, "Контакти збережено. Телефон оновиться на всіх кнопках сайту.");
      p1.input.value = n1.text;
      p2.input.value = n2.text;
    });
  }

  /* ---------- соцмережі ---------- */
  function socialsPanel() {
    const s = content.socials || {};
    const nets = [["instagram", "Instagram"], ["telegram", "Telegram"], ["facebook", "Facebook"]];
    const fields = nets.map(([id, name]) => [id, UI.field({ label: name, type: "url", value: s[id] || "", placeholder: "https://" })]);
    return formPanel("Соцмережі", "Порожнє поле = посилання на сайті не показується.", fields.map(([, f]) => f.el), async () => {
      let first = null;
      const out = {};
      fields.forEach(([id, f]) => {
        f.setError(null);
        const v = f.value().trim();
        if (v && !isUrl(v)) {
          f.setError("Посилання має починатися з https://");
          first = first || f;
        }
        out[id] = v;
      });
      if (first) return first.input.focus();
      await savePart({ socials: out });
    });
  }

  function isUrl(v) {
    try {
      const u = new URL(v);
      return u.protocol === "https:" || u.protocol === "http:";
    } catch (e) {
      return false;
    }
  }
})();
