# YourMsgr

Защищённый мессенджер с Docker-first развёртыванием, приватными чатами и E2EE для личной переписки.

## Быстрая установка на Linux

```bash
curl -fsSL https://raw.githubusercontent.com/bxchkov/YourMsgr/main/install.sh | sudo bash
```

Installer работает в интерактивном режиме:

1. Проверяет и при необходимости ставит Docker.
2. Клонирует проект в `/opt/yourmsgr`.
3. Просит домен для панели.
4. Если домен не введён, использует IP сервера.
5. Проверяет, что домен резолвится на текущий сервер.
6. При занятом `80`/`443` просит альтернативный порт или подбирает безопасный fallback.
7. Настраивает HTTPS-first запуск с самоподписанным сертификатом.
8. Создаёт `.env`, `server/.env`, helper-команду `yourmsgr`.
9. Поднимает стек и создаёт первого администратора.

По умолчанию приложение работает так:

- `80/tcp` используется только для redirect на HTTPS;
- `443/tcp` отдаёт саму панель;
- backend и PostgreSQL наружу не публикуются;
- сертификат самоподписанный, поэтому браузер покажет стандартное предупреждение доверия.

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
yourmsgr admin stats
yourmsgr admin users:list
yourmsgr uninstall
```

### Что делает меню

Меню `yourmsgr`:

- обновляет CPU/RAM раз в секунду;
- показывает единый статус приложения, контейнеров и HTTPS endpoint’ов;
- даёт вложенное управление сервисом;
- позволяет смотреть логи и возвращаться обратно в меню после `Ctrl + C`;
- проверяет обновления по версии проекта, а не просто по факту любого коммита.

## Обновления

Рекомендуемый сценарий:

```bash
yourmsgr check-update
yourmsgr update
```

Поведение:

- `check-update` сравнивает локальную и удалённую версию из файла `VERSION`;
- `update` не выполняет лишнюю пересборку, если версия уже актуальна;
- если удалённый код изменился, но версия не была увеличена, обычный update откажется обновляться;
- для принудительного обновления в таком случае есть `yourmsgr update --force`.

Текущая версия проекта: `2.0.1`.

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

Локальный compose-профиль теперь тоже ориентирован на HTTPS-first схему:

- `CLIENT_HTTP_PORT=80`
- `CLIENT_HTTPS_PORT=443`
- `PUBLIC_URL=https://localhost`

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
bun run admin users:bootstrap-admin
bun run admin users:role <login> <user|admin>
bun run admin users:logout <login>
bun run admin users:delete <login>
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
- libsodium-wrappers

### Infrastructure

- Docker Compose
- Nginx

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
