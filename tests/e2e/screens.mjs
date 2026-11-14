/*
 * Скриншоти сайту на 360px і 1280px (анімації вимкнені) + порівняння з еталоном.
 *   node tests/e2e/screens.mjs <папка>              зняти скриншоти
 *   node tests/e2e/screens.mjs <папка> <еталон>     зняти й порівняти попіксельно
 * Сервер має працювати: python3 -m http.server 8765
 */
import { mkdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { launch } from "./cdp.mjs";

const BASE = process.env.BASE || "http://localhost:8765/";
const [outDir, refDir] = process.argv.slice(2);
if (!outDir) {
  console.error("вкажіть папку для скриншотів");
  process.exit(1);
}
mkdirSync(outDir, { recursive: true });

const pages = ["index.html", "booking.html"];
const widths = [360, 1280];
const b = await launch();
await b.reducedMotion(true);
const shots = [];

for (const w of widths) {
  for (const p of pages) {
    await b.viewport(w, 800);
    await b.goto(BASE + p, 1200);
    const file = join(outDir, p.replace(".html", "") + "-" + w + ".png");
    await b.screenshot(file);
    shots.push(file);
    console.log("знято", file);
  }
}

let failed = false;
if (refDir) {
  // порівнюємо в самому Chrome через canvas, щоб не ставити бібліотек для PNG
  await b.goto("about:blank", 0);
  for (const file of shots) {
    const ref = join(refDir, file.split("/").pop());
    if (!existsSync(ref)) {
      console.log("немає еталона", ref);
      failed = true;
      continue;
    }
    const a = "data:image/png;base64," + readFileSync(file).toString("base64");
    const r = "data:image/png;base64," + readFileSync(ref).toString("base64");
    const res = await b.eval(`(async () => {
      const load = (src) => new Promise((ok) => { const i = new Image(); i.onload = () => ok(i); i.src = src; });
      const [x, y] = await Promise.all([load(${JSON.stringify(a)}), load(${JSON.stringify(r)})]);
      if (x.width !== y.width || x.height !== y.height) return { size: [x.width, x.height, y.width, y.height] };
      const px = (img) => { const c = document.createElement("canvas"); c.width = img.width; c.height = img.height;
        const g = c.getContext("2d"); g.drawImage(img, 0, 0); return g.getImageData(0, 0, c.width, c.height).data; };
      const p = px(x), q = px(y);
      let diff = 0, x0 = 1e9, x1 = -1, y0 = 1e9, y1 = -1;
      for (let i = 0; i < p.length; i += 4) {
        if (Math.abs(p[i]-q[i]) + Math.abs(p[i+1]-q[i+1]) + Math.abs(p[i+2]-q[i+2]) > 24) {
          diff++;
          const px = (i / 4) % x.width, py = Math.floor(i / 4 / x.width);
          x0 = Math.min(x0, px); x1 = Math.max(x1, px); y0 = Math.min(y0, py); y1 = Math.max(y1, py);
        }
      }
      return { diff, total: p.length / 4, box: diff ? [x0, y0, x1, y1].join(",") : "" };
    })()`);
    if (res.size) {
      console.log("РОЗМІР ВІДРІЗНЯЄТЬСЯ", file, res.size.join(" / "));
      failed = true;
    } else {
      const pct = ((res.diff / res.total) * 100).toFixed(3);
      const ok = res.diff / res.total < 0.001;
      if (!ok) failed = true;
      console.log((ok ? "ок   " : "РІЗНИЦЯ ") + file + ": " + res.diff + " пікс. (" + pct + "%)" + (res.diff ? ", область x0,y0,x1,y1 = " + res.box : ""));
    }
  }
}

if (b.logs.length) console.log("Консоль браузера:\n" + b.logs.join("\n"));
await b.close();
process.exit(failed ? 1 : 0);
