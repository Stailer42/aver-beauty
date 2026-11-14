/*
 * Тести логіки розкладу (schedule.js). Запуск: node --test tests/
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
require("../typo.js");
const S = require("../schedule.js");

const settings = {
  hours: { 0: null, 1: ["09:00", "20:00"], 2: ["09:00", "20:00"], 3: ["09:00", "20:00"], 4: ["09:00", "20:00"], 5: ["09:00", "20:00"], 6: ["10:00", "16:00"] },
  slot_step: 30,
  days_ahead: 14,
  lead_min: 60,
};
// 2030-01-07 = понеділок, 2030-01-12 = субота, 2030-01-13 = неділя
const MON = "2030-01-07";
const SAT = "2030-01-12";
const SUN = "2030-01-13";
const olena = { id: "o", sort: 0, visible: true, service_ids: ["cut"], work_days: [1, 2, 3, 4, 5, 6] };
const maria = { id: "m", sort: 1, visible: true, service_ids: ["cut"], work_days: [1, 2, 3] };
const hidden = { id: "h", sort: 2, visible: false, service_ids: ["cut"], work_days: [1, 2, 3, 4, 5, 6] };
const bk = (id, master_id, date, start, dur, status = "confirmed") => ({ id, master_id, date, start_min: start, duration_min: dur, status });

test("дати й час", () => {
  assert.equal(S.toMin("09:30"), 570);
  assert.equal(S.toHHMM(570), "09:30");
  assert.equal(S.addDays("2030-01-31", 1), "2030-02-01");
  assert.equal(S.addDays("2030-03-01", -1), "2030-02-28");
  assert.equal(S.weekday(MON), 1);
  assert.equal(S.weekday(SUN), 0);
});

test("години: тиждень, вихідний, виняток", () => {
  assert.deepEqual(S.dayHours(MON, settings, []), [540, 1200]);
  assert.deepEqual(S.dayHours(SAT, settings, []), [600, 960]);
  assert.equal(S.dayHours(SUN, settings, []), null);
  assert.equal(S.dayHours(MON, settings, [{ date: MON, open: null, close: null }]), null, "свято закриває робочий день");
  assert.deepEqual(S.dayHours(MON, settings, [{ date: MON, open: "10:00", close: "15:00" }]), [600, 900], "скорочений день");
  assert.deepEqual(S.dayHours(SUN, settings, [{ date: SUN, open: "11:00", close: "14:00" }]), [660, 840], "робоча неділя");
});

test("накладки: межі, скасовані, сам із собою, інший майстер", () => {
  const list = [bk("a", "o", MON, 600, 60), bk("c", "o", MON, 800, 60, "cancelled")];
  const at = (start, dur, extra = {}) => S.conflicts(list, { master_id: "o", date: MON, start_min: start, duration_min: dur, ...extra }).map((b) => b.id);
  assert.deepEqual(at(600, 60), ["a"], "той самий час");
  assert.deepEqual(at(630, 60), ["a"], "частковий перетин");
  assert.deepEqual(at(540, 90), ["a"], "закінчується всередині");
  assert.deepEqual(at(540, 60), [], "впритул до початку");
  assert.deepEqual(at(660, 30), [], "одразу після");
  assert.deepEqual(at(570, 180), ["a"], "накриває повністю");
  assert.deepEqual(at(800, 60), [], "скасований не займає час");
  assert.deepEqual(at(600, 60, { id: "a" }), [], "перенесення в межах свого ж часу");
  assert.deepEqual(S.conflicts(list, { master_id: "m", date: MON, start_min: 600, duration_min: 60 }), [], "інший майстер вільний");
  assert.deepEqual(S.conflicts(list, { master_id: "o", date: "2030-01-08", start_min: 600, duration_min: 60 }), [], "інший день");
});

test("майстри для послуги: порядок і приховані", () => {
  assert.deepEqual(S.mastersFor([maria, hidden, olena], "cut", true).map((m) => m.id), ["o", "m"]);
  assert.deepEqual(S.mastersFor([maria, hidden, olena], "cut", false).map((m) => m.id), ["o", "m", "h"]);
  assert.deepEqual(S.mastersFor([maria], "color", true), []);
});

test("вільні слоти: межі робочого дня", () => {
  const s = S.freeSlots({ date: MON, duration: 60, masters: [olena], bookings: [], settings, closures: [] });
  assert.equal(s[0].start, 540);
  assert.equal(s[s.length - 1].start, 1140, "останній слот закінчується рівно о 20:00");
  assert.equal(s.length, 21, "09:00, 09:30 ... 19:00");
  assert.equal(S.freeSlots({ date: SUN, duration: 60, masters: [olena], bookings: [], settings, closures: [] }).length, 0, "неділя");
  const long = S.freeSlots({ date: SAT, duration: 420, masters: [olena], bookings: [], settings, closures: [] });
  assert.equal(long.length, 0, "процедура довша за робочий день");
});

test("вільні слоти: зайнятий майстер і «будь-який»", () => {
  const busy = [bk("a", "o", MON, 600, 120)];
  const onlyO = S.freeSlots({ date: MON, duration: 60, masters: [olena], bookings: busy, settings, closures: [] }).map((x) => x.start);
  assert.ok(!onlyO.includes(600) && !onlyO.includes(660) && !onlyO.includes(570), "10:00–12:00 зайнято, 9:30 теж (перетне 10:00)");
  assert.ok(onlyO.includes(540) && onlyO.includes(720));

  const any = S.freeSlots({ date: MON, duration: 60, masters: [olena, maria], bookings: busy, settings, closures: [] });
  const at600 = any.find((x) => x.start === 600);
  assert.deepEqual(at600.masters, ["m"], "о 10:00 вільна лише Марія");
  const at540 = any.find((x) => x.start === 540);
  assert.deepEqual(at540.masters, ["o", "m"], "порядок майстрів збережено");

  const both = [bk("a", "o", MON, 600, 60), bk("b", "m", MON, 600, 60)];
  const none = S.freeSlots({ date: MON, duration: 60, masters: [olena, maria], bookings: both, settings, closures: [] });
  assert.ok(!none.some((x) => x.start === 600), "обидва зайняті: слота немає");
});

test("вільні слоти: робочі дні майстра", () => {
  const thu = "2030-01-10";
  const s = S.freeSlots({ date: thu, duration: 60, masters: [maria], bookings: [], settings, closures: [] });
  assert.equal(s.length, 0, "Марія не працює в четвер");
  const any = S.freeSlots({ date: thu, duration: 60, masters: [maria, olena], bookings: [], settings, closures: [] });
  assert.ok(any.every((x) => x.masters.join() === "o"));
});

test("вільні слоти: сьогодні не раніше ніж за lead_min, минулі дні порожні", () => {
  const now = new Date("2030-01-07T12:10:00");
  const s = S.freeSlots({ date: MON, duration: 60, masters: [olena], bookings: [], settings, closures: [], now });
  assert.equal(s[0].start, 13 * 60 + 30, "12:10 + 60 хв → перший слот 13:30");
  assert.equal(S.freeSlots({ date: "2030-01-06", duration: 60, masters: [olena], bookings: [], settings, closures: [], now }).length, 0);
  assert.equal(S.freeSlots({ date: "2030-01-08", duration: 60, masters: [olena], bookings: [], settings, closures: [], now })[0].start, 540);
});

test("вільні слоти: виняток-скорочений день", () => {
  const s = S.freeSlots({ date: MON, duration: 60, masters: [olena], bookings: [], settings, closures: [{ date: MON, open: "10:00", close: "13:00" }] });
  assert.deepEqual(s.map((x) => x.start), [600, 630, 660, 690, 720]);
});

test("перевірка для адмінки: попередження й блокування", () => {
  const busy = [bk("a", "o", MON, 600, 60)];
  const c1 = S.check({ slot: { master_id: "o", date: MON, start_min: 630, duration_min: 30 }, bookings: busy, settings, closures: [], master: olena });
  assert.equal(c1.conflicts.length, 1);
  const c2 = S.check({ slot: { master_id: "o", date: MON, start_min: 1170, duration_min: 60 }, bookings: busy, settings, closures: [], master: olena });
  assert.ok(c2.outside && !c2.closed && !c2.conflicts.length, "закінчується після 20:00");
  const c3 = S.check({ slot: { master_id: "m", date: "2030-01-10", start_min: 600, duration_min: 60 }, bookings: [], settings, closures: [], master: maria });
  assert.ok(c3.masterOff, "Марія не працює в четвер");
  const c4 = S.check({ slot: { master_id: "o", date: SUN, start_min: 600, duration_min: 60 }, bookings: [], settings, closures: [], master: olena });
  assert.ok(c4.closed);
});

test("ціна й опис параметрів", () => {
  const svc = { price: 900, options: [
    { id: "length", label: "Довжина волосся", choices: [{ label: "Коротке", add: 0 }, { label: "Середнє", add: 200 }] },
    { id: "tint", label: "Фарбування", choices: [{ label: "Без фарбування", add: 0 }, { label: "З фарбуванням", add: 150 }] },
  ] };
  assert.equal(S.priceFor(svc, {}), 900);
  assert.equal(S.priceFor(svc, { length: 1, tint: 1 }), 1250);
  assert.equal(S.priceFor(svc, { length: 9 }), 900, "неіснуючий варіант = перший");
  assert.equal(S.optionsText(svc, { length: 1 }), "Довжина волосся: середнє; Фарбування: без фарбування");
  assert.equal(S.optionsText({ price: 1, options: [] }, {}), "без додаткових параметрів");
});

test("текст годин роботи", () => {
  const base = { hours: { 0: null, 1: ["09:00", "20:00"], 2: ["09:00", "20:00"], 3: ["09:00", "20:00"], 4: ["09:00", "20:00"], 5: ["09:00", "20:00"], 6: ["09:00", "20:00"] } };
  assert.deepEqual(S.hoursLines(base), ["Пн–Сб 09:00–20:00", "Неділя: вихідний"]);
  assert.deepEqual(S.openingHours(base), ["Mo-Sa 09:00-20:00"]);
  assert.deepEqual(S.hoursLines(settings), ["Пн–Пт 09:00–20:00", "Сб 10:00–16:00", "Неділя: вихідний"]);
  const two = { hours: { ...base.hours, 6: null } };
  assert.deepEqual(S.hoursLines(two), ["Пн–Пт 09:00–20:00", "Сб, Нд: вихідні"]);
  assert.deepEqual(S.openingHours(settings), ["Mo-Fr 09:00-20:00", "Sa 10:00-16:00"]);
  const monOff = { hours: { ...base.hours, 1: null } };
  assert.deepEqual(S.hoursLines(monOff), ["Вт–Сб 09:00–20:00", "Пн, Нд: вихідні"], "вихідні після робочих днів");
});
