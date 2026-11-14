/*
 * Перевірки виправлень після незалежного рев'ю (етап 4).
 *   node tests/e2e/review-fixes.mjs
 * Сервер: python3 serve.py 8765
 */
import { launch } from "./cdp.mjs";

const BASE = process.env.BASE || "http://localhost:8765/";
const b = await launch();
await b.reducedMotion(true);
let failed = 0;
const check = (name, ok, extra) => {
  console.log((ok ? "ок    " : "ПОМИЛКА ") + name + (!ok && extra !== undefined ? " → " + JSON.stringify(extra) : ""));
  if (!ok) failed++;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const J = JSON.stringify;
const dlg = "dialog[open]";

const click = (text, scope = "body") => b.eval(`(() => {
  const root = [...document.querySelectorAll(${J(scope)})].pop();
  const els = [...root.querySelectorAll("button, a, label, summary")];
  const t = ${J(text)};
  const el = els.find((e) => e.textContent.trim() === t) || els.find((e) => e.textContent.trim().startsWith(t));
  if (!el) throw new Error("немає кнопки: " + t);
  el.click();
  return true;
})()`);
const setField = (label, value) => b.eval(`(() => {
  const root = [...document.querySelectorAll("dialog[open]")].pop();
  const lab = [...root.querySelectorAll("label")].find((l) => l.textContent.trim() === ${J(label)});
  if (!lab) throw new Error("немає поля: " + ${J(label)});
  const input = document.getElementById(lab.htmlFor);
  input.value = ${J(value)};
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
  return true;
})()`);
const shown = (sel) => b.eval(`(() => { const e = document.querySelector(${J(sel)}); return !!e && !e.closest("[hidden]"); })()`);
const site = (path) => b.goto(BASE + path, 900);
async function admin(hash) {
  await b.goto(BASE + "admin/#" + hash, 300);
  await b.waitFor(`document.querySelector("[data-boot]").hidden`);
  if (await b.eval(`!document.querySelector("[data-login]").hidden`)) {
    await b.eval(`(() => { document.querySelector("#l-login").value = "admin"; document.querySelector("#l-pass").value = "aver-demo"; document.querySelector("[data-login-submit]").click(); })()`);
  }
  await b.waitFor(`document.querySelector(".adm-title") && !document.querySelector("[data-app]").hidden`, 10000);
  await sleep(250);
}
// помилка createBooking як рядок коду ("ok", якщо записало)
const tryBook = (p) => b.eval(`AVERDB.createBooking(${J(p)}).then(() => "ok", (e) => e.code || e.message)`);

await b.viewport(390, 820);
await admin("bookings");
await b.eval(`AVERDB.reset()`);

/* ---------- 1. очищений текст ховається, а не повертається з розмітки ---------- */
await b.eval(`AVERDB.single("content").then((c) => AVERDB.saveSingle("content", { ...c, hero: { ...c.hero, note: "" }, sections: { ...c.sections, services: { ...c.sections.services, lead: "  " } } }))`);
await site("index.html");
check("сайт: порожній «Підпис під кнопками» сховано", !(await shown('[data-text="hero.note"]')));
check("сайт: порожній вступ послуг сховано", !(await shown('[data-text="sections.services.lead"]')));
check("сайт: заповнені тексти на місці", await shown('[data-text="hero.sub"]'));

/* ---------- 2. усі майстри сховані: команди немає, рядка «Майстри:» теж ---------- */
await b.eval(`AVERDB.list("masters").then((ms) => AVERDB.putMany("masters", ms.map((m) => ({ ...m, visible: false }))))`);
await site("index.html");
check("сайт: секцію «Команда» сховано", !(await shown("#team")));
check("сайт: пункт меню на команду сховано", (await b.eval(`[...document.querySelectorAll('a[href="#team"]')].filter((a) => !a.closest("[hidden]")).length`)) === 0);
check("сайт: порожнього «Майстри:» немає", (await b.eval(`document.querySelectorAll(".services__masters").length`)) === 0);
check("сайт: вигаданої команди з розмітки не видно", (await b.eval(`[...document.querySelectorAll("[data-team] li")].filter((l) => !l.closest("[hidden]")).length`)) === 0);
await site("booking.html");
check("запис: без майстрів онлайн-запис недоступний", (await b.eval(`document.querySelector("[data-service-list]").textContent`)).includes("тимчасово недоступний"));
await b.eval(`AVERDB.reset()`);

/* ---------- 3. послуга без майстра: посилання з головної пояснює, чому немає запису ---------- */
const lonely = await b.eval(`(async () => {
  const ms = await AVERDB.list("masters");
  const svc = (await AVERDB.list("services")).find((s) => s.visible && s.category_id === "hair");
  await AVERDB.putMany("masters", ms.map((m) => ({ ...m, service_ids: (m.service_ids || []).filter((id) => id !== svc.id) })));
  return svc;
})()`);
await site("booking.html?service=" + lonely.id);
check("запис: для послуги без майстра є пояснення", (await b.eval(`[...document.querySelectorAll(".bk-step .empty")].map((e) => e.textContent).join(" ")`)).includes("«" + lonely.name + "» онлайн-запис зараз недоступний"));
check("запис: відкрито крок 1 з категорією цієї послуги", (await b.eval(`document.querySelector('[data-cat-tabs] .tab[aria-pressed="true"]').dataset.cat`)) === lonely.category_id);
await b.eval(`AVERDB.reset()`);

/* ---------- 4. перевірки createBooking (як у create_booking в schema.sql) ---------- */
await admin("bookings");
const plan = await b.eval(`(async () => {
  const S = AVERSchedule;
  const [st, cl, sv, ms, bk] = await Promise.all([AVERDB.single("settings"), AVERDB.list("closures"), AVERDB.list("services"), AVERDB.list("masters"), AVERDB.list("bookings")]);
  const svc = sv.find((s) => s.visible && (s.options || []).some((g) => g.choices.length > 1) && S.mastersFor(ms, s.id, true).length);
  const today = S.toISO(new Date());
  for (let i = 1; i < st.days_ahead; i++) {
    const date = S.addDays(today, i);
    const fs = S.freeSlots({ date, duration: svc.duration_min, masters: S.mastersFor(ms, svc.id, true), bookings: bk, settings: st, closures: cl, now: new Date() });
    if (fs.length) return { svc, date, start: fs[0].start, daysAhead: st.days_ahead, today };
  }
})()`);
const g = plan.svc.options.find((x) => x.choices.length > 1);
const base = { service_id: plan.svc.id, master_id: null, date: plan.date, start_min: plan.start, choices: { [g.id]: 1 }, client_name: "Рев'ю Тест", client_phone: "+380 00 000 77 11", comment: "" };
check("createBooking: індекс варіанта поза списком → bad_choice", (await tryBook({ ...base, choices: { [g.id]: 99 } })) === "bad_choice");
check("createBooking: індекс -1 → bad_choice", (await tryBook({ ...base, choices: { [g.id]: -1 } })) === "bad_choice");
check("createBooking: ім'я довше 60 → bad_name", (await tryBook({ ...base, client_name: "Я".repeat(61) })) === "bad_name");
check("createBooking: не український номер → bad_phone", (await tryBook({ ...base, client_phone: "+1 202 555 01 23" })) === "bad_phone");
const far = await b.eval(`AVERSchedule.addDays(${J(plan.today)}, ${plan.daysAhead})`);
check("createBooking: день за межею days_ahead → slot_taken", (await tryBook({ ...base, date: far })) === "slot_taken");
check("createBooking: час не по сітці слотів → slot_taken", (await tryBook({ ...base, start_min: plan.start + 7 })) === "slot_taken");
const made = await b.eval(`AVERDB.createBooking(${J({ ...base, comment: "к".repeat(700) })})`);
const row = (await b.eval(`AVERDB.list("bookings")`)).find((x) => x.code === made.code);
check("createBooking: повертає code і master_id", /^AV-\d{4}$/.test(made.code) && !!made.master_id && row.master_id === made.master_id, made);
check("createBooking: коментар обрізано до 500", row.comment.length === 500, row.comment.length);

/* ---------- 5. редагування коментаря не переписує історію послуги ---------- */
// послугу відтоді змінили: варіант, обраний клієнтом, перейменували
const oldText = row.options_text;
await b.eval(`AVERDB.get("services", ${J(plan.svc.id)}).then((s) => AVERDB.put("services", { ...s, name: s.name + " NEW", options: s.options.map((x) => x.id === ${J(g.id)} ? { ...x, choices: x.choices.map((c, i) => (i === 1 ? { ...c, label: "Перейменовано" } : c)) } : x) }))`);
await admin("bookings");
await click("Усі", ".adm-tabs");
await b.eval(`(() => { const i = document.querySelector('input[type="search"]'); i.value = ${J(made.code)}; i.dispatchEvent(new Event("input", { bubbles: true })); })()`);
await sleep(400);
await b.eval(`document.querySelector(".adm-bk .adm-row__main").click()`);
await b.waitFor(`document.querySelector("dialog[open] #bk-svc")`);
await setField("Коментар", "Лише новий коментар");
// поки форма відкрита, інша вкладка підтверджує запис
await b.eval(`AVERDB.get("bookings", ${J(row.id)}).then((r) => AVERDB.put("bookings", { ...r, status: "confirmed" }))`);
await sleep(300);
await click("Зберегти", dlg + " .adm-dialog__actions");
await sleep(600);
const after = await b.eval(`AVERDB.get("bookings", ${J(row.id)})`);
check("редагування: коментар збережено", after.comment === "Лише новий коментар", after.comment);
check("редагування: назва й параметри послуги не переписані", after.service_name === row.service_name && after.options_text === oldText, { name: after.service_name, opts: after.options_text });
check("редагування: зміну з іншої вкладки (статус) не затерто", after.status === "confirmed", after.status);
check("список оновився після закриття діалогу", (await b.eval(`[...document.querySelectorAll(".adm-bk")].some((r) => !r.className.includes("is-new"))`)) === true);

/* ---------- 6. імпорт неповної копії відхиляється ---------- */
const importErr = await b.eval(`(async () => {
  const data = await AVERDB.exportAll();
  data.tables.settings = [];
  return AVERDB.importAll(data).then(() => "ok", (e) => e.message);
})()`);
check("імпорт без налаштувань відхилено", importErr.includes("settings"), importErr);
check("після відхиленого імпорту дані на місці", !!(await b.eval(`AVERDB.single("settings")`)));

/* ---------- 7. у підписі до роботи немає прихованого майстра ---------- */
await b.eval(`AVERDB.reset()`);
const credited = await b.eval(`AVERDB.list("photos").then((ps) => ps.find((p) => p.album === "works" && p.visible && p.master_id))`);
await b.eval(`AVERDB.get("masters", ${J(credited.master_id)}).then((m) => AVERDB.put("masters", { ...m, visible: false }))`);
const hiddenName = await b.eval(`AVERDB.get("masters", ${J(credited.master_id)}).then((m) => m.name)`);
await site("index.html");
check("сайт: ім'я прихованого майстра не в підписах робіт", !(await b.eval(`[...document.querySelectorAll(".work__who")].map((e) => e.textContent).join("|")`)).replace(/ /g, " ").includes(hiddenName), hiddenName);

/* ---------- 8. старий Safari: у typo.js немає lookbehind ---------- */
const src = await b.eval(`fetch(${J(BASE + "typo.js")}).then((r) => r.text())`);
check("typo.js без lookbehind у коді", !/new RegExp\([^)]*\(\?<[=!]/.test(src) && !/\/[^/\n]*\(\?<[=!][^/\n]*\//.test(src.replace(/\/\/.*$/gm, "")));

await b.eval(`AVERDB.reset()`);
check("консоль браузера без помилок", b.logs.length === 0, b.logs);
await b.close();
console.log(failed ? "\nНЕ ПРОЙДЕНО: " + failed : "\nУсе пройдено");
process.exit(failed ? 1 : 0);
