# Выкладка Mito

Схема: **сайт** (статические файлы) и **прокси к Supabase** — на нашем VPS за Caddy; **бэкенд** — Supabase Cloud.
Браузер ходит только на наш домен: `https://<домен>/` — приложение, `https://<домен>/sb/…` — Supabase
(REST, Auth, Realtime). Поэтому Mito работает, даже если сам хост Supabase недоступен у пользователя.
Ссылки в письмах тоже ведут на наш домен (`/auth/confirm`).

Каждый push в `main` запускает [workflow](../.github/workflows/deploy.yml):
**проверка** (типы, линтер, тесты) → **миграции** базы → **сборка и выкладка** → проверка, что сайт отвечает.
Если проверка не прошла, ничего не выкладывается. Релизы лежат в `/var/www/mito/releases/<commit>`,
сайт переключается атомарной заменой ссылки `current`; хранятся последние пять.

## 1. Сервер (один раз)

Ubuntu 22.04/24.04, под root. Скрипт ставит Caddy, создаёт пользователя `deploy` (вход только по ключу,
права — выкладывать файлы и перезагружать Caddy) и включает файрвол (22, 80, 443).

```bash
# с вашего компьютера
scp deploy/setup-server.sh root@<IP>:/root/
# на сервере
bash /root/setup-server.sh "<публичный ключ выкладки>"
```

Ключ выкладки — отдельная пара только для GitHub Actions:
`ssh-keygen -t ed25519 -N "" -C "mito-deploy" -f ~/.ssh/mito_deploy`.
Публичная половина (`mito_deploy.pub`) — аргумент скрипта, приватная — секрет `DEPLOY_SSH_KEY`.

## 2. Supabase (один раз)

1. **Authentication → URL Configuration**
   - Site URL: `https://<домен>`
   - Redirect URLs: `https://<домен>/**`
2. **Authentication → Email Templates** — вставить шаблоны из репозитория:
   - *Magic Link* ← [`supabase/templates/magic_link.html`](../supabase/templates/magic_link.html), тема «Вход в Mito»
   - *Confirm signup* ← [`supabase/templates/confirmation.html`](../supabase/templates/confirmation.html), тема «Подтвердите почту для Mito»
3. **Connect** (кнопка вверху) → **Session pooler** → строка подключения вида
   `postgresql://postgres.<ref>:[YOUR-PASSWORD]@aws-…pooler.supabase.com:5432/postgres`.
   Подставить пароль базы (спецсимволы в пароле — URL-кодировать) → секрет `SUPABASE_DB_URL`.
   Именно pooler: прямое подключение на бесплатном тарифе доступно только по IPv6, которого нет у GitHub Actions.
4. Пока нет своего домена и SMTP: **Sign In / Providers → Email** → выключить «Confirm email»
   (шаблоны писем без своего SMTP не редактируются, а стандартные ведут на хост Supabase).
5. Позже: **Authentication → SMTP** — свой почтовый сервис (например, Resend). Встроенная почта Supabase
   отправляет лишь несколько писем в час.

Таблицы создавать вручную не нужно — их создаёт workflow из `supabase/migrations`.

## 3. GitHub → Settings → Secrets and variables → Actions

**Variables** (не секретные):

| Имя | Значение |
|---|---|
| `MITO_DOMAIN` | домен сайта без `https://` |
| `SERVER_HOST` | IP сервера |
| `SUPABASE_URL` | Project URL, `https://<ref>.supabase.co` |
| `SUPABASE_ANON_KEY` | anon / publishable key (он публичный по своей природе) |

**Secrets**:

| Имя | Значение |
|---|---|
| `DEPLOY_SSH_KEY` | содержимое приватного ключа `~/.ssh/mito_deploy` целиком |
| `SSH_KNOWN_HOSTS` | строка `ssh-keyscan -t ed25519 <IP>` (сверить отпечаток с сервером: `ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub`) |
| `SUPABASE_DB_URL` | строка подключения из шага 2.3, с паролем |
| `MENTOR_GROQ_KEY` | ключ Groq (console.groq.com → API Keys) — основной провайдер |
| `MENTOR_GEMINI_KEY` | ключ Google AI Studio (aistudio.google.com → Get API key; из РФ — через VPN) — запасной: Flash и Flash-Lite |
| `MENTOR_SALT` | необязательно: любая случайная строка для хеширования IP в счётчиках лимитов |

## AI-ментор

Сервис `server/mentor` (Node 24 запускает TypeScript напрямую) работает на том же сервере как служба
`mito-mentor` под отдельным пользователем и слушает только `127.0.0.1:8787`. Caddy отдаёт его по
`/api/*` и сам проставляет `X-Real-IP` — лимиты по IP нельзя обойти подменой заголовка.
Ключи моделей лежат в `/etc/mito/mentor.env` (права 600) — их пишет workflow из секретов.

- Установка на сервере — тот же `setup-server.sh` (повторный запуск безопасен): ставит Node 24 и службу.
  Пока службы нет, шаг выкладки ментора пропускается с предупреждением.
- Цепочка провайдеров: Groq → Gemini Flash → Gemini Flash-Lite; при лимите, перегрузке или ошибке запрос
  уходит следующему. Порядок — `MENTOR_PROVIDERS` (`groq,gemini,gemini-lite`), модели — `MENTOR_GROQ_MODEL`,
  `MENTOR_GEMINI_MODEL`, `MENTOR_GEMINI_LITE_MODEL`.
- Лимиты (переменные окружения службы): `MENTOR_IP_DAY` (60), `MENTOR_IP_MINUTE` (10),
  `MENTOR_GLOBAL_DAY` (800).
- Смена ключа (истёк или отозван): новый ключ → секрет GitHub с тем же именем → Actions → Deploy →
  Run workflow. Workflow перепишет `/etc/mito/mentor.env` и перезапустит службу.
- Логи: `journalctl -u mito-mentor -f`. Проверка: `https://<домен>/api/mentor/health`.
- Локально: `npm run mentor` (ключи `MENTOR_GEMINI_KEY` / `MENTOR_GROQ_KEY` в `.env.local`; без ключей —
  встроенный тестовый провайдер), Vite проксирует `/api` на него.

## 4. Выкладка

Push в `main` или **Actions → Deploy → Run workflow**. Ход — во вкладке Actions.

## Обслуживание

- Логи веб-сервера: `journalctl -u caddy -f`
- Откат: на сервере `ls -1t /var/www/mito/releases`, затем
  `ln -sfn /var/www/mito/releases/<commit> /var/www/mito/current` — Caddy подхватит сразу.
- Смена домена: поменять `MITO_DOMAIN` и настройки из шага 2.1, перезапустить workflow. HTTPS-сертификат
  Caddy выпустит сам.

## Локальная разработка

Docker Desktop → `npm run db:start` → `npm run dev`. Ключи локального Supabase — в `.env.local`
(см. `.env.example`). Письма локально: http://127.0.0.1:54324.
