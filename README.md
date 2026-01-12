# .Chat - Secure Private Messenger

Приватный мессенджер с end-to-end шифрованием для быстрого развёртывания на собственном сервере.

## 📚 Документация

- **[Быстрый старт](#-быстрый-старт)** - Установка и запуск
- **[Windows разработка](docs/WINDOWS_DEV.md)** - Локальная разработка на Windows
- **[API документация](docs/API.md)** - REST API endpoints
- **[Архитектура](docs/ARCHITECTURE.md)** - Структура проекта
- **[Безопасность](docs/SECURITY.md)** - E2EE и защита данных
- **[CLI команды](docs/CLI.md)** - Админ-панель
- **[Деплой](docs/DEPLOY.md)** - Production развёртывание

## 🚀 Быстрый старт

### Автоматическая установка (Linux)

```bash
bash <(curl -Ls https://raw.githubusercontent.com/YOUR_USERNAME/YOUR_REPO/main/install.sh)
```

### Ручная установка

#### Требования
- Bun >= 1.0
- PostgreSQL >= 14
- Node.js >= 18 (для клиента)

#### Backend (Server)

```bash
cd server
bun install
cp .env.example .env
# Отредактируйте .env файл с вашими настройками

# Запустите миграции
bun run db:generate
bun run db:migrate

# Запуск
bun run dev  # development
bun run start  # production
```

#### Frontend (Client)

```bash
cd client
npm install  # или bun install

# Запуск
npm run dev  # development
npm run build  # production
```

## 📦 Docker Compose

```bash
docker-compose up -d
```

Приложение будет доступно:
- Frontend: http://localhost:5173
- Backend API: http://localhost:3000

## 🔐 Безопасность

- JWT authentication с refresh tokens
- Argon2 хеширование паролей
- End-to-end шифрование сообщений (libsodium)
- HTTPS в production
- Rate limiting
- CORS защита

## 🛠️ Технологии

**Backend:**
- Bun (runtime)
- Hono (framework)
- PostgreSQL + Drizzle ORM
- Socket.IO (WebSocket)
- JWT + Argon2

**Frontend:**
- Vite
- Vanilla JS (модульная структура)
- Socket.IO Client
- SCSS

## 📁 Структура проекта

```
.Chat/
├── server/           # Backend (Bun + Hono)
│   ├── src/
│   │   ├── controllers/
│   │   ├── services/
│   │   ├── middleware/
│   │   ├── routes/
│   │   ├── db/
│   │   └── utils/
│   └── package.json
│
├── client/           # Frontend (Vite)
│   ├── src/
│   │   ├── js/
│   │   ├── styles/
│   │   └── index.html
│   └── package.json
│
├── install.sh
└── docker-compose.yml
```

## 🎯 CLI Админ-панель

```bash
cd server
bun run admin users:list           # Список пользователей
bun run admin users:create         # Создать пользователя
bun run admin users:delete <login> # Удалить пользователя
bun run admin messages:count       # Количество сообщений
bun run admin help                 # Полный список команд
```

## 🗑️ Удаление

```bash
bash uninstall.sh
```

## 📝 License

MIT
