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

  document.addEventListener("DOMContentLoaded", async () => {
    requestAnimationFrame(() => root.classList.add("is-ready"));

    initPageTransitions();
    initHeaderAndScroll();
    initMenu();
    initActiveNav();

    // блоки з даних адмінки малюємо до анімацій появи, щоб нові елементи теж "виринали"
    const ok = await dataReady();
    initContent(ok);
    initServices(ok);
    initWorks(ok);
    initSalonData(ok);
    initSalon();
    initReviewsData(ok);
    initReviews();
    initWhy(ok);
    initTeam(ok);
    initHours(ok);
    initReveal();
  });

  /* ---------- Допоміжне для даних з адмінки ---------- */
  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  // Текст із "\n" -> рядки з <br> (лише текст, без HTML)
  function setLines(node, text) {
    node.textContent = "";
    String(text).split("\n").forEach((line, i) => {
      if (i) node.appendChild(document.createElement("br"));
      node.appendChild(document.createTextNode(line));
    });
  }

  // Замінити текст посилання, не чіпаючи іконку всередині
  function setLinkText(a, text) {
    const nodes = [...a.childNodes].filter((n) => n.nodeType === 3 && n.nodeValue.trim());
    if (nodes.length) nodes[nodes.length - 1].nodeValue = text;
  }

  // Секція без даних ховається разом із пунктами меню, що на неї ведуть
  function hideSection(id) {
    const s = document.getElementById(id);
    if (s) s.hidden = true;
    document.querySelectorAll('a[href="#' + id + '"]').forEach((a) => ((a.closest("li") || a).hidden = true));
  }

  /* ---------- Тексти, контакти, соцмережі ---------- */
  function initContent(ok) {
    if (!ok || !AVER.content) return;
    const c = AVER.content;
    const T = window.AVERText;
    const nb = (s) => String(s).replace(/ /g, T.NB);

    document.querySelectorAll("[data-text]").forEach((node) => {
      const v = node.dataset.text.split(".").reduce((o, k) => (o ? o[k] : undefined), c);
      if (typeof v === "string" && v.trim()) setLines(node, v);
    });

    const ct = c.contacts || {};
    const phones = ct.phones || [];
    document.querySelectorAll("[data-phone]").forEach((a) => {
      const p = phones[Number(a.dataset.phone)];
      if (!p) {
        (a.closest("li") || a).hidden = true;
        return;
      }
      a.href = T.phoneHref(p);
      if (/\d/.test(a.textContent)) setLinkText(a, nb(p));
    });

    document.querySelectorAll("[data-email]").forEach((a) => {
      if (!ct.email) {
        (a.closest("li") || a).hidden = true;
        return;
      }
      a.href = "mailto:" + ct.email;
      setLinkText(a, ct.email);
    });

    const place = [ct.city, ct.street].filter(Boolean);
    const mapUrl = ct.map_url || "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(place.join(", "));
    document.querySelectorAll("[data-address]").forEach((a) => {
      a.href = mapUrl;
      setLinkText(a, [ct.city, nb(ct.street || "")].filter(Boolean).join(", "));
    });
    document.querySelectorAll("[data-address-label]").forEach((s) => {
      s.textContent = "AVER / " + [ct.city, nb(ct.street || "")].filter(Boolean).join(", ");
    });

    const so = c.socials || {};
    document.querySelectorAll("[data-social]").forEach((a) => {
      const url = so[a.dataset.social];
      if (!url) (a.closest("li") || a).hidden = true;
      else a.href = url;
    });

    // дані для Google (schema.org)
    const ld = document.querySelector('script[type="application/ld+json"]');
    if (ld) {
      try {
        const data = JSON.parse(ld.textContent);
        if (phones[0]) data.telephone = "+" + phones[0].replace(/\D/g, "");
        if (ct.email) data.email = ct.email;
        data.address = { ...data.address, streetAddress: ct.street || "", addressLocality: ct.city || "" };
        data.sameAs = Object.values(so).filter(Boolean);
        ld.textContent = JSON.stringify(data, null, 2);
      } catch (e) {
        /* зіпсований JSON-LD: лишаємо як є */
      }
    }
  }

  /* ---------- Роботи (галерея) ---------- */
  function initWorks(ok) {
    const list = document.querySelector("[data-works]");
    if (!list || !ok) return;
    if (!AVER.works.length) return hideSection("works");
    list.textContent = "";
    AVER.works.forEach((w, i) => {
      const li = el("li", "rise" + (i % 3 ? " d" + (i % 3) : ""));
      const fig = el("figure", "work");
      const box = el("div", "work__img");
      const img = el("img", "photo");
      img.src = w.src;
      img.alt = w.alt;
      if (w.width) img.width = w.width;
      if (w.height) img.height = w.height;
      img.loading = "lazy";
      img.style.objectPosition = "50% " + w.focus + "%"; // точка кадрування з адмінки
      box.appendChild(img);
      const cap = el("figcaption");
      cap.appendChild(document.createTextNode(w.caption + (w.master ? " " : "")));
      if (w.master) cap.appendChild(el("span", "work__who", w.master.replace(/ /g, " ")));
      fig.append(box, cap);
      li.appendChild(fig);
      list.appendChild(li);
    });
  }

  /* ---------- Салон: зони з фото ---------- */
  function initSalonData(ok) {
    const stage = document.querySelector("[data-salon-stage]");
    const steps = document.querySelector("[data-salon-steps]");
    if (!stage || !steps || !ok) return;
    if (!AVER.salon.length) return hideSection("salon");
    stage.textContent = "";
    steps.textContent = "";
    AVER.salon.forEach((z, i) => {
      const img = el("img", "photo" + (i === 0 ? " is-active" : ""));
      img.dataset.salonImg = "";
      img.src = z.src;
      img.alt = z.alt;
      if (z.width) img.width = z.width;
      if (z.height) img.height = z.height;
      if (i) img.loading = "lazy";
      if (z.focus !== 50) img.style.objectPosition = "50% " + z.focus + "%";
      stage.appendChild(img);

      const li = el("li", "salon__step" + (i === 0 ? " is-active" : ""));
      li.dataset.salonStep = String(i);
      li.append(el("span", "salon__num", String(i + 1).padStart(2, "0")), el("h3", null, z.title));
      if (z.text) li.appendChild(el("p", null, z.text));
      steps.appendChild(li);
    });
  }

  /* ---------- Відгуки ---------- */
  function initReviewsData(ok) {
    const track = document.querySelector("[data-reviews]");
    if (!track || !ok) return;
    if (!AVER.reviews.length) return hideSection("reviews");
    const quote = track.querySelector(".review__quote");
    track.textContent = "";
    AVER.reviews.forEach((r) => {
      const li = el("li", "review");
      if (quote) li.appendChild(quote.cloneNode(true));
      li.appendChild(el("p", null, r.text));
      const foot = el("footer");
      foot.appendChild(el("cite", null, r.author));
      if (r.service) foot.appendChild(el("span", "muted", r.service));
      li.appendChild(foot);
      track.appendChild(li);
    });
    // з одним-двома відгуками гортати нема куди
    const ctrl = document.querySelector(".reviews__ctrl");
    if (ctrl) ctrl.hidden = AVER.reviews.length < 3;
  }

  /* ---------- Чому AVER ---------- */
  function initWhy(ok) {
    const list = document.querySelector("[data-why]");
    if (!list || !ok || !AVER.content) return;
    const items = (AVER.content.why || []).filter((w) => w.title);
    if (!items.length) return hideSection("why");
    list.textContent = "";
    items.forEach((w, i) => {
      const li = el("li", "why__item rise");
      const num = el("span", "why__num", String(i + 1).padStart(2, "0"));
      num.setAttribute("aria-hidden", "true");
      li.append(num, el("h3", null, w.title));
      if (w.text) li.appendChild(el("p", null, w.text));
      list.appendChild(li);
    });
  }

  /* ---------- Години роботи з розкладу адмінки: футер і дані для Google ---------- */
  function initHours(ok) {
    if (!ok || !AVER.hoursLines) return;
    const box = document.querySelector("[data-hours]");
    if (box) {
      box.textContent = "";
      AVER.hoursLines().forEach((line, i) => {
        if (i) box.appendChild(document.createElement("br"));
        box.appendChild(document.createTextNode(line));
      });
    }
    const ld = document.querySelector('script[type="application/ld+json"]');
    if (ld) {
      try {
        const data = JSON.parse(ld.textContent);
        data.openingHours = AVER.openingHours();
        ld.textContent = JSON.stringify(data, null, 2);
      } catch (e) {
        /* зіпсований JSON-LD: лишаємо як є */
      }
    }
  }

  // Дані з бази (data.js). Якщо не вдалося або занадто довго, лишається HTML-розмітка сторінки.
  function dataReady() {
    if (typeof AVER === "undefined" || !AVER.ready) return Promise.resolve(false);
    const timeout = new Promise((res) => setTimeout(() => res(false), 2500));
    return Promise.race([AVER.ready.then(() => true, () => false), timeout]);
  }

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
  function initServices(ok) {
    const tabsBox = document.querySelector("[data-services-tabs]");
    const panelsBox = document.querySelector("[data-services-panels]");
    if (!tabsBox || !panelsBox) return;
    if (!ok) {
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
            '<a class="svc__link' + (s.description ? " has-desc" : "") + '" data-nav href="booking.html?service=' + encodeURIComponent(s.id) + '">' +
            '<span class="svc__name"></span>' +
            '<span class="svc__time"></span>' +
            (s.description ? '<span class="svc__desc"></span>' : "") +
            '<span class="svc__dots" aria-hidden="true"></span>' +
            '<span class="svc__price"></span>' +
            '<span class="svc__go" aria-hidden="true"><svg class="icon"><use href="#i-arrow-up-right"/></svg></span>' +
            "</a>";
          li.querySelector(".svc__name").textContent = s.name;
          li.querySelector(".svc__time").textContent = AVER.formatDuration(s.min);
          if (s.description) li.querySelector(".svc__desc").textContent = s.description;
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

  /* ---------- Команда: майстри з даних адмінки ---------- */
  function initTeam(ok) {
    const list = document.querySelector("[data-team]");
    if (!list || !ok || !AVER.masters.length) return; // інакше лишається розмітка з index.html
    const T = window.AVERText;
    list.innerHTML = "";
    AVER.masters.forEach((m, i) => {
      const li = document.createElement("li");
      li.className = "member member--ava rise" + (i % 3 ? " d" + (i % 3) : "");
      const text = document.createElement("div");
      text.className = "member__text";

      const ava = document.createElement("span");
      ava.className = "member__avatar";
      if (m.photo) {
        const img = document.createElement("img");
        img.className = "photo";
        img.src = m.photo;
        img.alt = ""; // ім'я написане поруч
        img.width = 64;
        img.height = 64;
        img.loading = "lazy";
        ava.appendChild(img);
      } else {
        ava.setAttribute("aria-hidden", "true");
        ava.textContent = m.name.trim().split(/\s+/).slice(0, 2).map((w) => w.charAt(0)).join("");
      }
      li.appendChild(ava);

      if (m.role) {
        const role = document.createElement("span");
        role.className = "label";
        role.textContent = m.role;
        text.appendChild(role);
      }
      const h3 = document.createElement("h3");
      h3.textContent = m.name;
      text.appendChild(h3);
      if (m.specialty) {
        const p = document.createElement("p");
        p.className = "muted";
        p.textContent = m.specialty;
        text.appendChild(p);
      }
      if (m.experience) {
        const meta = document.createElement("span");
        meta.className = "member__meta";
        meta.textContent = "Досвід " + m.experience + T.NB + T.plural(m.experience, ["рік", "роки", "років"]);
        text.appendChild(meta);
      }
      li.appendChild(text);
      list.appendChild(li);
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
