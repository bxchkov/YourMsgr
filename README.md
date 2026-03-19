# YourMsgr

Защищённый мессенджер с Docker-first развёртыванием, общим чатом, личными чатами и E2EE для приватной переписки.

## Быстрая установка на Linux

```bash
curl -fsSL https://raw.githubusercontent.com/bxchkov/YourMsgr/main/install.sh | sudo bash
```

Эта команда теперь делает только bootstrap:

1. устанавливает Docker при необходимости;
2. клонирует или обновляет проект в `/opt/yourmsgr`;
3. ставит helper-команду `yourmsgr`;
4. ничего не поднимает автоматически.

После bootstrap приложение ещё не настроено и не запущено.

## Что означает команда установки

```bash
curl -fsSL https://raw.githubusercontent.com/bxchkov/YourMsgr/main/install.sh | sudo bash
```

- `curl` скачивает installer-скрипт;
- `-f` завершает команду с ошибкой, если GitHub вернул HTTP-ошибку;
- `-s` убирает лишний шум;
- `-S` показывает текст ошибки, если она есть;
- `-L` следует за redirect;
- `| sudo bash` передаёт скачанный скрипт в `bash` с root-правами.

Важно: у `curl | bash` stdin занят самим скриптом, поэтому интерактивный wizard на этом этапе неудобен. Именно поэтому домен и HTTPS теперь настраиваются не во время bootstrap, а при первом старте через `yourmsgr`.

## Первый запуск после установки

Вариант через меню:

```bash
sudo yourmsgr
```

Дальше:

1. открыть `Service management`;
2. выбрать `Start application`;
3. пройти wizard домена и HTTPS;
4. дождаться выпуска сертификата и старта контейнеров.

Прямой вариант без захода в меню:

```bash
sudo yourmsgr service start
```

Если конфигурации ещё нет, helper сам запустит wizard первого старта.

## Как теперь устроен lifecycle

### 1. Bootstrap

- проект скачан;
- helper установлен;
- сервисы не запущены;
- домен ещё не выбран.

### 2. First start

- запрашивается домен;
- проверяется DNS-резолв домена на этот сервер;
- проверяется доступность `80/tcp`;
- поднимается Caddy с trusted HTTPS через ACME;
- создаётся первый admin.

### 3. Reconfigure

Если позже домен нужно поменять, полная переустановка не нужна:

```bash
sudo yourmsgr reconfigure
```

или

```bash
sudo yourmsgr setup
```

Wizard перепишет конфигурацию и перезапустит стек.

## Основные команды helper

```bash
yourmsgr
yourmsgr version
yourmsgr status
yourmsgr setup
yourmsgr reconfigure
yourmsgr logs
yourmsgr check-update
sudo yourmsgr update
sudo yourmsgr service start
sudo yourmsgr service stop
sudo yourmsgr service restart
sudo yourmsgr service autostart on
sudo yourmsgr service autostart off
sudo yourmsgr service autorestart on
sudo yourmsgr service autorestart off
yourmsgr admin stats
yourmsgr uninstall
```

## Обновления

Рекомендуемый сценарий:

```bash
yourmsgr check-update
sudo yourmsgr update
```

Поведение:

- `check-update` сравнивает локальную и удалённую версии по файлу `VERSION`;
- `update` обновляет helper и код проекта;
- если приложение уже настроено, после обновления автоматически пересобирается и перезапускается стек;
- если bootstrap уже выполнен, но конфигурации ещё нет, update просто обновит код без автозапуска.

## Админка

Отдельной web-admin панели в проекте нет. Админская поверхность сейчас состоит из:

1. серверного CLI;
2. роли `admin` в основном клиенте.

Быстрый вход в админский CLI:

```bash
yourmsgr admin stats
yourmsgr admin users:list
yourmsgr admin users:get <login>
yourmsgr admin users:create-auto
yourmsgr admin users:create-auto --admin
yourmsgr admin users:role <login> <user|admin>
yourmsgr admin users:logout <login>
yourmsgr admin users:delete <login>
yourmsgr admin messages:admin-post <admin-login> <message>
yourmsgr admin messages:purge-group <login>
```

## Ручной запуск через Docker Compose

```bash
cp .env.example .env
cp server/.env.example server/.env
docker compose up -d --build
```

Для production-сценария рекомендован именно installer/helper flow.

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

## Текущая версия

`2.0.11`

## Лицензия

MIT
