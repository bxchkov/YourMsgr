# Админка: текущее состояние

## Что есть сейчас

В проекте нет отдельной web-admin панели. Административная логика сейчас состоит из:

1. серверного CLI;
2. роли `admin` (`role = 3`) в JWT и WebSocket-проверках;
3. права удалять любые сообщения из клиентского интерфейса.

## Что умеет CLI

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

## Почему CLI был сокращён

Во время аудита подтверждились проблемы старого CLI:

- `messages:clear` был слишком разрушительным;
- `messages:count` грузил всю таблицу сообщений вместо `count(*)`;
- `messages:user` был больше похож на отладочный хелпер, чем на зрелую moderation-команду;
- `users:create` обходил часть общей валидации проекта.

## Что считается админской функциональностью в UI

- админ может удалять любые сообщения;
- обычный пользователь может удалять только свои сообщения.

На этом UI-функции администратора сейчас заканчиваются.

## Что добавилось после аудита

- отдельная команда `health` для быстрой operational-проверки;
- `users:get` для просмотра конкретного пользователя;
- `users:logout` для принудительного сброса сессии;
- `users:bootstrap-admin` для one-command install сценария.

## Чего пока нет

- страницы администрирования;
- аудита действий админа;
- блокировок пользователей;
- управления чатами/группами через UI;
- read-only дашборда по системе.

## Следующий логичный этап развития

Если нужна именно полноценная админка, а не CLI, то следующий шаг должен быть таким:

1. вынести отдельные admin API routes;
2. ввести отдельный admin layout во фронте;
3. добавить dashboard со статистикой, пользователями и moderation actions;
4. ввести audit trail для критичных действий.
