# Локальная разработка на Windows

Полное руководство по настройке и запуску проекта на Windows для разработки.

## 📋 Требования

1. **Bun** - JavaScript runtime
2. **Node.js** - Для клиента (можно использовать и Bun)
3. **PostgreSQL** - База данных
4. **Git** - Система контроля версий

## 🔧 Установка зависимостей

### 1. Установка Bun

```powershell
# PowerShell
powershell -c "irm bun.sh/install.ps1 | iex"
```

После установки перезапустите терминал.

### 2. Установка PostgreSQL

**Вариант 1: Docker Desktop** (рекомендуется)

1. Скачайте и установите [Docker Desktop](https://www.docker.com/products/docker-desktop/)
2. Запустите PostgreSQL:

```powershell
docker run -d --name chat-postgres -e POSTGRES_USER=chat_user -e POSTGRES_PASSWORD=chat_password -e POSTGRES_DB=chat -p 5432:5432 postgres:16-alpine
```

**Вариант 2: Нативная установка**

1. Скачайте [PostgreSQL](https://www.postgresql.org/download/windows/)
2. Установите с параметрами:
   - Port: 5432
   - Password: запомните для .env

### 3. Установка Node.js (опционально)

Скачайте с [nodejs.org](https://nodejs.org/) (LTS версия)

## 🚀 Запуск проекта

### Backend (Server)

```powershell
# Перейдите в папку server
cd server

# Установите зависимости
bun install

# Создайте .env файл
copy .env.example .env

# Отредактируйте .env (в блокноте или VS Code)
notepad .env
```

Содержимое `.env`:
```env
PORT=3000
NODE_ENV=development

DATABASE_URL=postgresql://chat_user:chat_password@localhost:5432/chat

JWT_ACCESS_SECRET=your-secret-here-generate-random
JWT_REFRESH_SECRET=your-another-secret-here

ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3000

RATE_LIMIT_MAX=100
RATE_LIMIT_WINDOW=15
```

Генерация секретов:
```powershell
# В PowerShell
[Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Maximum 256 }))
```

Запустите миграции БД:
```powershell
bun run db:generate
bun run db:migrate
```

Запустите сервер:
```powershell
bun run dev
```

Сервер запустится на http://localhost:3000

### Frontend (Client)

Откройте **новый терминал**:

```powershell
# Перейдите в папку client
cd client

# Установите зависимости (npm или bun)
npm install
# или
bun install

# Запустите dev server
npm run dev
# или
bun run dev
```

Клиент запустится на http://localhost:5173

## ✅ Проверка

1. Откройте браузер: http://localhost:5173
2. Создайте аккаунт
3. Отправьте тестовое сообщение
4. Откройте второе окно в режиме инкогнито и создайте второй аккаунт
5. Проверьте, что сообщения приходят в реальном времени

## 🛠️ Полезные команды

### Backend
```powershell
cd server

bun run dev          # Development с hot-reload
bun run start        # Production запуск
bun run db:studio    # Drizzle Studio (веб-интерфейс для БД)
bun run admin help   # CLI админка
```

### Frontend
```powershell
cd client

npm run dev          # Development сервер
npm run build        # Production сборка
npm run preview      # Превью production сборки
```

### База данных
```powershell
# Подключение к PostgreSQL (если Docker)
docker exec -it chat-postgres psql -U chat_user -d chat

# Основные SQL команды
\dt                  # Список таблиц
SELECT * FROM users; # Все пользователи
SELECT * FROM messages; # Все сообщения
\q                   # Выход
```

## 🐛 Решение проблем

### Проблема: "Bun не найден"
**Решение:** Перезапустите терминал или добавьте Bun в PATH вручную

### Проблема: "Не могу подключиться к БД"
**Решение:**
1. Проверьте, что PostgreSQL запущен: `docker ps` (если Docker)
2. Проверьте DATABASE_URL в .env
3. Проверьте firewall

### Проблема: "Port 3000 already in use"
**Решение:**
1. Найдите процесс: `netstat -ano | findstr :3000`
2. Завершите процесс: `taskkill /PID <номер> /F`
3. Или измените PORT в .env

### Проблема: "Module not found"
**Решение:**
```powershell
cd server
rm -r node_modules
bun install
```

## 🔥 Hot Reload

При изменении файлов:
- **Backend**: Автоматически перезапускается (bun --watch)
- **Frontend**: Автоматически обновляется (Vite HMR)

## 📝 Рекомендуемые расширения VS Code

- **ES7+ React/Redux/React-Native snippets**
- **Prettier** - Форматирование
- **ESLint** - Линтинг
- **Drizzle ORM** - Autocomplete для БД
- **SQLTools** - Управление БД

## 🎯 Следующие шаги

1. Прочитайте [Архитектуру](ARCHITECTURE.md)
2. Изучите [API документацию](API.md)
3. Ознакомьтесь с [CLI командами](CLI.md)
4. Начните разработку!
