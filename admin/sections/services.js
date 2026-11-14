/*
 * Розділ «Послуги»: категорії, послуги, ціни, тривалість, параметри з доплатами.
 * Усе, що тут змінено, одразу бере головна сторінка й форма запису (через data.js).
 */
(function () {
  const UI = AVERUI;
  const T = AVERText;
  const { h } = UI;
  const CAT_KEY = "aver-admin-cat";

  const state = { cat: null, reorder: false };
  let data = null; // { cats, services, masters, bookings }
  let root = null;

  AVERAdmin.register("services", {
    async render(box) {
      root = box;
      state.reorder = false;
      await load();
      paint();
    },
  });

  async function load() {
    const [cats, services, masters, bookings] = await Promise.all([
      AVERDB.list("categories"),
      AVERDB.list("services"),
      AVERDB.list("masters"),
      AVERDB.list("bookings"),
    ]);
    data = { cats, services, masters, bookings };
    if (!state.cat) {
      try {
        state.cat = sessionStorage.getItem(CAT_KEY);
      } catch (e) { /* немає сховища */ }
    }
    if (!cats.some((c) => c.id === state.cat)) state.cat = cats[0] ? cats[0].id : null;
  }

  async function reload() {
    await load();
    paint();
  }

  const inCat = (catId) => data.services.filter((s) => s.category_id === catId).sort((a, b) => a.sort - b.sort);

  function priceText(s) {
    return (s.price_from ? "від " : "") + T.formatPrice(s.price);
  }

  function paint() {
    const cat = data.cats.find((c) => c.id === state.cat);
    const reorderBtn = UI.button({
      label: state.reorder ? "Готово" : "Змінити порядок",
      icon: state.reorder ? "check" : "move",
      small: true,
      onClick: () => {
        state.reorder = !state.reorder;
        paint();
      },
    });
    reorderBtn.setAttribute("aria-pressed", String(state.reorder));

    const head = UI.viewHead("Послуги", "Ціни, тривалість і доплати. Зміни одразу видно на головній і у формі запису.", [
      UI.button({ label: "Категорії", icon: "folder", small: true, onClick: openCategories }),
      reorderBtn,
      UI.button({ label: "Додати послугу", icon: "plus", variant: "solid", small: true, onClick: () => openService(null), disabled: !data.cats.length }),
    ]);

    const tabs = h("div", { class: "tabs adm-tabs", role: "group", "aria-label": "Категорії" },
      data.cats.map((c) => h("button", {
        class: "tab",
        type: "button",
        "aria-pressed": String(c.id === state.cat),
        on: {
          click: () => {
            state.cat = c.id;
            try {
              sessionStorage.setItem(CAT_KEY, c.id);
            } catch (e) { /* немає сховища */ }
            paint();
          },
        },
      }, c.name, h("span", { class: "adm-tab__count", text: String(inCat(c.id).length) })))
    );

    const items = cat ? inCat(cat.id) : [];
    const list = UI.list({
      items,
      empty: "У цій категорії ще немає послуг. Натисніть «Додати послугу».",
      row: (s) => ({
        title: s.name,
        hidden: !s.visible,
        meta: [
          T.formatDuration(s.duration_min),
          priceText(s),
          s.options.length ? s.options.length + " " + T.plural(s.options.length, ["параметр", "параметри", "параметрів"]) : "",
        ].filter(Boolean).join(" / "),
      }),
      onOpen: (s) => openService(s),
      onToggle: async (s) => {
        await AVERDB.put("services", { ...s, visible: !s.visible });
        UI.toast(s.visible ? "«" + s.name + "» сховано з сайту" : "«" + s.name + "» знову на сайті");
        reload();
      },
      onMove: async (s, dir) => {
        await move(items, s, dir, "services");
        reload();
      },
    });
    if (state.reorder) list.setReorder(true);

    UI.clear(root);
    UI.append(root, [
      head,
      data.cats.length ? tabs : UI.empty("Спершу створіть категорію: кнопка «Категорії»."),
      cat && !cat.visible ? h("p", { class: "adm-warn" }, UI.icon("eye-off"), "Категорію «" + cat.name + "» сховано: її послуг не видно на сайті.") : null,
      cat ? list.el : null,
    ]);
  }

  // Поміняти місцями з сусідом і перенумерувати порядок
  async function move(items, item, dir, table) {
    const i = items.indexOf(item);
    const j = i + dir;
    if (j < 0 || j >= items.length) return;
    const arr = items.slice();
    [arr[i], arr[j]] = [arr[j], arr[i]];
    await AVERDB.putMany(table, arr.map((x, k) => ({ ...x, sort: k })));
  }

  /* ---------- категорії ---------- */
  function openCategories() {
    const body = h("div", { class: "adm-cats" });
    let changed = false;

    function draw() {
      UI.clear(body);
      const ul = h("ul", { class: "adm-cats__list" });
      data.cats.forEach((c, i) => {
        const input = h("input", { type: "text", value: c.name, "aria-label": "Назва категорії", maxlength: "40" });
        input.addEventListener("change", async () => {
          const name = input.value.trim().replace(/\s+/g, " ");
          if (!name) {
            input.value = c.name;
            UI.toast("Назва категорії не може бути порожньою", "error");
            return;
          }
          if (name === c.name) return;
          await AVERDB.put("categories", { ...c, name });
          changed = true;
          await load();
          UI.toast("Категорію перейменовано");
        });
        const count = inCat(c.id).length;
        ul.appendChild(h("li", { class: "adm-cats__row" + (c.visible ? "" : " is-hidden") },
          h("div", { class: "field adm-cats__name" }, input),
          h("span", { class: "adm-cats__count", text: count + " " + T.plural(count, ["послуга", "послуги", "послуг"]) }),
          h("div", { class: "adm-row__tools" },
            UI.button({ label: "Вище: " + c.name, icon: "chevron-up", iconOnly: true, small: true, disabled: i === 0, onClick: () => moveCat(c, -1) }),
            UI.button({ label: "Нижче: " + c.name, icon: "chevron-down", iconOnly: true, small: true, disabled: i === data.cats.length - 1, onClick: () => moveCat(c, 1) }),
            (() => {
              const b = UI.button({
                label: (c.visible ? "Сховати з сайту: " : "Показати на сайті: ") + c.name,
                icon: c.visible ? "eye" : "eye-off",
                iconOnly: true,
                small: true,
                onClick: async () => {
                  await AVERDB.put("categories", { ...c, visible: !c.visible });
                  changed = true;
                  await load();
                  draw();
                },
              });
              b.setAttribute("aria-pressed", String(c.visible));
              return b;
            })(),
            UI.button({
              label: "Видалити: " + c.name,
              icon: "trash",
              iconOnly: true,
              small: true,
              onClick: async () => {
                if (count) {
                  UI.toast("У категорії «" + c.name + "» є послуги (" + count + "). Спершу перенесіть або видаліть їх.", "error");
                  return;
                }
                if (!(await UI.confirm({ title: "Видалити категорію?", text: "Категорію «" + c.name + "» буде видалено.", ok: "Видалити", danger: true }))) return;
                await AVERDB.remove("categories", c.id);
                changed = true;
                await load();
                draw();
              },
            })
          )
        ));
      });

      const add = UI.field({ label: "Нова категорія", name: "new-cat", placeholder: "Наприклад, Масаж" });
      add.input.maxLength = 40;
      const addBtn = UI.button({ label: "Додати", icon: "plus", small: true, type: "submit" });
      const form = h("form", { class: "adm-cats__add", novalidate: true }, add.el, addBtn);
      form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const name = add.value().trim().replace(/\s+/g, " ");
        if (!name) {
          add.setError("Введіть назву");
          add.input.focus();
          return;
        }
        if (data.cats.some((c) => c.name.toLowerCase() === name.toLowerCase())) {
          add.setError("Така категорія вже є");
          add.input.focus();
          return;
        }
        const cat = await AVERDB.put("categories", { name, sort: data.cats.length, visible: true });
        state.cat = cat.id;
        changed = true;
        await load();
        draw();
        UI.toast("Категорію «" + name + "» додано");
        body.querySelector(".adm-cats__add input").focus();
      });

      UI.append(body, [
        data.cats.length ? ul : UI.empty("Категорій ще немає."),
        form,
      ]);
    }

    async function moveCat(c, dir) {
      await move(data.cats, c, dir, "categories");
      changed = true;
      await load();
      draw();
    }

    draw();
    UI.dialog({
      title: "Категорії",
      body,
      onClose: () => {
        if (changed) reload();
      },
    });
  }

  /* ---------- послуга ---------- */
  function openService(service) {
    const isNew = !service;
    const s = service || {
      name: "",
      category_id: state.cat,
      description: "",
      price: 0,
      price_from: false,
      duration_min: 60,
      options: [],
      visible: true,
    };
    let dirty = false;

    const name = UI.field({ label: "Назва", name: "name", value: s.name, required: true });
    name.input.maxLength = 80;
    const cat = UI.select({ label: "Категорія", name: "category", value: s.category_id, options: data.cats.map((c) => ({ value: c.id, label: c.name + (c.visible ? "" : " (прихована)") })) });
    const desc = UI.field({ label: "Опис, необов'язково", name: "description", multiline: true, rows: 2, value: s.description, hint: "Один рядок під назвою на сайті, до 160 символів" });
    desc.input.maxLength = 160;
    const price = UI.field({ label: "Ціна, ₴", name: "price", type: "text", inputmode: "numeric", value: String(s.price) });
    const from = UI.checkbox({ label: "Показувати як «від … ₴»", note: "Коли ціна залежить від довжини волосся чи об'єму роботи", checked: s.price_from });
    const dur = UI.field({ label: "Тривалість, хв", name: "duration", type: "text", inputmode: "numeric", value: String(s.duration_min), hint: T.formatDuration(s.duration_min) });
    const durHint = dur.el.querySelector(".field__hint");
    dur.input.addEventListener("input", () => {
      const v = UI.int(dur.value());
      durHint.textContent = v && v > 0 && v <= 720 ? T.formatDuration(v) : "";
    });
    const visible = UI.checkbox({ label: "Показувати на сайті", checked: s.visible });

    // параметри з доплатами: копія, яку редагуємо
    const groups = structuredClone(s.options || []);
    const optBox = h("div", { class: "adm-opts" });
    const optError = h("p", { class: "adm-opts__error", role: "alert", hidden: true });

    function newId(prefix) {
      return prefix + Math.random().toString(36).slice(2, 8);
    }

    function drawOptions(focusSel) {
      UI.clear(optBox);
      groups.forEach((g, gi) => {
        const label = h("input", { type: "text", value: g.label, maxlength: "40", "aria-label": "Назва параметра " + (gi + 1), placeholder: "Наприклад, Довжина волосся", "data-g": gi });
        label.addEventListener("input", () => (g.label = label.value));
        const rows = g.choices.map((c, ci) => {
          const l = h("input", { type: "text", value: c.label, maxlength: "60", "aria-label": "Варіант " + (ci + 1), placeholder: "Варіант", "data-c": gi + "-" + ci });
          l.addEventListener("input", () => (c.label = l.value));
          const a = h("input", { type: "text", inputmode: "numeric", value: String(c.add), "aria-label": "Доплата за варіант " + (ci + 1) + ", гривень", "data-a": gi + "-" + ci });
          a.addEventListener("input", () => (c.add = a.value));
          return h("li", { class: "adm-choice" },
            h("div", { class: "adm-choice__label" }, l),
            h("div", { class: "adm-choice__add" }, h("span", { "aria-hidden": "true", text: "+" }), a, h("span", { "aria-hidden": "true", text: "₴" })),
            UI.button({
              label: "Прибрати варіант " + (ci + 1),
              icon: "x",
              iconOnly: true,
              small: true,
              disabled: g.choices.length <= 2,
              onClick: () => {
                g.choices.splice(ci, 1);
                dirty = true;
                drawOptions();
              },
            })
          );
        });
        optBox.appendChild(h("fieldset", { class: "adm-optgroup" },
          h("legend", { class: "sr-only", text: "Параметр " + (gi + 1) }),
          h("div", { class: "adm-optgroup__head" },
            h("div", { class: "field" }, label),
            UI.button({
              label: "Видалити параметр " + (g.label || gi + 1),
              icon: "trash",
              iconOnly: true,
              small: true,
              onClick: () => {
                groups.splice(gi, 1);
                dirty = true;
                drawOptions();
              },
            })
          ),
          h("p", { class: "adm-optgroup__hint", text: "Перший варіант обраний у формі запису за замовчуванням. Доплата 0 = без доплати." }),
          h("ul", { class: "adm-choices" }, rows),
          UI.button({
            label: "Додати варіант",
            icon: "plus",
            small: true,
            onClick: () => {
              g.choices.push({ label: "", add: 0 });
              dirty = true;
              drawOptions('[data-c="' + gi + "-" + (g.choices.length - 1) + '"]');
            },
          })
        ));
      });
      optBox.appendChild(UI.button({
        label: "Додати параметр",
        icon: "plus",
        small: true,
        onClick: () => {
          groups.push({ id: newId("g"), label: "", choices: [{ label: "", add: 0 }, { label: "", add: 0 }] });
          dirty = true;
          drawOptions('[data-g="' + (groups.length - 1) + '"]');
        },
      }));
      if (focusSel) {
        const el = optBox.querySelector(focusSel);
        if (el) el.focus();
      }
    }
    drawOptions();

    const form = h("form", { class: "form adm-form", novalidate: true },
      name.el,
      cat.el,
      desc.el,
      h("div", { class: "adm-form__row" }, price.el, dur.el),
      from.el,
      visible.el,
      h("fieldset", { class: "adm-fieldset" },
        h("legend", { text: "Параметри й доплати" }),
        h("p", { class: "adm-note", text: "Клієнт обирає їх у кроці «Деталі», доплата додається до ціни. Наприклад, довжина волосся або дизайн нігтів." }),
        optBox,
        optError
      )
    );
    form.addEventListener("input", () => (dirty = true));
    form.addEventListener("change", () => (dirty = true));
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      save();
    });

    const saveBtn = UI.button({ label: isNew ? "Додати послугу" : "Зберегти", variant: "solid", onClick: () => save() });
    const actions = [
      UI.button({ label: "Скасувати", onClick: () => dlg.tryClose() }),
      saveBtn,
    ];
    if (!isNew) actions.unshift(UI.button({ label: "Видалити", icon: "trash", class: "adm-dialog__danger", onClick: () => remove() }));

    const dlg = UI.dialog({
      title: isNew ? "Нова послуга" : s.name,
      body: form,
      actions,
      wide: true,
      isDirty: () => dirty,
    });
    if (isNew) name.input.focus();

    function validate() {
      let first = null;
      const bad = (field, msg) => {
        field.setError(msg);
        first = first || field.input;
      };
      [name, price, dur].forEach((f) => f.setError(null));
      optError.hidden = true;
      optBox.querySelectorAll('[aria-invalid="true"]').forEach((el) => el.removeAttribute("aria-invalid"));

      const n = name.value().trim().replace(/\s+/g, " ");
      if (n.length < 2) bad(name, "Введіть назву послуги");
      else if (data.services.some((x) => x.id !== s.id && x.name.toLowerCase() === n.toLowerCase())) bad(name, "Послуга з такою назвою вже є");

      const p = UI.int(price.value());
      if (p === null || p < 0 || p > 100000) bad(price, "Ціна: ціле число від 0 до 100 000");

      const d = UI.int(dur.value());
      if (d === null || d < 5 || d > 720) bad(dur, "Від 5 до 720 хвилин");
      else if (d % 5) bad(dur, "Кратно 5 хвилинам");

      // параметри
      let optMsg = "";
      const markOpt = (sel, msg) => {
        const el = optBox.querySelector(sel);
        if (el) {
          el.setAttribute("aria-invalid", "true");
          first = first || el;
        }
        optMsg = optMsg || msg;
      };
      const cleanGroups = groups.map((g, gi) => {
        const label = String(g.label).trim();
        if (!label) markOpt('[data-g="' + gi + '"]', "Заповніть назву кожного параметра");
        const choices = g.choices.map((c, ci) => {
          const cl = String(c.label).trim();
          if (!cl) markOpt('[data-c="' + gi + "-" + ci + '"]', "Заповніть назву кожного варіанта");
          const add = UI.int(c.add);
          if (add === null || add < 0 || add > 100000) markOpt('[data-a="' + gi + "-" + ci + '"]', "Доплата: ціле число від 0 до 100 000");
          return { label: cl, add: add || 0 };
        });
        return { id: g.id || newId("g"), label, choices };
      });
      if (optMsg) {
        optError.textContent = optMsg;
        optError.hidden = false;
      }

      if (first) {
        first.focus();
        return null;
      }
      return { name: n, price: p, duration_min: d, options: cleanGroups };
    }

    async function save() {
      const v = validate();
      if (!v) return;
      saveBtn.disabled = true;
      const catId = cat.value();
      const row = {
        ...s,
        name: v.name,
        category_id: catId,
        description: T.nbsp(desc.value().trim().replace(/[ \t]+/g, " ")),
        price: v.price,
        price_from: from.checked(),
        duration_min: v.duration_min,
        options: v.options,
        visible: visible.checked(),
      };
      // нова послуга або перенесена в іншу категорію: в кінець списку
      if (isNew || catId !== s.category_id) {
        const same = data.services.filter((x) => x.category_id === catId && x.id !== s.id);
        row.sort = same.length ? Math.max(...same.map((x) => x.sort)) + 1 : 0;
      }
      try {
        await AVERDB.put("services", row);
      } catch (err) {
        console.error(err);
        UI.toast("Не вдалося зберегти. Спробуйте ще раз.", "error");
        saveBtn.disabled = false;
        return;
      }
      dirty = false;
      dlg.close();
      state.cat = catId;
      UI.toast(isNew ? "Послугу «" + v.name + "» додано" : "Зміни збережено");
      reload();
    }

    async function remove() {
      const used = data.bookings.filter((b) => b.service_id === s.id).length;
      if (used) {
        const hide = await UI.confirm({
          title: "Цю послугу не можна видалити",
          text: "На неї вже є записи (" + used + "). Щоб вона зникла з сайту, сховайте її: записи й історія залишаться.",
          ok: s.visible ? "Сховати послугу" : "Зрозуміло",
        });
        if (hide && s.visible) {
          await AVERDB.put("services", { ...s, visible: false });
          dirty = false;
          dlg.close();
          UI.toast("«" + s.name + "» сховано з сайту");
          reload();
        }
        return;
      }
      const ok = await UI.confirm({ title: "Видалити послугу?", text: "«" + s.name + "» зникне з сайту й з переліку послуг майстрів.", ok: "Видалити", danger: true });
      if (!ok) return;
      await AVERDB.remove("services", s.id);
      // прибрати послугу в майстрів
      const touched = data.masters.filter((m) => (m.service_ids || []).includes(s.id));
      if (touched.length) {
        await AVERDB.putMany("masters", touched.map((m) => ({ ...m, service_ids: m.service_ids.filter((id) => id !== s.id) })));
      }
      dirty = false;
      dlg.close();
      UI.toast("Послугу видалено");
      reload();
    }
  }
})();
