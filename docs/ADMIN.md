# Админка: текущее состояние

## Что есть сейчас

В проекте нет отдельной web-admin панели. Административная логика сейчас состоит из:

1. серверного CLI;
2. роли `admin` (`role = 3`) в JWT и WebSocket-проверках;
3. прав на удаление любых сообщений из основного клиентского интерфейса.

## Что умеет CLI

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

## Что считается админской функциональностью в UI

- админ может удалять любые сообщения;
- обычный пользователь может удалять только свои сообщения.

На этом UI-функции администратора сейчас заканчиваются.

## Что было добавлено после аудита

- `health` для быстрой operational-проверки;
- `users:get` для просмотра конкретного пользователя;
- `users:logout` для принудительного сброса сессии;
- `users:create-auto` и `users:create-auto --admin` для быстрого операционного создания аккаунтов;
- `messages:admin-post` для служебного сообщения в общий чат;
- `messages:purge-group` для удаления сообщений пользователя из общего чата;
- `users:bootstrap-admin` для one-command install сценария.

## Чего пока нет

- отдельной web-admin панели;
- журнала критичных действий администратора;
- банов и мутов;
- управления чатами и группами через UI;
- read-only dashboard по системе.

## Следующий логичный этап развития

Если позже понадобится именно полноценная админка, а не только CLI, следующий шаг должен быть таким:

1. вынести отдельные admin API routes;
2. добавить отдельный admin layout во фронте;
3. сделать dashboard со статистикой, пользователями и moderation actions;
4. ввести журнал критичных действий администратора.
