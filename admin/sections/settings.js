/*
 * Розділ «Налаштування»: зміна пароля, резервна копія (експорт/імпорт), скидання демо-даних.
 */
(function () {
  const UI = AVERUI;
  const { h } = UI;

  AVERAdmin.register("settings", {
    async render(box, { user }) {
      UI.append(box, [
        UI.viewHead("Налаштування", "Обліковий запис, резервна копія та тестові дані."),
        AVERDB.isMemory
          ? h("p", { class: "adm-warn" }, UI.icon("alert"), "Браузер не дозволив зберігати дані (можливо, приватний режим). Зміни зникнуть після перезавантаження сторінки.")
          : null,
        h("div", { class: "adm-grid" },
          passwordPanel(user),
          backupPanel(),
          resetPanel()
        ),
      ]);
    },
  });

  /* ---------- пароль ---------- */
  function passwordPanel(user) {
    const current = UI.field({ label: "Поточний пароль", type: "password", autocomplete: "current-password", reveal: true });
    const next = UI.field({ label: "Новий пароль", type: "password", autocomplete: "new-password", reveal: true, hint: "Мінімум " + AVERAuth.MIN_PASSWORD + " символів" });
    const repeat = UI.field({ label: "Новий пароль ще раз", type: "password", autocomplete: "new-password", reveal: true });
    const submit = UI.button({ label: "Змінити пароль", variant: "solid", type: "submit" });

    // прихований логін допомагає менеджерам паролів зрозуміти, для кого пароль
    const form = h("form", { class: "form", novalidate: true },
      h("input", { type: "text", name: "username", autocomplete: "username", value: user.login, hidden: true, readonly: true }),
      current.el, next.el, repeat.el, submit
    );

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const c = current.value();
      const n = next.value();
      const r = repeat.value();
      [current, next, repeat].forEach((f) => f.setError(null));
      let bad = false;
      if (!c) { current.setError("Введіть поточний пароль"); bad = true; }
      if (n.length < AVERAuth.MIN_PASSWORD) { next.setError("Мінімум " + AVERAuth.MIN_PASSWORD + " символів"); bad = true; }
      else if (n !== r) { repeat.setError("Паролі не збігаються"); bad = true; }
      if (bad) {
        form.querySelector('[aria-invalid="true"]').focus();
        return;
      }

      submit.disabled = true;
      UI.setLabel(submit, "Зберігаємо…");
      const res = await AVERAuth.changePassword(user.id, c, n);
      submit.disabled = false;
      UI.setLabel(submit, "Змінити пароль");
      if (!res.ok) {
        ({ current, next }[res.field] || current).setError(res.message);
        ({ current, next }[res.field] || current).input.focus();
        return;
      }
      form.reset();
      form.querySelector('[name="username"]').value = user.login;
      UI.toast("Пароль змінено. Наступного разу входьте з новим.");
    });

    return UI.panel("Пароль",
      h("p", { class: "adm-note" }, "Логін: ", h("b", { text: user.login }), ". Пароль зберігається лише як хеш, відновити його не можна, тільки скинути демо-дані."),
      form
    );
  }

  /* ---------- резервна копія ---------- */
  function backupPanel() {
    const exportBtn = UI.button({
      label: "Завантажити копію",
      icon: "download",
      onClick: async () => {
        exportBtn.disabled = true;
        try {
          const data = await AVERDB.exportAll();
          UI.download("aver-backup-" + UI.todayISO() + ".json", JSON.stringify(data, null, 2));
          UI.toast("Копію збережено у файл");
        } catch (err) {
          console.error(err);
          UI.toast("Не вдалося створити копію", "error");
        }
        exportBtn.disabled = false;
      },
    });

    const file = h("input", { type: "file", accept: "application/json,.json", class: "sr-only", tabindex: "-1", "aria-hidden": "true" });
    const importBtn = UI.button({ label: "Відновити з копії", icon: "upload", onClick: () => file.click() });

    file.addEventListener("change", async () => {
      const f = file.files[0];
      file.value = "";
      if (!f) return;
      const ok = await UI.confirm({
        title: "Відновити з копії?",
        text: "Усі поточні дані (послуги, записи, тексти, фото й пароль) буде замінено вмістом файлу «" + f.name + "».",
        ok: "Замінити дані",
        danger: true,
      });
      if (!ok) return;
      try {
        const data = JSON.parse(await f.text());
        await AVERDB.importAll(data);
        UI.toast("Дані відновлено з копії");
        if (await AVERAdmin.requireUser()) AVERAdmin.refresh();
      } catch (err) {
        console.error(err);
        UI.toast(err instanceof SyntaxError ? "Файл пошкоджений: це не JSON" : err.message || "Не вдалося відновити дані", "error");
      }
    });

    return UI.panel("Резервна копія",
      h("p", { class: "adm-note", text: "Файл з усіма даними й фото. Знадобиться, щоб перенести дані в інший браузер або повернути їх після експериментів." }),
      h("div", { class: "adm-actions" }, exportBtn, importBtn),
      file
    );
  }

  /* ---------- скидання ---------- */
  function resetPanel() {
    const btn = UI.button({
      label: "Скинути демо-дані",
      icon: "reset",
      onClick: async () => {
        const ok = await UI.confirm({
          title: "Скинути демо-дані?",
          text: "Усі зміни, записи й завантажені фото зникнуть, пароль повернеться до демо (aver-demo). Скасувати цю дію не можна.",
          ok: "Скинути",
          danger: true,
        });
        if (!ok) return;
        btn.disabled = true;
        try {
          await AVERDB.reset();
          UI.toast("Тестові дані відновлено");
          if (await AVERAdmin.requireUser()) AVERAdmin.refresh();
        } catch (err) {
          console.error(err);
          UI.toast("Не вдалося скинути дані", "error");
          btn.disabled = false;
        }
      },
    });

    return UI.panel("Тестові дані",
      h("p", { class: "adm-note", text: "Це демо: дані живуть лише в цьому браузері, інші відвідувачі бачать свою копію. Скидання повертає послуги, майстрів, тексти й фото до початкових." }),
      h("div", { class: "adm-actions" }, btn)
    );
  }
})();
