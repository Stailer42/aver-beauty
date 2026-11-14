/*
 * AVER: логіка сторінки онлайн-запису.
 * Кроки: 1 процедура → 2 деталі → 3 дата й час → 4 контакти → успіх.
 * Дані й "база" беруться з data.js (AVER.services, AVER.getBusySlots, AVER.saveBooking).
 */

(function () {
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];

  const WEEKDAYS = ["Нд", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
  const MONTHS = ["січ", "лют", "бер", "кві", "тра", "чер", "лип", "сер", "вер", "жов", "лис", "гру"];
  const NEXT_LABELS = {
    1: "Обрати деталі",
    2: "Обрати дату й час",
    3: "Ввести контакти",
    4: "Підтвердити запис",
  };

  const state = {
    step: 1,
    maxStep: 1,
    service: null, // об'єкт послуги
    options: {}, // { groupId: indexOfChoice }
    date: null, // "2026-11-18"
    time: null, // хвилини від початку доби
    shownTotal: 0, // число, яке зараз на екрані (для анімації ціни)
    submitting: false,
  };

  // лічильники запитів: відповідь на застарілий запит ігнорується
  let daysSeq = 0;
  let slotsSeq = 0;

  document.addEventListener("DOMContentLoaded", init);

  async function init() {
    if (typeof AVER === "undefined") return;
    try {
      await AVER.ready;
    } catch (err) {
      showError($("[data-service-list]"), "Не вдалося завантажити послуги. Оновіть сторінку або зателефонуйте нам.");
      return;
    }
    if (!AVER.categories.length) {
      showError($("[data-service-list]"), "Онлайн-запис тимчасово недоступний. Зателефонуйте нам, і ми запишемо вас.");
      return;
    }
    renderCategories();
    bindNav();
    bindForm();

    // Прийшли з головної за посиланням на конкретну послугу: ?service=manicure
    const preset = new URLSearchParams(location.search).get("service");
    const service = AVER.services.find((s) => s.id === preset);
    if (service) {
      selectCategory(service.cat);
      selectService(service.id);
      goTo(2);
    } else {
      selectCategory(AVER.categories[0].id);
    }
    updateSummary();
  }

  /* ---------- Утиліти ---------- */
  function toISO(d) {
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }

  function fromISO(iso) {
    return new Date(iso + "T00:00:00");
  }

  function timeText(min) {
    return String(Math.floor(min / 60)).padStart(2, "0") + ":" + String(min % 60).padStart(2, "0");
  }

  function longDate(iso) {
    return fromISO(iso).toLocaleDateString("uk-UA", { weekday: "long", day: "numeric", month: "long" });
  }

  function dayMonth(iso) {
    return fromISO(iso).toLocaleDateString("uk-UA", { day: "numeric", month: "long" });
  }

  function showError(box, text) {
    box.innerHTML = "";
    const p = document.createElement("p");
    p.className = "empty";
    p.textContent = text;
    box.appendChild(p);
  }

  function total() {
    if (!state.service) return 0;
    return state.service.options.reduce((sum, group) => {
      const i = state.options[group.id] ?? 0;
      return sum + group.choices[i].add;
    }, state.service.price);
  }

  /* ---------- Крок 1: процедура ---------- */
  function renderCategories() {
    const box = $("[data-cat-tabs]");
    AVER.categories.forEach((cat) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "tab";
      b.setAttribute("aria-pressed", "false");
      b.dataset.cat = cat.id;
      b.textContent = cat.name;
      box.appendChild(b);
    });
    box.addEventListener("click", (e) => {
      const b = e.target.closest(".tab");
      if (b) selectCategory(b.dataset.cat);
    });
  }

  function selectCategory(catId) {
    $$("[data-cat-tabs] .tab").forEach((t) => t.setAttribute("aria-pressed", String(t.dataset.cat === catId)));
    const list = $("[data-service-list]");
    list.innerHTML = "";
    AVER.services
      .filter((s) => s.cat === catId)
      .forEach((s) => {
        const li = document.createElement("li");
        li.innerHTML =
          '<label class="choice">' +
          '<input type="radio" name="service">' +
          '<span class="choice__body' + (s.description ? " has-desc" : "") + '">' +
          '<span class="choice__name"></span><span class="choice__meta"></span>' +
          (s.description ? '<span class="choice__desc"></span>' : "") +
          '<span class="choice__price"></span><span class="choice__dot" aria-hidden="true"></span>' +
          "</span></label>";
        const input = $("input", li);
        input.value = s.id;
        input.checked = state.service && state.service.id === s.id;
        $(".choice__name", li).textContent = s.name;
        $(".choice__meta", li).textContent = AVER.formatDuration(s.min);
        if (s.description) $(".choice__desc", li).textContent = s.description;
        $(".choice__price", li).textContent = (s.from ? "від " : "") + AVER.formatPrice(s.price);
        input.addEventListener("change", () => selectService(s.id));
        list.appendChild(li);
      });
  }

  function selectService(id) {
    const s = AVER.services.find((x) => x.id === id);
    if (!s) return;
    const changed = !state.service || state.service.id !== id;
    state.service = s;
    if (changed) {
      state.options = {};
      s.options.forEach((g) => (state.options[g.id] = 0));
      // інша тривалість/категорія: раніше обраний час може вже не підходити
      state.time = null;
      state.maxStep = 2;
    }
    const input = $$('input[name="service"]').find((i) => i.value === id);
    if (input) input.checked = true;
    renderOptions();
    updateSummary();
  }

  /* ---------- Крок 2: деталі ---------- */
  function renderOptions() {
    const box = $("[data-options]");
    box.innerHTML = "";
    const s = state.service;
    if (!s) return;

    if (!s.options.length) {
      const p = document.createElement("p");
      p.className = "empty";
      p.textContent = "Для процедури «" + s.name + "» додаткові деталі не потрібні. Переходьте до вибору часу.";
      box.appendChild(p);
      return;
    }

    s.options.forEach((group) => {
      const fs = document.createElement("fieldset");
      fs.className = "optgroup";
      const lg = document.createElement("legend");
      lg.textContent = group.label;
      fs.appendChild(lg);
      const pills = document.createElement("div");
      pills.className = "pills";
      group.choices.forEach((c, i) => {
        const label = document.createElement("label");
        label.className = "pill";
        label.innerHTML = '<input type="radio"><span><span class="pill__t"></span><small></small></span>';
        const input = $("input", label);
        input.name = "opt-" + group.id;
        input.checked = state.options[group.id] === i;
        $(".pill__t", label).textContent = c.label;
        $("small", label).textContent = c.add ? "+" + AVER.formatPrice(c.add) : "";
        input.addEventListener("change", () => {
          state.options[group.id] = i;
          updateSummary();
        });
        pills.appendChild(label);
      });
      fs.appendChild(pills);
      box.appendChild(fs);
    });
  }

  /* ---------- Крок 3: дата й час ---------- */
  async function freeSlots(iso) {
    const s = state.service;
    const day = fromISO(iso).getDay();
    const hours = AVER.hours[day];
    if (!hours) return [];
    const busy = await AVER.getBusySlots(iso, s.cat);
    const now = new Date();
    const isToday = iso === toISO(now);
    const earliest = now.getHours() * 60 + now.getMinutes() + 60; // сьогодні: не раніше ніж за годину
    const out = [];
    for (let t = hours[0]; t + s.min <= hours[1]; t += AVER.slotStep) {
      if (isToday && t < earliest) continue;
      const clash = busy.some((b) => t < b.end && t + s.min > b.start);
      if (!clash) out.push(t);
    }
    return out;
  }

  async function renderDays() {
    const my = ++daysSeq;
    const list = $("[data-days]");
    const slotsBox = $("[data-slots]");
    list.innerHTML = "";
    slotsBox.innerHTML = "";
    const today = new Date();
    let firstAvailable = null;

    const dates = [];
    for (let i = 0; i < AVER.daysAhead; i++) {
      dates.push(new Date(today.getFullYear(), today.getMonth(), today.getDate() + i));
    }
    let allSlots;
    try {
      allSlots = await Promise.all(dates.map((d) => freeSlots(toISO(d))));
    } catch (err) {
      if (my !== daysSeq) return;
      showError(slotsBox, "Не вдалося завантажити розклад. Перевірте інтернет і спробуйте ще раз або зателефонуйте нам.");
      return;
    }
    if (my !== daysSeq) return; // поки чекали, користувач уже пішов далі

    for (let i = 0; i < dates.length; i++) {
      const d = dates[i];
      const iso = toISO(d);
      const slots = allSlots[i];
      const li = document.createElement("li");
      const b = document.createElement("button");
      b.type = "button";
      b.className = "day";
      b.dataset.date = iso;
      b.innerHTML = '<span class="day__wd"></span><span class="day__num"></span><span class="day__mo"></span>';
      $(".day__wd", b).textContent = WEEKDAYS[d.getDay()];
      $(".day__num", b).textContent = d.getDate();
      $(".day__mo", b).textContent = MONTHS[d.getMonth()];
      const closed = !AVER.hours[d.getDay()];
      b.disabled = !slots.length;
      b.setAttribute("aria-pressed", "false");
      b.setAttribute(
        "aria-label",
        WEEKDAYS[d.getDay()] + " " + d.getDate() + " " + MONTHS[d.getMonth()] + (i === 0 ? ", сьогодні" : "") + (closed ? ", вихідний" : !slots.length ? ", вільного часу немає" : ", вільних слотів: " + slots.length)
      );
      if (!b.disabled && !firstAvailable) firstAvailable = iso;
      b.addEventListener("click", () => selectDate(iso));
      li.appendChild(b);
      list.appendChild(li);
    }

    // залишаємо обрану дату, якщо вона досі доступна, інакше перший вільний день
    const keep = state.date && !$('[data-date="' + state.date + '"]', list)?.disabled;
    selectDate(keep ? state.date : firstAvailable, true);
  }

  async function selectDate(iso, keepTime) {
    if (!keepTime || iso !== state.date) state.time = null;
    state.date = iso;
    $$("[data-days] .day").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.date === iso)));
    const box = $("[data-slots]");
    const status = $("[data-slots-status]");
    const my = ++slotsSeq;
    box.innerHTML = "";

    if (!iso) {
      showError(box, "Найближчими днями вільного часу немає. Зателефонуйте нам, і\u00A0ми знайдемо віконце.");
      status.textContent = "";
      updateSummary();
      return;
    }

    let slots;
    try {
      slots = await freeSlots(iso);
    } catch (err) {
      if (my !== slotsSeq) return;
      showError(box, "Не вдалося завантажити вільний час. Спробуйте ще раз або зателефонуйте нам.");
      return;
    }
    if (my !== slotsSeq) return; // відповідь на старий клік: ігноруємо
    box.innerHTML = "";
    status.textContent = longDate(iso) + ": вільних слотів " + slots.length;
    if (state.time !== null && !slots.includes(state.time)) state.time = null;

    const groups = [
      { name: "Ранок", test: (t) => t < 12 * 60 },
      { name: "День", test: (t) => t >= 12 * 60 && t < 17 * 60 },
      { name: "Вечір", test: (t) => t >= 17 * 60 },
    ];
    groups.forEach((g) => {
      const items = slots.filter(g.test);
      if (!items.length) return;
      const wrap = document.createElement("div");
      wrap.className = "slots-group";
      const h = document.createElement("h3");
      h.textContent = g.name;
      const ul = document.createElement("ul");
      ul.className = "slots";
      items.forEach((t) => {
        const li = document.createElement("li");
        const b = document.createElement("button");
        b.type = "button";
        b.className = "slot";
        b.textContent = timeText(t);
        b.setAttribute("aria-pressed", String(state.time === t));
        b.addEventListener("click", () => {
          state.time = t;
          $("[data-slots-notice]").hidden = true;
          $$(".slot", box).forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
          updateSummary();
        });
        li.appendChild(b);
        ul.appendChild(li);
      });
      wrap.append(h, ul);
      box.appendChild(wrap);
    });
    updateSummary();
  }

  /* ---------- Крок 4: форма ---------- */
  function formatPhone(value) {
    let d = value.replace(/\D/g, "");
    if (d.startsWith("380")) d = d.slice(3);
    else if (d.startsWith("80")) d = d.slice(2);
    while (d.startsWith("0")) d = d.slice(1);
    d = d.slice(0, 9);
    const parts = [d.slice(0, 2), d.slice(2, 5), d.slice(5, 7), d.slice(7, 9)].filter(Boolean);
    return { text: "+380" + (parts.length ? " " + parts.join(" ") : ""), digits: d };
  }

  function bindForm() {
    const phone = $("#f-phone");
    phone.addEventListener("focus", () => {
      if (!phone.value) phone.value = "+380 ";
    });
    phone.addEventListener("blur", () => {
      const f = formatPhone(phone.value);
      phone.value = f.digits.length ? f.text : "";
    });
    phone.addEventListener("input", () => {
      const f = formatPhone(phone.value);
      // форматуємо лише коли друкують у кінці, щоб курсор не стрибав під час правок усередині
      if (phone.selectionStart === phone.value.length) {
        phone.value = f.text + (f.digits.length ? "" : " ");
      }
      if (f.digits.length === 9) setInvalid("phone", false);
    });
    $("#f-name").addEventListener("input", (e) => {
      if (e.target.value.trim().length >= 2) setInvalid("name", false);
    });
    $('input[name="consent"]').addEventListener("change", (e) => {
      if (e.target.checked) setInvalid("consent", false);
    });
    $("#bk-form").addEventListener("submit", (e) => {
      e.preventDefault();
      submit();
    });
  }

  function setInvalid(field, on) {
    const el = $('[data-field="' + field + '"]');
    el.classList.toggle("is-invalid", on);
    const input = $("input", el);
    if (input) input.setAttribute("aria-invalid", String(on));
  }

  function validate() {
    const name = $("#f-name").value.trim();
    const phone = formatPhone($("#f-phone").value);
    const consent = $('input[name="consent"]').checked;
    setInvalid("name", name.length < 2);
    setInvalid("phone", phone.digits.length !== 9);
    setInvalid("consent", !consent);
    const firstBad = $(".is-invalid input");
    if (firstBad) firstBad.focus();
    return !firstBad ? { name, phone: phone.text, comment: $("#f-comment").value.trim() } : null;
  }

  async function submit() {
    if (state.submitting) return;
    const data = validate();
    if (!data) return;
    const next = $("[data-next]");
    $("[data-form-error]").hidden = true;
    state.submitting = true;
    setBusy(true);
    next.disabled = true;
    $("[data-next-label]").textContent = "Зберігаємо…";

    try {
      // час міг зайняти хтось інший, поки заповнювали форму
      const still = await freeSlots(state.date);
      if (!still.includes(state.time)) {
        state.time = null;
        state.submitting = false;
        setBusy(false);
        goTo(3);
        showSlotsNotice("Цей час щойно зайняли. Оберіть, будь ласка, інший.");
        return;
      }
      const result = await saveCurrent(data);
      showDone(data.name, result.id);
    } catch (err) {
      showFormError("Не вдалося зберегти запис. Перевірте інтернет і спробуйте ще раз або зателефонуйте нам.");
      state.submitting = false;
      setBusy(false);
      updateSummary();
    }
  }

  function setBusy(on) {
    $("[data-back]").disabled = on;
    $$("[data-steps] button").forEach((b, i) => (b.disabled = on || i + 1 > state.maxStep));
  }

  function showFormError(text) {
    const el = $("[data-form-error]");
    el.textContent = text;
    el.hidden = false;
  }

  function showSlotsNotice(text) {
    const el = $("[data-slots-notice]");
    el.textContent = text;
    el.hidden = false;
  }

  function saveCurrent(data) {
    return AVER.saveBooking({
      service: state.service.id,
      serviceName: state.service.name,
      category: state.service.cat,
      options: optionsSummary(),
      date: state.date,
      start: state.time,
      duration: state.service.min,
      price: total(),
      name: data.name,
      phone: data.phone,
      comment: data.comment,
    });
  }

  function showDone(name, id) {
    $$(".bk-step").forEach((s) => (s.hidden = true));
    $("[data-nav-bar]").hidden = true;
    $$("[data-steps] li").forEach((li) => {
      li.classList.remove("is-current");
      li.classList.add("is-done");
    });
    $$("[data-steps] button").forEach((b) => (b.disabled = true));
    $("[data-done-name]").textContent = name;
    $("[data-done-text]").textContent =
      "Ви записані на «" + state.service.name + "»: " + dayMonth(state.date) + " о " + timeText(state.time) + ". Адміністратор зателефонує, щоб підтвердити візит.";
    $("[data-done-id]").textContent = id;
    const done = $("[data-done]");
    done.hidden = false;
    $("#done-title").focus({ preventScroll: true });
    scrollToTop();
  }

  /* ---------- Навігація між кроками ---------- */
  function bindNav() {
    $("[data-next]").addEventListener("click", () => {
      if (state.step === 4) submit();
      else goTo(state.step + 1);
    });
    $("[data-back]").addEventListener("click", () => {
      if (state.step > 1) goTo(state.step - 1);
    });
    $("[data-steps]").addEventListener("click", (e) => {
      const b = e.target.closest("button[data-goto]");
      if (b && !b.disabled) goTo(Number(b.dataset.goto));
    });
  }

  function canLeave(step) {
    if (step === 1) return !!state.service;
    if (step === 2) return true;
    if (step === 3) return state.date && state.time !== null;
    return true;
  }

  function goTo(step) {
    if (state.submitting) return;
    if (step !== 3) $("[data-slots-notice]").hidden = true;
    if (step > state.step) {
      for (let s = state.step; s < step; s++) if (!canLeave(s)) return;
    }
    const back = step < state.step;
    state.step = step;
    state.maxStep = Math.max(state.maxStep, step);

    $$(".bk-step").forEach((sec) => {
      const on = Number(sec.dataset.step) === step;
      sec.hidden = !on;
      sec.classList.toggle("is-back", on && back);
    });

    if (step === 3) renderDays();

    $$("[data-steps] li").forEach((li, i) => {
      const n = i + 1;
      li.classList.toggle("is-current", n === step);
      li.classList.toggle("is-done", n < step);
      $("button", li).disabled = n > state.maxStep;
      if (n === step) $("button", li).setAttribute("aria-current", "step");
      else $("button", li).removeAttribute("aria-current");
    });

    $("[data-back]").hidden = step === 1;
    const h = $("#st" + step);
    if (h) h.focus({ preventScroll: true });
    scrollToTop();
    updateSummary();
  }

  function scrollToTop() {
    const top = $("[data-steps]").getBoundingClientRect().top;
    if (top < 0 || top > window.innerHeight * 0.6) {
      window.scrollTo({ top: window.scrollY + top - 100, behavior: reduceMotion ? "auto" : "smooth" });
    }
  }

  /* ---------- Підсумок і кнопка "далі" ---------- */
  function optionsSummary() {
    const s = state.service;
    if (!s) return "";
    if (!s.options.length) return "без додаткових параметрів";
    return s.options.map((g) => {
      const c = g.choices[state.options[g.id] ?? 0].label;
      return g.label + ": " + c.charAt(0).toLowerCase() + c.slice(1);
    }).join("; ");
  }

  function updateSummary() {
    const s = state.service;
    const set = (k, v) => ($('[data-sum="' + k + '"]').textContent = v || "не обрано");
    set("service", s && s.name);
    set("options", s && optionsSummary());
    set("date", state.date && state.step >= 3 ? longDate(state.date) : "");
    set("time", state.time !== null ? timeText(state.time) + "–" + timeText(state.time + s.min) : "");
    set("duration", s && AVER.formatDuration(s.min));

    animateTotal(total());

    const next = $("[data-next]");
    next.disabled = !canLeave(state.step);
    $("[data-next-label]").textContent = NEXT_LABELS[state.step];
  }

  let totalAnim = 0;
  let totalTarget = null;

  function animateTotal(to) {
    const prefix = state.service && state.service.from ? "від " : "";
    const els = [$("[data-total]"), $("[data-total-mobile]")];
    if (to !== totalTarget) $("[data-total-live]").textContent = "Разом: " + prefix + AVER.formatPrice(to);
    totalTarget = to;

    const from = state.shownTotal;
    cancelAnimationFrame(totalAnim);
    const paint = (v) => {
      state.shownTotal = v;
      els.forEach((el) => (el.textContent = prefix + AVER.formatPrice(v)));
    };
    if (reduceMotion || from === to) {
      paint(to);
      return;
    }
    const t0 = performance.now();
    const dur = 600;
    function frame(now) {
      const p = Math.min(1, (now - t0) / dur);
      const eased = 1 - Math.pow(1 - p, 4);
      paint(p === 1 ? to : Math.round((from + (to - from) * eased) / 10) * 10);
      if (p < 1) totalAnim = requestAnimationFrame(frame);
    }
    totalAnim = requestAnimationFrame(frame);
  }
})();
