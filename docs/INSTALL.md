# Установка и деплой

## One-command bootstrap

```bash
curl -fsSL https://raw.githubusercontent.com/bxchkov/YourMsgr/main/install.sh | sudo bash
```

Эта команда:

1. ставит Docker при необходимости;
2. клонирует проект в `/opt/yourmsgr`;
3. устанавливает helper-команду `yourmsgr`;
4. не запускает приложение автоматически.

## Почему wizard больше не встроен прямо в `curl | bash`

При запуске installer через pipe stdin уже занят телом скрипта. Поэтому интерактивный опрос домена на этом этапе ненадёжен и даёт плохой UX.

Из-за этого install flow разделён на 2 шага:

1. bootstrap через `curl | bash`;
2. интерактивная конфигурация через `yourmsgr` при первом старте.

## Первый запуск

Через меню:

```bash
sudo yourmsgr
```

Дальше:

1. `Service management`
2. `Start application`

Или сразу:

```bash
sudo yourmsgr service start
```

Если конфигурации ещё нет, helper сам откроет wizard.

## Что делает wizard

Wizard первого запуска:

1. запрашивает публичный домен;
2. проверяет, что домен резолвится на этот сервер;
3. проверяет доступность `80/tcp`;
4. выбирает HTTPS-порт (`443` или запасной, например `8443`, если `443` занят);
5. генерирует `.env` и `server/.env`;
6. поднимает стек;
7. ждёт trusted HTTPS и `/auth`;
8. создаёт первого admin-пользователя.

## Повторная настройка

Если домен меняется, полная переустановка не нужна:

```bash
sudo yourmsgr reconfigure
```

или

```bash
sudo yourmsgr setup
```

## Непосредственно поддерживаемые сценарии

### Production

- домен обязателен;
- нужен корректный DNS A-record на этот сервер;
- `80/tcp` должен быть доступен извне для ACME;
- сертификат выпускает Caddy автоматически.

### Non-interactive configuration

Если нужно автоматизировать именно этап конфигурации, можно передать домен через env:

```bash
export YOURMSGR_PUBLIC_HOST=chat.example.com
sudo yourmsgr service start
```

Поддерживаются и другие installer env-переменные:

- `YOURMSGR_REPO_URL`
- `YOURMSGR_REPO_BRANCH`
- `YOURMSGR_INSTALL_DIR`
- `YOURMSGR_PUBLIC_HOST`
- `YOURMSGR_PUBLIC_IP`
- `YOURMSGR_CLIENT_HTTPS_PORT`
- `YOURMSGR_SERVER_BIND`
- `YOURMSGR_SERVER_PORT`
- `YOURMSGR_POSTGRES_BIND`
- `YOURMSGR_POSTGRES_PORT`
- `YOURMSGR_POSTGRES_USER`
- `YOURMSGR_POSTGRES_PASSWORD`
- `YOURMSGR_POSTGRES_DB`
- `YOURMSGR_RESTART_POLICY`
- `YOURMSGR_JWT_ACCESS_SECRET`
- `YOURMSGR_JWT_REFRESH_SECRET`
- `YOURMSGR_RATE_LIMIT_MAX`
- `YOURMSGR_RATE_LIMIT_WINDOW`
- `YOURMSGR_ADMIN_LOGIN`
- `YOURMSGR_ADMIN_PASSWORD`
- `YOURMSGR_ADMIN_USERNAME`

## Удаление

```bash
yourmsgr uninstall
```

Удаление остаётся полным:

- stack удаляется;
- volumes удаляются;
- каталог `/opt/yourmsgr` удаляется;
- helper удаляется.
