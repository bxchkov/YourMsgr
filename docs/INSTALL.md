# Установка и деплой

## One-command install

```bash
curl -fsSL https://raw.githubusercontent.com/bxchkov/YourMsgr/main/install.sh | sudo bash
```

## Как теперь работает installer

Installer ориентирован на HTTPS-first сценарий:

1. Устанавливает Docker при необходимости.
2. Клонирует или обновляет проект в `/opt/yourmsgr`.
3. Спрашивает домен панели.
4. Если домен не указан, использует IP сервера.
5. Проверяет DNS-резолв домена на текущий сервер.
6. Настраивает самоподписанный TLS-сертификат.
7. Поднимает стек и ждёт готовности:
   - `http://127.0.0.1:<SERVER_PORT>/healthz`
   - `http://127.0.0.1:<CLIENT_HTTP_PORT>/healthz`
   - `https://127.0.0.1:<CLIENT_HTTPS_PORT>/auth`
8. Создаёт первого admin-пользователя.

## Какие файлы создаются

- каталог проекта: `/opt/yourmsgr`
- helper-команда: `/usr/local/bin/yourmsgr`
- root `.env` для Docker Compose
- `server/.env` с секретами backend
- локальное хранилище TLS-сертификата: `deploy/certs`

## Основные переменные installer-а

Можно переопределять до запуска:

```bash
export YOURMSGR_PUBLIC_HOST=chat.example.com
export YOURMSGR_CLIENT_HTTP_PORT=8080
export YOURMSGR_CLIENT_HTTPS_PORT=8443
curl -fsSL https://raw.githubusercontent.com/bxchkov/YourMsgr/main/install.sh | sudo bash
```

Поддерживаемые переменные:

- `YOURMSGR_REPO_URL`
- `YOURMSGR_REPO_BRANCH`
- `YOURMSGR_INSTALL_DIR`
- `YOURMSGR_PUBLIC_HOST`
- `YOURMSGR_PUBLIC_IP`
- `YOURMSGR_CLIENT_HTTP_BIND`
- `YOURMSGR_CLIENT_HTTP_PORT`
- `YOURMSGR_CLIENT_HTTPS_BIND`
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

## Управление после установки

```bash
yourmsgr
```

### Основные команды

```bash
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
yourmsgr uninstall
```

### Что изменилось в helper

- `status` объединяет старые `status` и `health`;
- `logs` больше не выбрасывает из меню навсегда: после `Ctrl + C` можно сразу вернуться назад;
- убран `server shell`;
- обновление теперь завязано на `VERSION`;
- в главном меню CPU и RAM обновляются раз в секунду;
- branch/commit из интерфейса helper убраны.

## Обновление

```bash
yourmsgr check-update
yourmsgr update
```

Правила:

- публикуемое обновление должно сопровождаться увеличением `VERSION`;
- обычное обновление не идёт, если версия уже актуальна;
- если удалённый код изменился, а версия нет, helper требует `--force`.

## Удаление

```bash
yourmsgr uninstall
```

Удаление полное:

- stack удаляется;
- volumes удаляются;
- каталог `/opt/yourmsgr` удаляется;
- helper удаляется.

## Примечание по TLS

На текущем этапе installer всегда использует самоподписанный сертификат. Это упрощённый, но предсказуемый HTTPS-first режим:

- для работы приложения HTTPS обязателен;
- браузер покажет предупреждение о недоверенном сертификате;
- позже этот слой можно заменить на доменный ACME/Let's Encrypt flow без смены общей структуры installer-а и helper-а.
