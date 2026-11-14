/*
 * AVER: "база даних" демо-версії в браузері (IndexedDB).
 * ---------------------------------------------------------------
 * Це ЄДИНИЙ файл, який знає, де лежать дані. Сайт і адмінка звертаються
 * лише до функцій AVERDB нижче. Щоб підключити Supabase, пишемо файл
 * db-supabase.js з тими самими функціями й підключаємо його замість цього.
 *
 * Таблиці (у Supabase будуть такі самі): див. supabase/schema.sql
 * Рядки таблиць settings і content: один запис з id "main".
 *
 * Обмеження демо: дані живуть лише в цьому браузері. Якщо IndexedDB
 * недоступна (деякі приватні режими), працюємо з копією в пам'яті:
 * сайт показується, але зміни зникнуть після перезавантаження.
 */
(function () {
  const DB_NAME = "aver-demo";
  const DB_VERSION = 1;
  // Збільшуємо, коли змінюється структура тестових даних: стара демо-база перезапишеться
  const SEED_VERSION = 2;

  const TABLES = [
    "meta", "users", "settings", "closures", "categories", "services",
    "masters", "bookings", "photos", "reviews", "content", "files",
  ];

  // Корінь сайту = папка, де лежить цей файл (працює і з /, і з /admin/)
  const here = document.currentScript && document.currentScript.src;
  const ROOT = here ? new URL(".", here).href : new URL(".", location.href).href;

  const channel = "BroadcastChannel" in window ? new BroadcastChannel("aver-db") : null;

  let readyPromise = null;
  let idb = null; // IDBDatabase
  let memory = null; // запасний варіант: { table: Map }

  /* ---------- низький рівень ---------- */

  const wrap = (r) => new Promise((res, rej) => {
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });

  function openIDB() {
    return new Promise((res, rej) => {
      if (!("indexedDB" in window)) return rej(new Error("IndexedDB недоступна"));
      const r = indexedDB.open(DB_NAME, DB_VERSION);
      r.onupgradeneeded = () => {
        const db = r.result;
        TABLES.forEach((t) => {
          if (!db.objectStoreNames.contains(t)) db.createObjectStore(t, { keyPath: "id" });
        });
      };
      r.onsuccess = () => {
        const db = r.result;
        // інша вкладка оновила структуру бази: закриваємося, щоб їй не заважати
        db.onversionchange = () => db.close();
        res(db);
      };
      r.onerror = () => rej(r.error);
      r.onblocked = () => rej(new Error("База зайнята іншою вкладкою"));
    });
  }

  /*
   * Транзакція: fn отримує операції get/getAll/put/delete/clear.
   * Усередині fn можна чекати (await) лише ці операції, інакше IndexedDB
   * закриє транзакцію. readwrite-транзакції виконуються по черзі навіть
   * між вкладками, тому "перевірив і записав" усередині однієї fn атомарне.
   */
  function run(tables, mode, fn) {
    tables = [].concat(tables);
    if (memory) {
      const ops = {
        get: async (t, id) => clone(memory[t].get(id) ?? null),
        getAll: async (t) => [...memory[t].values()].map(clone),
        put: async (t, row) => { memory[t].set(row.id, clone(row)); return row; },
        delete: async (t, id) => { memory[t].delete(id); },
        clear: async (t) => { memory[t].clear(); },
      };
      return Promise.resolve(fn(ops));
    }
    return new Promise((res, rej) => {
      const tx = idb.transaction(tables, mode);
      let result;
      const store = (t) => tx.objectStore(t);
      const ops = {
        get: (t, id) => wrap(store(t).get(id)).then((v) => v ?? null),
        getAll: (t) => wrap(store(t).getAll()),
        put: (t, row) => wrap(store(t).put(row)).then(() => row),
        delete: (t, id) => wrap(store(t).delete(id)),
        clear: (t) => wrap(store(t).clear()),
      };
      Promise.resolve()
        .then(() => fn(ops))
        .then((r) => { result = r; })
        .catch((err) => {
          try { tx.abort(); } catch (e) { /* уже завершена */ }
          rej(err);
        });
      tx.oncomplete = () => res(result);
      tx.onerror = () => rej(tx.error);
      tx.onabort = () => rej(tx.error || new Error("Транзакцію скасовано"));
    });
  }

  function clone(v) {
    return v == null ? v : structuredClone(v);
  }

  function notify(tables) {
    if (channel) channel.postMessage({ tables: [].concat(tables) });
  }

  /* ---------- тестові дані ---------- */

  function loadSeed() {
    if (window.AVER_SEED) return Promise.resolve(window.AVER_SEED);
    return new Promise((res, rej) => {
      const s = document.createElement("script");
      s.src = ROOT + "seed.js";
      s.onload = () => (window.AVER_SEED ? res(window.AVER_SEED) : rej(new Error("seed.js порожній")));
      s.onerror = () => rej(new Error("Не вдалося завантажити seed.js"));
      document.head.appendChild(s);
    });
  }

  async function writeSeed() {
    const seed = await loadSeed();
    const data = seed.build(new Date());
    await run(TABLES, "readwrite", async (o) => {
      for (const t of TABLES) await o.clear(t);
      for (const t of Object.keys(data)) {
        for (const row of data[t]) await o.put(t, row);
      }
      await o.put("meta", { id: "seed", version: SEED_VERSION, seeded_at: new Date().toISOString() });
    });
  }

  async function init() {
    try {
      idb = await openIDB();
    } catch (err) {
      console.warn("AVER: IndexedDB недоступна, працюємо в пам'яті.", err);
      memory = Object.fromEntries(TABLES.map((t) => [t, new Map()]));
    }
    const meta = await run("meta", "readonly", (o) => o.get("meta", "seed"));
    if (!meta || meta.version !== SEED_VERSION) {
      if (meta) console.info("AVER: структура тестових даних оновилася, демо-базу перезаписано.");
      await writeSeed();
    }
  }

  /* ---------- файли (фото) ---------- */

  const urlCache = new Map();

  function blobToDataURL(blob) {
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(r.result);
      r.onerror = () => rej(r.error);
      r.readAsDataURL(blob);
    });
  }

  async function dataURLToBlob(url) {
    return (await fetch(url)).blob();
  }

  /* ---------- публічні функції ---------- */

  const api = {
    ROOT,
    TABLES,
    get isMemory() {
      return !!memory;
    },

    // Відкрити базу й, якщо треба, заповнити тестовими даними. Можна викликати скільки завгодно.
    ready() {
      if (!readyPromise) readyPromise = init();
      return readyPromise;
    },

    // Усі рядки таблиці; якщо є поле sort, то за ним
    async list(table) {
      await api.ready();
      const rows = await run(table, "readonly", (o) => o.getAll(table));
      return rows.sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0));
    },

    async get(table, id) {
      await api.ready();
      return run(table, "readonly", (o) => o.get(table, id));
    },

    // Вставити або оновити рядок (за id). Без id створюється новий.
    async put(table, row) {
      await api.ready();
      const r = { ...row };
      if (!r.id) r.id = api.newId();
      await run(table, "readwrite", (o) => o.put(table, r));
      notify(table);
      return r;
    },

    async putMany(table, rows) {
      await api.ready();
      await run(table, "readwrite", async (o) => {
        for (const r of rows) await o.put(table, r);
      });
      notify(table);
      return rows;
    },

    async remove(table, id) {
      await api.ready();
      await run(table, "readwrite", (o) => o.delete(table, id));
      notify(table);
    },

    // Рядок-одинак (settings, content)
    single(table) {
      return api.get(table, "main");
    },

    saveSingle(table, data) {
      return api.put(table, { ...data, id: "main" });
    },

    /*
     * Атомарна зміна: fn(ops) читає й пише в межах однієї транзакції.
     * Для перевірки накладок записів: прочитати всі записи, перевірити, зберегти.
     * Якщо fn кидає помилку, нічого не зберігається.
     */
    async atomic(tables, fn) {
      await api.ready();
      const r = await run(tables, "readwrite", fn);
      notify(tables);
      return r;
    },

    newId() {
      return crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2);
    },

    // Зберегти фото (Blob). Повертає посилання "idb:<id>" для поля src/photo.
    async putFile(blob) {
      const id = api.newId();
      await api.put("files", { id, blob, type: blob.type, size: blob.size, created_at: new Date().toISOString() });
      return "idb:" + id;
    },

    async removeFile(src) {
      if (!src || !src.startsWith("idb:")) return;
      const id = src.slice(4);
      if (urlCache.has(id)) {
        URL.revokeObjectURL(urlCache.get(id));
        urlCache.delete(id);
      }
      await api.remove("files", id);
    },

    // Адреса для <img src>: шлях до файлу сайту або завантажене фото з бази
    async fileUrl(src) {
      if (!src) return "";
      if (!src.startsWith("idb:")) return new URL(src, ROOT).href;
      const id = src.slice(4);
      if (urlCache.has(id)) return urlCache.get(id);
      const row = await api.get("files", id);
      if (!row) return "";
      const url = URL.createObjectURL(row.blob);
      urlCache.set(id, url);
      return url;
    },

    // Підписка на зміни з інших вкладок: cb({ tables: [...] })
    onChange(cb) {
      if (channel) channel.addEventListener("message", (e) => cb(e.data));
    },

    // Усі дані одним JSON (фото всередині як data:URL)
    async exportAll() {
      await api.ready();
      const out = { app: "aver", seed_version: SEED_VERSION, exported_at: new Date().toISOString(), tables: {} };
      for (const t of TABLES) {
        if (t === "meta") continue;
        const rows = await run(t, "readonly", (o) => o.getAll(t));
        if (t === "files") {
          out.tables.files = [];
          for (const f of rows) out.tables.files.push({ ...f, blob: await blobToDataURL(f.blob) });
        } else {
          out.tables[t] = rows;
        }
      }
      return out;
    },

    // Замінити всі дані вмістом експорту. Кидає помилку, якщо файл не наш.
    async importAll(data) {
      await api.ready();
      if (!data || data.app !== "aver" || typeof data.tables !== "object") {
        throw new Error("Це не файл експорту AVER");
      }
      const tables = {};
      for (const t of TABLES) {
        if (t === "meta") continue;
        const rows = data.tables[t] || [];
        if (!Array.isArray(rows) || rows.some((r) => !r || typeof r !== "object" || !r.id)) {
          throw new Error("Пошкоджена таблиця «" + t + "» у файлі");
        }
        tables[t] = rows;
      }
      if (!tables.users.length) throw new Error("У файлі немає жодного користувача, після імпорту не вдасться увійти");
      for (const f of tables.files) f.blob = await dataURLToBlob(f.blob);
      await run(TABLES, "readwrite", async (o) => {
        for (const t of Object.keys(tables)) {
          await o.clear(t);
          for (const row of tables[t]) await o.put(t, row);
        }
      });
      urlCache.forEach((u) => URL.revokeObjectURL(u));
      urlCache.clear();
      notify(Object.keys(tables));
    },

    // Повернути тестові дані (усе, що змінено, зникне)
    async reset() {
      await api.ready();
      await writeSeed();
      urlCache.forEach((u) => URL.revokeObjectURL(u));
      urlCache.clear();
      notify(TABLES);
    },
  };

  window.AVERDB = api;
})();
