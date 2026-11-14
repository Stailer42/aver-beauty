/*
 * AVER адмінка: вхід, сесія, зміна пароля.
 * ---------------------------------------------------------------
 * Пароль ніде не зберігається відкритим текстом: у таблиці users лише
 * хеш PBKDF2-SHA256 (210 000 ітерацій) і випадкова "сіль".
 *
 * ВАЖЛИВО: у статичному демо це не справжній захист. Хто відкриє
 * інструменти розробника, може обійти вхід. Справжній захист дає
 * Supabase Auth: перевірка пароля на сервері + правила доступу до таблиць.
 * Тоді цей файл замінюється викликами supabase.auth.signInWithPassword().
 */
(function () {
  const SESSION_KEY = "aver-admin-session";
  const LOCK_KEY = "aver-admin-lock";
  const SESSION_MS = 8 * 60 * 60 * 1000; // 8 годин
  const MAX_FAILS = 5;
  const LOCK_MS = 60 * 1000;
  const ITERATIONS = 210000;

  const enc = new TextEncoder();
  const toB64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
  const fromB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

  async function hashPassword(password, saltB64, iterations) {
    const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
    const bits = await crypto.subtle.deriveBits(
      { name: "PBKDF2", hash: "SHA-256", salt: fromB64(saltB64), iterations },
      key,
      256
    );
    return toB64(bits);
  }

  // порівняння без раннього виходу
  function sameHash(a, b) {
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return diff === 0;
  }

  function readJSON(storage, key) {
    try {
      return JSON.parse(storage.getItem(key));
    } catch (e) {
      return null;
    }
  }

  function writeJSON(storage, key, value) {
    try {
      if (value === null) storage.removeItem(key);
      else storage.setItem(key, JSON.stringify(value));
    } catch (e) {
      /* сховище недоступне: сесія проживе до перезавантаження */
    }
  }

  function lockState() {
    return readJSON(localStorage, LOCK_KEY) || { fails: 0, until: 0 };
  }

  async function findUser(login) {
    const users = await AVERDB.list("users");
    const l = String(login || "").trim().toLowerCase();
    return users.find((u) => u.login.toLowerCase() === l) || null;
  }

  const api = {
    MIN_PASSWORD: 8,

    // Скільки секунд ще чекати після 5 невдалих спроб (0 = можна)
    lockedFor() {
      const s = lockState();
      return Math.max(0, Math.ceil((s.until - Date.now()) / 1000));
    },

    /**
     * Повертає { ok: true, user } або { ok: false, reason, wait }.
     * reason: "locked" | "wrong"
     */
    async login(login, password) {
      const wait = api.lockedFor();
      if (wait) return { ok: false, reason: "locked", wait };

      const user = await findUser(login);
      // хеш рахуємо навіть для неіснуючого логіна, щоб час відповіді не підказував, чи є такий користувач
      const salt = user ? user.salt : "AAAAAAAAAAAAAAAAAAAAAA==";
      const hash = await hashPassword(String(password || ""), salt, user ? user.iterations : ITERATIONS);

      if (user && sameHash(hash, user.password_hash)) {
        writeJSON(localStorage, LOCK_KEY, null);
        writeJSON(sessionStorage, SESSION_KEY, { user_id: user.id, expires: Date.now() + SESSION_MS });
        return { ok: true, user };
      }

      const s = lockState();
      s.fails += 1;
      if (s.fails >= MAX_FAILS) {
        s.fails = 0;
        s.until = Date.now() + LOCK_MS;
      }
      writeJSON(localStorage, LOCK_KEY, s);
      const w = api.lockedFor();
      return w ? { ok: false, reason: "locked", wait: w } : { ok: false, reason: "wrong", left: MAX_FAILS - s.fails };
    },

    // Поточний користувач або null (сесія закінчилась / користувача видалено)
    async currentUser() {
      const s = readJSON(sessionStorage, SESSION_KEY);
      if (!s || s.expires < Date.now()) {
        writeJSON(sessionStorage, SESSION_KEY, null);
        return null;
      }
      const user = await AVERDB.get("users", s.user_id);
      if (!user) writeJSON(sessionStorage, SESSION_KEY, null);
      return user;
    },

    logout() {
      writeJSON(sessionStorage, SESSION_KEY, null);
    },

    /**
     * Зміна пароля. Повертає { ok: true } або { ok: false, field, message }.
     */
    async changePassword(userId, current, next) {
      const user = await AVERDB.get("users", userId);
      if (!user) return { ok: false, field: "current", message: "Користувача не знайдено, увійдіть знову" };
      const hash = await hashPassword(current, user.salt, user.iterations);
      if (!sameHash(hash, user.password_hash)) return { ok: false, field: "current", message: "Поточний пароль не підходить" };
      if (next.length < api.MIN_PASSWORD) return { ok: false, field: "next", message: "Мінімум " + api.MIN_PASSWORD + " символів" };
      if (next === current) return { ok: false, field: "next", message: "Новий пароль збігається з поточним" };

      const salt = toB64(crypto.getRandomValues(new Uint8Array(16)));
      const password_hash = await hashPassword(next, salt, ITERATIONS);
      await AVERDB.put("users", { ...user, salt, password_hash, iterations: ITERATIONS, updated_at: new Date().toISOString() });
      return { ok: true };
    },
  };

  window.AVERAuth = api;
})();
