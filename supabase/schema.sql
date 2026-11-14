-- =========================================================
-- AVER: структура бази для Supabase (Postgres)
-- Виконати один раз: Supabase → SQL Editor → вставити → Run.
--
-- Таблиці й поля ті самі, що в демо-базі браузера (db-local.js),
-- тому сайт і адмінка не міняються, міняється лише адаптер.
--
-- УВАГА: файл написано без доступу до живого Supabase і не запускався.
-- Перед справжнім запуском перевірте на тестовому проєкті.
-- =========================================================

create extension if not exists btree_gist;   -- для заборони накладок записів
create extension if not exists pgcrypto;     -- gen_random_uuid()

-- ---------- адміністратори ----------
-- Паролі зберігає й перевіряє Supabase Auth (bcrypt на сервері).
-- Тут лише список, хто з користувачів Auth має доступ до адмінки.
create table if not exists admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  name    text not null default 'Адміністратор'
);

create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from admins where user_id = auth.uid());
$$;

-- ---------- налаштування розкладу (один рядок) ----------
create table if not exists settings (
  id         text primary key default 'main' check (id = 'main'),
  hours      jsonb not null,               -- {"0": null, "1": ["09:00","20:00"], ...}, 0 = неділя
  slot_step  int  not null default 30  check (slot_step between 5 and 120),
  days_ahead int  not null default 14  check (days_ahead between 1 and 90),
  lead_min   int  not null default 60  check (lead_min between 0 and 1440)
);

-- вихідні й скорочені дні
create table if not exists closures (
  id    text primary key default gen_random_uuid()::text,
  date  date not null unique,
  open  text,                              -- "10:00" або null = вихідний
  close text,
  note  text not null default '',
  -- або обидва поля (скорочений день), або жодного (вихідний)
  check ((open is null) = (close is null))
);

-- ---------- послуги ----------
create table if not exists categories (
  id      text primary key default gen_random_uuid()::text,
  name    text not null,
  sort    int  not null default 0,
  visible boolean not null default true
);

create table if not exists services (
  id           text primary key default gen_random_uuid()::text,
  category_id  text not null references categories (id) on delete restrict,
  name         text not null,
  description  text not null default '',
  price        int  not null check (price >= 0),          -- гривні
  price_from   boolean not null default false,            -- "від ... ₴"
  duration_min int  not null check (duration_min between 5 and 720),
  options      jsonb not null default '[]',               -- [{id,label,choices:[{label,add}]}]
  sort         int  not null default 0,
  visible      boolean not null default true
);

create table if not exists masters (
  id               text primary key default gen_random_uuid()::text,
  name             text not null,
  role             text not null default '',
  specialty        text not null default '',
  experience_years int  not null default 0,
  photo            text not null default '',              -- шлях у Storage
  service_ids      text[] not null default '{}',
  work_days        int[]  not null default '{1,2,3,4,5,6}', -- 0 = неділя
  sort             int  not null default 0,
  visible          boolean not null default true
);

-- ---------- записи ----------
create table if not exists bookings (
  id           text primary key default gen_random_uuid()::text,
  code         text not null unique,                      -- AV-1234
  service_id   text references services (id) on delete set null,
  service_name text not null,                             -- знімок назви на момент запису
  options_text text not null default '',
  choices      jsonb not null default '{}',               -- {"length": 1} = обраний варіант у кожній групі
  -- майстра видалили: старі записи лишаються в історії без майстра
  -- (адмінка не дає видалити майстра, поки в нього є майбутні записи)
  master_id    text references masters (id) on delete set null,
  date         date not null,                             -- день у часі салону (Київ)
  start_min    int  not null check (start_min between 0 and 1439),
  duration_min int  not null check (duration_min > 0),
  price        int  not null default 0,
  client_name  text not null,
  client_phone text not null,
  comment      text not null default '',
  status       text not null default 'new' check (status in ('new', 'confirmed', 'cancelled')),
  source       text not null default 'site' check (source in ('site', 'admin')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  slot         int4range generated always as (int4range(start_min, start_min + duration_min)) stored,

  -- ГОЛОВНЕ ПРАВИЛО: два активні записи до одного майстра не можуть перетинатися в часі.
  -- База відхилить такий запис навіть якщо двоє натиснуть «Записатися» одночасно.
  constraint bookings_no_overlap exclude using gist (
    master_id with =, date with =, slot with &&
  ) where (status <> 'cancelled')
);

create index if not exists bookings_date_idx on bookings (date);

-- ---------- фото, відгуки, тексти ----------
create table if not exists photos (
  id        text primary key default gen_random_uuid()::text,
  album     text not null check (album in ('works', 'salon')),
  src       text not null,
  width     int  not null default 0,
  height    int  not null default 0,
  alt       text not null,
  caption   text not null default '',                     -- для робіт
  master_id text references masters (id) on delete set null,
  focus_y   int  not null default 50 check (focus_y between 0 and 100), -- точка кадрування по вертикалі, %
  title     text not null default '',                     -- для салону
  text      text not null default '',
  sort      int  not null default 0,
  visible   boolean not null default true
);

create table if not exists reviews (
  id            text primary key default gen_random_uuid()::text,
  author        text not null,
  service_label text not null default '',
  text          text not null,
  visible       boolean not null default true,
  sort          int  not null default 0,
  created_at    timestamptz not null default now()
);

create table if not exists content (
  id       text primary key default 'main' check (id = 'main'),
  hero     jsonb not null default '{}',
  sections jsonb not null default '{}',
  story    text  not null default '',
  why      jsonb not null default '[]',
  contacts jsonb not null default '{}',
  socials  jsonb not null default '{}'
);

-- =========================================================
-- Права доступу (RLS)
-- Відвідувач сайту: читає лише видимі дані, записів не бачить.
-- Адмін (є в таблиці admins): читає й змінює все.
-- =========================================================
alter table admins     enable row level security;
alter table settings   enable row level security;
alter table closures   enable row level security;
alter table categories enable row level security;
alter table services   enable row level security;
alter table masters    enable row level security;
alter table bookings   enable row level security;
alter table photos     enable row level security;
alter table reviews    enable row level security;
alter table content    enable row level security;

drop policy if exists "admins: свій рядок" on admins;
create policy "admins: свій рядок" on admins for select using (user_id = auth.uid());

drop policy if exists "публічне читання" on settings;
create policy "публічне читання" on settings   for select using (true);
drop policy if exists "публічне читання" on closures;
create policy "публічне читання" on closures   for select using (true);
drop policy if exists "публічне читання" on content;
create policy "публічне читання" on content    for select using (true);
drop policy if exists "публічне читання" on categories;
create policy "публічне читання" on categories for select using (visible or is_admin());
drop policy if exists "публічне читання" on services;
create policy "публічне читання" on services   for select using (visible or is_admin());
drop policy if exists "публічне читання" on masters;
create policy "публічне читання" on masters    for select using (visible or is_admin());
drop policy if exists "публічне читання" on photos;
create policy "публічне читання" on photos     for select using (visible or is_admin());
drop policy if exists "публічне читання" on reviews;
create policy "публічне читання" on reviews    for select using (visible or is_admin());

drop policy if exists "адмін змінює" on settings;
create policy "адмін змінює" on settings   for all using (is_admin()) with check (is_admin());
drop policy if exists "адмін змінює" on closures;
create policy "адмін змінює" on closures   for all using (is_admin()) with check (is_admin());
drop policy if exists "адмін змінює" on content;
create policy "адмін змінює" on content    for all using (is_admin()) with check (is_admin());
drop policy if exists "адмін змінює" on categories;
create policy "адмін змінює" on categories for all using (is_admin()) with check (is_admin());
drop policy if exists "адмін змінює" on services;
create policy "адмін змінює" on services   for all using (is_admin()) with check (is_admin());
drop policy if exists "адмін змінює" on masters;
create policy "адмін змінює" on masters    for all using (is_admin()) with check (is_admin());
drop policy if exists "адмін змінює" on photos;
create policy "адмін змінює" on photos     for all using (is_admin()) with check (is_admin());
drop policy if exists "адмін змінює" on reviews;
create policy "адмін змінює" on reviews    for all using (is_admin()) with check (is_admin());
-- записи (імена й телефони клієнтів) бачить і змінює лише адмін
drop policy if exists "адмін змінює" on bookings;
create policy "адмін змінює" on bookings   for all using (is_admin()) with check (is_admin());

-- =========================================================
-- Функції для сайту (відвідувач не має прямого доступу до bookings)
-- =========================================================

-- Зайнятий час на дату: лише проміжки, без імен і телефонів
create or replace function busy_slots(p_date date)
returns table (master_id text, start_min int, end_min int)
language sql stable security definer set search_path = public, pg_temp as $$
  select b.master_id, b.start_min, b.start_min + b.duration_min
  from bookings b
  where b.date = p_date and b.status <> 'cancelled';
$$;

-- Запис із сайту. Ціну, тривалість і майстра рахує сервер (браузеру не довіряємо).
-- Те саме, що AVERDB.createBooking у db-local.js, з тими самими кодами помилок:
--   bad_name, bad_phone, bad_choice, service_not_found, slot_taken
-- (slot_taken = цей час недоступний з будь-якої причини: зайнято, вихідний,
--  поза годинами, не по сітці слотів, замало часу до візиту, задалеко наперед;
--  сайт тоді просто просить обрати інший час).
-- p_choices: {"length": 1, "design": 0} = індекс обраного варіанта в кожній групі
-- p_master_id: null = будь-який вільний майстер
-- Повертає {"code": "AV-1234", "master_id": "m-anna"}: сайт показує, до кого записано.
-- стара версія повертала text: тип результату через create or replace не змінити
drop function if exists create_booking(text, text, date, int, jsonb, text, text, text);
create or replace function create_booking(
  p_service_id text, p_master_id text, p_date date, p_start_min int,
  p_choices jsonb, p_client_name text, p_client_phone text, p_comment text
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  s        services;
  st       settings;
  g        jsonb;
  ch       jsonb;
  v_raw    text;
  v_label  text;
  v_price  int;
  v_text   text := '';
  v_hours  jsonb;
  v_open   int;
  v_close  int;
  v_master text;
  v_code   text;
  v_kyiv   timestamp := now() at time zone 'Europe/Kyiv';
  v_today  date := (now() at time zone 'Europe/Kyiv')::date;
  v_dow    int;
  v_try    int;
  c        closures;
begin
  -- клієнт
  if length(trim(coalesce(p_client_name, ''))) not between 2 and 60 then raise exception 'bad_name'; end if;
  if length(coalesce(p_client_phone, '')) > 20
     or regexp_replace(coalesce(p_client_phone, ''), '\D', '', 'g') !~ '^380[0-9]{9}$' then raise exception 'bad_phone'; end if;
  if p_date is null or p_start_min is null then raise exception 'slot_taken'; end if;
  v_dow := extract(dow from p_date)::int;

  select * into s from services where id = p_service_id and visible;
  if not found then raise exception 'service_not_found'; end if;
  select * into st from settings where id = 'main';

  -- ціна й опис обраних параметрів; індекс лише ціле число >= 0 у межах списку
  if p_choices is not null and jsonb_typeof(p_choices) <> 'object' then raise exception 'bad_choice'; end if;
  v_price := s.price;
  for g in select * from jsonb_array_elements(s.options) loop
    v_raw := p_choices ->> (g ->> 'id');
    if v_raw is not null and v_raw !~ '^[0-9]{1,3}$' then raise exception 'bad_choice'; end if;
    ch := g -> 'choices' -> coalesce(v_raw::int, 0);
    if ch is null then raise exception 'bad_choice'; end if;
    v_price := v_price + coalesce((ch ->> 'add')::int, 0);
    v_label := coalesce(ch ->> 'label', '');
    -- як optionsText у schedule.js: з малої лише перша літера ("2D" лишається "2D")
    v_text := v_text || case when v_text = '' then '' else '; ' end
              || (g ->> 'label') || ': ' || lower(left(v_label, 1)) || substr(v_label, 2);
  end loop;
  if v_text = '' then v_text := 'без додаткових параметрів'; end if;

  -- робочі години з урахуванням винятків
  select * into c from closures where date = p_date;
  if found then
    if c.open is null then raise exception 'slot_taken'; end if;  -- вихідний
    v_open := split_part(c.open, ':', 1)::int * 60 + split_part(c.open, ':', 2)::int;
    v_close := split_part(c.close, ':', 1)::int * 60 + split_part(c.close, ':', 2)::int;
  else
    v_hours := st.hours -> v_dow::text;
    if v_hours is null or v_hours = 'null'::jsonb then raise exception 'slot_taken'; end if;
    v_open := split_part(v_hours ->> 0, ':', 1)::int * 60 + split_part(v_hours ->> 0, ':', 2)::int;
    v_close := split_part(v_hours ->> 1, ':', 1)::int * 60 + split_part(v_hours ->> 1, ':', 2)::int;
  end if;
  -- у межах годин і рівно по сітці слотів (як freeSlots у schedule.js)
  if p_start_min < v_open or p_start_min + s.duration_min > v_close
     or mod(p_start_min - v_open, st.slot_step) <> 0 then raise exception 'slot_taken'; end if;
  -- минулі дні закриті; сьогодні не раніше ніж за lead_min; днів наперед: days_ahead, рахуючи сьогодні
  if p_date < v_today or p_date >= v_today + st.days_ahead then raise exception 'slot_taken'; end if;
  if p_date = v_today
     and p_start_min < extract(hour from v_kyiv)::int * 60 + extract(minute from v_kyiv)::int + st.lead_min
  then raise exception 'slot_taken'; end if;

  -- Майстер: обраний або перший вільний. Якщо двоє одночасно взяли того самого
  -- "будь-якого" майстра, база відхилить другого (exclusion_violation), і ми
  -- пробуємо наступного вільного. Повтор при unique_violation = збіг номера запису.
  for v_try in 1..5 loop
    select m.id into v_master
    from masters m
    where m.visible
      and p_service_id = any (m.service_ids)
      and v_dow = any (m.work_days)
      and (p_master_id is null or m.id = p_master_id)
      and not exists (
        select 1 from bookings b
        where b.master_id = m.id and b.date = p_date and b.status <> 'cancelled'
          and b.slot && int4range(p_start_min, p_start_min + s.duration_min)
      )
    order by m.sort
    limit 1;
    if v_master is null then raise exception 'slot_taken'; end if;

    -- номер запису: чотири цифри, а коли їх майже не лишилось, шість (як newCode у schedule.js)
    v_code := null;
    for i in 1..50 loop
      v_code := 'AV-' || (1000 + floor(random() * 9000))::int;
      exit when not exists (select 1 from bookings where code = v_code);
      v_code := null;
    end loop;
    if v_code is null then v_code := 'AV-' || (100000 + floor(random() * 900000))::int; end if;

    begin
      insert into bookings (code, service_id, service_name, options_text, choices, master_id, date, start_min,
                            duration_min, price, client_name, client_phone, comment, status, source)
      values (v_code, s.id, s.name, v_text, coalesce(p_choices, '{}'::jsonb), v_master, p_date, p_start_min,
              s.duration_min, v_price, trim(p_client_name), p_client_phone, left(trim(coalesce(p_comment, '')), 500),
              'new', 'site');
      return jsonb_build_object('code', v_code, 'master_id', v_master);
    exception
      when exclusion_violation or unique_violation then
        null; -- хтось устиг між перевіркою і вставкою: наступна спроба бачить його запис
    end;
  end loop;
  raise exception 'slot_taken';
end;
$$;

grant execute on function busy_slots(date) to anon, authenticated;
grant execute on function create_booking(text, text, date, int, jsonb, text, text, text) to anon, authenticated;

-- =========================================================
-- Фото: Storage → бакет "photos" (Public). Завантажувати може лише адмін.
-- =========================================================
insert into storage.buckets (id, name, public) values ('photos', 'photos', true)
on conflict (id) do nothing;

drop policy if exists "photos: адмін завантажує" on storage.objects;
create policy "photos: адмін завантажує" on storage.objects for insert
  with check (bucket_id = 'photos' and is_admin());
drop policy if exists "photos: адмін змінює" on storage.objects;
create policy "photos: адмін змінює" on storage.objects for update
  using (bucket_id = 'photos' and is_admin());
drop policy if exists "photos: адмін видаляє" on storage.objects;
create policy "photos: адмін видаляє" on storage.objects for delete
  using (bucket_id = 'photos' and is_admin());
