/*
 * AVER: спільний скрипт для обох сторінок.
 * Підключений у <head> без defer, щоб одразу виставити класи для анімацій
 * (без "миготіння" контенту). Уся робота з DOM чекає DOMContentLoaded.
 */

(function () {
  const root = document.documentElement;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Чи підтримує браузер анімовані переходи між сторінками (Chrome/Edge 126+, Safari 18.2+)
  const hasViewTransitions = "CSSViewTransitionRule" in window;

  root.classList.add("js", hasViewTransitions ? "vt" : "no-vt");

  // Повернення кнопкою "Назад" із кешу: прибрати шторку
  window.addEventListener("pageshow", (e) => {
    if (e.persisted) root.classList.remove("is-leaving");
  });

  document.addEventListener("DOMContentLoaded", () => {
    requestAnimationFrame(() => root.classList.add("is-ready"));

    initPageTransitions();
    initHeaderAndScroll();
    initMenu();
    initReveal();
    initServices();
    initActiveNav();
    initSalon();
    initReviews();
  });

  /* ---------- Перехід між сторінками (запасний варіант) ---------- */
  function initPageTransitions() {
    if (hasViewTransitions || reduceMotion) return;
    document.addEventListener("click", (e) => {
      const link = e.target.closest("a[data-nav]");
      if (!link || e.defaultPrevented) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
      e.preventDefault();
      root.classList.add("is-leaving");
      setTimeout(() => {
        window.location.href = link.href;
      }, 450);
    });
  }

  /* ---------- Хедер, прогрес, паралакс, мобільна панель: один обробник скролу ---------- */
  function initHeaderAndScroll() {
    const header = document.querySelector(".header");
    const progress = document.querySelector(".progress");
    const layers = reduceMotion ? [] : [...document.querySelectorAll("[data-parallax]")];
    const mbar = document.querySelector("[data-mbar]");
    const hero = document.querySelector(".hero");
    let ticking = false;

    function update() {
      ticking = false;
      const y = window.scrollY;
      const vh = window.innerHeight;
      const max = document.documentElement.scrollHeight - vh;

      if (header) header.classList.toggle("is-scrolled", y > 24);
      if (progress) progress.style.transform = "scaleX(" + (max > 0 ? y / max : 0) + ")";

      layers.forEach((el) => {
        const box = el.parentElement.getBoundingClientRect();
        if (box.bottom < 0 || box.top > vh) return; // поза екраном: не рахуємо
        const k = parseFloat(el.dataset.parallax) || 0;
        const offset = -(box.top + box.height / 2 - vh / 2) * k;
        el.style.transform = "translate3d(0," + offset.toFixed(1) + "px,0)";
      });

      if (mbar && hero) {
        const show = hero.getBoundingClientRect().bottom < 0;
        if (show !== mbar.classList.contains("is-visible")) {
          mbar.classList.toggle("is-visible", show);
          mbar.setAttribute("aria-hidden", String(!show));
          mbar.querySelectorAll("a").forEach((a) => (a.tabIndex = show ? 0 : -1));
        }
      }
    }

    function onScroll() {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(update);
      }
    }

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    update();
  }

  /* ---------- Мобільне меню ---------- */
  function initMenu() {
    const burger = document.querySelector(".burger");
    const menu = document.getElementById("menu");
    if (!burger || !menu) return;

    // поки меню відкрите, сторінка під ним недоступна для Tab і читачів екрана
    const behind = [...document.querySelectorAll("main, footer, [data-mbar]")];

    function setOpen(open) {
      root.classList.toggle("menu-open", open);
      burger.setAttribute("aria-expanded", String(open));
      burger.setAttribute("aria-label", open ? "Закрити меню" : "Відкрити меню");
      behind.forEach((el) => (el.inert = open));
      if (open) {
        const first = menu.querySelector("a");
        if (first) setTimeout(() => first.focus({ preventScroll: true }), 50);
      }
    }

    burger.addEventListener("click", () => setOpen(!root.classList.contains("menu-open")));
    menu.addEventListener("click", (e) => {
      if (e.target.closest("a")) setOpen(false);
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && root.classList.contains("menu-open")) {
        setOpen(false);
        burger.focus();
      }
    });
    window.matchMedia("(min-width: 960px)").addEventListener("change", () => setOpen(false));
  }

  /* ---------- Поява блоків під час скролу ---------- */
  function initReveal() {
    const items = document.querySelectorAll(".rise");
    if (!("IntersectionObserver" in window) || reduceMotion) {
      items.forEach((el) => el.classList.add("is-in"));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-in");
            io.unobserve(entry.target);
          }
        });
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.12 }
    );
    items.forEach((el) => io.observe(el));
  }

  /* ---------- Послуги: вкладки з даних адмінки (data.js) ---------- */
  async function initServices() {
    const tabsBox = document.querySelector("[data-services-tabs]");
    const panelsBox = document.querySelector("[data-services-panels]");
    if (!tabsBox || !panelsBox || typeof AVER === "undefined") return;
    try {
      await AVER.ready;
    } catch (err) {
      const p = document.createElement("p");
      p.textContent = "Не вдалося завантажити перелік послуг. Зателефонуйте нам, і ми все розповімо.";
      panelsBox.appendChild(p);
      return;
    }

    AVER.categories.forEach((cat, i) => {
      const tab = document.createElement("button");
      tab.type = "button";
      tab.className = "tab";
      tab.id = "tab-" + cat.id;
      tab.setAttribute("role", "tab");
      tab.setAttribute("aria-controls", "panel-" + cat.id);
      tab.setAttribute("aria-selected", String(i === 0));
      tab.tabIndex = i === 0 ? 0 : -1;
      tab.textContent = cat.name;
      tabsBox.appendChild(tab);

      const panel = document.createElement("div");
      panel.className = "services__panel";
      panel.id = "panel-" + cat.id;
      panel.setAttribute("role", "tabpanel");
      panel.setAttribute("aria-labelledby", tab.id);
      panel.hidden = i !== 0;

      const masters = document.createElement("p");
      masters.className = "services__masters";
      masters.textContent = "Майстри: " + cat.masters;
      panel.appendChild(masters);

      const list = document.createElement("ul");
      list.className = "svc-list";
      AVER.services
        .filter((s) => s.cat === cat.id)
        .forEach((s) => {
          const li = document.createElement("li");
          li.className = "svc";
          li.innerHTML =
            '<a class="svc__link" data-nav href="booking.html?service=' + encodeURIComponent(s.id) + '">' +
            '<span class="svc__name"></span>' +
            '<span class="svc__time"></span>' +
            '<span class="svc__dots" aria-hidden="true"></span>' +
            '<span class="svc__price"></span>' +
            '<span class="svc__go" aria-hidden="true"><svg class="icon"><use href="#i-arrow-up-right"/></svg></span>' +
            "</a>";
          li.querySelector(".svc__name").textContent = s.name;
          li.querySelector(".svc__time").textContent = AVER.formatDuration(s.min);
          li.querySelector(".svc__price").textContent = (s.from ? "від " : "") + AVER.formatPrice(s.price);
          li.querySelector("a").setAttribute("aria-label", "Записатися: " + s.name + ", " + (s.from ? "від " : "") + AVER.formatPrice(s.price));
          list.appendChild(li);
        });
      panel.appendChild(list);
      panelsBox.appendChild(panel);
    });

    const tabs = [...tabsBox.querySelectorAll(".tab")];

    function select(tab) {
      tabs.forEach((t) => {
        const on = t === tab;
        t.setAttribute("aria-selected", String(on));
        t.tabIndex = on ? 0 : -1;
        document.getElementById(t.getAttribute("aria-controls")).hidden = !on;
      });
    }

    tabsBox.addEventListener("click", (e) => {
      const tab = e.target.closest(".tab");
      if (tab) select(tab);
    });

    // стрілки на клавіатурі між вкладками
    tabsBox.addEventListener("keydown", (e) => {
      const i = tabs.indexOf(document.activeElement);
      if (i < 0) return;
      let next = null;
      if (e.key === "ArrowRight") next = tabs[(i + 1) % tabs.length];
      if (e.key === "ArrowLeft") next = tabs[(i - 1 + tabs.length) % tabs.length];
      if (next) {
        e.preventDefault();
        next.focus();
        select(next);
      }
    });
  }

  /* ---------- Підсвічування активного пункту меню ---------- */
  function initActiveNav() {
    const links = [...document.querySelectorAll('.nav a[href^="#"]')];
    if (!links.length || !("IntersectionObserver" in window)) return;
    const map = new Map();
    links.forEach((a) => {
      const section = document.querySelector(a.getAttribute("href"));
      if (section) map.set(section, a);
    });
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          links.forEach((a) => a.classList.remove("is-active"));
          map.get(entry.target).classList.add("is-active");
        });
      },
      { rootMargin: "-45% 0px -50% 0px" }
    );
    map.forEach((_, section) => io.observe(section));
  }

  /* ---------- Салон: фото змінюються разом із текстом ---------- */
  function initSalon() {
    const steps = [...document.querySelectorAll("[data-salon-step]")];
    const imgs = [...document.querySelectorAll("[data-salon-img]")];
    if (!steps.length || !("IntersectionObserver" in window)) return;

    // фото завантажуються ліниво: підвантажити всі, щойно секція наближається
    const stage = document.querySelector(".salon__stage");
    const preload = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        imgs.forEach((img) => (img.loading = "eager"));
        preload.disconnect();
      }
    }, { rootMargin: "400px 0px" });
    if (stage) preload.observe(stage);

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const n = Number(entry.target.dataset.salonStep);
          steps.forEach((s, i) => s.classList.toggle("is-active", i === n));
          imgs.forEach((img, i) => img.classList.toggle("is-active", i === n));
        });
      },
      { rootMargin: "-55% 0px -35% 0px" }
    );
    steps.forEach((s) => io.observe(s));
  }

  /* ---------- Відгуки: кнопки гортання ---------- */
  function initReviews() {
    const track = document.querySelector("[data-reviews]");
    if (!track) return;
    document.querySelectorAll(".round-btn[data-dir]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const card = track.querySelector(".review");
        const step = card ? card.getBoundingClientRect().width + 16 : track.clientWidth * 0.8;
        const dir = btn.dataset.dir === "next" ? 1 : -1;
        track.scrollBy({ left: dir * step, behavior: reduceMotion ? "auto" : "smooth" });
      });
    });
  }
})();
