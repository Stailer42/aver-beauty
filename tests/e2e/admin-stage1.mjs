/*
 * Етап 1: вхід, сесія, налаштування адмінки.
 *   node tests/e2e/admin-stage1.mjs [папка-для-скриншотів]
 * Сервер: python3 serve.py 8765
 */
import { mkdirSync } from "node:fs";
import { launch } from "./cdp.mjs";

const BASE = process.env.BASE || "http://localhost:8765/";
const shots = process.argv[2] || "tmp/screens/admin";
mkdirSync(shots, { recursive: true });

const b = await launch();
let failed = 0;
const check = (name, ok, extra) => {
  console.log((ok ? "ок    " : "ПОМИЛКА ") + name + (extra && !ok ? " → " + extra : ""));
  if (!ok) failed++;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// заповнити поле й натиснути кнопку входу
const login = (l, p) => b.eval(`(() => {
  document.querySelector("#l-login").value = ${JSON.stringify(l)};
  document.querySelector("#l-pass").value = ${JSON.stringify(p)};
  document.querySelector("[data-login-submit]").click();
})()`);
const visible = (sel) => b.eval(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); return !!e && !e.closest("[hidden]") && e.getClientRects().length > 0; })()`);
const text = (sel) => b.eval(`(document.querySelector(${JSON.stringify(sel)}) || {}).textContent || ""`);
const noHScroll = () => b.eval(`document.documentElement.scrollWidth <= window.innerWidth`);

await b.viewport(360, 760);
await b.goto(BASE + "admin/", 400);
await b.waitFor(`!document.querySelector("[data-boot]") || document.querySelector("[data-boot]").hidden`);

check("показано екран входу", await visible("[data-login-form]"));
check("адмінка схована до входу", !(await visible("[data-app]")));
check("360px: немає горизонтального скролу (вхід)", await noHScroll());
await b.screenshot(shots + "/login-360.png", false);

// пароль у базі лише як хеш
const dump = await b.eval(`AVERDB.exportAll().then((d) => JSON.stringify(d))`);
check("у базі немає пароля відкритим текстом", !dump.includes("aver-demo"));
const u = await b.eval(`AVERDB.get("users", "u-admin")`);
check("у користувача є хеш і сіль", !!(u && u.password_hash && u.salt && u.iterations >= 100000));

// неправильний пароль
await login("admin", "wrong-pass");
await b.waitFor(`!document.querySelector("[data-login-error]").hidden`);
check("неправильний пароль: показано помилку", (await text("[data-login-error]")).includes("Неправильний"));
check("неправильний пароль: адмінка не відкрилась", !(await visible("[data-app]")));

// неіснуючий логін
await login("nobody", "aver-demo");
await sleep(600);
check("неіснуючий логін не пускає", !(await visible("[data-app]")));

// блокування після 5 спроб (2 вже було)
for (let i = 0; i < 3; i++) {
  await login("admin", "wrong" + i);
  await b.waitFor(`!document.querySelector("[data-login-submit]").disabled || document.querySelector("[data-login-error]").textContent.includes("Забагато")`);
  await sleep(300);
}
check("після 5 спроб вхід заблоковано", (await text("[data-login-error]")).includes("Забагато"));
check("кнопка входу вимкнена під час блокування", await b.eval(`document.querySelector("[data-login-submit]").disabled`));
await login("admin", "aver-demo");
await sleep(500);
check("навіть правильний пароль не пускає під час блокування", !(await visible("[data-app]")));

// знімаємо блокування (імітуємо, що минула хвилина) і перезавантажуємо
await b.eval(`localStorage.removeItem("aver-admin-lock")`);
await b.goto(BASE + "admin/", 400);
await b.waitFor(`!document.querySelector("[data-login]").hidden`);

// правильний вхід
await login("Admin ", "aver-demo"); // регістр і пробіл у логіні не заважають
await b.waitFor(`!document.querySelector("[data-app]").hidden`, 10000);
check("правильний пароль відкриває адмінку", await visible("[data-app]"));
check("перший розділ: Записи", (await text(".adm-title")) === "Записи" && !(await text(".adm-soon")));
check("нижня панель видима на телефоні", await visible(".adm-tabbar"));
check("360px: немає горизонтального скролу (адмінка)", await noHScroll());

// сесія переживає перезавантаження вкладки
await b.goto(BASE + "admin/#settings", 400);
await b.waitFor(`document.querySelector(".adm-title") && document.querySelector(".adm-title").textContent === "Налаштування"`);
check("після перезавантаження сесія жива", true);
check("пункт «Ще» підсвічено для розділу поза нижньою панеллю", await b.eval(`document.querySelector("[data-more]").classList.contains("is-current")`));
check("360px: немає горизонтального скролу (налаштування)", await noHScroll());
await b.screenshot(shots + "/settings-360.png", true);

// шторка «Ще»
await b.eval(`document.querySelector("[data-more]").click()`);
await sleep(300);
check("«Ще» відкриває список усіх розділів", await b.eval(`document.querySelectorAll("dialog[open] .adm-more a").length === 8`));
await b.screenshot(shots + "/more-360.png", false);
await b.eval(`document.querySelector("dialog[open] .adm-more a[href='#reviews']").click()`);
await b.waitFor(`document.querySelector(".adm-title") && document.querySelector(".adm-title").textContent === "Відгуки"`);
check("перехід з «Ще» в розділ і закриття шторки", !(await b.eval(`!!document.querySelector("dialog[open]")`)));
await b.goto(BASE + "admin/#settings", 400);
await b.waitFor(`document.querySelector(".adm-title") && document.querySelector(".adm-title").textContent === "Налаштування"`);

// зміна пароля
const pw = (cur, n, r) => b.eval(`(() => {
  const f = document.querySelectorAll(".adm-panel form input[type=password]");
  f[0].value = ${JSON.stringify(cur)}; f[1].value = ${JSON.stringify(n)}; f[2].value = ${JSON.stringify(r)};
  document.querySelector(".adm-panel form button[type=submit]").click();
})()`);
await pw("aver-demo", "short", "short");
await sleep(200);
check("короткий новий пароль відхилено", (await text(".adm-panel .is-invalid .field__error")).includes("Мінімум"));
await pw("aver-demo", "new-password-1", "new-password-2");
await sleep(200);
check("різні паролі відхилено", (await text(".adm-panel .is-invalid .field__error")).includes("не збігаються"));
await pw("wrong-current", "new-password-1", "new-password-1");
await b.waitFor(`document.querySelector(".adm-panel .is-invalid")`);
check("неправильний поточний пароль відхилено", (await text(".adm-panel .is-invalid .field__error")).includes("не підходить"));
await pw("aver-demo", "new-password-1", "new-password-1");
await b.waitFor(`document.querySelector(".adm-toast.is-on")`);
check("пароль змінено", (await text(".adm-toast")).includes("Пароль змінено"));
const u2 = await b.eval(`AVERDB.get("users", "u-admin")`);
check("нова сіль і новий хеш", u2.salt !== u.salt && u2.password_hash !== u.password_hash);

// вихід і вхід зі старим/новим паролем
await b.eval(`document.querySelector(".adm-top [data-logout]").click()`);
await b.waitFor(`!document.querySelector("[data-login]").hidden`);
check("вихід повертає на екран входу", await visible("[data-login-form]"));
await login("admin", "aver-demo");
await b.waitFor(`!document.querySelector("[data-login-error]").hidden`);
check("старий пароль більше не підходить", !(await visible("[data-app]")));
await login("admin", "new-password-1");
await b.waitFor(`!document.querySelector("[data-app]").hidden`);
check("новий пароль підходить", await visible("[data-app]"));

// закінчення сесії
await b.eval(`(() => { const s = JSON.parse(sessionStorage.getItem("aver-admin-session")); s.expires = Date.now() - 1; sessionStorage.setItem("aver-admin-session", JSON.stringify(s)); })()`);
await b.goto(BASE + "admin/#settings", 400);
await b.waitFor(`!document.querySelector("[data-login]").hidden`);
check("прострочена сесія вимагає входу", !(await visible("[data-app]")));

// експорт / імпорт / скидання
await login("admin", "new-password-1");
await b.waitFor(`!document.querySelector("[data-app]").hidden`);
const exp = await b.eval(`AVERDB.exportAll()`);
check("експорт містить усі таблиці", ["users", "settings", "categories", "services", "masters", "photos", "reviews", "content"].every((t) => Array.isArray(exp.tables[t]) && (t === "bookings" || exp.tables[t].length > 0)));
await b.eval(`AVERDB.put("categories", { id: "hair", name: "ЗМІНЕНО", sort: 0, visible: true })`);
await b.eval(`AVERDB.importAll(${JSON.stringify(exp)})`);
check("імпорт повертає дані з копії", (await b.eval(`AVERDB.get("categories", "hair")`)).name === "Волосся");
const badImport = await b.eval(`AVERDB.importAll({ app: "other" }).then(() => "ok", (e) => e.message)`);
check("чужий файл не імпортується", badImport.includes("не файл експорту"));
check("після невдалого імпорту дані цілі", (await b.eval(`AVERDB.list("services")`)).length === 17);

await b.eval(`AVERDB.reset()`);
const u3 = await b.eval(`AVERDB.get("users", "u-admin")`);
check("скидання повертає демо-пароль", u3.password_hash === u.password_hash);

// десктоп
await b.viewport(1280, 860, false);
await b.goto(BASE + "admin/#settings", 400);
await b.waitFor(`document.querySelector(".adm-title")`);
check("десктоп: бокове меню видиме", await visible(".adm-side"));
check("десктоп: нижня панель схована", !(await visible(".adm-tabbar")));
await b.screenshot(shots + "/settings-1280.png", false);
await b.eval(`document.querySelector(".adm-side [data-logout]").click()`);
await b.waitFor(`!document.querySelector("[data-login]").hidden`);
await b.screenshot(shots + "/login-1280.png", false);

// сайт після всього цього працює
await b.goto(BASE + "index.html", 800);
check("головна: послуги на місці", (await b.eval(`document.querySelectorAll(".svc").length`)) > 0);
await b.goto(BASE + "booking.html", 800);
check("запис: послуги на місці", (await b.eval(`document.querySelectorAll("[data-service-list] li").length`)) > 0);

check("консоль браузера без помилок", b.logs.length === 0, b.logs.join("\n"));
await b.close();
console.log(failed ? "\nНЕ ПРОЙДЕНО: " + failed : "\nУсе пройдено");
process.exit(failed ? 1 : 0);
