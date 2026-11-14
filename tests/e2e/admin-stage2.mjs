/*
 * Етап 2: послуги й майстри в адмінці → головна й форма запису.
 *   node tests/e2e/admin-stage2.mjs [папка-для-скриншотів]
 * Сервер: python3 serve.py 8765
 */
import { mkdirSync } from "node:fs";
import { launch } from "./cdp.mjs";

const BASE = process.env.BASE || "http://localhost:8765/";
const shots = process.argv[2] || "tmp/screens/admin2";
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
const sp = (s) => String(s).replace(/\u00A0/g, " "); // нерозривні пробіли -> звичайні для порівняння

// клік по кнопці/посиланню з потрібним текстом (або aria-label) усередині scope
const click = (text, scope = "body") => b.eval(`(() => {
  const root = [...document.querySelectorAll(${J(scope)})].pop();
  const els = [...root.querySelectorAll("button, a, label")];
  const t = ${J(text)};
  const el = els.find((e) => (e.getAttribute("aria-label") || "").trim() === t) ||
             els.find((e) => e.textContent.trim() === t) ||
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
  return true;
})()`);
const text = (sel) => b.eval(`[...document.querySelectorAll(${J(sel)})].map((e) => e.textContent.trim())`);
const noHScroll = () => b.eval(`document.documentElement.scrollWidth <= window.innerWidth`);
const dialogOpen = () => b.eval(`!!document.querySelector("dialog[open]")`);

async function admin(hash) {
  await b.goto(BASE + "admin/#" + hash, 300);
  await b.waitFor(`document.querySelector("[data-boot]").hidden`);
  if (await b.eval(`!document.querySelector("[data-login]").hidden`)) {
    await b.eval(`(() => { document.querySelector("#l-login").value = "admin"; document.querySelector("#l-pass").value = "aver-demo"; document.querySelector("[data-login-submit]").click(); })()`);
  }
  await b.waitFor(`document.querySelector(".adm-title") && !document.querySelector("[data-app]").hidden`, 10000);
  await sleep(150);
}
async function site(path) {
  await b.goto(BASE + path, 900);
}
async function rowOpen(title) {
  await b.eval(`(() => {
    const r = [...document.querySelectorAll(".adm-row__main")].find((e) => e.querySelector(".adm-row__title").firstChild.textContent === ${J(title)});
    if (!r) throw new Error("немає рядка " + ${J(title)});
    r.click();
  })()`);
  await b.waitFor(`document.querySelector("dialog[open]")`);
}
async function saveDialog(label = "Зберегти") {
  await click(label, dlg);
  await sleep(400);
}

await b.viewport(390, 820);
await admin("services");
await b.eval(`AVERDB.reset()`);
await admin("services");

/* ---------- список ---------- */
check("послуги: 6 у категорії «Волосся»", (await b.eval(`document.querySelectorAll(".adm-row").length`)) === 6);
check("лічильники на вкладках", (await text(".adm-tab__count")).join(",") === "6,4,4,3");
check("390px: немає горизонтального скролу (послуги)", await noHScroll());
await b.screenshot(shots + "/services-390.png", false);

/* ---------- зміна ціни й доплати ---------- */
await rowOpen("Жіноча стрижка");
await b.screenshot(shots + "/service-dialog-390.png", false);
check("390px: діалог без горизонтального скролу", await b.eval(`(() => { const d = document.querySelector("dialog[open]"); return d.scrollWidth <= d.clientWidth; })()`));
await setField("Ціна, ₴", "950");
await b.eval(`(() => { const a = document.querySelector('dialog[open] [data-a="0-1"]'); a.value = "250"; a.dispatchEvent(new Event("input", { bubbles: true })); })()`);
await saveDialog();
check("діалог закрився після збереження", !(await dialogOpen()));
const hw = await b.eval(`AVERDB.get("services", "haircut-women")`);
check("у базі нова ціна й доплата", hw.price === 950 && hw.options[0].choices[1].add === 250, { price: hw.price, add: hw.options[0].choices[1].add });

await site("index.html");
check("головна: нова ціна «від 950 ₴»", (await text(".svc__price")).map(sp).includes("від 950 ₴"), await text(".svc__price"));
check("головна: опис під назвою", (await text(".svc__desc"))[0].startsWith("Консультація"));
await site("booking.html?service=haircut-women");
check("запис: доплата «+250 ₴» у кроці 2", (await text(".pill small")).map(sp).includes("+250 ₴"), await text(".pill small"));
await b.eval(`[...document.querySelectorAll(".pill")].find((p) => p.textContent.includes("Середнє")).querySelector("input").click()`);
await sleep(300);
check("запис: «Разом» = 950 + 250", sp(await b.eval(`document.querySelector("[data-total]").textContent`)) === "від 1 200 ₴", await b.eval(`document.querySelector("[data-total]").textContent`));

/* ---------- перевірки форми ---------- */
await admin("services");
await click("Додати послугу");
await b.waitFor(`document.querySelector("dialog[open]")`);
await setField("Ціна, ₴", "abc");
await setField("Тривалість, хв", "7");
await click("Додати параметр", dlg);
await saveDialog("Додати послугу");
const errs = await text("dialog[open] .is-invalid .field__error");
check("порожня назва відхилена", errs.some((e) => e.includes("назву")), errs);
check("ціна-текст відхилена", errs.some((e) => e.includes("Ціна")), errs);
check("тривалість не кратна 5 відхилена", errs.some((e) => e.includes("Кратно 5")), errs);
check("порожній параметр відхилено", (await text("dialog[open] .adm-opts__error")).join("").includes("назву кожного параметра"));
check("діалог лишився відкритим", await dialogOpen());

/* ---------- закриття зі змінами ---------- */
await b.eval(`document.querySelector("dialog[open]").dispatchEvent(new Event("cancel", { cancelable: true }))`);
await sleep(300);
check("Esc зі змінами питає підтвердження", (await b.eval(`document.querySelectorAll("dialog[open]").length`)) === 2);
await click("Повернутися", dlg);
await sleep(200);
check("«Повернутися» лишає форму", (await b.eval(`document.querySelectorAll("dialog[open]").length`)) === 1);
await b.eval(`document.querySelector("dialog[open]").dispatchEvent(new Event("cancel", { cancelable: true }))`);
await sleep(300);
await click("Не зберігати", "dialog[open]");
await sleep(300);
check("«Не зберігати» закриває без збереження", !(await dialogOpen()));

/* ---------- нова послуга з параметром ---------- */
await click("Нігті", ".adm-tabs");
await sleep(150);
await click("Додати послугу");
await b.waitFor(`document.querySelector("dialog[open]")`);
await setField("Назва", "Парафінотерапія рук");
await setField("Опис, необов'язково", "Зволоження й живлення шкіри рук за 30 хвилин");
await setField("Ціна, ₴", "400");
await setField("Тривалість, хв", "30");
check("категорія за замовчуванням = відкрита вкладка", (await b.eval(`document.querySelector("dialog[open] select").value`)) === "nails");
await click("Додати параметр", dlg);
await b.eval(`(() => {
  const set = (sel, v) => { const e = document.querySelector("dialog[open] " + sel); e.value = v; e.dispatchEvent(new Event("input", { bubbles: true })); };
  set('[data-g="0"]', "Аромат"); set('[data-c="0-0"]', "Без аромату"); set('[data-a="0-0"]', "0"); set('[data-c="0-1"]', "Лаванда"); set('[data-a="0-1"]', "50");
})()`);
await saveDialog("Додати послугу");
check("нова послуга збережена", !(await dialogOpen()));
const nw = (await b.eval(`AVERDB.list("services")`)).find((s) => s.name === "Парафінотерапія рук");
check("нова: поля в базі", nw && nw.category_id === "nails" && nw.price === 400 && nw.duration_min === 30 && nw.options[0].choices[1].add === 50, nw);
check("нова: опис із нерозривними пробілами", nw && nw.description.includes("30 хвилин") && nw.description.includes("й живлення"), nw && nw.description);
check("нова: в кінці категорії", (await b.eval(`[...document.querySelectorAll(".adm-row__title")].pop().firstChild.textContent`)) === "Парафінотерапія рук");

/* ---------- приховування ---------- */
await click("Волосся", ".adm-tabs");
await sleep(150);
await click("Сховати з сайту: Чоловіча стрижка");
await sleep(400);
check("приховану позначено в списку", (await text(".adm-row.is-hidden .adm-row__title")).some((t) => t.startsWith("Чоловіча стрижка")));

/* ---------- порядок ---------- */
await click("Змінити порядок");
await sleep(150);
await click("Вище: Укладання");
await sleep(400);
const hairOrder = await b.eval(`[...document.querySelectorAll(".adm-row__title")].map((e) => e.firstChild.textContent)`);
check("«Укладання» піднялося на 1 позицію", hairOrder.indexOf("Укладання") === 4, hairOrder);
check("у режимі порядку перша «Вище» вимкнена", await b.eval(`[...document.querySelectorAll(".adm-row__tools button")][0].disabled`));
await click("Готово");

await site("index.html");
const names = await text("#panel-hair .svc__name");
check("головна: прихованої послуги немає", !names.includes("Чоловіча стрижка"), names);
check("головна: новий порядок", names.indexOf("Укладання") < names.indexOf("Відновлення та ботокс для волосся"), names);
await b.eval(`document.querySelector("#tab-nails").click()`);
check("головна: нова послуга в «Нігтях»", (await text("#panel-nails .svc__name")).includes("Парафінотерапія рук"));
await site("booking.html?service=haircut-men");
check("запис: прихована послуга за посиланням не відкривається", (await b.eval(`!document.querySelector('[data-step="1"]').hidden`)));

/* ---------- категорії ---------- */
await admin("services");
await click("Категорії");
await b.waitFor(`document.querySelector("dialog[open] .adm-cats__list")`);
await setField("Нова категорія", "Масаж");
await click("Додати", "dialog[open] .adm-cats__add");
await sleep(400);
check("категорію додано", (await b.eval(`AVERDB.list("categories")`)).some((c) => c.name === "Масаж"));
await click("Сховати з сайту: Обличчя та макіяж", dlg);
await sleep(300);
await click("Видалити: Нігті", dlg);
await sleep(300);
check("категорію з послугами не видалено", (await b.eval(`AVERDB.get("categories", "nails")`)) !== null && (await text(".adm-toast")).join("").includes("є послуги"));
await click("Видалити: Масаж", dlg);
await b.waitFor(`document.querySelectorAll("dialog[open]").length === 2`);
await click("Видалити", "dialog[open]:last-of-type .adm-dialog__actions");
await sleep(400);
check("порожню категорію видалено", !(await b.eval(`AVERDB.list("categories")`)).some((c) => c.name === "Масаж"));
await b.screenshot(shots + "/categories-390.png", false);
await click("Закрити", dlg);
await sleep(300);
await site("index.html");
check("головна: прихованої категорії немає", !(await text("[data-services-tabs] .tab")).includes("Обличчя та макіяж"), await text("[data-services-tabs] .tab"));

/* ---------- послугу з записами не видалити ---------- */
await admin("services");
await b.eval(`AVERDB.put("bookings", { id: "t1", code: "AV-0001", service_id: "styling", service_name: "Укладання", master_id: "m-maria", date: "2099-01-05", start_min: 600, duration_min: 45, price: 700, client_name: "Тест", client_phone: "+380 00 000 00 09", comment: "", options_text: "", status: "confirmed", source: "admin" })`);
await admin("services");
await rowOpen("Укладання");
await click("Видалити", dlg);
await b.waitFor(`document.querySelectorAll("dialog[open]").length === 2`);
check("послуга з записами: пропонує сховати", (await text("dialog[open]:last-of-type h2")).join("").includes("не можна видалити"));
await click("Сховати послугу", "dialog[open]:last-of-type");
await sleep(400);
check("послугу сховано, не видалено", (await b.eval(`AVERDB.get("services", "styling")`)).visible === false);

/* ---------- майстри ---------- */
await admin("masters");
check("майстри: 6 рядків з аватарками", (await b.eval(`document.querySelectorAll(".adm-row .adm-avatar").length`)) === 6);
check("390px: немає горизонтального скролу (майстри)", await noHScroll());
await b.screenshot(shots + "/masters-390.png", false);

await rowOpen("Марія Коваленко");
// «завантажуємо» фото 2000×1500: малюємо в canvas і кладемо у file input
await b.eval(`(async () => {
  const c = document.createElement("canvas"); c.width = 2000; c.height = 1500;
  const g = c.getContext("2d"); g.fillStyle = "#c98b96"; g.fillRect(0, 0, 2000, 1500); g.fillStyle = "#3b2b30"; g.beginPath(); g.arc(1000, 650, 420, 0, 7); g.fill();
  const blob = await new Promise((r) => c.toBlob(r, "image/png"));
  const dt = new DataTransfer(); dt.items.add(new File([blob], "maria.png", { type: "image/png" }));
  const input = document.querySelector('dialog[open] input[type="file"]');
  input.files = dt.files; input.dispatchEvent(new Event("change"));
})()`);
await b.waitFor(`document.querySelector("dialog[open] .adm-avatar--lg img")`);
check("фото: прев'ю в діалозі", true);
await b.screenshot(shots + "/master-dialog-390.png", false);
// зняти «Укладання» в Марії
await b.eval(`[...document.querySelectorAll("dialog[open] .adm-svcpick .check")].find((l) => l.textContent.startsWith("Укладання")).querySelector("input").click()`);
await saveDialog();
const maria = await b.eval(`AVERDB.get("masters", "m-maria")`);
check("фото збережено в базі як idb:", maria.photo.startsWith("idb:"), maria.photo);
const file = await b.eval(`(async () => { const f = await AVERDB.get("files", (await AVERDB.get("masters", "m-maria")).photo.slice(4)); return { type: f.type, size: f.size }; })()`);
check("фото стиснуте (WebP/JPEG, < 200 КБ)", /image\/(webp|jpeg)/.test(file.type) && file.size < 200 * 1024, file);
const dims = await b.eval(`(async () => { const f = await AVERDB.get("files", (await AVERDB.get("masters", "m-maria")).photo.slice(4)); const bm = await createImageBitmap(f.blob); return [bm.width, bm.height]; })()`);
check("фото зменшене до 800px по довшій стороні", dims[0] === 800 && dims[1] === 600, dims);
check("послугу знято з майстра", !maria.service_ids.includes("styling"));

// Олена без послуг волосся → у «Волоссі» лише Марія
await rowOpen("Олена Бондар");
await b.eval(`[...document.querySelectorAll("dialog[open] .adm-svcpick .check input")].forEach((i) => { if (i.checked) i.click(); })`);
await saveDialog();
check("попередження про майстра без послуг", (await text(".adm-toast")).join("").includes("Без послуг"));

// сховати Ірину
await click("Сховати з сайту: Ірина Лисенко");
await sleep(400);

// новий майстер
await click("Додати майстра");
await b.waitFor(`document.querySelector("dialog[open]")`);
await setField("Ім'я та прізвище", "Тетяна Гнатюк");
await setField("Роль", "Масажистка");
await setField("Досвід, років", "3");
await b.eval(`[...document.querySelectorAll("dialog[open] .adm-svcpick .check")].find((l) => l.textContent.startsWith("Масаж обличчя")).querySelector("input").click()`);
await b.eval(`[...document.querySelectorAll("dialog[open] .adm-day input")].find((i) => i.value === "6").click()`); // без суботи
await saveDialog("Додати майстра");
const tet = (await b.eval(`AVERDB.list("masters")`)).find((m) => m.name === "Тетяна Гнатюк");
check("новий майстер: дні й послуги", tet && tet.work_days.join() === "1,2,3,4,5" && tet.service_ids.join() === "face-massage" && tet.sort === 6, tet);
check("новий майстер: «Пн–Пт» у списку", (await text(".adm-row__meta")).some((t) => t.includes("Масажистка / 1 послуга / Пн–Пт")), await text(".adm-row__meta"));

// майстра з майбутнім записом не видалити (запис t1 у Марії)
await rowOpen("Марія Коваленко");
await click("Видалити", dlg);
await b.waitFor(`document.querySelectorAll("dialog[open]").length === 2`);
check("майстра з майбутніми записами не видалено", (await text("dialog[open]:last-of-type h2")).join("").includes("перенесіть"));
await click("Зрозуміло", "dialog[open]:last-of-type");
await sleep(200);
await click("Закрити", dlg);
await sleep(200);

// видалити нового майстра
await rowOpen("Тетяна Гнатюк");
await click("Видалити", dlg);
await b.waitFor(`document.querySelectorAll("dialog[open]").length === 2`);
await click("Видалити", "dialog[open]:last-of-type .adm-dialog__actions");
await sleep(400);
check("майстра видалено", !(await b.eval(`AVERDB.list("masters")`)).some((m) => m.name === "Тетяна Гнатюк"));

/* ---------- сайт: команда ---------- */
await site("index.html");
const team = await text("[data-team] h3");
check("команда: 5 видимих майстрів", team.length === 5 && !team.includes("Ірина Лисенко"), team);
check("команда: фото Марії", await b.eval(`!![...document.querySelectorAll("[data-team] .member")].find((m) => m.textContent.includes("Марія")).querySelector(".member__avatar img")`));
check("команда: ініціали в інших", (await b.eval(`[...document.querySelectorAll("[data-team] .member__avatar")].find((a) => !a.querySelector("img")).textContent`)) === "ОБ");
check("команда: «Досвід 12 років»", (await text(".member__meta"))[0] === "Досвід 12 років", await text(".member__meta"));
check("«Майстри:» у «Волоссі» лише Марія", (await text("#panel-hair .services__masters"))[0] === "Майстри: Марія Коваленко", await text("#panel-hair .services__masters"));
check("390px: головна без горизонтального скролу", await noHScroll());

/* ---------- десктоп ---------- */
await b.viewport(1280, 860, false);
await admin("services");
await b.screenshot(shots + "/services-1280.png", false);
await rowOpen("Жіноча стрижка");
await b.screenshot(shots + "/service-dialog-1280.png", false);
await click("Закрити", dlg);
await admin("masters");
await rowOpen("Марія Коваленко");
await b.screenshot(shots + "/master-dialog-1280.png", false);

await b.eval(`AVERDB.reset()`);
check("консоль браузера без помилок", b.logs.length === 0, b.logs);
await b.close();
console.log(failed ? "\nНЕ ПРОЙДЕНО: " + failed : "\nУсе пройдено");
process.exit(failed ? 1 : 0);
