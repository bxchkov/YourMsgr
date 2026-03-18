# Установка и деплой

## One-command install

```bash
curl -fsSL https://raw.githubusercontent.com/bxchkov/YourMsgr/main/install.sh | sudo bash
```

## Что создаёт installer

- каталог проекта: `/opt/yourmsgr`
- helper-команду: `/usr/local/bin/yourmsgr`
- root `.env` для Docker Compose
- `server/.env` с JWT-секретами
- первого admin-пользователя при первой установке

## Основные env-переменные installer-а

Можно переопределять до запуска:

```bash
export YOURMSGR_PUBLIC_HOST=example.com
export YOURMSGR_CLIENT_PORT=8080
export YOURMSGR_INSTALL_DIR=/srv/yourmsgr
curl -fsSL https://raw.githubusercontent.com/bxchkov/YourMsgr/main/install.sh | sudo bash
```

Поддерживаемые переменные:

- `YOURMSGR_REPO_URL`
- `YOURMSGR_REPO_BRANCH`
- `YOURMSGR_INSTALL_DIR`
- `YOURMSGR_PUBLIC_HOST`
- `YOURMSGR_CLIENT_BIND`
- `YOURMSGR_CLIENT_PORT`
- `YOURMSGR_SERVER_BIND`
- `YOURMSGR_SERVER_PORT`
- `YOURMSGR_POSTGRES_BIND`
- `YOURMSGR_POSTGRES_PORT`
- `YOURMSGR_POSTGRES_USER`
- `YOURMSGR_POSTGRES_PASSWORD`
- `YOURMSGR_POSTGRES_DB`
- `YOURMSGR_JWT_ACCESS_SECRET`
- `YOURMSGR_JWT_REFRESH_SECRET`
- `YOURMSGR_RATE_LIMIT_MAX`
- `YOURMSGR_RATE_LIMIT_WINDOW`
- `YOURMSGR_ADMIN_LOGIN`
- `YOURMSGR_ADMIN_PASSWORD`
- `YOURMSGR_ADMIN_USERNAME`

## Управление после установки

```bash
yourmsgr
yourmsgr version
yourmsgr check-update
yourmsgr status
yourmsgr health
yourmsgr logs
yourmsgr restart
yourmsgr update
yourmsgr shell
yourmsgr admin stats
yourmsgr uninstall
yourmsgr uninstall-purge
```

## Замечания по безопасности

- наружу по умолчанию публикуется только клиент;
- backend и PostgreSQL по умолчанию привязаны к `127.0.0.1`;
- installer ждёт готовности `/healthz` перед bootstrap admin;
- для production рекомендуется внешний reverse proxy с HTTPS.

## Рекомендуемый цикл обновлений

Для обычной эксплуатации и теста новых правок не нужно каждый раз переустанавливать проект с нуля:

```bash
yourmsgr check-update
yourmsgr update
```

Поведение:

- `yourmsgr update` выполняет `git pull` и `docker compose up -d --build`;
- `yourmsgr uninstall` удаляет проект полностью: stack, Docker volume, каталог установки и helper;
- `yourmsgr uninstall-purge` оставлен как совместимый алиас и ведёт себя так же, как `yourmsgr uninstall`.
