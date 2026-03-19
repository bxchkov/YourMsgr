# YourMsgr

Защищённый мессенджер с Docker-first развёртыванием, групповым чатом, личными чатами и E2EE для приватной переписки.

## Быстрая установка на Linux

```bash
curl -fsSL https://raw.githubusercontent.com/bxchkov/YourMsgr/main/install.sh | sudo bash
```

Installer теперь работает в production-сценарии:

1. Проверяет и при необходимости устанавливает Docker.
2. Клонирует проект в `/opt/yourmsgr`.
3. Требует домен для панели.
4. Проверяет, что домен резолвится на текущий сервер.
5. Требует свободный `80/tcp` и по возможности свободный `443/tcp`.
6. Поднимает Caddy с автоматическим выпуском доверенного TLS-сертификата.
7. Создаёт `.env`, `server/.env`, helper-команду `yourmsgr`.
8. Поднимает стек и создаёт первого администратора.

Важно:

- IP-only установка больше не поддерживается.
- Для нормальной работы HTTPS домен должен смотреть прямо на этот сервер.
- Порт `80` должен быть открыт и не занят сторонними сервисами.
- Если `443` занят, installer подберёт отдельный HTTPS-порт, например `8443`.
- При занятом `443` панель может работать на `https://<domain>:<port>` без browser warning, если сертификат выпущен успешно.

## Управление после установки

Основная команда:

```bash
yourmsgr
```

CLI helper поддерживает:

```bash
yourmsgr menu
yourmsgr version
yourmsgr status
yourmsgr logs
yourmsgr check-update
yourmsgr update
yourmsgr service start
yourmsgr service stop
yourmsgr service restart
yourmsgr service autostart on
yourmsgr service autostart off
yourmsgr service autorestart on
yourmsgr service autorestart off
yourmsgr reconfigure
yourmsgr admin stats
yourmsgr uninstall
```

### Что делает меню

Меню `yourmsgr`:

- показывает единый статус приложения, контейнеров и endpoint-ов;
- даёт отдельный раздел управления сервисом;
- даёт раздел логов с возвратом обратно в меню;
- даёт раздел обновлений, завязанный на `VERSION`;
- даёт раздел админских CLI-команд;
- позволяет запустить `reconfigure`, если нужно переехать на другой домен или HTTPS-порт.

## Обновления

Рекомендуемый сценарий:

```bash
yourmsgr check-update
yourmsgr update
```

Поведение:

- `check-update` сравнивает локальную и удалённую версии из файла `VERSION`;
- `update` не делает лишнюю пересборку, если версия уже актуальна;
- если код изменился, а `VERSION` не был увеличен, обычный update откажется обновляться;
- для принудительного обновления в таком случае есть `yourmsgr update --force`.

Текущая версия проекта: `2.0.5`.

## Удаление

```bash
yourmsgr uninstall
```

Удаление намеренно простое и полное:

- останавливает и удаляет Docker stack;
- удаляет volumes проекта;
- удаляет каталог установки;
- удаляет helper-команду.

## Ручной запуск через Docker Compose

```bash
cp .env.example .env
cp server/.env.example server/.env
docker compose up -d --build
```

Compose-профиль ориентирован на Caddy и trusted-HTTPS flow:

- `PUBLIC_HOST=chat.example.com`
- `PUBLIC_URL=https://chat.example.com`
- `CLIENT_HTTP_PORT=80`
- `CLIENT_HTTPS_PORT=443`

## Админка

Отдельной web-admin панели в проекте нет. Админская поверхность сейчас состоит из:

1. серверного CLI;
2. роли `admin` в основном клиенте.

Полезные CLI-команды:

```bash
cd server
bun run admin help
```

Основной набор:

```bash
bun run admin health
bun run admin stats
bun run admin users:list
bun run admin users:get <login>
bun run admin users:create
bun run admin users:create --admin
bun run admin users:create-auto
bun run admin users:create-auto --admin
bun run admin users:bootstrap-admin
bun run admin users:role <login> <user|admin>
bun run admin users:logout <login>
bun run admin users:delete <login>
bun run admin messages:admin-post <admin-login> <message>
bun run admin messages:purge-group <login>
```

## Технологии

### Backend

- Bun
- Hono
- PostgreSQL
- Drizzle ORM
- Bun WebSocket
- JWT + Argon2

### Frontend

- Vue 3
- Pinia
- Vue Router
- Vite
- SCSS
- Web Crypto API + tweetnacl

### Infrastructure

- Docker Compose
- Caddy

## Структура

```text
YourMsgr/
├── client/
├── server/
├── scripts/
├── deploy/
├── docker-compose.yml
├── install.sh
└── README.md
```

## Лицензия

MIT
