/*
 * Етап 3: записи й розклад. Головне правило: два активні записи до одного майстра
 * не перетинаються в часі — ні з сайту, ні з адмінки, ні при перенесенні.
 *   node tests/e2e/admin-stage3.mjs [папка-для-скриншотів]
 * Сервер: python3 serve.py 8765
 */
import { mkdirSync } from "node:fs";
import { launch } from "./cdp.mjs";

const BASE = process.env.BASE || "http://localhost:8765/";
const shots = process.argv[2] || "tmp/screens/admin3";
mkdirSync(shots, { recursive: true });

const b = await launch();
await b.reducedMotion(true);
let failed = 0;
const check = (name, ok, extra) => {
  console.log((ok ? "ок    " : "ПОМИЛКА ") + name + (!ok && extra !== undefined ? " → " + JSON.stringify(extra) : ""));
  if (!ok) failed++;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const J = JSON.stringify;
const sp = (s) => String(s).replace(/\u00A0/g, " ");

const click = (text, scope = "body") => b.eval(`(() => {
  const root = [...document.querySelectorAll(${J(scope)})].pop();
  const els = [...root.querySelectorAll("button, a, label")];
  const t = ${J(text)};
  const el = els.find((e) => (e.getAttribute("aria-label") || "").trim() === t) ||
             els.find((e) => e.textContent.trim() === t) ||
             els.find((e) => (e.getAttribute("aria-label") || "").startsWith(t)) ||
             els.find((e) => e.textContent.trim().startsWith(t));
  if (!el) throw new Error("немає кнопки: " + t);
  el.click();
  return true;
})()`);
const dlg = "dialog[open]";
const setField = (label, value, scope = dlg) => b.eval(`(() => {
  const root = [...document.querySelectorAll(${J(scope)})].pop();
  const lab = [...root.querySelectorAll("label")].find((l) => l.textContent.trim() === ${J(label)});
  if (!lab) throw new Error("немає поля: " + ${J(label)});
  const input = document.getElementById(lab.htmlFor);
  input.value = ${J(value)};
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
  return true;
})()`);
const text = (sel) => b.eval(`[...document.querySelectorAll(${J(sel)})].map((e) => e.textContent.trim())`);
const dialogs = () => b.eval(`document.querySelectorAll("dialog[open]").length`);
const bookings = () => b.eval(`AVERDB.list("bookings")`);

async function admin(hash) {
  await b.goto(BASE + "admin/#" + hash, 300);
  await b.waitFor(`document.querySelector("[data-boot]").hidden`);
  if (await b.eval(`!document.querySelector("[data-login]").hidden`)) {
    await b.eval(`(() => { document.querySelector("#l-login").value = "admin"; document.querySelector("#l-pass").value = "aver-demo"; document.querySelector("[data-login-submit]").click(); })()`);
  }
  await b.waitFor(`document.querySelector(".adm-title") && !document.querySelector("[data-app]").hidden`, 10000);
  await sleep(200);
}
const site = (path) => b.goto(BASE + path, 900);

await b.viewport(390, 820);
await admin("settings");
await b.eval(`AVERDB.reset()`);

/* ---------- тестові дані ---------- */
const seed = await bookings();
const overl = await b.eval(`AVERDB.list("bookings").then((l) => l.filter((a) => AVERSchedule.conflicts(l, a).length).length)`);
check("тестові записи згенеровано (" + seed.length + ")", seed.length > 100);
check("у тестових записах немає накладок", overl === 0, overl);
check("у кожного тестового запису є майстер", seed.every((x) => x.master_id));

/* ---------- запис із сайту до конкретного майстра ---------- */
await site("booking.html?service=manicure");
check("крок 2: вибір майстра", (await text('input[name="master"] + span .pill__t')).join("|") === "Будь-який майстер|Софія Мельник", await text('input[name="master"] + span .pill__t'));
check("підсумок: «будь-який вільний»", (await b.eval(`document.querySelector('[data-sum="master"]').textContent`)) === "будь-який вільний");
await b.eval(`[...document.querySelectorAll('input[name="master"]')][1].click()`);
check("підсумок: обраний майстер", (await b.eval(`document.querySelector('[data-sum="master"]').textContent`)) === "Софія Мельник");
await b.eval(`document.querySelector("[data-next]").click()`);
await b.waitFor(`document.querySelector(".slot")`);
// перший доступний день, крім сьогодні
const picked = await b.eval(`(async () => {
  const days = [...document.querySelectorAll("[data-days] .day:not([disabled])")];
  const day = days.find((d) => d.dataset.date !== AVERSchedule.toISO(new Date())) || days[0];
  day.click();
  await new Promise((r) => setTimeout(r, 400));
  const slot = document.querySelector(".slot");
  slot.click();
  return { date: day.dataset.date, time: slot.textContent };
})()`);
const T0 = Number(picked.time.slice(0, 2)) * 60 + Number(picked.time.slice(3));
await b.eval(`document.querySelector("[data-next]").click()`);
await b.eval(`(() => { document.querySelector("#f-name").value = "Тест Сайтовий"; document.querySelector("#f-phone").value = "+380 67 111 22 33"; document.querySelector('input[name="consent"]').checked = true; })()`);
await b.eval(`document.querySelector("[data-next]").click()`);
await b.waitFor(`!document.querySelector("[data-done]").hidden`);
check("успіх: «до майстра Софія Мельник»", (await b.eval(`document.querySelector("[data-done-text]").textContent`)).includes("до майстра Софія Мельник"));
let mine = (await bookings()).find((x) => x.client_name === "Тест Сайтовий");
check("запис у базі: майстер, статус, джерело, ціна", mine && mine.master_id === "m-sofia" && mine.status === "new" && mine.source === "site" && mine.price === 750 && mine.date === picked.date && mine.start_min === T0, mine);
check("запис зберігає обрані варіанти", mine && mine.choices && mine.choices.design === 0);

/* ---------- той самий час ще раз: заборонено ---------- */
const again = await b.eval(`AVER.saveBooking({ serviceId: "manicure", masterId: "m-sofia", date: ${J(picked.date)}, start: ${T0}, choices: {}, name: "Друга", phone: "+380 67 000 00 01" }).then(() => "збережено", (e) => e.code)`);
check("сайт: другий запис на той самий час до того ж майстра відхилено", again === "slot_taken", again);
const againAny = await b.eval(`AVER.saveBooking({ serviceId: "manicure", masterId: null, date: ${J(picked.date)}, start: ${T0 + 30}, choices: {}, name: "Третя", phone: "+380 67 000 00 02" }).then(() => "збережено", (e) => e.code)`);
check("сайт: «будь-який» на перетин (T+30 хв) теж відхилено", againAny === "slot_taken", againAny);
const freeAfter = await b.eval(`AVER.freeSlots(${J(picked.date)}, "manicure", null)`);
check("сайт: цей час більше не пропонується", !freeAfter.includes(T0) && !freeAfter.includes(T0 + 30) && !freeAfter.includes(T0 - 30));

/* ---------- гонка: час зайняли, поки клієнт заповнював форму ---------- */
await site("booking.html?service=pedicure");
await b.eval(`document.querySelector("[data-next]").click()`);
await b.waitFor(`document.querySelector(".slot")`);
const race = await b.eval(`(async () => {
  const days = [...document.querySelectorAll("[data-days] .day:not([disabled])")];
  const day = days[days.length - 1]; day.click();
  await new Promise((r) => setTimeout(r, 400));
  const slot = document.querySelector(".slot"); slot.click();
  return { date: day.dataset.date, start: Number(slot.textContent.slice(0, 2)) * 60 + Number(slot.textContent.slice(3)) };
})()`);
await b.eval(`document.querySelector("[data-next]").click()`);
// «інший клієнт» займає цей самий час
await b.eval(`AVER.saveBooking({ serviceId: "pedicure", masterId: null, date: ${J(race.date)}, start: ${race.start}, choices: {}, name: "Швидша клієнтка", phone: "+380 67 000 00 03" })`);
await b.eval(`(() => { document.querySelector("#f-name").value = "Повільна"; document.querySelector("#f-phone").value = "+380 67 111 22 44"; document.querySelector('input[name="consent"]').checked = true; document.querySelector("[data-next]").click(); })()`);
await b.waitFor(`!document.querySelector("[data-slots-notice]").hidden`);
check("гонка: повернуло до вибору часу з поясненням", (await b.eval(`document.querySelector("[data-slots-notice]").textContent`)).includes("щойно зайняли"));
check("гонка: другого запису немає", !(await bookings()).some((x) => x.client_name === "Повільна"));

/* ---------- «будь-який майстер» призначає вільного ---------- */
const anyDay = await b.eval(`(async () => {
  for (let i = 1; i < 14; i++) {
    const d = AVERSchedule.addDays(AVERSchedule.toISO(new Date()), i);
    const o = await AVER.freeSlots(d, "haircut-women", "m-olena");
    const m = await AVER.freeSlots(d, "haircut-women", "m-maria");
    const both = o.filter((t) => m.includes(t));
    if (both.length) return { d, t: both[0] };
  }
})()`);
await b.eval(`AVER.saveBooking({ serviceId: "haircut-women", masterId: "m-olena", date: ${J(anyDay.d)}, start: ${anyDay.t}, choices: {}, name: "До Олени", phone: "+380 67 000 00 04" })`);
const anyRes = await b.eval(`AVER.saveBooking({ serviceId: "haircut-women", masterId: null, date: ${J(anyDay.d)}, start: ${anyDay.t}, choices: { length: 2 }, name: "До будь-кого", phone: "+380 67 000 00 05" })`);
check("«будь-який»: Олена зайнята → призначено Марію", anyRes.masterName === "Марія Коваленко", anyRes);
const anyRow = (await bookings()).find((x) => x.client_name === "До будь-кого");
check("ціна з доплатою рахується на сервері (900 + 400)", anyRow.price === 1300, anyRow.price);
const anyRes2 = await b.eval(`AVER.saveBooking({ serviceId: "haircut-women", masterId: null, date: ${J(anyDay.d)}, start: ${anyDay.t}, choices: {}, name: "Третя", phone: "+380 67 000 00 06" }).then(() => "збережено", (e) => e.code)`);
check("«будь-який»: обидві зайняті → відхилено", anyRes2 === "slot_taken", anyRes2);

/* ---------- адмінка: лічильник і підтвердження ---------- */
await admin("bookings");
const badge = Number(await b.eval(`document.querySelector('[data-badge="bookings"]').textContent`));
const expected = await b.eval(`AVERDB.list("bookings").then((l) => l.filter((x) => x.status === "new" && x.date >= AVERSchedule.toISO(new Date())).length)`);
check("лічильник нових біля «Записів»", badge === expected && badge > 0, { badge, expected });
await click("Нові", ".adm-tabs");
await sleep(200);
await b.eval(`(() => { const i = document.querySelector('input[type="search"]'); i.value = "Сайтовий"; i.dispatchEvent(new Event("input", { bubbles: true })); })()`);
await sleep(400);
check("пошук знаходить запис із сайту", (await text(".adm-bk .adm-bk__name")).join() === "Тест Сайтовий", await text(".adm-bk .adm-bk__name"));
await b.screenshot(shots + "/list-390.png", false);
await click("Підтвердити запис: Тест Сайтовий");
await sleep(500);
mine = (await bookings()).find((x) => x.client_name === "Тест Сайтовий");
check("підтвердження змінює статус", mine.status === "confirmed");
check("лічильник зменшився", Number(await b.eval(`document.querySelector('[data-badge="bookings"]').textContent || 0`)) === badge - 1);

/* ---------- адмінка: новий запис на зайнятий час ---------- */
async function newBookingForm() {
  await click("Записати клієнта");
  await b.waitFor(`document.querySelector("dialog[open] #bk-svc")`);
}
async function fillBooking({ name, phone, service, master, date, time }) {
  if (name) await setField("Ім'я клієнта", name);
  if (phone) await setField("Телефон", phone);
  if (service) await b.eval(`(() => { const s = document.querySelector("dialog[open] #bk-svc"); s.value = ${J(service)}; s.dispatchEvent(new Event("change", { bubbles: true })); })()`);
  if (master) await b.eval(`(() => { const s = document.querySelector("dialog[open] #bk-master"); s.value = ${J(master)}; s.dispatchEvent(new Event("change", { bubbles: true })); })()`);
  if (date) await setField("Дата", date);
  if (time) await setField("Початок", time);
  await sleep(150);
}
const count0 = (await bookings()).length;
await newBookingForm();
await fillBooking({ name: "Адмінська", phone: "067 555 44 33", service: "manicure", master: "m-sofia", date: picked.date, time: picked.time });
check("форма показує «Зайнято» з ім'ям клієнта", (await text("dialog[open] .adm-avail__bad")).join(" ").includes("Тест Сайтовий"));
await b.screenshot(shots + "/conflict-390.png", false);
await click("Записати", dlg + " .adm-dialog__actions");
await sleep(400);
check("адмінка: запис на зайнятий час не збережено", (await bookings()).length === count0 && (await dialogs()) === 1);
check("помилка біля поля часу", (await text("dialog[open] .is-invalid .field__error")).join(" ").includes("зайнятий"));

// вільне вікно з підказок
await b.eval(`document.querySelector("dialog[open] .adm-slot").click()`);
await sleep(150);
check("клік по вільному вікну ставить час і «вільний»", (await text("dialog[open] .adm-avail__ok")).join(" ").includes("Час вільний"));
await click("Записати", dlg + " .adm-dialog__actions");
await sleep(500);
const adm = (await bookings()).find((x) => x.client_name === "Адмінська");
check("адмінка: запис збережено", !!adm && adm.source === "admin" && adm.status === "confirmed" && /^AV-\d{4}$/.test(adm.code), adm);
check("телефон нормалізовано: 067… → +380 67…", adm && adm.client_phone === "+380 67 555 44 33", adm && adm.client_phone);

/* ---------- перенесення ---------- */
await click("Усі", ".adm-tabs");
await b.eval(`(() => { const i = document.querySelector('input[type="search"]'); i.value = "Адмінська"; i.dispatchEvent(new Event("input", { bubbles: true })); })()`);
await sleep(400);
await b.eval(`document.querySelector(".adm-bk .adm-row__main").click()`);
await b.waitFor(`document.querySelector("dialog[open] #bk-svc")`);
await setField("Початок", picked.time); // на час «Тест Сайтовий»
await click("Зберегти", dlg + " .adm-dialog__actions");
await sleep(400);
check("перенесення на зайнятий час заблоковано", (await bookings()).find((x) => x.id === adm.id).start_min === adm.start_min && (await dialogs()) === 1);
const newTime = await b.eval(`[...document.querySelectorAll("dialog[open] .adm-slot")].map((s) => s.textContent).find((t) => t !== ${J(S2(adm.start_min))})`);
await setField("Початок", newTime);
await click("Зберегти", dlg + " .adm-dialog__actions");
await sleep(500);
const moved = (await bookings()).find((x) => x.id === adm.id);
check("перенесення на вільний час збережено", moved.start_min !== adm.start_min && (await text(".adm-toast")).join("").includes("перенесено"), { was: adm.start_min, now: moved.start_min });

/* ---------- скасування звільняє час, відновлення перевіряє ---------- */
await b.eval(`document.querySelector(".adm-bk .adm-row__main").click()`);
await b.waitFor(`document.querySelector("dialog[open] #bk-svc")`);
await click("Скасувати запис", dlg + " .adm-dialog__actions");
await b.waitFor(`document.querySelectorAll("dialog[open]").length === 2`);
await click("Скасувати запис", "dialog[open]:last-of-type .adm-dialog__actions");
await sleep(600);
check("скасування: статус cancelled", (await bookings()).find((x) => x.id === adm.id).status === "cancelled");
// хтось займає звільнений час
await b.eval(`AVERDB.put("bookings", { ...${J(moved)}, id: "taker", code: "AV-0002", client_name: "Зайняла", status: "confirmed" })`);
await admin("bookings");
await b.eval(`(() => { const i = document.querySelector('input[type="search"]'); i.value = "Адмінська"; i.dispatchEvent(new Event("input", { bubbles: true })); })()`);
await sleep(400);
await b.eval(`document.querySelector(".adm-bk .adm-row__main").click()`);
await b.waitFor(`document.querySelector("dialog[open] #bk-svc")`);
await b.eval(`document.querySelector('dialog[open] input[name="bk-status"][value="confirmed"]').click()`);
await sleep(150);
await click("Зберегти", dlg + " .adm-dialog__actions");
await sleep(400);
check("відновлення скасованого на зайнятий час заблоковано", (await bookings()).find((x) => x.id === adm.id).status === "cancelled");
await click("Закрити", dlg + " .adm-dialog__actions");
await sleep(200);
if (await dialogs()) await click("Не зберігати", "dialog[open]:last-of-type");
await sleep(200);

/* ---------- поза розкладом: попередження ---------- */
await newBookingForm();
await fillBooking({ name: "Пізня", phone: "+380 00 000 00 77", service: "styling", master: "m-maria", date: anyDay.d, time: "21:00" });
check("форма попереджає «поза годинами»", (await text("dialog[open] .adm-avail__warn")).join(" ").includes("Поза годинами"));
check("демо-номер +380 00… приймається", true);
await click("Записати", dlg + " .adm-dialog__actions");
await b.waitFor(`document.querySelectorAll("dialog[open]").length === 2`);
check("перед збереженням питає «Записати поза розкладом?»", (await text("dialog[open]:last-of-type h2")).join("").includes("поза розкладом"));
await click("Так, записати", "dialog[open]:last-of-type");
await sleep(500);
check("запис поза годинами збережено після підтвердження", (await bookings()).some((x) => x.client_name === "Пізня" && x.start_min === 21 * 60));

/* ---------- календар ---------- */
await click("Календар", ".adm-views");
await sleep(300);
check("календар: блоки записів є", (await b.eval(`document.querySelectorAll(".adm-ev").length`)) > 0);
check("календар: на телефоні видно одну колонку", (await b.eval(`[...document.querySelectorAll(".adm-cal__col")].filter((c) => c.offsetParent).length`)) === 1);
await b.screenshot(shots + "/calendar-390.png", false);
// клік у порожнє місце колонки → форма з цим майстром і часом
await b.eval(`(() => {
  const col = [...document.querySelectorAll(".adm-cal__col")].find((c) => c.offsetParent && !c.classList.contains("is-off"));
  const r = col.getBoundingClientRect();
  // шукаємо точку без запису
  for (let y = 5; y < r.height; y += 18) {
    const el = document.elementFromPoint(r.left + r.width / 2, r.top + y);
    if (el === col || (el && el.classList.contains("adm-cal__work"))) {
      col.dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: r.left + r.width / 2, clientY: r.top + y }));
      return;
    }
  }
})()`);
await sleep(400);
const pre = await b.eval(`({ m: document.querySelector("dialog[open] #bk-master") && document.querySelector("dialog[open] #bk-master").value, t: [...document.querySelectorAll("dialog[open] input[type=time]")].map((i) => i.value)[0] })`);
check("клік у календарі відкриває форму з майстром і часом", !!pre.m && /^\d\d:\d\d$/.test(pre.t), pre);
await click("Скасувати", dlg + " .adm-dialog__actions");
await sleep(200);
if (await dialogs()) await click("Не зберігати", "dialog[open]:last-of-type");

/* ---------- живе оновлення: запис із сайту в іншій вкладці ---------- */
// "інша вкладка" = iframe зі сторінкою запису: окремий документ, своя копія AVERDB і свій канал повідомлень
// (window.open у headless Chrome блокується як спливне вікно)
await admin("bookings");
const badgeBefore = Number(await b.eval(`document.querySelector('[data-badge="bookings"]').textContent || 0`));
await b.eval(`(async () => {
  const frame = document.createElement("iframe");
  frame.src = "../booking.html";
  frame.hidden = true;
  document.body.appendChild(frame);
  const w = frame.contentWindow;
  await new Promise((r, rej) => {
    const t0 = Date.now();
    const t = setInterval(() => {
      const A = w.eval && w.eval("typeof AVER !== 'undefined' ? AVER : null"); // const AVER не є властивістю window
      if (A && A.services && A.services.length) { clearInterval(t); r(); }
      else if (Date.now() - t0 > 8000) { clearInterval(t); rej(new Error("друга вкладка не завантажилась")); }
    }, 50);
  });
  const day = AVERSchedule.addDays(AVERSchedule.toISO(new Date()), 12);
  for (let i = 0; i < 6; i++) {
    const d = AVERSchedule.addDays(day, -i);
    const A = w.eval("AVER");
    const s = await A.freeSlots(d, "lash-lamination", null);
    if (s.length) { await A.saveBooking({ serviceId: "lash-lamination", masterId: null, date: d, start: s[0], choices: {}, name: "З іншої вкладки", phone: "+380 67 000 00 08" }); break; }
  }
  setTimeout(() => frame.remove(), 300);
})()`);
await sleep(800);
check("лічильник оновився без перезавантаження", Number(await b.eval(`document.querySelector('[data-badge="bookings"]').textContent || 0`)) === badgeBefore + 1);

/* ---------- розклад ---------- */
await admin("schedule");
await b.eval(`[...document.querySelectorAll(".adm-hours__row")][0].querySelector('input[type="checkbox"]').click()`); // понеділок вихідний
await click("Зберегти години");
await sleep(400);
const st = await b.eval(`AVERDB.single("settings")`);
check("понеділок став вихідним", st.hours[1] === null && st.hours[2] !== null);
await sleep(2600);
check("попередження про записи поза новим розкладом", (await text(".adm-toast")).join("").includes("поза розкладом"));
// неправильні години
await b.eval(`(() => { const r = [...document.querySelectorAll(".adm-hours__row")][1]; const [o, c] = r.querySelectorAll('input[type="time"]'); o.value = "18:00"; c.value = "10:00"; })()`);
await click("Зберегти години");
await sleep(300);
check("закриття раніше за відкриття відхилено", (await text(".adm-hours .adm-opts__error")).join("").includes("пізніше"));
await admin("schedule");

// виняток: вихідний у день, коли в Софії є вільний час
const closeDay = picked.date;
const rowsBefore = await b.eval(`document.querySelectorAll(".adm-closures__row").length`);
await setField("Дата", closeDay, ".adm-closures__add");
await click("Додати виняток");
// блок перемальовується після збереження: чекаємо новий рядок, а не фіксовану паузу
await b.waitFor(`document.querySelectorAll(".adm-closures__row").length === ${rowsBefore + 1}`);
check("виняток додано", (await b.eval(`AVERDB.list("closures")`)).some((c) => c.date === closeDay && !c.open));
await setField("Дата", closeDay, ".adm-closures__add");
await click("Додати виняток");
await sleep(300);
check("другий виняток на ту саму дату відхилено", (await text(".adm-closures__add .is-invalid .field__error")).join("").includes("уже є"),
  await b.eval(`({ errs: [...document.querySelectorAll(".adm-closures__add .field")].map((f) => f.className + ": " + f.textContent), value: document.querySelector(".adm-closures__add input[type=date]").value, n: document.querySelectorAll(".adm-closures__row").length })`));

// робочі дні майстра: Софія без п'ятниці
await b.eval(`[...document.querySelectorAll(".adm-mdays__row")].find((r) => r.textContent.includes("Софія")).querySelectorAll(".adm-day input")[4].click()`);
await sleep(400);
check("робочі дні майстра збережено одразу", !(await b.eval(`AVERDB.get("masters", "m-sofia")`)).work_days.includes(5));

// налаштування запису: лише з завтрашнього дня
await b.eval(`(() => { const s = [...document.querySelectorAll("select")].find((x) => [...x.options].some((o) => o.value === "1440")); s.value = "1440"; })()`);
await click("Зберегти", ".adm-panel:has(select)");
await sleep(400);
check("«найраніше» = з завтрашнього дня", (await b.eval(`AVERDB.single("settings")`)).lead_min === 1440);
await b.screenshot(shots + "/schedule-390.png", true);

/* ---------- сайт підхопив розклад ---------- */
await site("index.html");
check("футер: години з розкладу", sp(await b.eval(`document.querySelector("[data-hours]").innerText`)) === "Вт–Сб 09:00–20:00\nПн, Нд: вихідні", await b.eval(`document.querySelector("[data-hours]").innerText`));
check("JSON-LD: openingHours", (await b.eval(`JSON.parse(document.querySelector('script[type="application/ld+json"]').textContent).openingHours`)).join() === "Tu-Sa 09:00-20:00");
await site("booking.html?service=manicure");
await b.eval(`document.querySelector("[data-next]").click()`);
await b.waitFor(`document.querySelector("[data-days] .day")`);
const days = await b.eval(`[...document.querySelectorAll("[data-days] .day")].map((d) => ({ date: d.dataset.date, dis: d.disabled, label: d.getAttribute("aria-label") }))`);
// понеділки без винятків (тестовий «скорочений день» може випасти на понеділок: виняток важливіший)
const closureDates = (await b.eval(`AVERDB.list("closures")`)).map((c) => c.date);
const mondays = days.filter((d) => new Date(d.date + "T00:00").getDay() === 1 && !closureDates.includes(d.date));
check("понеділки у формі: вихідний", mondays.every((d) => d.dis && d.label.includes("вихідний")), mondays);
const mondayHours = await b.eval(`(() => {
  const closed = ${J(closureDates)};
  for (let i = 1; i < 60; i++) {
    const d = AVERSchedule.addDays(AVERSchedule.toISO(new Date()), i);
    if (AVERSchedule.weekday(d) === 1 && !closed.includes(d)) return AVER.dayHours(d);
  }
  return "немає";
})()`);
check("понеділок без винятку: салон закритий", mondayHours === null, mondayHours);
check("день-виняток: вихідний", days.find((d) => d.date === closeDay).label.includes("вихідний"));
check("п'ятниці: у Софії немає часу", days.filter((d) => new Date(d.date + "T00:00").getDay() === 5).every((d) => d.dis));
check("сьогодні: запис закрито (з завтрашнього дня)", days[0].dis);

/* ---------- десктоп ---------- */
await b.viewport(1280, 900, false);
await admin("bookings");
await click("Календар", ".adm-views");
await sleep(300);
check("десктоп: усі колонки майстрів", (await b.eval(`[...document.querySelectorAll(".adm-cal__col")].filter((c) => c.offsetParent).length`)) >= 6);
await b.screenshot(shots + "/calendar-1280.png", false);

await b.eval(`AVERDB.reset()`);
check("консоль браузера без помилок", b.logs.length === 0, b.logs);
await b.close();
console.log(failed ? "\nНЕ ПРОЙДЕНО: " + failed : "\nУсе пройдено");
process.exit(failed ? 1 : 0);

function S2(min) {
  return String(Math.floor(min / 60)).padStart(2, "0") + ":" + String(min % 60).padStart(2, "0");
}
