# CLI Админ-панель

Консольные команды для управления пользователями и сообщениями.

## 🚀 Запуск

```bash
cd server
bun run admin <command> [args]
```

---

## 👥 Управление пользователями

### `users:list`

Показать список всех пользователей.

```bash
bun run admin users:list
```

**Вывод:**
```
Users:
┌─────┬──────┬──────────┬──────────┬──────┬─────────────────────┐
│ id  │ login│ username │ role     │ ...  │ created             │
├─────┼──────┼──────────┼──────────┼──────┼─────────────────────┤
│ 1   │ admin│ Admin    │ 3        │ ...  │ 2024-01-12 10:00:00 │
│ 2   │ user │ User123  │ 1        │ ...  │ 2024-01-12 11:00:00 │
└─────┴──────┴──────────┴──────────┴──────┴─────────────────────┘
```

---

### `users:create`

Создать нового пользователя (интерактивный режим).

```bash
bun run admin users:create
```

**Процесс:**
```
Login (6-16 chars): testuser
Username (2-16 chars): Test User
Password (8-16 chars): password123
Role (1=user, 3=admin, default=1): 1
✓ User 'testuser' created successfully
```

**Roles:**
- `1` - Обычный пользователь (default)
- `3` - Администратор

---

### `users:delete <login>`

Удалить пользователя по логину.

```bash
bun run admin users:delete testuser
```

**Вывод:**
```
✓ User 'testuser' deleted
```

⚠️ **Внимание:** Удаляет пользователя и все его сообщения (CASCADE).

---

### `users:role <login> <role>`

Изменить роль пользователя.

```bash
bun run admin users:role testuser 3
```

**Вывод:**
```
✓ User 'testuser' role changed to 3
```

**Roles:**
- `1` - User (может удалять только свои сообщения)
- `3` - Admin (может удалять любые сообщения)

---

## 💬 Управление сообщениями

### `messages:count`

Показать количество сообщений.

```bash
bun run admin messages:count
```

**Вывод:**
```
Total messages: 1523
```

---

### `messages:clear`

Удалить ВСЕ сообщения (с подтверждением).

```bash
bun run admin messages:clear
```

**Процесс:**
```
Are you sure you want to delete ALL messages? (yes/no): yes
✓ All messages deleted
```

⚠️ **Внимание:** Операция необратима!

---

### `messages:user <login>`

Показать все сообщения конкретного пользователя.

```bash
bun run admin messages:user testuser
```

**Вывод:**
```
Messages from Test User:
┌─────┬──────────────────────────────────────────────────┬─────────────────────┐
│ id  │ message                                          │ date                │
├─────┼──────────────────────────────────────────────────┼─────────────────────┤
│ 1   │ Hello world!                                     │ 2024-01-12 10:00:00 │
│ 2   │ This is a test message                           │ 2024-01-12 10:05:00 │
└─────┴──────────────────────────────────────────────────┴─────────────────────┘
```

---

## ℹ️ Справка

### `help`

Показать список всех команд.

```bash
bun run admin help
```

**Вывод:**
```
.Chat Admin CLI

Commands:
  users:list              List all users
  users:create            Create new user (interactive)
  users:delete <login>    Delete user by login
  users:role <login> <role>  Change user role (1=user, 3=admin)

  messages:count          Show message count
  messages:clear          Clear all messages (with confirmation)
  messages:user <login>   Show messages from user

  help                    Show this help
```

---

## 🔧 Примеры использования

### Создание админа

```bash
cd server
bun run admin users:create

# Введите:
# Login: admin
# Username: Administrator
# Password: secure_password_123
# Role: 3

✓ User 'admin' created successfully
```

### Понижение прав админа

```bash
bun run admin users:role admin 1
✓ User 'admin' role changed to 1
```

### Удаление спам-пользователя

```bash
# 1. Проверяем его сообщения
bun run admin messages:user spammer

# 2. Удаляем пользователя (удалятся и его сообщения)
bun run admin users:delete spammer
✓ User 'spammer' deleted
```

### Очистка чата

```bash
bun run admin messages:clear
Are you sure you want to delete ALL messages? (yes/no): yes
✓ All messages deleted
```

---

## 📝 Notes

1. Все команды требуют настроенный `.env` файл
2. База данных должна быть запущена
3. Для интерактивных команд используется stdin
4. Ошибки выводятся в stderr
5. Exit code: `0` = success, `1` = error

---

## 🐛 Troubleshooting

### Ошибка: "Cannot connect to database"

**Решение:**
1. Проверьте DATABASE_URL в .env
2. Убедитесь что PostgreSQL запущен
3. Проверьте права доступа к БД

### Ошибка: "User not found"

**Решение:**
Проверьте правильность написания логина (case-insensitive).

### Ошибка: "ENOENT: no such file or directory, open '.env'"

**Решение:**
Создайте `.env` файл из `.env.example`:
```bash
cd server
cp .env.example .env
```

---

## 🚀 Автоматизация

### Batch создание пользователей

```bash
# create_users.sh
#!/bin/bash

users=(
  "user1:User One:password1:1"
  "user2:User Two:password2:1"
  "admin:Admin:admin123:3"
)

for user in "${users[@]}"; do
  IFS=':' read -r login username password role <<< "$user"
  echo "$login\n$username\n$password\n$role" | bun run admin users:create
done
```

### Backup пользователей

```bash
bun run admin users:list > users_backup.txt
```

---

## 🔐 Security

⚠️ **Важно:**
- CLI имеет полный доступ к БД
- Не давайте доступ к серверу посторонним
- Используйте сильные пароли для админов
- Регулярно делайте backup БД

---

## 💡 Tips

1. Используйте `users:list` для быстрого просмотра всех пользователей
2. Перед `messages:clear` сделайте backup
3. Используйте `messages:user` для модерации
4. Админы (role=3) имеют полный доступ к удалению сообщений в UI
