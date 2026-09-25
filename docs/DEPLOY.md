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
3. **Account → Access Tokens** — создать токен для GitHub Actions (секрет `SUPABASE_ACCESS_TOKEN`).
4. Позже: **Authentication → SMTP** — свой почтовый сервис (например, Resend). Встроенная почта Supabase
   отправляет лишь несколько писем в час.

Таблицы создавать вручную не нужно — их создаёт workflow из `supabase/migrations`.

## 3. GitHub → Settings → Secrets and variables → Actions

**Variables** (не секретные):

| Имя | Значение |
|---|---|
| `MITO_DOMAIN` | домен сайта без `https://` |
| `SERVER_HOST` | IP сервера |
| `SUPABASE_URL` | Project URL, `https://<ref>.supabase.co` |
| `SUPABASE_PROJECT_REF` | `<ref>` из Project URL |
| `SUPABASE_ANON_KEY` | anon / publishable key (он публичный по своей природе) |

**Secrets**:

| Имя | Значение |
|---|---|
| `DEPLOY_SSH_KEY` | содержимое приватного ключа `~/.ssh/mito_deploy` целиком |
| `SSH_KNOWN_HOSTS` | строка `ssh-keyscan -t ed25519 <IP>` (сверить отпечаток с сервером: `ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub`) |
| `SUPABASE_ACCESS_TOKEN` | токен из шага 2.3 |
| `SUPABASE_DB_PASSWORD` | пароль базы, заданный при создании проекта |

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
