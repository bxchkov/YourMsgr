# Установка и деплой

## One-command install

```bash
curl -fsSL https://raw.githubusercontent.com/bxchkov/YourMsgr/main/install.sh | sudo bash
```

## Как теперь работает installer

Installer ориентирован на production HTTPS с обязательным доменом:

1. Устанавливает Docker при необходимости.
2. Клонирует или обновляет проект в `/opt/yourmsgr`.
3. Требует домен панели.
4. Проверяет DNS-резолв домена на текущий сервер.
5. Проверяет, что `80/tcp` свободен, а для HTTPS выбирает `443` или запасной порт.
6. Поднимает Caddy и ждёт готовности:
   - `http://127.0.0.1:<SERVER_PORT>/healthz`
   - `https://<domain>/healthz`
   - `https://<domain>/auth`
7. Создаёт первого admin-пользователя.

## Какие файлы создаются

- каталог проекта: `/opt/yourmsgr`
- helper-команда: `/usr/local/bin/yourmsgr`
- root `.env` для Docker Compose
- `server/.env` с секретами backend

## Основные переменные installer-а

Можно переопределять до запуска:

```bash
export YOURMSGR_PUBLIC_HOST=chat.example.com
export YOURMSGR_CLIENT_HTTPS_PORT=8443
curl -fsSL https://raw.githubusercontent.com/bxchkov/YourMsgr/main/install.sh | sudo bash
```

Поддерживаемые переменные:

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

## Обязательные условия

Для успешной установки должны выполняться все пункты:

- у вас есть домен;
- A-запись домена указывает на этот сервер;
- `80/tcp` доступен снаружи для ACME HTTP challenge;
- `80/tcp` не занят другими сервисами;
- если хотите URL без `:порт`, тогда свободен и `443/tcp`.

Если `443` занят, installer не падает, а использует отдельный HTTPS-порт, например `8443`.

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
yourmsgr reconfigure
yourmsgr admin stats
yourmsgr uninstall
```

### Что изменилось в helper

- `status` объединяет прежние `status` и `health`;
- `logs` позволяет вернуться обратно в меню после `Ctrl + C`;
- `reconfigure` повторно запускает installer и позволяет сменить домен или HTTPS-порт;
- обновления завязаны на `VERSION`;
- helper больше не использует self-signed TLS.

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

## Примечание по HTTPS

Installer не использует self-signed сертификаты. TLS выпускает Caddy автоматически через ACME, поэтому браузерное предупреждение о недоверенном сертификате не должно появляться, если:

- домен корректно указывает на сервер;
- `80` доступен снаружи;
- сертификат успел выпуститься;
- браузер открывает именно доменное имя, а не IP;
- при занятом `443` вы открываете панель на том HTTPS-порту, который выбрал installer.
