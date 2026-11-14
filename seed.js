/*
 * AVER: ТЕСТОВІ ДАНІ ДЛЯ ДЕМО
 * ---------------------------------------------------------------
 * Усі послуги, ціни, майстри, відгуки й контакти вигадані.
 * Цей файл потрібен лише один раз: коли база в браузері порожня
 * або коли в адмінці натиснули «Скинути демо-дані».
 * Звичайні зміни робіть в адмінці (/admin/), а не тут.
 *
 * Позначки в текстах:  ~  нерозривний пробіл,  \n  перенос рядка (<br>).
 * Демо-вхід в адмінку: admin / aver-demo (у базі лише хеш пароля).
 */
(function () {
  const nb = (s) => s.replace(/~/g, " ");
  const auto = (s) => (window.AVERText ? window.AVERText.nbsp(s) : s);

  const hairLength = (adds) => ({
    id: "length",
    label: "Довжина волосся",
    choices: [
      { label: "Коротке, до плечей", add: adds[0] },
      { label: "Середнє, до лопаток", add: adds[1] },
      { label: "Довге, до талії", add: adds[2] },
      { label: "Дуже довге, нижче талії", add: adds[3] },
    ],
  });
  const nailDesign = () => ({
    id: "design",
    label: "Дизайн",
    choices: [
      { label: "Без дизайну", add: 0 },
      { label: "Мінімалістичний", add: 150 },
      { label: "Складний", add: 350 },
    ],
  });
  const removal = () => ({
    id: "removal",
    label: "Старе покриття",
    choices: [
      { label: "Немає, нігті чисті", add: 0 },
      { label: "Потрібно зняти", add: 200 },
    ],
  });

  // [id, категорія, назва, хвилин, ціна, "від", параметри, опис]
  const SERVICES = [
    ["haircut-women", "hair", "Жіноча стрижка", 60, 900, true, [hairLength([0, 200, 400, 600])], "Консультація, миття, стрижка й укладання феном."],
    ["haircut-men", "hair", "Чоловіча стрижка", 45, 600, false, [], "Стрижка машинкою й ножицями, миття голови, укладання."],
    ["color-one", "hair", "Фарбування в один тон", 120, 1800, true, [hairLength([0, 600, 1200, 1800])], "Рівний колір від коренів до кінчиків і догляд після фарбування."],
    ["color-airtouch", "hair", "Складне фарбування AirTouch", 240, 4200, true, [hairLength([0, 1000, 2000, 3000])], "М'які переходи кольору без різких меж, тонування й догляд."],
    ["care-botox", "hair", "Відновлення та ботокс для волосся", 90, 1800, true, [hairLength([0, 400, 800, 1200])], "Глибоке відновлення сухого й пошкодженого волосся."],
    ["styling", "hair", "Укладання", 45, 700, true, [hairLength([0, 150, 300, 450])], "Локони, об'єм або гладке волосся для події чи фотосесії."],

    ["manicure", "nails", "Манікюр з покриттям", 90, 750, false, [nailDesign(), removal()], "Комбінований манікюр, вирівнювання й покриття гель-лаком."],
    ["pedicure", "nails", "Педикюр з покриттям", 90, 900, false, [removal()], "Обробка стоп і нігтів, покриття гель-лаком."],
    ["nail-extension", "nails", "Нарощування нігтів", 150, 1300, false, [
      { id: "length", label: "Довжина нігтів", choices: [
        { label: "Коротка", add: 0 }, { label: "Середня", add: 200 }, { label: "Довга", add: 400 },
      ] },
      nailDesign(),
    ], "Нарощування на форми, моделювання й покриття."],
    ["nail-removal", "nails", "Зняття покриття", 30, 200, false, [], "Акуратне зняття без шкоди для нігтя."],

    ["face-cleaning", "face", "Комбінована чистка обличчя", 75, 1400, false, [], "Ультразвукова й механічна чистка, заспокійлива маска."],
    ["peeling", "face", "Пілінг", 45, 1200, false, [], "Кислотний пілінг під тип шкіри й поради щодо домашнього догляду."],
    ["face-massage", "face", "Масаж обличчя", 45, 600, false, [], "Ручний лімфодренажний масаж для тонусу й свіжого кольору обличчя."],
    ["makeup", "face", "Вечірній макіяж", 60, 1500, false, [
      { id: "lashes", label: "Вії", choices: [
        { label: "Без накладних вій", add: 0 }, { label: "Накладні пучки", add: 200 },
      ] },
    ], "Стійкий макіяж для події й фото, без корекцій до вечора."],

    ["brow-lamination", "brows", "Ламінування брів", 60, 700, false, [
      { id: "tint", label: "Фарбування", choices: [
        { label: "Без фарбування", add: 0 }, { label: "З фарбуванням", add: 200 },
      ] },
    ], "Фіксація форми, живлення волосків і корекція."],
    ["lash-lamination", "brows", "Ламінування вій", 60, 850, false, [], "Підкручування й живлення власних вій."],
    ["lash-extension", "brows", "Нарощування вій", 120, 1100, false, [
      { id: "volume", label: "Об'єм", choices: [
        { label: "Класика", add: 0 }, { label: "2D", add: 200 }, { label: "3D", add: 400 },
      ] },
    ], "Поштучне нарощування, підбір вигину й довжини."],
  ];

  const MASTERS = [
    { id: "m-olena", name: "Олена Бондар", role: "Засновниця, стиліст-колорист", specialty: "Складне фарбування, блонд, AirTouch", experience_years: 12,
      service_ids: ["haircut-women", "color-one", "color-airtouch", "care-botox"] },
    { id: "m-maria", name: "Марія Коваленко", role: "Топ-стиліст", specialty: "Стрижки, укладання, відновлення волосся", experience_years: 9,
      service_ids: ["haircut-women", "haircut-men", "color-one", "care-botox", "styling"] },
    { id: "m-sofia", name: "Софія Мельник", role: "Майстер нігтьового сервісу", specialty: "Манікюр, педикюр, нарощування", experience_years: 8,
      service_ids: ["manicure", "pedicure", "nail-extension", "nail-removal"] },
    { id: "m-daryna", name: "Дарина Шевчук", role: "Бровист і~лешмейкер", specialty: "Ламінування брів і~вій, нарощування вій", experience_years: 7,
      service_ids: ["brow-lamination", "lash-lamination", "lash-extension"] },
    { id: "m-anna", name: "Анна Ткаченко", role: "Косметолог", specialty: "Чистки, пілінги, масаж обличчя", experience_years: 10,
      service_ids: ["face-cleaning", "peeling", "face-massage"], work_days: [1, 2, 3, 4, 5] },
    { id: "m-iryna", name: "Ірина Лисенко", role: "Візажист", specialty: "Вечірній і~весільний макіяж", experience_years: 7,
      service_ids: ["makeup"], work_days: [3, 4, 5, 6] },
  ];

  // Вигадані клієнти для тестових записів (телефони навмисно неробочі)
  const CLIENTS = [
    "Катерина Дмитренко", "Юлія Мороз", "Ольга Петренко", "Вікторія Савчук", "Наталія Кравець", "Ірина Захарченко",
    "Анастасія Гуменюк", "Олена Литвин", "Тетяна Руденко", "Марина Остапчук", "Діана Левченко", "Христина Федорук",
    "Софія Ковальчук", "Аліна Пономаренко", "Яна Білик", "Оксана Гаврилюк", "Дарина Сидоренко", "Людмила Яковенко",
    "Андрій Бойко", "Максим Ткачук", "Вероніка Шевченко", "Інна Мельничук", "Галина Степаненко", "Роксолана Іваницька",
  ];
  const COMMENTS = ["Перший візит", "Прошу без парфумованих засобів", "Можливо, запізнюся на 5 хвилин", "Хочу так само, як минулого разу", "Чутлива шкіра"];

  // Детермінований генератор: однаковий день запуску = однакові тестові записи
  function seededRandom(seedText) {
    let h = 2166136261;
    for (let i = 0; i < seedText.length; i++) {
      h ^= seedText.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return () => {
      h += 0x6d2b79f5;
      let t = h;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /*
   * Тестові записи: 7 днів назад і 14 уперед. Кожен майстер заповнює свій день
   * по черзі (процедура, перерва, процедура...), тому накладок немає за побудовою.
   */
  function makeBookings(todayISO, nowMin, services, masters, settings, closures) {
    const S = window.AVERSchedule;
    const out = [];
    const codes = new Set();
    const svcById = new Map(services.map((s) => [s.id, s]));
    let clientN = 0;

    for (let off = -7; off < 14; off++) {
      const date = S.addDays(todayISO, off);
      const hours = S.dayHours(date, settings, closures);
      if (!hours) continue;
      masters.forEach((m) => {
        if (!S.masterWorks(m, date)) return;
        const rnd = seededRandom("aver" + date + m.id);
        // ближчі дні заповнені щільніше, далекі майже вільні
        const busy = off < 0 ? 0.75 : Math.max(0.15, 0.7 - off * 0.04);
        let t = hours[0] + Math.floor(rnd() * 3) * 30;
        while (t < hours[1]) {
          const svc = svcById.get(m.service_ids[Math.floor(rnd() * m.service_ids.length)]);
          if (!svc || t + svc.duration_min > hours[1]) break;
          if (rnd() > busy) {
            t += 30 + Math.floor(rnd() * 3) * 30;
            continue;
          }
          const choices = {};
          svc.options.forEach((g) => (choices[g.id] = Math.floor(rnd() * g.choices.length)));
          const past = off < 0 || (off === 0 && t + svc.duration_min <= nowMin);
          const r = rnd();
          const status = past ? (r < 0.1 ? "cancelled" : "confirmed") : r < 0.07 ? "new" : r < 0.93 ? "confirmed" : "cancelled";
          let code;
          do code = "AV-" + (1000 + Math.floor(rnd() * 9000));
          while (codes.has(code));
          codes.add(code);
          const ci = clientN++ % CLIENTS.length;
          const created = new Date(S.fromISO(S.addDays(date, -1 - Math.floor(rnd() * 9))).getTime() + (9 + Math.floor(rnd() * 10)) * 3600000);
          out.push({
            id: "b-" + date + "-" + m.id + "-" + t,
            code,
            service_id: svc.id,
            service_name: svc.name,
            options_text: S.optionsText(svc, choices),
            choices,
            master_id: m.id,
            date,
            start_min: t,
            duration_min: svc.duration_min,
            price: S.priceFor(svc, choices),
            client_name: CLIENTS[ci],
            client_phone: "+380 00 000 " + String(10 + ci).padStart(2, "0") + " " + String((ci * 29 + 11) % 100).padStart(2, "0"),
            comment: rnd() < 0.15 ? COMMENTS[Math.floor(rnd() * COMMENTS.length)] : "",
            status,
            source: rnd() < 0.6 ? "site" : "admin",
            created_at: created.toISOString(),
            updated_at: created.toISOString(),
          });
          t += svc.duration_min + Math.floor(rnd() * 3) * 30;
        }
      });
    }
    return out;
  }

  // [файл, ширина, висота, alt, підпис, майстер, точка фокусу по вертикалі у % (щоб у кадрі 4:5 не відрізало обличчя)]
  const WORKS = [
    ["work-1.jpg", 1000, 1500, "Фарбування волосся із фольгою, світле волосся", "Фарбування волосся", "m-olena", 28],
    ["work-2.jpg", 1000, 1777, "Дівчина з довгим кучерявим волоссям каштанового кольору", "Локони й~укладання", "m-maria", 24],
    ["work-3.jpg", 1000, 1333, "Майстер наносить червоний гель-лак", "Манікюр з~гель-лаком", "m-sofia", 50],
    ["work-4.jpg", 1000, 1777, "Майстер у чорних рукавичках готує очі клієнтки до ламінування вій", "Ламінування вій", "m-daryna", 30],
    ["work-5.jpg", 1000, 1636, "Дівчина вирівнює волосся праскою перед дзеркалом, чорно-біле фото", "Укладання волосся", "m-maria", 42],
    ["work-6.jpg", 1000, 1779, "Майстер робить педикюр, крупний план", "Педикюр", "m-sofia", 45],
  ];

  const SALON = [
    ["salon-1.jpg", 1200, 1800, "Стиліст біля зони миття голови, світла стіна з картиною", "Зал стилістів",
      "Просторий зал із~зонами миття й~укладання, світлими стінами та~живими рослинами. Ми не~записуємо гостей упритул, тож у~залі завжди спокійно."],
    ["salon-2.jpg", 1800, 1201, "Зона манікюру й педикюру з арочним вікном", "Манікюр і~педикюр",
      "Окремі станції для~кожного майстра та~арочні вікна з~денним світлом. Інструменти проходять три етапи обробки, а~крафт-пакет ми відкриваємо у~вас на~очах."],
    ["salon-3.jpg", 1800, 1200, "Світлий кабінет догляду з рожевими жалюзі й масажним столом", "Кабінет догляду",
      "Світла приватна кімната для~процедур обличчя, зачинені двері й~тиша."],
    ["salon-4.jpg", 1200, 1800, "Полиці з професійною косметикою для догляду", "Професійна косметика",
      "Засоби, якими ми~працюємо, стоять на~полицях у~залі: майстер покаже, що підійде саме вам."],
  ];

  const REVIEWS = [
    ["Катерина Д.", "Складне фарбування AirTouch", "Нарешті блонд без~жовтизни і~з~живими кінчиками. Олена пояснила кожен крок і~порадила домашній догляд, який справді працює."],
    ["Юлія М.", "Манікюр з~покриттям", "Манікюр тримається три тижні без~жодного відколу. Окремо дякую за~тишу: це єдина година на~тижні, коли я~відпочиваю."],
    ["Ольга П.", "Комбінована чистка обличчя", "Анна дуже делікатна. Шкіра після чистки рівна, без~почервоніння, а~в~кабінеті так затишно, що я~майже заснула."],
    ["Вікторія С.", "Вечірній макіяж", "Макіяж на~весілля сестри протримався до~ранку. Ірина почула, що я~хочу природний образ, і~зробила саме так."],
    ["Наталія К.", "Ламінування вій", "Записалася онлайн за~хвилину, прийшла, і~мене не~змусили чекати. Вії виглядають доглянутими, а~не~штучними."],
  ];

  const WHY = [
    ["Досвідчені майстри", "Кожен майстер має досвід від~семи років і~щороку проходить навчання з~нових технік."],
    ["Професійна косметика", "Працюємо з~італійськими та~французькими брендами салонного догляду і~радимо лише те, чим користуємося самі."],
    ["Стерильність без~компромісів", "Три етапи обробки інструментів, одноразові пилки й~крафт-пакети, які відкриваємо у~вас на~очах."],
    ["Чесна ціна", "Вартість називаємо до~початку процедури. Жодних доплат, про~які ви дізнаєтеся вже на~касі."],
    ["Ваш час", "Не~записуємо впритул і~не~поспішаємо. Онлайн-запис працює цілодобово."],
  ];

  function build(today) {
    const now = today.toISOString();
    const S = window.AVERSchedule;
    const todayISO = S.toISO(today);
    const nowMin = today.getHours() * 60 + today.getMinutes();

    const services = SERVICES.map(([id, cat, name, min, price, from, options, desc], i) => ({
      id,
      category_id: cat,
      name,
      description: auto(desc),
      price,
      price_from: from,
      duration_min: min,
      options,
      sort: i,
      visible: true,
    }));

    const photo = (album, i, [file, width, height, alt]) => ({
      id: album + "-" + (i + 1),
      album,
      src: "assets/photos/" + file,
      width,
      height,
      alt,
      sort: i,
      visible: true,
    });

    const settings = {
      id: "main",
      // 0 = неділя ... 6 = субота; null = вихідний
      hours: { 0: null, 1: ["09:00", "20:00"], 2: ["09:00", "20:00"], 3: ["09:00", "20:00"], 4: ["09:00", "20:00"], 5: ["09:00", "20:00"], 6: ["09:00", "20:00"] },
      slot_step: 30, // крок вибору часу, хвилин
      days_ahead: 14, // на скільки днів уперед можна записатися
      lead_min: 60, // сьогодні: не раніше ніж за стільки хвилин
    };

    // приклад винятку: скорочений день через 9 днів (якщо це не неділя)
    let shortDay = S.addDays(todayISO, 9);
    if (S.weekday(shortDay) === 0) shortDay = S.addDays(shortDay, 1);
    const closures = [{ id: "c-1", date: shortDay, open: "10:00", close: "16:00", note: "Скорочений день: навчання команди" }];

    const masters = MASTERS.map((m, i) => ({
      work_days: [1, 2, 3, 4, 5, 6],
      ...m,
      role: nb(m.role),
      specialty: nb(m.specialty),
      photo: "",
      sort: i,
      visible: true,
    }));

    return {
      users: [{
        id: "u-admin",
        login: "admin",
        name: "Адміністратор",
        // PBKDF2-SHA256 від пароля "aver-demo", сам пароль ніде не зберігається
        password_hash: "W9PKxjy78hI6pWQnwEGbKBmSfKxcKXzpJ5P1UE+V6O8=",
        salt: "Gc5ZO5mvahaCCkLzlpPFQQ==",
        iterations: 210000,
        created_at: now,
      }],

      settings: [settings],

      closures,

      categories: [
        { id: "hair", name: "Волосся", sort: 0, visible: true },
        { id: "nails", name: "Нігті", sort: 1, visible: true },
        { id: "face", name: "Обличчя та макіяж", sort: 2, visible: true },
        { id: "brows", name: "Брови та вії", sort: 3, visible: true },
      ],

      services,

      masters,

      bookings: makeBookings(todayISO, nowMin, services, masters, settings, closures),

      photos: [
        ...WORKS.map((w, i) => ({ ...photo("works", i, w), caption: nb(w[4]), master_id: w[5], focus_y: w[6] })),
        ...SALON.map((s, i) => ({ ...photo("salon", i, s), title: nb(s[4]), text: nb(s[5]), focus_y: 50 })),
      ],

      reviews: REVIEWS.map(([author, service, text], i) => ({
        id: "r-" + (i + 1),
        author,
        service_label: nb(service),
        text: nb(text),
        visible: true,
        sort: i,
        created_at: now,
      })),

      content: [{
        id: "main",
        hero: {
          label: nb("Салон краси у~Львові / вул.~Тестова,~12"),
          sub: nb("Преміальний догляд за~волоссям,\nнігтями й~обличчям без~поспіху"),
          note: nb("Онлайн-запис за~1~хвилину"),
        },
        sections: {
          services: {
            title: nb("Послуги\nта~ціни"),
            lead: nb("Ціни вказані за~базову процедуру. Вартість фарбування й~догляду залежить від~довжини волосся, майстер назве її до~початку роботи."),
            note: nb("Майстра можна обрати під~час онлайн-запису."),
          },
          works: {
            title: nb("Роботи\nнаших майстрів"),
            lead: nb("Кадри з~щоденної роботи наших майстрів: колір, укладання, манікюр і~догляд."),
          },
          salon: {
            title: nb("Тихий простір\nу~центрі Львова"),
            lead: nb("Чотири зони на~одному поверсі старого будинку: світло з~вікон, тепле дерево й~жодної музики, яку треба перекрикувати."),
          },
          reviews: {
            title: nb("Що кажуть\nнаші гості"),
            lead: nb("Відгуки, які гості залишили після візиту. Ми нічого не~скорочували й~не~редагували."),
          },
          why: {
            title: nb("Чому гості\nповертаються"),
          },
          team: {
            title: nb("Команда\nмайстрів"),
            lead: nb("Шестеро майстрів, кожен відповідає за~свій напрям. Хочете до~когось конкретного? Оберіть майстра під~час онлайн-запису."),
          },
          cta: {
            title: nb("Час подбати\nпро~себе"),
            lead: nb("Оберіть процедуру та~вільний час онлайн або~зателефонуйте, і~ми підберемо зручний день."),
          },
        },
        story: nb("AVER відкрився у~2019~році як~невелика студія колориста Олени Бондар. Сьогодні це шестеро майстрів, чотири зони й~та~сама ідея: доглянутий вигляд без~поспіху та~зайвого шуму."),
        why: WHY.map(([title, text], i) => ({ id: "w-" + (i + 1), title: nb(title), text: nb(text) })),
        contacts: {
          phones: ["+380 00 000 00 00", "+380 00 000 00 01"],
          email: "hello@aver.example",
          city: "Львів",
          street: "вул. Тестова, 12",
          map_url: "https://www.google.com/maps/search/?api=1&query=%D0%9B%D1%8C%D0%B2%D1%96%D0%B2",
        },
        socials: {
          instagram: "https://www.instagram.com/",
          telegram: "https://t.me/",
          facebook: "https://www.facebook.com/",
        },
      }],

      files: [],
    };
  }

  window.AVER_SEED = { build };
})();
