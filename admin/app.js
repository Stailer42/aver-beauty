/*
 * AVER адмінка: оболонка, вхід, навігація між розділами.
 * Розділ = файл у sections/, який викликає AVERAdmin.register(id, { render }).
 * Адреса розділу: admin/#services, admin/#bookings ...
 */
(function () {
  const UI = AVERUI;
  const { h } = UI;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];

  // mobile: true = кнопка в нижній панелі телефона (решта ховається в «Ще»)
  const SECTIONS = [
    { id: "bookings", title: "Записи", icon: "calendar", stage: 3, mobile: true },
    { id: "services", title: "Послуги", icon: "scissors", stage: 2, mobile: true },
    { id: "masters", title: "Майстри", icon: "users", stage: 2, mobile: true },
    { id: "schedule", title: "Розклад", icon: "clock", stage: 3 },
    { id: "gallery", title: "Фото", icon: "image", stage: 4 },
    { id: "reviews", title: "Відгуки", icon: "message", stage: 4 },
    { id: "content", title: "Тексти й контакти", short: "Тексти", icon: "type", stage: 4 },
    { id: "settings", title: "Налаштування", icon: "sliders", stage: 1 },
  ];
  const DEFAULT = "bookings";

  const registry = {};
  let user = null;
  let renderSeq = 0;

  // Збій бази (переповнене сховище, закрите з'єднання) у будь-якому збереженні:
  // замість тиші показуємо, що зміни не записались. Самі розділи ловлять лише очікувані помилки.
  window.addEventListener("unhandledrejection", (e) => {
    console.error(e.reason);
    if (!user) return; // до входу помилки показує екран входу
    UI.toast("Не вдалося зберегти зміни. Оновіть сторінку й спробуйте ще раз.", "error");
  });

  const Admin = {
    SECTIONS,
    register(id, def) {
      registry[id] = def;
    },
    get user() {
      return user;
    },
    // Перемалювати поточний розділ (після імпорту, скидання тощо)
    refresh() {
      return render(currentId(), false);
    },
    // Сесія закінчилась або користувача видалено
    async requireUser() {
      user = await AVERAuth.currentUser();
      if (!user) {
        showLogin("Сесія закінчилась, увійдіть знову.");
        return null;
      }
      return user;
    },
  };
  window.AVERAdmin = Admin;

  document.addEventListener("DOMContentLoaded", start);

  async function start() {
    try {
      await AVERDB.ready();
    } catch (err) {
      console.error(err);
      $("[data-boot]").replaceChildren(
        h("p", { class: "empty", text: "Не вдалося відкрити базу даних у цьому браузері. Відкрийте адмінку через локальний сервер (див. README) або в іншому браузері." })
      );
      return;
    }
    bindLogin();
    buildNav();
    $$("[data-logout]").forEach((b) => b.addEventListener("click", logout));
    window.addEventListener("hashchange", () => {
      if (user) render(currentId(), true);
    });
    // сесія закінчується, навіть якщо вкладка просто відкрита
    setInterval(() => {
      if (user) Admin.requireUser();
    }, 60 * 1000);
    // запис із сайту в іншій вкладці: оновити лічильник
    AVERDB.onChange((msg) => {
      if ((msg.tables || []).includes("bookings")) Admin.refreshBadges();
    });

    user = await AVERAuth.currentUser();
    $("[data-boot]").hidden = true;
    if (user) showApp(false);
    else showLogin();
  }

  /* ---------- вхід ---------- */

  function showLogin(message) {
    user = null;
    $("[data-app]").hidden = true;
    $("[data-login]").hidden = false;
    $("[data-skip]").setAttribute("href", "#login-main");
    document.title = "Вхід: адмінка AVER";
    const pass = $("#l-pass");
    pass.value = "";
    setLoginError(message || "");
    $("#l-login").focus();
  }

  function setLoginError(text) {
    const el = $("[data-login-error]");
    el.textContent = text;
    el.hidden = !text;
  }

  let lockTimer = 0;

  function bindLogin() {
    const form = $("[data-login-form]");
    const submit = $("[data-login-submit]");
    const label = $(".btn__label", submit);
    const defaultLabel = label.textContent;

    $("[data-reveal]").addEventListener("click", (e) => {
      const btn = e.currentTarget;
      const input = $("#l-pass");
      const show = input.type === "password";
      input.type = show ? "text" : "password";
      btn.setAttribute("aria-pressed", String(show));
      btn.setAttribute("aria-label", show ? "Сховати пароль" : "Показати пароль");
      $("use", btn).setAttribute("href", show ? "#i-eye-off" : "#i-eye");
    });

    ["login", "password"].forEach((f) => {
      $('[data-f="' + f + '"] input').addEventListener("input", () => {
        $('[data-f="' + f + '"]').classList.remove("is-invalid");
      });
    });

    function lockCountdown(sec) {
      clearInterval(lockTimer);
      submit.disabled = true;
      const tick = () => {
        const left = AVERAuth.lockedFor();
        if (!left) {
          clearInterval(lockTimer);
          submit.disabled = false;
          setLoginError("");
          return;
        }
        setLoginError("Забагато невдалих спроб. Спробуйте через " + left + " с.");
      };
      tick();
      lockTimer = setInterval(tick, 1000);
    }

    if (AVERAuth.lockedFor()) lockCountdown();

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (submit.disabled) return;
      const login = $("#l-login").value.trim();
      const password = $("#l-pass").value;
      $('[data-f="login"]').classList.toggle("is-invalid", !login);
      $('[data-f="password"]').classList.toggle("is-invalid", !password);
      if (!login || !password) {
        setLoginError("Введіть логін і пароль.");
        (login ? $("#l-pass") : $("#l-login")).focus();
        return;
      }

      submit.disabled = true;
      label.textContent = "Перевіряємо…";
      setLoginError("");
      let res;
      try {
        res = await AVERAuth.login(login, password);
      } catch (err) {
        console.error(err);
        res = { ok: false, reason: "error" };
      }
      label.textContent = defaultLabel;
      submit.disabled = false;

      if (res.ok) {
        user = res.user;
        showApp(true);
        return;
      }
      if (res.reason === "locked") {
        lockCountdown();
      } else if (res.reason === "error") {
        setLoginError("Браузер не зміг перевірити пароль. Відкрийте адмінку через http://localhost (див. README).");
      } else {
        setLoginError("Неправильний логін або пароль." + (res.left <= 2 ? " Залишилось спроб: " + res.left + "." : ""));
        $("#l-pass").select();
      }
    });
  }

  function logout() {
    AVERAuth.logout();
    history.replaceState(null, "", location.pathname);
    showLogin();
    UI.toast("Ви вийшли з адмінки");
  }

  /* ---------- оболонка й навігація ---------- */

  function showApp(focus) {
    $("[data-login]").hidden = true;
    $("[data-app]").hidden = false;
    $("[data-skip]").setAttribute("href", "#adm-main");
    $("[data-user]").textContent = user.name + " (" + user.login + ")";
    render(currentId(), focus);
    Admin.refreshBadges();
  }

  function currentId() {
    const id = location.hash.slice(1);
    return SECTIONS.some((s) => s.id === id) ? id : DEFAULT;
  }

  function navLink(s, short) {
    return h("a", { class: "adm-nav__link", href: "#" + s.id, "data-section": s.id },
      UI.icon(s.icon),
      h("span", { class: "adm-nav__text", text: short ? s.short || s.title : s.title }),
      h("span", { class: "adm-badge", "data-badge": s.id, hidden: true })
    );
  }

  function buildNav() {
    const side = $("[data-nav-side]");
    SECTIONS.forEach((s) => side.appendChild(navLink(s)));

    const bottom = $("[data-nav-bottom]");
    SECTIONS.filter((s) => s.mobile).forEach((s) => bottom.appendChild(navLink(s, true)));
    const more = h("button", { class: "adm-nav__link", type: "button", "aria-haspopup": "dialog", "data-more": "" },
      UI.icon("more"),
      h("span", { class: "adm-nav__text", text: "Ще" })
    );
    more.addEventListener("click", openMore);
    bottom.appendChild(more);
  }

  function openMore() {
    const list = h("nav", { class: "adm-more", "aria-label": "Усі розділи" }, SECTIONS.map((s) => navLink(s)));
    const extra = h("div", { class: "adm-more__foot" },
      h("a", { class: "ulink", href: "../index.html", target: "_blank", rel: "noopener" }, UI.icon("external"), "Відкрити сайт"),
      h("button", { class: "ulink", type: "button", on: { click: () => { dlg.close(); logout(); } } }, UI.icon("logout"), "Вийти")
    );
    const dlg = UI.dialog({ title: "Розділи", body: [list, extra] });
    markActive(currentId(), list);
    list.addEventListener("click", (e) => {
      if (e.target.closest("a")) dlg.close();
    });
  }

  function markActive(id, root) {
    $$("[data-section]", root || document).forEach((a) => {
      if (a.dataset.section === id) a.setAttribute("aria-current", "page");
      else a.removeAttribute("aria-current");
    });
    // «Ще» підсвічується, якщо відкрито розділ, якого немає в нижній панелі
    const more = $("[data-more]");
    if (more) more.classList.toggle("is-current", !SECTIONS.find((s) => s.id === id).mobile);
  }

  // Нові (непідтверджені) записи на сьогодні й далі: число біля «Записів»
  Admin.refreshBadges = async function () {
    if (!user) return;
    const today = UI.todayISO();
    const n = (await AVERDB.list("bookings")).filter((b) => b.status === "new" && b.date >= today).length;
    Admin.setBadge("bookings", n);
  };

  // Лічильник біля пункту меню (напр. нові записи)
  Admin.setBadge = function (id, n) {
    $$('[data-badge="' + id + '"]').forEach((b) => {
      b.hidden = !n;
      b.textContent = n > 99 ? "99+" : String(n);
      b.setAttribute("aria-label", n ? "нових: " + n : "");
    });
  };

  async function render(id, focus) {
    if (!(await Admin.requireUser())) return;
    const my = ++renderSeq;
    const s = SECTIONS.find((x) => x.id === id);
    const view = $("[data-view]");
    markActive(id);
    document.title = s.title + ": адмінка AVER";

    const box = h("div", { class: "adm-view" });
    try {
      if (registry[id]) {
        await registry[id].render(box, { user, section: s });
      } else {
        UI.append(box, [
          UI.viewHead(s.title),
          h("div", { class: "adm-soon" },
            UI.icon(s.icon),
            h("p", { text: "Цей розділ з'явиться на етапі " + s.stage + "." }),
            h("p", { class: "muted", text: "Поки що його дані беруться з тестового набору й показуються на сайті як раніше." })
          ),
        ]);
      }
    } catch (err) {
      console.error(err);
      box.replaceChildren(UI.viewHead(s.title), UI.empty("Не вдалося відкрити розділ. Оновіть сторінку."));
    }
    if (my !== renderSeq) return; // поки малювали, користувач перейшов в інший розділ
    view.replaceChildren(box);
    view.scrollTop = 0;
    window.scrollTo(0, 0);
    if (focus) {
      const t = $(".adm-title", view);
      if (t) t.focus({ preventScroll: true });
    }
  }
})();
