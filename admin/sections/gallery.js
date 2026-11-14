/*
 * Розділ «Фото»: галерея робіт і зони салону.
 * Завантаження (браузер стискає до 1600px), порядок, показ/приховування,
 * опис для незрячих (alt), точка кадрування для робіт (на сайті кадр 4:5).
 */
(function () {
  const UI = AVERUI;
  const T = AVERText;
  const { h } = UI;
  const ALBUM_KEY = "aver-admin-album";

  const ALBUMS = {
    works: { title: "Роботи", hint: "Сітка на сайті по 3 в ряд: найкраще виглядає 6 або 9 фото." },
    salon: { title: "Салон", hint: "Кожне фото = зона салону з назвою й текстом. Фото змінюються, коли гість гортає текст." },
  };

  const state = { album: "works", reorder: false };
  let data = null;
  let root = null;

  AVERAdmin.register("gallery", {
    async render(box) {
      root = box;
      state.reorder = false;
      try {
        state.album = sessionStorage.getItem(ALBUM_KEY) || "works";
      } catch (e) { /* немає сховища */ }
      await load();
      paint();
    },
  });

  async function load() {
    const [photos, masters] = await Promise.all([AVERDB.list("photos"), AVERDB.list("masters")]);
    const urls = {};
    await Promise.all(photos.map(async (p) => (urls[p.id] = await AVERDB.fileUrl(p.src))));
    data = { photos, masters, urls, master: new Map(masters.map((m) => [m.id, m])) };
  }

  async function reload() {
    await load();
    paint();
  }

  const items = () => data.photos.filter((p) => p.album === state.album).sort((a, b) => a.sort - b.sort);

  function thumb(p) {
    const box = h("span", { class: "adm-thumb", "aria-hidden": "true" });
    if (data.urls[p.id]) {
      const img = h("img", { src: data.urls[p.id], alt: "" });
      img.style.objectPosition = "50% " + (p.focus_y ?? 50) + "%";
      box.appendChild(img);
    }
    return box;
  }

  function paint() {
    const list = items();
    const visibleN = list.filter((p) => p.visible).length;
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

    const tabs = h("div", { class: "tabs adm-tabs", role: "group", "aria-label": "Альбом" },
      Object.entries(ALBUMS).map(([id, a]) => h("button", {
        class: "tab",
        type: "button",
        "aria-pressed": String(state.album === id),
        on: {
          click: () => {
            state.album = id;
            state.reorder = false;
            try {
              sessionStorage.setItem(ALBUM_KEY, id);
            } catch (e) { /* немає сховища */ }
            paint();
          },
        },
      }, a.title, h("span", { class: "adm-tab__count", text: String(data.photos.filter((p) => p.album === id).length) })))
    );

    const ui = UI.list({
      items: list,
      empty: "Фото ще немає. Натисніть «Додати фото».",
      row: (p) => ({
        title: state.album === "works" ? p.caption.replace(/ /g, " ") || "Без підпису" : p.title.replace(/ /g, " ") || "Без назви",
        hidden: !p.visible,
        hiddenLabel: "приховане",
        meta: state.album === "works"
          ? [(data.master.get(p.master_id) || {}).name, p.width + "×" + p.height].filter(Boolean).join(" / ")
          : p.alt,
        thumb: thumb(p),
      }),
      onOpen: (p) => openPhoto(p),
      onToggle: async (p) => {
        await AVERDB.put("photos", { ...p, visible: !p.visible });
        UI.toast(p.visible ? "Фото сховано з сайту" : "Фото знову на сайті");
        reload();
      },
      onMove: async (p, dir) => {
        const arr = list.slice();
        const i = arr.indexOf(p);
        const j = i + dir;
        [arr[i], arr[j]] = [arr[j], arr[i]];
        await AVERDB.putMany("photos", arr.map((x, k) => ({ ...x, sort: k })));
        reload();
      },
    });
    if (state.reorder) ui.setReorder(true);

    UI.clear(root);
    UI.append(root, [
      UI.viewHead("Фото", "Роботи майстрів і зони салону. Порядок тут = порядок на сайті.", [
        reorderBtn,
        UI.button({ label: "Додати фото", icon: "plus", variant: "solid", small: true, onClick: () => openPhoto(null) }),
      ]),
      tabs,
      h("p", { class: "adm-note", text: ALBUMS[state.album].hint }),
      !visibleN && list.length ? h("p", { class: "adm-warn" }, UI.icon("eye-off"), "Усі фото цього альбому сховані: на сайті секції не буде.") : null,
      ui.el,
    ]);
  }

  function openPhoto(photo) {
    const isNew = !photo;
    const album = photo ? photo.album : state.album;
    const p = photo || { album, src: "", width: 0, height: 0, alt: "", caption: "", master_id: null, title: "", text: "", focus_y: 50, visible: true };
    let dirty = false;
    let pending = null; // { blob, url, width, height }

    /* прев'ю з рамкою як на сайті */
    const frame = h("div", { class: "adm-frame adm-frame--" + album });
    const img = h("img", { alt: "" });
    frame.appendChild(img);
    const empty = h("p", { class: "adm-frame__empty", text: "Фото ще не обрано" });
    frame.appendChild(empty);

    const focus = h("input", { type: "range", min: "0", max: "100", step: "1", value: String(p.focus_y ?? 50), id: "ph-focus" });
    const focusField = h("div", { class: "field adm-focus" },
      h("label", { for: "ph-focus", text: "Що лишається в кадрі" }),
      h("div", { class: "adm-focus__row" }, h("span", { text: "верх" }), focus, h("span", { text: "низ" })),
      h("span", { class: "field__hint", text: "Посуньте, щоб обличчя чи робота не обрізалися: на сайті фото показується в рамці 4:5." })
    );
    focus.addEventListener("input", () => {
      img.style.objectPosition = "50% " + focus.value + "%";
      dirty = true;
    });

    function drawPreview() {
      const url = pending ? pending.url : data.urls[p.id] || "";
      img.src = url;
      img.hidden = !url;
      empty.hidden = !!url;
      img.style.objectPosition = "50% " + focus.value + "%";
      UI.setLabel(upBtn, url ? "Замінити фото" : "Обрати фото");
    }

    const file = h("input", { type: "file", accept: "image/*", class: "sr-only", tabindex: "-1", "aria-hidden": "true" });
    const upBtn = UI.button({ label: "Обрати фото", icon: "upload", small: true, onClick: () => file.click() });
    const sizeNote = h("p", { class: "adm-photo__note" });
    file.addEventListener("change", async () => {
      const f = file.files[0];
      file.value = "";
      if (!f) return;
      upBtn.disabled = true;
      UI.setLabel(upBtn, "Стискаємо…");
      try {
        const r = await UI.compressImage(f, 1600, 0.82);
        if (pending) URL.revokeObjectURL(pending.url);
        pending = { ...r, url: URL.createObjectURL(r.blob) };
        dirty = true;
        sizeNote.textContent = "Після стиснення: " + r.width + "×" + r.height + ", " + Math.round(r.blob.size / 1024) + " КБ." +
          (Math.max(r.width, r.height) < 1000 ? " Фото замале, на великому екрані може бути розмитим." : "");
        photoErr.hidden = true;
      } catch (err) {
        UI.toast(err.message, "error");
      }
      upBtn.disabled = false;
      drawPreview();
    });
    const photoErr = h("p", { class: "adm-opts__error", role: "alert", hidden: true, text: "Оберіть фото" });

    /* поля */
    const alt = UI.field({ label: "Що на фото (для незрячих і Google)", multiline: true, rows: 2, value: p.alt, hint: "Опишіть просто: «Майстер наносить червоний гель-лак»" });
    alt.input.maxLength = 160;
    let fields;
    if (album === "works") {
      const caption = UI.field({ label: "Підпис на сайті", value: (p.caption || "").replace(/ /g, " "), placeholder: "Наприклад, Манікюр з гель-лаком" });
      caption.input.maxLength = 60;
      const master = UI.select({
        label: "Майстер, необов'язково",
        value: p.master_id || "",
        options: [{ value: "", label: "Не вказувати" }].concat(data.masters.map((m) => ({ value: m.id, label: m.name + (m.visible ? "" : " (прихований)") }))),
      });
      fields = { caption, master };
    } else {
      const title = UI.field({ label: "Назва зони", value: (p.title || "").replace(/ /g, " "), placeholder: "Наприклад, Кабінет догляду" });
      title.input.maxLength = 50;
      const text = UI.field({ label: "Текст", multiline: true, rows: 3, value: (p.text || "").replace(/ /g, " ") });
      text.input.maxLength = 300;
      fields = { title, text };
    }
    const visible = UI.checkbox({ label: "Показувати на сайті", checked: p.visible });

    const form = h("form", { class: "form adm-form", novalidate: true },
      h("div", { class: "adm-photoedit" },
        frame,
        h("div", { class: "adm-photoedit__side" },
          h("div", { class: "adm-actions" }, upBtn),
          sizeNote,
          photoErr,
          album === "works" ? focusField : null
        ),
        file
      ),
      album === "works" ? [fields.caption.el, fields.master.el] : [fields.title.el, fields.text.el],
      alt.el,
      visible.el
    );
    form.addEventListener("input", () => (dirty = true));
    form.addEventListener("change", () => (dirty = true));
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      save();
    });

    const saveBtn = UI.button({ label: isNew ? "Додати фото" : "Зберегти", variant: "solid", onClick: () => save() });
    const actions = [UI.button({ label: "Скасувати", onClick: () => dlg.tryClose() }), saveBtn];
    if (!isNew) actions.unshift(UI.button({ label: "Видалити", icon: "trash", class: "adm-dialog__danger", onClick: () => remove() }));

    const dlg = UI.dialog({
      title: isNew ? "Нове фото: " + ALBUMS[album].title.toLowerCase() : album === "works" ? "Фото роботи" : "Зона салону",
      body: form,
      actions,
      wide: true,
      isDirty: () => dirty,
      onClose: () => {
        if (pending) URL.revokeObjectURL(pending.url);
      },
    });
    drawPreview();

    async function save() {
      alt.setError(null);
      photoErr.hidden = true;
      let first = null;
      if (!pending && !p.src) {
        photoErr.hidden = false;
        first = upBtn;
      }
      const altText = alt.value().trim().replace(/\s+/g, " ");
      if (altText.length < 5) {
        alt.setError("Опишіть фото кількома словами");
        first = first || alt.input;
      }
      if (album === "salon") {
        fields.title.setError(null);
        if (!fields.title.value().trim()) {
          fields.title.setError("Введіть назву зони");
          first = first || fields.title.input;
        }
      }
      if (first) {
        first.focus();
        return;
      }

      saveBtn.disabled = true;
      const row = { ...p, alt: altText, visible: visible.checked(), focus_y: Number(focus.value) };
      if (album === "works") {
        row.caption = T.nbsp(fields.caption.value().trim().replace(/\s+/g, " "));
        row.master_id = fields.master.value() || null;
      } else {
        row.title = T.nbsp(fields.title.value().trim().replace(/\s+/g, " "));
        row.text = T.nbsp(fields.text.value().trim().replace(/\s+/g, " "));
      }
      if (isNew) {
        const same = data.photos.filter((x) => x.album === album);
        row.sort = same.length ? Math.max(...same.map((x) => x.sort)) + 1 : 0;
      }
      try {
        const oldSrc = p.src;
        if (pending) {
          row.src = await AVERDB.putFile(pending.blob);
          row.width = pending.width;
          row.height = pending.height;
        }
        await AVERDB.put("photos", row);
        if (pending && oldSrc) await AVERDB.removeFile(oldSrc); // файли з assets/ не чіпає
      } catch (err) {
        console.error(err);
        UI.toast(err && err.name === "QuotaExceededError" ? "У браузері закінчилося місце для фото. Видаліть зайві фото." : "Не вдалося зберегти. Спробуйте ще раз.", "error");
        saveBtn.disabled = false;
        return;
      }
      dirty = false;
      dlg.close();
      UI.toast(isNew ? "Фото додано в кінець альбому" : "Зміни збережено");
      reload();
    }

    async function remove() {
      const ok = await UI.confirm({ title: "Видалити фото?", text: "Фото зникне з сайту. Якщо хочете лише тимчасово прибрати його, краще сховайте.", ok: "Видалити", danger: true });
      if (!ok) return;
      await AVERDB.remove("photos", p.id);
      await AVERDB.removeFile(p.src);
      dirty = false;
      dlg.close();
      UI.toast("Фото видалено");
      reload();
    }
  }
})();
