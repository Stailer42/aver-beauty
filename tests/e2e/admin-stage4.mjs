/*
 * Етап 4: фото, відгуки, тексти й контакти в адмінці → головна й сторінка запису.
 *   node tests/e2e/admin-stage4.mjs [папка-для-скриншотів]
 * Сервер: python3 serve.py 8765
 */
import { mkdirSync } from "node:fs";
import { launch } from "./cdp.mjs";

const BASE = process.env.BASE || "http://localhost:8765/";
const shots = process.argv[2] || "tmp/screens/admin4";
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
const NB = " ";

const click = (text, scope = "body") => b.eval(`(() => {
  const root = [...document.querySelectorAll(${J(scope)})].pop();
  const els = [...root.querySelectorAll("button, a, label, summary")];
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
const setField = (label, value, scope = "body") => b.eval(`(() => {
  const root = [...document.querySelectorAll(${J(scope)})].pop();
  const lab = [...root.querySelectorAll("label")].find((l) => l.textContent.trim() === ${J(label)});
  if (!lab) throw new Error("немає поля: " + ${J(label)});
  const input = document.getElementById(lab.htmlFor);
  input.value = ${J(value)};
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
  return true;
})()`);
// кнопка «Зберегти» всередині панелі з заголовком
const savePanel = (title) => b.eval(`(() => {
  const p = [...document.querySelectorAll(".adm-panel")].find((x) => x.querySelector(".adm-panel__title").textContent === ${J(title)});
  p.querySelector('button[type="submit"]').click();
})()`);
const panelErrors = (title) => b.eval(`(() => {
  const p = [...document.querySelectorAll(".adm-panel")].find((x) => x.querySelector(".adm-panel__title").textContent === ${J(title)});
  return [...p.querySelectorAll(".is-invalid .field__error, .adm-opts__error:not([hidden])")].map((e) => e.textContent.trim());
})()`);
const text = (sel) => b.eval(`[...document.querySelectorAll(${J(sel)})].filter((e) => !e.closest("[hidden]")).map((e) => e.textContent.trim())`);
const visible = (sel) => b.eval(`(() => { const e = document.querySelector(${J(sel)}); return !!e && !e.closest("[hidden]"); })()`);
const noHScroll = () => b.eval(`(() => { const d = document.querySelector("dialog[open]"); return d ? d.scrollWidth <= d.clientWidth : document.documentElement.scrollWidth <= innerWidth; })()`);

async function admin(hash) {
  await b.goto(BASE + "admin/#" + hash, 300);
  await b.waitFor(`document.querySelector("[data-boot]").hidden`);
  if (await b.eval(`!document.querySelector("[data-login]").hidden`)) {
    await b.eval(`(() => { document.querySelector("#l-login").value = "admin"; document.querySelector("#l-pass").value = "aver-demo"; document.querySelector("[data-login-submit]").click(); })()`);
  }
  await b.waitFor(`document.querySelector(".adm-title") && !document.querySelector("[data-app]").hidden`, 10000);
  await sleep(250);
}
const site = (path) => b.goto(BASE + path, 900);
const rowOpen = async (title) => {
  await b.eval(`(() => {
    const r = [...document.querySelectorAll(".adm-row__main")].find((e) => e.querySelector(".adm-row__title").firstChild.textContent === ${J(title)});
    if (!r) throw new Error("немає рядка " + ${J(title)});
    r.click();
  })()`);
  await b.waitFor(`document.querySelector("dialog[open]")`);
};

await b.viewport(390, 820);
await admin("content");
await b.eval(`AVERDB.reset()`);
await admin("content");
check("390px: тексти без горизонтального скролу", await noHScroll());

/* ---------- перший екран ---------- */
await setField("Підзаголовок", "Догляд за волоссям\nі обличчям у центрі Львова");
await savePanel("Перший екран");
await sleep(400);
const hero = (await b.eval(`AVERDB.single("content")`)).hero;
check("підзаголовок: нерозривні пробіли й перенос", hero.sub === "Догляд за" + NB + "волоссям\nі" + NB + "обличчям у" + NB + "центрі Львова", hero.sub);
await setField("Підзаголовок", "");
await savePanel("Перший екран");
await sleep(200);
check("порожній підзаголовок відхилено", (await panelErrors("Перший екран")).join().includes("порожнім"));

/* ---------- контакти ---------- */
await admin("content");
await setField("Основний телефон", "067 12");
await setField("E-mail, необов'язково", "не-пошта");
await savePanel("Контакти");
await sleep(200);
const cErr = await panelErrors("Контакти");
check("неправильний телефон і e-mail відхилено", cErr.some((e) => e.includes("9 цифр")) && cErr.some((e) => e.includes("Перевірте адресу")), cErr);
await setField("Основний телефон", "067 123 45 67");
await setField("Другий телефон, необов'язково", "");
await setField("E-mail, необов'язково", "hello@aver.example");
await setField("Вулиця й будинок", "вул. Нова, 5");
await savePanel("Контакти");
await sleep(400);
const ct = (await b.eval(`AVERDB.single("content")`)).contacts;
check("контакти: телефон нормалізовано, другий прибрано", ct.phones.join("|") === "+380 67 123 45 67" && ct.street === "вул. Нова, 5", ct);

/* ---------- соцмережі ---------- */
await setField("Facebook", "facebook.com/aver");
await savePanel("Соцмережі");
await sleep(200);
check("посилання без https:// відхилено", (await panelErrors("Соцмережі")).join().includes("https://"));
await setField("Facebook", "");
await setField("Instagram", "https://www.instagram.com/aver.demo/");
await savePanel("Соцмережі");
await sleep(400);

/* ---------- заголовки розділів ---------- */
await admin("content");
await click("02 / Роботи");
await sleep(150);
await b.eval(`(() => {
  const d = [...document.querySelectorAll(".adm-details")].find((x) => x.textContent.includes("02 / Роботи"));
  const t = d.querySelector("textarea"); t.value = "Наші\\nроботи"; t.dispatchEvent(new Event("input", { bubbles: true }));
})()`);
await savePanel("Заголовки й вступи розділів");
await sleep(400);
check("заголовок розділу збережено", (await b.eval(`AVERDB.single("content")`)).sections.works.title === "Наші\nроботи");

/* ---------- чому AVER ---------- */
await click("Прибрати пункт 5");
await click("Нижче: пункт 1");
await sleep(100);
await savePanel("Чому AVER");
await sleep(400);
const why = (await b.eval(`AVERDB.single("content")`)).why.map((w) => w.title);
check("«Чому AVER»: 4 пункти в новому порядку", why.length === 4 && why[0] === "Професійна косметика" && why[1] === "Досвідчені майстри", why);
await b.screenshot(shots + "/content-390.png", false);

/* ---------- сайт: тексти й контакти ---------- */
await site("index.html");
check("сайт: підзаголовок із переносом", (await b.eval(`document.querySelector(".hero__sub").innerHTML`)) === "Догляд за&nbsp;волоссям<br>і&nbsp;обличчям у&nbsp;центрі Львова", await b.eval(`document.querySelector(".hero__sub").innerHTML`));
const tels = await b.eval(`[...document.querySelectorAll('[data-phone="0"]')].map((a) => a.getAttribute("href"))`);
check("сайт: усі кнопки дзвінка на новий номер (" + tels.length + ")", tels.length === 6 && tels.every((h) => h === "tel:+380671234567"), tels);
check("сайт: номер у шапці з нерозривними пробілами", (await b.eval(`document.querySelector(".header__phone").textContent`)) === ["+380", "67", "123", "45", "67"].join(NB));
check("сайт: другий телефон сховано", (await text('[data-phone="1"]')).length === 0);
check("сайт: адреса у футері", (await b.eval(`document.querySelector("[data-address]").textContent`)).trim() === "Львів, вул." + NB + "Нова," + NB + "5");
check("сайт: Facebook сховано, Instagram оновлено", (await text('[data-social="facebook"]')).length === 0 && (await b.eval(`document.querySelector('[data-social="instagram"]').href`)) === "https://www.instagram.com/aver.demo/");
check("сайт: заголовок «Роботи» оновлено", (await b.eval(`document.querySelector("#works-title").innerHTML`)) === "Наші<br>роботи");
check("сайт: «Чому AVER» 4 пункти, нумерація 01–04", (await text(".why__num")).join() === "01,02,03,04" && (await text(".why__item h3"))[0] === "Професійна косметика");
const ld = await b.eval(`JSON.parse(document.querySelector('script[type="application/ld+json"]').textContent)`);
check("JSON-LD: телефон, адреса, соцмережі", ld.telephone === "+380671234567" && ld.address.streetAddress === "вул. Нова, 5" && ld.sameAs.join() === "https://www.instagram.com/aver.demo/,https://t.me/", ld);
await site("booking.html");
check("сторінка запису: телефон і адреса", (await b.eval(`document.querySelector(".header__phone").getAttribute("href")`)) === "tel:+380671234567" && (await b.eval(`document.querySelector("[data-address-label]").textContent`)) === "AVER / Львів, вул." + NB + "Нова," + NB + "5");

/* ---------- фото: роботи ---------- */
await admin("gallery");
check("фото: 6 робіт", (await b.eval(`document.querySelectorAll(".adm-row").length`)) === 6);
await click("Сховати з сайту: Локони й укладання");
await sleep(400);
await click("Змінити порядок");
for (let i = 0; i < 5; i++) {
  await click("Вище: Педикюр");
  await sleep(250);
}
await click("Готово");
await sleep(200);
check("порядок: «Педикюр» першим", (await b.eval(`document.querySelector(".adm-row__title").firstChild.textContent`)) === "Педикюр");

// нове фото: без опису не зберігається, потім зберігається
await click("Додати фото");
await b.waitFor(`document.querySelector("dialog[open]")`);
await click("Додати фото", dlg + " .adm-dialog__actions");
await sleep(200);
check("нове фото без файлу й опису не зберігається", (await text("dialog[open] .adm-opts__error")).join().includes("Оберіть фото") && (await text("dialog[open] .is-invalid .field__error")).join().includes("Опишіть"));
await b.eval(`(async () => {
  const c = document.createElement("canvas"); c.width = 2400; c.height = 1800;
  const g = c.getContext("2d"); g.fillStyle = "#f7e6e9"; g.fillRect(0, 0, 2400, 1800); g.fillStyle = "#c98b96"; g.fillRect(800, 300, 800, 1200);
  const blob = await new Promise((r) => c.toBlob(r, "image/jpeg", 0.9));
  const dt = new DataTransfer(); dt.items.add(new File([blob], "work.jpg", { type: "image/jpeg" }));
  const input = document.querySelector('dialog[open] input[type="file"]');
  input.files = dt.files; input.dispatchEvent(new Event("change"));
})()`);
await b.waitFor(`document.querySelector("dialog[open] .adm-frame img:not([hidden])") && document.querySelector("dialog[open] .adm-frame img").src.startsWith("blob:")`);
check("стиснення: підказка про розмір 1600×1200", (await text("dialog[open] .adm-photo__note")).join().includes("1600×1200"));
await setField("Підпис на сайті", "Брови з фарбуванням", dlg);
await setField("Що на фото (для незрячих і Google)", "Брови після ламінування крупним планом", dlg);
await b.eval(`(() => { const s = document.querySelector("dialog[open] select"); s.value = "m-daryna"; s.dispatchEvent(new Event("change", { bubbles: true })); })()`);
await b.eval(`(() => { const r = document.querySelector('dialog[open] input[type="range"]'); r.value = "35"; r.dispatchEvent(new Event("input", { bubbles: true })); })()`);
check("повзунок одразу двигає кадр у прев'ю", (await b.eval(`document.querySelector("dialog[open] .adm-frame img").style.objectPosition`)) === "50% 35%");
await b.screenshot(shots + "/photo-dialog-390.png", false);
await click("Додати фото", dlg + " .adm-dialog__actions");
await sleep(600);
const added = (await b.eval(`AVERDB.list("photos")`)).find((p) => (p.caption || "").startsWith("Брови"));
check("нове фото в базі: idb, 1600×1200, фокус 35, майстер", added && added.src.startsWith("idb:") && added.width === 1600 && added.height === 1200 && added.focus_y === 35 && added.master_id === "m-daryna", added);

await site("index.html");
const works = await b.eval(`[...document.querySelectorAll("[data-works] figcaption")].map((f) => f.firstChild.textContent.trim())`);
check("сайт: 6 робіт (одна прихована, одна нова)", works.length === 6 && !works.includes("Локони й" + NB + "укладання"), works);
check("сайт: «Педикюр» першим, нове фото останнім", works[0] === "Педикюр" && works[5] === "Брови з" + NB + "фарбуванням", works);
check("сайт: кадрування йде за фото, а не за позицією", (await b.eval(`document.querySelector("[data-works] img").style.objectPosition`)) === "50% 45%");
check("сайт: нове фото показується (blob:)", await b.eval(`[...document.querySelectorAll("[data-works] img")].pop().src.startsWith("blob:")`));
check("сайт: майстер у підписі", (await b.eval(`[...document.querySelectorAll("[data-works] .work__who")].pop().textContent`)) === "Дарина" + NB + "Шевчук");

/* ---------- фото: салон ---------- */
await admin("gallery");
await click("Салон", ".adm-tabs");
await sleep(200);
await rowOpen("Кабінет догляду");
await setField("Назва зони", "Кабінет косметолога", dlg);
await click("Зберегти", dlg + " .adm-dialog__actions");
await sleep(500);
await site("index.html");
check("сайт: зону салону перейменовано", (await text(".salon__step h3")).includes("Кабінет косметолога"));
check("сайт: фото й тексти салону в парі (4 і 4)", (await b.eval(`document.querySelectorAll("[data-salon-img]").length`)) === 4 && (await b.eval(`document.querySelectorAll("[data-salon-step]").length`)) === 4);

/* ---------- відгуки ---------- */
await admin("reviews");
await click("Додати відгук");
await b.waitFor(`document.querySelector("dialog[open]")`);
await setField("Ім'я клієнта", "Марта Л.", dlg);
await setField("Текст відгуку", "Коротко", dlg);
await click("Додати відгук", dlg + " .adm-dialog__actions");
await sleep(200);
check("закороткий відгук відхилено", (await text("dialog[open] .is-invalid .field__error")).join().includes("20 символів"));
await setField("Текст відгуку", "Дуже уважні майстри, зручний онлайн-запис і жодного очікування на рецепції.", dlg);
await setField("Послуга, необов'язково", "Манікюр з покриттям", dlg);
await click("Додати відгук", dlg + " .adm-dialog__actions");
await sleep(500);
await click("Сховати з сайту: Юлія М.");
await sleep(400);
await site("index.html");
const authors = await text(".review cite");
check("сайт: новий відгук першим, прихований зник", authors[0] === "Марта Л." && !authors.includes("Юлія М.") && authors.length === 5, authors);
check("сайт: нерозривні пробіли в тексті відгуку", (await b.eval(`document.querySelector(".review p").textContent`)).includes("і" + NB + "жодного"));

/* ---------- порожні блоки ховаються ---------- */
await admin("reviews");
for (const a of ["Марта Л.", "Катерина Д.", "Ольга П.", "Вікторія С.", "Наталія К."]) {
  await click("Сховати з сайту: " + a);
  await sleep(300);
}
check("адмінка попереджає: відгуків на сайті не буде", (await text(".adm-warn")).join().includes("сховано"));
await site("index.html");
check("сайт: без відгуків секцію сховано", !(await visible("#reviews")));
check("сайт: пункт меню «Відгуки» сховано", (await text('.nav a[href="#reviews"]')).length === 0);

/* ---------- видалення фото прибирає файл ---------- */
await admin("gallery");
await click("Роботи", ".adm-tabs");
await sleep(200);
await rowOpen("Брови з фарбуванням");
await click("Видалити", dlg + " .adm-dialog__actions");
await b.waitFor(`document.querySelectorAll("dialog[open]").length === 2`);
await click("Видалити", "dialog[open]:last-of-type .adm-dialog__actions");
await sleep(500);
check("видалене фото прибрано разом із файлом", !(await b.eval(`AVERDB.list("photos")`)).some((p) => p.id === added.id) && !(await b.eval(`AVERDB.get("files", ${J(added.src.slice(4))})`)));

/* ---------- десктоп ---------- */
await b.viewport(1280, 900, false);
await admin("gallery");
await b.screenshot(shots + "/gallery-1280.png", false);
await admin("reviews");
await b.screenshot(shots + "/reviews-1280.png", false);

await b.eval(`AVERDB.reset()`);
check("консоль браузера без помилок", b.logs.length === 0, b.logs);
await b.close();
console.log(failed ? "\nНЕ ПРОЙДЕНО: " + failed : "\nУсе пройдено");
process.exit(failed ? 1 : 0);
