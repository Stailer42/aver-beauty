/*
 * Розділ «Майстри»: ім'я, фото, роль, спеціалізація, досвід, послуги, робочі дні.
 * Блок «Команда» на головній і вибір майстра у формі запису беруть дані звідси.
 */
(function () {
  const UI = AVERUI;
  const T = AVERText;
  const { h } = UI;

  const state = { reorder: false };
  let data = null;
  let root = null;

  AVERAdmin.register("masters", {
    async render(box) {
      root = box;
      state.reorder = false;
      await load();
      paint();
    },
  });

  async function load() {
    const [masters, cats, services, bookings, photos] = await Promise.all([
      AVERDB.list("masters"),
      AVERDB.list("categories"),
      AVERDB.list("services"),
      AVERDB.list("bookings"),
      AVERDB.list("photos"),
    ]);
    const urls = {};
    await Promise.all(masters.map(async (m) => (urls[m.id] = await AVERDB.fileUrl(m.photo))));
    data = { masters, cats, services, bookings, photos, urls };
  }

  async function reload() {
    await load();
    paint();
  }

  function metaText(m) {
    const n = (m.service_ids || []).filter((id) => data.services.some((s) => s.id === id)).length;
    return [
      m.role.replace(/ /g, " "),
      n ? n + " " + T.plural(n, ["послуга", "послуги", "послуг"]) : "без послуг: записатися неможливо",
      (m.work_days || []).length ? T.dayRanges(m.work_days) : "немає робочих днів",
    ].filter(Boolean).join(" / ");
  }

  function paint() {
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

    const list = UI.list({
      items: data.masters,
      empty: "Майстрів ще немає. Натисніть «Додати майстра».",
      row: (m) => ({
        title: m.name,
        hidden: !m.visible,
        hiddenLabel: "прихований",
        meta: metaText(m),
        thumb: UI.avatar(m.name, data.urls[m.id]),
      }),
      onOpen: (m) => openMaster(m),
      onToggle: async (m) => {
        await AVERDB.put("masters", { ...m, visible: !m.visible });
        UI.toast(m.visible ? m.name + ": сховано з сайту й форми запису" : m.name + ": знову на сайті");
        reload();
      },
      onMove: async (m, dir) => {
        const i = data.masters.indexOf(m);
        const j = i + dir;
        const arr = data.masters.slice();
        [arr[i], arr[j]] = [arr[j], arr[i]];
        await AVERDB.putMany("masters", arr.map((x, k) => ({ ...x, sort: k })));
        reload();
      },
    });
    if (state.reorder) list.setReorder(true);

    UI.clear(root);
    UI.append(root, [
      UI.viewHead("Майстри", "Порядок тут = порядок у блоці «Команда» на головній.", [
        reorderBtn,
        UI.button({ label: "Додати майстра", icon: "plus", variant: "solid", small: true, onClick: () => openMaster(null) }),
      ]),
      list.el,
    ]);
  }

  function openMaster(master) {
    const isNew = !master;
    const m = master || {
      name: "",
      role: "",
      specialty: "",
      experience_years: 0,
      photo: "",
      service_ids: [],
      work_days: [1, 2, 3, 4, 5, 6],
      visible: true,
    };
    let dirty = false;
    let pending = null; // { blob, url } нове фото, ще не збережене
    let dropPhoto = false;
    const plain = (s) => String(s || "").replace(/ /g, " ");

    /* фото */
    const preview = h("div", { class: "adm-photo__preview" });
    const fileInput = h("input", { type: "file", accept: "image/*", class: "sr-only", tabindex: "-1", "aria-hidden": "true" });
    const upBtn = UI.button({ label: "Завантажити фото", icon: "camera", small: true, onClick: () => fileInput.click() });
    const rmBtn = UI.button({
      label: "Прибрати фото",
      icon: "trash",
      small: true,
      onClick: () => {
        if (pending) URL.revokeObjectURL(pending.url);
        pending = null;
        dropPhoto = true;
        dirty = true;
        drawPhoto();
      },
    });
    const photoNote = h("p", { class: "adm-photo__note", text: "Квадратне або вертикальне фото обличчя. На сайті показується в колі." });

    function drawPhoto() {
      const url = pending ? pending.url : dropPhoto ? "" : data.urls[m.id] || "";
      UI.clear(preview).appendChild(UI.avatar(name.value() || m.name, url, "lg"));
      UI.setLabel(upBtn, url ? "Замінити фото" : "Завантажити фото");
      rmBtn.hidden = !url;
    }

    fileInput.addEventListener("change", async () => {
      const f = fileInput.files[0];
      fileInput.value = "";
      if (!f) return;
      upBtn.disabled = true;
      UI.setLabel(upBtn, "Стискаємо…");
      try {
        const { blob } = await UI.compressImage(f, 800, 0.85);
        if (pending) URL.revokeObjectURL(pending.url);
        pending = { blob, url: URL.createObjectURL(blob) };
        dropPhoto = false;
        dirty = true;
      } catch (err) {
        UI.toast(err.message, "error");
      }
      upBtn.disabled = false;
      drawPhoto();
    });

    /* поля */
    const name = UI.field({ label: "Ім'я та прізвище", name: "name", value: m.name, required: true });
    name.input.maxLength = 60;
    name.input.addEventListener("input", () => {
      if (!pending && (dropPhoto || !data.urls[m.id])) drawPhoto(); // ініціали оновлюються
    });
    const role = UI.field({ label: "Роль", name: "role", value: plain(m.role), placeholder: "Наприклад, Топ-стиліст", hint: "Дрібний підпис над ім'ям на сайті" });
    role.input.maxLength = 50;
    const spec = UI.field({ label: "Спеціалізація", name: "specialty", value: plain(m.specialty), placeholder: "Стрижки, укладання, відновлення волосся" });
    spec.input.maxLength = 90;
    const exp = UI.field({ label: "Досвід, років", name: "experience", type: "text", inputmode: "numeric", value: String(m.experience_years || 0), hint: "0 = не показувати" });
    const visible = UI.checkbox({ label: "Показувати на сайті й у формі запису", checked: m.visible });

    /* послуги */
    const svcChecks = [];
    const svcBox = h("div", { class: "adm-svcpick" },
      data.cats.map((c) => {
        const items = data.services.filter((s) => s.category_id === c.id).sort((a, b) => a.sort - b.sort);
        if (!items.length) return null;
        const checks = items.map((s) => {
          const cb = UI.checkbox({ label: s.name, value: s.id, checked: (m.service_ids || []).includes(s.id), note: s.visible ? "" : "прихована" });
          svcChecks.push(cb);
          return cb.el;
        });
        const all = UI.button({
          label: "Усі",
          small: true,
          onClick: () => {
            const boxes = checks.map((el) => el.querySelector("input"));
            const on = !boxes.every((b) => b.checked);
            boxes.forEach((b) => (b.checked = on));
            dirty = true;
          },
        });
        all.setAttribute("aria-label", "Позначити або зняти всі послуги категорії " + c.name);
        return h("div", { class: "adm-svcpick__group" },
          h("div", { class: "adm-svcpick__head" }, h("h3", { text: c.name }), all),
          checks
        );
      })
    );

    /* робочі дні */
    const dayChecks = T.WEEK_ORDER.map((d) => {
      const input = h("input", { type: "checkbox", value: String(d), checked: (m.work_days || []).includes(d) });
      return {
        d,
        input,
        el: h("label", { class: "adm-day" }, input, h("span", { text: T.DAYS_SHORT[d] })),
      };
    });

    const errBox = h("p", { class: "adm-opts__error", role: "alert", hidden: true });

    const form = h("form", { class: "form adm-form", novalidate: true },
      h("div", { class: "adm-photo" }, preview, h("div", { class: "adm-photo__side" }, h("div", { class: "adm-actions" }, upBtn, rmBtn), photoNote), fileInput),
      name.el,
      role.el,
      spec.el,
      exp.el,
      visible.el,
      h("fieldset", { class: "adm-fieldset" },
        h("legend", { text: "Робочі дні" }),
        h("p", { class: "adm-note", text: "У ці дні майстра можна обрати у формі запису (у межах годин роботи салону)." }),
        h("div", { class: "adm-days" }, dayChecks.map((x) => x.el))
      ),
      h("fieldset", { class: "adm-fieldset" },
        h("legend", { text: "Послуги, які виконує" }),
        data.services.length ? svcBox : UI.empty("Послуг ще немає: спершу додайте їх у розділі «Послуги»."),
      ),
      errBox
    );
    form.addEventListener("input", () => (dirty = true));
    form.addEventListener("change", () => (dirty = true));
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      save();
    });

    const saveBtn = UI.button({ label: isNew ? "Додати майстра" : "Зберегти", variant: "solid", onClick: () => save() });
    const actions = [UI.button({ label: "Скасувати", onClick: () => dlg.tryClose() }), saveBtn];
    if (!isNew) actions.unshift(UI.button({ label: "Видалити", icon: "trash", class: "adm-dialog__danger", onClick: () => remove() }));

    const dlg = UI.dialog({
      title: isNew ? "Новий майстер" : m.name,
      body: form,
      actions,
      wide: true,
      isDirty: () => dirty,
      onClose: () => {
        if (pending) URL.revokeObjectURL(pending.url);
      },
    });
    drawPhoto();
    if (isNew) name.input.focus();

    async function save() {
      [name, exp].forEach((f) => f.setError(null));
      errBox.hidden = true;
      const n = name.value().trim().replace(/\s+/g, " ");
      const years = UI.int(exp.value());
      let first = null;
      if (n.length < 2) {
        name.setError("Введіть ім'я майстра");
        first = first || name.input;
      } else if (data.masters.some((x) => x.id !== m.id && x.name.toLowerCase() === n.toLowerCase())) {
        name.setError("Майстер з таким ім'ям уже є");
        first = first || name.input;
      }
      if (years === null || years < 0 || years > 70) {
        exp.setError("Ціле число від 0 до 70");
        first = first || exp.input;
      }
      const days = dayChecks.filter((x) => x.input.checked).map((x) => x.d).sort();
      const serviceIds = svcChecks.filter((c) => c.checked()).map((c) => c.input.value);
      if (first) {
        first.focus();
        return;
      }

      saveBtn.disabled = true;
      const row = {
        ...m,
        name: n,
        role: T.nbsp(role.value().trim().replace(/\s+/g, " ")),
        specialty: T.nbsp(spec.value().trim().replace(/\s+/g, " ")),
        experience_years: years,
        service_ids: serviceIds,
        work_days: days,
        visible: visible.checked(),
      };
      if (isNew) row.sort = data.masters.length ? Math.max(...data.masters.map((x) => x.sort)) + 1 : 0;
      try {
        const oldPhoto = m.photo;
        if (pending) row.photo = await AVERDB.putFile(pending.blob);
        else if (dropPhoto) row.photo = "";
        await AVERDB.put("masters", row);
        // старий файл більше не потрібен
        if ((pending || dropPhoto) && oldPhoto) await AVERDB.removeFile(oldPhoto);
      } catch (err) {
        console.error(err);
        UI.toast("Не вдалося зберегти. Спробуйте ще раз.", "error");
        saveBtn.disabled = false;
        return;
      }
      dirty = false;
      dlg.close();
      const warn = !serviceIds.length ? " Без послуг до майстра не можна записатися." : !days.length ? " Без робочих днів до майстра не можна записатися." : "";
      UI.toast((isNew ? n + ": додано." : "Зміни збережено.") + warn, warn ? "error" : null);
      reload();
    }

    async function remove() {
      const today = UI.todayISO();
      const future = data.bookings.filter((b) => b.master_id === m.id && b.status !== "cancelled" && b.date >= today).length;
      if (future) {
        await UI.confirm({
          title: "Спершу перенесіть записи",
          text: "До майстра " + m.name + " є майбутні записи (" + future + "). Перенесіть їх до іншого майстра або скасуйте в розділі «Записи». Щоб прибрати майстра з сайту вже зараз, сховайте його.",
          ok: "Зрозуміло",
        });
        return;
      }
      const ok = await UI.confirm({ title: "Видалити майстра?", text: m.name + " зникне з сайту й форми запису. Старі записи збережуться.", ok: "Видалити", danger: true });
      if (!ok) return;
      await AVERDB.remove("masters", m.id);
      if (m.photo) await AVERDB.removeFile(m.photo);
      // роботи цього майстра лишаються в галереї, але без підпису
      const works = data.photos.filter((p) => p.master_id === m.id);
      if (works.length) await AVERDB.putMany("photos", works.map((p) => ({ ...p, master_id: null })));
      dirty = false;
      dlg.close();
      UI.toast("Майстра видалено");
      reload();
    }
  }
})();
