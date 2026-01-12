# Архитектура проекта

Полное описание структуры, паттернов и принципов проекта.

## 📁 Структура проекта

```
.Chat/
├── server/                     # Backend (Bun + Hono + PostgreSQL)
│   ├── src/
│   │   ├── controllers/       # HTTP контроллеры
│   │   │   └── auth.controller.ts
│   │   ├── services/          # Бизнес-логика
│   │   │   ├── auth.service.ts
│   │   │   └── message.service.ts
│   │   ├── middleware/        # Express middleware
│   │   │   ├── auth.ts       # JWT проверка
│   │   │   ├── cors.ts       # CORS настройки
│   │   │   └── rateLimit.ts  # Rate limiting
│   │   ├── routes/            # API роуты
│   │   │   └── auth.routes.ts
│   │   ├── db/                # База данных
│   │   │   ├── schema.ts     # Drizzle схема
│   │   │   ├── index.ts      # DB connection
│   │   │   ├── migrate.ts    # Миграции
│   │   │   └── migrations/   # SQL миграции
│   │   ├── utils/             # Утилиты
│   │   │   ├── jwt.ts        # JWT функции
│   │   │   ├── password.ts   # Argon2
│   │   │   ├── validation.ts # Zod валидация
│   │   │   └── response.ts   # API responses
│   │   ├── types/             # TypeScript типы
│   │   ├── cli/               # CLI команды
│   │   │   └── admin.ts      # Админ-панель
│   │   └── index.ts           # Entry point
│   ├── .env.example
│   ├── package.json
│   ├── tsconfig.json
│   └── Dockerfile
│
├── client/                     # Frontend (Vite + Vanilla JS)
│   ├── src/
│   │   ├── js/
│   │   │   ├── auth/          # Аутентификация
│   │   │   │   ├── authService.js
│   │   │   │   └── authForms.js
│   │   │   ├── chat/          # Чат функционал
│   │   │   │   ├── socket.js
│   │   │   │   ├── chatManager.js
│   │   │   │   └── messageRenderer.js
│   │   │   ├── utils/         # Утилиты
│   │   │   │   ├── api.js
│   │   │   │   ├── storage.js
│   │   │   │   ├── validation.js
│   │   │   │   ├── modal.js
│   │   │   │   └── crypto.js  # E2EE
│   │   │   └── main.js        # Entry point
│   │   ├── styles/
│   │   │   ├── reset.scss
│   │   │   └── style.scss
│   │   └── index.html
│   ├── public/                # Статика
│   ├── package.json
│   ├── vite.config.js
│   ├── nginx.conf
│   └── Dockerfile
│
├── docs/                       # Документация
│   ├── WINDOWS_DEV.md
│   ├── ARCHITECTURE.md
│   ├── API.md
│   ├── SECURITY.md
│   ├── CLI.md
│   └── DEPLOY.md
│
├── docker-compose.yml
├── install.sh
├── uninstall.sh
├── README.md
└── .gitignore
```

## 🏗️ Backend архитектура

### Слои приложения

```
HTTP Request
     ↓
Middleware (CORS, Rate Limit, Auth)
     ↓
Routes (URL routing)
     ↓
Controllers (HTTP logic)
     ↓
Services (Business logic)
     ↓
Database (Drizzle ORM)
     ↓
PostgreSQL
```

### Принципы

1. **Separation of Concerns** - Каждый слой отвечает за свою задачу
2. **Dependency Injection** - Сервисы создаются один раз
3. **Type Safety** - TypeScript + Drizzle + Zod
4. **Security First** - Валидация на всех уровнях

### Controllers

Отвечают за HTTP логику:
- Парсинг запросов
- Валидация входных данных
- Вызов сервисов
- Формирование ответов

```typescript
// Пример: auth.controller.ts
async login(c: Context) {
  // 1. Получение данных
  const credentials = parseHeaders(c);

  // 2. Валидация
  const valid = validateData(loginSchema, credentials);

  // 3. Бизнес-логика (через сервис)
  const result = await authService.login(login, password);

  // 4. Ответ
  return sendSuccess(c, "Login successful", { accessToken });
}
```

### Services

Содержат бизнес-логику:
- Работа с БД
- Бизнес-правила
- Валидация на уровне логики

```typescript
// Пример: auth.service.ts
async login(login: string, password: string) {
  // Поиск пользователя
  const user = await db.query.users.findFirst(...);

  // Проверка пароля
  const valid = await verifyPassword(user.password, password);

  // Генерация токенов
  const tokens = generateTokens(user.id, user.username);

  return { user, tokens };
}
```

### WebSocket (Socket.IO)

```
Client connects
     ↓
Check JWT in handshake
     ↓
Load messages from DB
     ↓
Listen for events:
  - send_message
  - delete_message
  - disconnect
     ↓
Broadcast to all clients
```

## 🎨 Frontend архитектура

### Модульная структура

```
main.js (Entry point)
     ↓
├── Auth Module
│   ├── authService (API calls)
│   └── authForms (UI logic)
│
├── Chat Module
│   ├── socket (WebSocket)
│   ├── chatManager (Logic)
│   └── messageRenderer (UI)
│
└── Utils
    ├── storage (LocalStorage)
    ├── validation
    ├── modal
    └── crypto (E2EE)
```

### Паттерны

1. **Module Pattern** - Каждая фича в отдельном файле
2. **Event-driven** - События для коммуникации между модулями
3. **Separation of Concerns** - Логика отделена от UI

### Пример модуля

```javascript
// auth/authService.js - API взаимодействие
export const authService = {
  async login(login, password) {
    const response = await fetch(...);
    return response.json();
  }
};

// auth/authForms.js - UI логика
export class LoginForm {
  constructor(selector, onSuccess) {
    this.form = document.querySelector(selector);
    this.setupValidation();
    this.form.addEventListener('submit', this.handleSubmit);
  }

  async handleSubmit(e) {
    e.preventDefault();
    const result = await authService.login(...);
    if (result.success) this.onSuccess();
  }
}
```

## 🔐 Безопасность

### Слои защиты

1. **Network Level**
   - CORS (только разрешённые домены)
   - Rate Limiting (защита от DDoS)
   - HTTPS в production

2. **Application Level**
   - JWT с refresh tokens
   - httpOnly cookies (защита от XSS)
   - Argon2 для паролей (защита от брутфорса)

3. **Database Level**
   - Параметризованные запросы (защита от SQL injection)
   - Drizzle ORM type-safe queries

4. **Message Level**
   - E2EE с libsodium (защита от перехвата)

### Аутентификация

```
1. User login
     ↓
2. Generate access token (15min) + refresh token (30d)
     ↓
3. Save refresh token in httpOnly cookie
     ↓
4. Return access token to client
     ↓
5. Client stores in localStorage
     ↓
6. Client sends access token in Authorization header
     ↓
7. Access token expires → refresh via refresh token
     ↓
8. Logout → clear both tokens
```

## 🗄️ База данных

### Схема

```sql
users
├── id (serial, PK)
├── login (text, unique)
├── username (text)
├── password (text, argon2)
├── role (integer, 1=user, 3=admin)
├── refresh_token (text)
├── public_key (text, E2EE)
└── created_at (timestamp)

messages
├── id (serial, PK)
├── user_id (integer, FK -> users.id)
├── username (text)
├── message (text)
└── date (timestamp)
```

### Миграции

Drizzle Kit генерирует SQL миграции:
```bash
bun run db:generate  # Генерация из schema.ts
bun run db:migrate   # Применение миграций
```

## 🔄 Жизненный цикл запроса

### HTTP (REST API)

```
1. Client отправляет fetch('/auth/login')
     ↓
2. CORS middleware проверяет origin
     ↓
3. Rate Limiter проверяет лимит запросов
     ↓
4. Route определяет контроллер
     ↓
5. Controller валидирует данные (Zod)
     ↓
6. Service выполняет бизнес-логику
     ↓
7. Database запрос через Drizzle
     ↓
8. Controller формирует ответ
     ↓
9. Client получает JSON response
```

### WebSocket

```
1. Client подключается к Socket.IO
     ↓
2. Server проверяет JWT в handshake.query
     ↓
3. Server загружает сообщения из БД
     ↓
4. Client emit('send_message', data)
     ↓
5. Server проверяет JWT в data.accessToken
     ↓
6. Server сохраняет в БД
     ↓
7. Server broadcast('send_message', newMessage)
     ↓
8. Все клиенты получают обновление
```

## 🚀 Deployment

### Production stack

```
User
  ↓ HTTPS
Nginx (Reverse Proxy + Static Files)
  ↓
  ├─→ Frontend (client/dist)
  └─→ Backend (server:3000)
       ↓
    PostgreSQL (Docker)
```

### Docker Compose

```yaml
services:
  postgres: # Database
  server:   # Backend API + WebSocket
  client:   # Frontend (Nginx)
```

## 📊 Диаграмма компонентов

```
┌─────────────────────────────────────────┐
│              Browser                    │
│  ┌────────────┐        ┌─────────────┐ │
│  │   HTML     │        │   Socket    │ │
│  │   SCSS     │───────▶│   Client    │ │
│  │ Vanilla JS │        └─────────────┘ │
│  └────────────┘                         │
└──────┬──────────────────────────────────┘
       │ HTTP/WS
       │
┌──────▼──────────────────────────────────┐
│            Backend Server               │
│  ┌──────────┐      ┌────────────────┐  │
│  │   Hono   │─────▶│   Socket.IO    │  │
│  │  Routes  │      │    Server      │  │
│  └────┬─────┘      └────────────────┘  │
│       │                                 │
│  ┌────▼──────────────────────────────┐ │
│  │        Services + Utils           │ │
│  └────┬──────────────────────────────┘ │
│       │                                 │
│  ┌────▼──────────────────────────────┐ │
│  │        Drizzle ORM                │ │
│  └────┬──────────────────────────────┘ │
└───────┼─────────────────────────────────┘
        │
┌───────▼─────────────────────────────────┐
│          PostgreSQL Database            │
└─────────────────────────────────────────┘
```

## 🎯 Лучшие практики

### Backend
- ✅ Type-safe запросы (Drizzle)
- ✅ Валидация на каждом слое (Zod)
- ✅ Separation of concerns
- ✅ Error handling
- ✅ Security by default

### Frontend
- ✅ Модульная структура
- ✅ Переиспользуемые компоненты
- ✅ Event-driven architecture
- ✅ Простой и читаемый код
- ✅ ES6 modules

### Общее
- ✅ Не хардкодить секреты
- ✅ Использовать .env
- ✅ Документировать код
- ✅ Версионировать изменения
- ✅ Регулярные коммиты
