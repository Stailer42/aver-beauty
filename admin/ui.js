/*
 * AVER адмінка: спільні елементи інтерфейсу.
 * Увесь текст із бази вставляється як текст (textContent), не як HTML.
 */
(function () {
  const UI = {};

  /*
   * Створення елемента:
   *   UI.h("p", { class: "muted" }, "текст", otherNode)
   * props: class, text, on: { click: fn }, решта йде в атрибути
   * (true = порожній атрибут, false/null = не ставити).
   */
  UI.h = function (tag, props, ...children) {
    const el = document.createElement(tag);
    props = props || {};
    for (const [k, v] of Object.entries(props)) {
      if (v === false || v == null) continue;
      if (k === "class") el.className = v;
      else if (k === "text") el.textContent = v;
      else if (k === "on") Object.entries(v).forEach(([ev, fn]) => el.addEventListener(ev, fn));
      else if (k === "value" && "value" in el) el.value = v;
      else if (k === "checked" || k === "disabled" || k === "hidden" || k === "selected") el[k] = !!v;
      else el.setAttribute(k, v === true ? "" : v);
    }
    UI.append(el, children);
    return el;
  };

  UI.append = function (el, children) {
    children.flat(Infinity).forEach((c) => {
      if (c == null || c === false) return;
      el.appendChild(typeof c === "string" || typeof c === "number" ? document.createTextNode(String(c)) : c);
    });
    return el;
  };

  UI.clear = function (el) {
    while (el.firstChild) el.removeChild(el.firstChild);
    return el;
  };

  // Текст із "\n" -> рядки з <br>
  UI.lines = function (text) {
    const out = [];
    String(text || "").split("\n").forEach((line, i) => {
      if (i) out.push(document.createElement("br"));
      out.push(document.createTextNode(line));
    });
    return out;
  };

  UI.icon = function (name, cls) {
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("class", "icon" + (cls ? " " + cls : ""));
    svg.setAttribute("aria-hidden", "true");
    const use = document.createElementNS(ns, "use");
    use.setAttribute("href", "#i-" + name);
    svg.appendChild(use);
    return svg;
  };

  /*
   * Кнопка в стилі сайту.
   * UI.button({ label, icon, variant: "solid"|"ghost", small, type, onClick, iconOnly, title })
   */
  UI.button = function (o) {
    const cls = ["btn", "btn--" + (o.variant || "ghost")];
    if (o.small) cls.push("btn--sm");
    if (o.iconOnly) cls.push("btn--icon");
    if (o.class) cls.push(o.class);
    const b = UI.h("button", {
      class: cls.join(" "),
      type: o.type || "button",
      "aria-label": o.iconOnly ? o.label : null,
      title: o.iconOnly ? o.label : o.title,
      disabled: o.disabled,
      on: o.onClick ? { click: o.onClick } : null,
    },
      UI.h("span", { class: "btn__fill" }),
      o.icon ? UI.icon(o.icon, o.iconClass) : null,
      o.iconOnly ? null : UI.h("span", { class: "btn__label", text: o.label })
    );
    return b;
  };

  // Поміняти текст кнопки (наприклад, "Зберігаємо…")
  UI.setLabel = function (btn, text) {
    const l = btn.querySelector(".btn__label");
    if (l) l.textContent = text;
  };

  let fieldSeq = 0;

  /*
   * Поле форми з підписом і помилкою (стилі .field із сайту).
   * UI.field({ label, name, type, value, multiline, rows, hint, required, autocomplete, inputmode, reveal })
   * Повертає { el, input, value(), setError(msg|null) }
   */
  UI.field = function (o) {
    const id = "f" + ++fieldSeq;
    const errId = id + "-err";
    const hintId = o.hint ? id + "-hint" : null;
    const input = o.multiline
      ? UI.h("textarea", { id, name: o.name, rows: o.rows || 3 })
      : UI.h("input", {
          id,
          name: o.name,
          type: o.type || "text",
          autocomplete: o.autocomplete || "off",
          inputmode: o.inputmode,
          min: o.min,
          max: o.max,
          step: o.step,
          placeholder: o.placeholder,
        });
    if (o.multiline && o.placeholder) input.placeholder = o.placeholder;
    if (o.value != null) input.value = o.value;
    if (o.required) input.required = true;
    input.setAttribute("aria-describedby", [hintId, errId].filter(Boolean).join(" "));

    const err = UI.h("span", { class: "field__error", id: errId }, UI.icon("alert"), UI.h("span"));
    const wrap = UI.h("div", { class: "field" + (o.reveal ? " field--reveal" : "") + (o.class ? " " + o.class : "") },
      UI.h("label", { for: id, text: o.label }),
      input,
      o.reveal ? UI.h("button", {
        class: "field__reveal",
        type: "button",
        "aria-label": "Показати пароль",
        "aria-pressed": "false",
        on: {
          click: (e) => {
            const btn = e.currentTarget;
            const show = input.type === "password";
            input.type = show ? "text" : "password";
            btn.setAttribute("aria-pressed", String(show));
            btn.setAttribute("aria-label", show ? "Сховати пароль" : "Показати пароль");
            btn.querySelector("use").setAttribute("href", show ? "#i-eye-off" : "#i-eye");
          },
        },
      }, UI.icon("eye")) : null,
      o.hint ? UI.h("span", { class: "field__hint", id: hintId, text: o.hint }) : null,
      err
    );

    const api = {
      el: wrap,
      input,
      value: () => input.value,
      setError(msg) {
        wrap.classList.toggle("is-invalid", !!msg);
        input.setAttribute("aria-invalid", String(!!msg));
        err.lastChild.textContent = msg || "";
      },
    };
    input.addEventListener("input", () => api.setError(null));
    return api;
  };

  /* ---------- тости ---------- */
  let toastTimer = 0;
  UI.toast = function (text, kind) {
    let box = document.querySelector(".adm-toast");
    if (!box) {
      box = UI.h("div", { class: "adm-toast", role: "status", "aria-live": "polite" });
      document.body.appendChild(box);
    }
    box.textContent = text;
    box.classList.toggle("is-error", kind === "error");
    box.classList.remove("is-on");
    void box.offsetWidth; // перезапуск анімації
    box.classList.add("is-on");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => box.classList.remove("is-on"), kind === "error" ? 6000 : 3200);
  };

  /* ---------- діалоги ---------- */

  /*
   * UI.dialog({ title, body: Node|[Node], actions: [buttons], wide, onClose })
   * Повертає { el, close() }. На телефоні відкривається знизу як шторка.
   */
  UI.dialog = function (o) {
    const titleId = "dlg" + ++fieldSeq;
    const closeBtn = UI.button({ label: "Закрити", icon: "x", iconOnly: true, small: true, class: "adm-dialog__x" });
    const d = UI.h("dialog", { class: "adm-dialog" + (o.wide ? " adm-dialog--wide" : ""), "aria-labelledby": titleId },
      UI.h("div", { class: "adm-dialog__head" },
        UI.h("h2", { id: titleId, text: o.title }),
        closeBtn
      ),
      UI.h("div", { class: "adm-dialog__body" }, o.body || []),
      o.actions && o.actions.length ? UI.h("div", { class: "adm-dialog__actions" }, o.actions) : null
    );
    const prevFocus = document.activeElement;
    const close = () => {
      if (d.open) d.close();
    };
    closeBtn.addEventListener("click", close);
    // клік по затемненню закриває
    d.addEventListener("click", (e) => {
      if (e.target === d) close();
    });
    d.addEventListener("close", () => {
      d.remove();
      if (o.onClose) o.onClose();
      if (prevFocus && prevFocus.focus) prevFocus.focus({ preventScroll: true });
    });
    document.body.appendChild(d);
    d.showModal();
    return { el: d, close };
  };

  // Підтвердження: await UI.confirm({ title, text, ok: "Видалити", danger: true }) -> true/false
  UI.confirm = function (o) {
    return new Promise((resolve) => {
      let result = false;
      const ok = UI.button({ label: o.ok || "Так", variant: "solid", onClick: () => { result = true; dlg.close(); } });
      const cancel = UI.button({ label: o.cancel || "Скасувати", onClick: () => dlg.close() });
      const dlg = UI.dialog({
        title: o.title,
        body: UI.h("p", { text: o.text }),
        actions: [cancel, ok],
        onClose: () => resolve(result),
      });
      (o.danger ? cancel : ok).focus();
    });
  };

  /* ---------- блоки сторінки ---------- */

  UI.viewHead = function (title, lead, actions) {
    return UI.h("div", { class: "adm-head" },
      UI.h("div", null,
        UI.h("h1", { class: "adm-title", tabindex: "-1", text: title }),
        lead ? UI.h("p", { class: "adm-lead", text: lead }) : null
      ),
      actions && actions.length ? UI.h("div", { class: "adm-head__actions" }, actions) : null
    );
  };

  UI.panel = function (title, ...children) {
    return UI.h("section", { class: "adm-panel" },
      title ? UI.h("h2", { class: "adm-panel__title", text: title }) : null,
      children
    );
  };

  UI.empty = function (text) {
    return UI.h("p", { class: "empty", text });
  };

  // Завантажити текст як файл
  UI.download = function (filename, text, type) {
    const url = URL.createObjectURL(new Blob([text], { type: type || "application/json" }));
    const a = UI.h("a", { href: url, download: filename });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  UI.todayISO = function () {
    const d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  };

  window.AVERUI = UI;
})();
