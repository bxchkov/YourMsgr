# YourMsgr

Защищённый мессенджер с приватными чатами, E2EE для личной переписки и Docker-first развёртыванием.

## Быстрая установка на Linux одной командой

После публикации `install.sh` в GitHub установка на VPS будет выглядеть так:

```bash
curl -fsSL https://raw.githubusercontent.com/bxchkov/YourMsgr/main/install.sh | sudo bash
```

Что делает скрипт:

1. Устанавливает Docker при его отсутствии.
2. Клонирует или обновляет проект в `/opt/yourmsgr`.
3. Создаёт root `.env` для Docker Compose и `server/.env` с JWT-секретами.
4. Поднимает стек через `docker compose up -d --build` и дожидается health-check.
5. Создаёт первого admin-пользователя при первой установке.
6. Устанавливает helper-команду `yourmsgr`.

После установки доступны команды:

```bash
yourmsgr
yourmsgr version
yourmsgr check-update
yourmsgr status
yourmsgr health
yourmsgr logs
yourmsgr restart
yourmsgr backup
yourmsgr update
yourmsgr admin stats
yourmsgr admin users:list
yourmsgr uninstall
yourmsgr uninstall-purge
```

## Что важно по install-flow

- Наружу по умолчанию публикуется только клиентский HTTP-порт.
- Backend и PostgreSQL по умолчанию слушают только `127.0.0.1`.
- Основная конфигурация Docker Compose лежит в root `.env`.
- Серверные секреты лежат в `server/.env`.

Пример root `.env`:

```env
POSTGRES_USER=chat_user
POSTGRES_PASSWORD=change_me
POSTGRES_DB=chat

NODE_ENV=production
ALLOWED_ORIGINS=http://localhost,http://127.0.0.1

CLIENT_BIND=0.0.0.0
CLIENT_PORT=80

SERVER_BIND=127.0.0.1
SERVER_PORT=3000

POSTGRES_BIND=127.0.0.1
POSTGRES_PORT=5432
```

## Ручной запуск через Docker Compose

```bash
cp .env.example .env
cp server/.env.example server/.env

docker compose up -d --build
```

Клиент будет доступен на `http://localhost`.

## Что сейчас представляет собой админка

В проекте **нет отдельной web-admin панели**. Админская поверхность сейчас состоит из двух частей:

1. **CLI на сервере**
2. **Роль `admin` (`role = 3`) в клиенте и WebSocket-логике**

Что реально умеет админ сейчас:

- просматривать пользователей через CLI;
- смотреть health/state проекта через CLI;
- создавать обычных пользователей и админов через CLI;
- автоматически bootstrap'иться при первой установке;
- менять роль пользователя через CLI;
- принудительно разлогинивать пользователя через CLI;
- удалять пользователя через CLI;
- видеть агрегированную статистику проекта через CLI;
- удалять любые сообщения в интерфейсе мессенджера.

Что админка **пока не умеет**:

- отдельный web-интерфейс управления;
- просмотр аудита действий;
- модерацию пользователей/чатов через UI;
- изолированный набор административных API.

## Команды CLI

```bash
cd server
bun run admin help
```

Актуальный набор:

```bash
bun run admin health
bun run admin stats
bun run admin users:list
bun run admin users:get <login>
bun run admin users:create
bun run admin users:create --admin
bun run admin users:bootstrap-admin
bun run admin users:role <login> <user|admin>
bun run admin users:logout <login>
bun run admin users:delete <login>
```

Устаревшие опасные команды удалены:

- `messages:clear`
- `messages:user`

`messages:count` оставлен только как deprecated alias к `stats`.

## Как тестировать правки на сервере

- Для обычного цикла доработок не нужно удалять проект и ставить его заново. Нормальный путь теперь такой: правки в GitHub -> `yourmsgr check-update` -> `yourmsgr update`.
- `yourmsgr update` перед обновлением автоматически делает backup, затем подтягивает код и пересобирает стек.
- `yourmsgr uninstall` удаляет проект и helper, но по умолчанию оставляет Docker volume с данными.
- `yourmsgr uninstall-purge` удаляет проект полностью вместе с volume и backup-файлами.

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
- libsodium-wrappers

### Infrastructure

- Docker Compose
- Nginx

## Структура проекта

```text
YourMsgr/
├── client/                 # Vue 3 client
├── server/                 # Bun + Hono backend
├── scripts/                # Helper scripts for server management
├── docker-compose.yml
├── .env.example
├── install.sh
└── README.md
```

## Практические замечания после аудита

- Отдельной web-admin панели сейчас нет, поэтому слово «админка» корректнее относить к CLI и moderation-permissions.
- Для production-сценария текущий Docker stack уже стал безопаснее, но полноценный reverse-proxy под HTTPS и домен всё ещё лучше выносить на внешний уровень.

## Лицензия

MIT
