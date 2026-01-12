# API Документация

REST API endpoints и Socket.IO события.

## 🌐 Base URL

```
Development: http://localhost:3000
Production:  https://your-domain.com
```

## 🔐 Authentication

Все защищённые endpoints требуют JWT токен в header:
```
Authorization: Bearer <access_token>
```

Refresh token хранится в httpOnly cookie.

---

## 📡 REST API Endpoints

### Auth

#### `POST /auth/registration`

Регистрация нового пользователя.

**Headers:**
```
authorization: login:password:username
```

**Response:**
```json
{
  "success": true,
  "message": "User registered successfully",
  "data": {
    "accessToken": "eyJhbGc..."
  }
}
```

**Errors:**
- `400` - Invalid input data
- `401` - User already exists

---

#### `POST /auth/login`

Вход пользователя.

**Headers:**
```
authorization: login:password
```

**Response:**
```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "accessToken": "eyJhbGc..."
  }
}
```

**Errors:**
- `400` - Invalid credentials format
- `401` - Invalid credentials

---

#### `GET /auth/session`

Проверка активной сессии.

**Headers:**
```
authorization: Bearer <access_token>
```

**Response (valid session):**
```json
{
  "success": true,
  "message": "Session valid"
}
```

**Response (token expired, auto-refreshed):**
```json
{
  "success": true,
  "message": "Session restored with new tokens",
  "data": {
    "accessToken": "eyJhbGc..."
  }
}
```

**Errors:**
- `403` - Session expired, please login again

---

#### `GET /auth/refresh`

Обновление access/refresh токенов.

**Headers:**
```
authorization: Bearer <access_token>
```

**Response:**
```json
{
  "success": true,
  "message": "Tokens refreshed",
  "data": {
    "accessToken": "eyJhbGc..."
  }
}
```

**Errors:**
- `403` - Invalid or expired refresh token

---

#### `POST /auth/logout`

Выход (удаление токенов).

**Headers:**
```
authorization: Bearer <access_token>
```

**Response:**
```json
{
  "success": true,
  "message": "Logout successful"
}
```

---

## 🔌 Socket.IO Events

### Client → Server

#### `connection`

Подключение к серверу.

**Query params:**
```javascript
{
  accessToken: "eyJhbGc..."
}
```

**Server response:**
- `check_session` - Если токен невалиден
- `client_logout` - Если нет токена
- `load_messages` - Загрузка всех сообщений

---

#### `send_message`

Отправка сообщения.

**Data:**
```javascript
{
  accessToken: "eyJhbGc...",
  message: "Hello world!"
}
```

**Server broadcasts:**
```javascript
{
  id: 123,
  userId: 1,
  username: "John",
  message: "Hello world!",
  date: "2024-01-12T10:30:00.000Z"
}
```

---

#### `delete_message`

Удаление сообщения.

**Data:**
```javascript
{
  accessToken: "eyJhbGc...",
  id: 123
}
```

**Permissions:**
- Пользователь может удалить своё сообщение
- Админ (role >= 3) может удалить любое сообщение

**Server broadcasts:**
```javascript
{
  id: 123
}
```

---

### Server → Client

#### `load_messages`

Загрузка всех сообщений при подключении.

**Data:**
```javascript
{
  messages: [
    {
      id: 1,
      userId: 1,
      username: "John",
      message: "Hello",
      date: "2024-01-12T10:30:00.000Z"
    },
    // ...
  ]
}
```

---

#### `send_message`

Новое сообщение (broadcast всем клиентам).

**Data:**
```javascript
{
  id: 123,
  userId: 1,
  username: "John",
  message: "Hello world!",
  date: "2024-01-12T10:30:00.000Z"
}
```

---

#### `delete_message`

Сообщение удалено (broadcast всем клиентам).

**Data:**
```javascript
{
  id: 123
}
```

---

#### `check_session`

Сессия невалидна, нужно обновить.

Клиент должен вызвать `/auth/session` или `/auth/refresh`.

---

#### `refresh_tokens`

Предложение обновить токены (перед истечением).

Клиент должен вызвать `/auth/refresh`.

---

#### `client_logout`

Принудительный выход (невалидный токен).

Клиент должен очистить localStorage и показать форму логина.

---

## 🔍 Response Format

### Success Response
```json
{
  "success": true,
  "message": "Operation completed",
  "data": {
    // optional data object
  }
}
```

### Error Response
```json
{
  "success": false,
  "message": "Error description"
}
```

---

## 🚦 HTTP Status Codes

- `200` - OK
- `201` - Created
- `400` - Bad Request (invalid input)
- `401` - Unauthorized (invalid credentials)
- `403` - Forbidden (expired token, no permissions)
- `429` - Too Many Requests (rate limit exceeded)
- `500` - Internal Server Error

---

## 🛡️ Rate Limiting

**Defaults:**
- Window: 15 minutes
- Max requests: 100 per IP

Превышение лимита вернёт:
```json
{
  "success": false,
  "message": "Too many requests"
}
```

Status: `429`

---

## 🧪 Примеры использования

### JavaScript (fetch)

```javascript
// Login
const login = async (username, password) => {
  const response = await fetch('http://localhost:3000/auth/login', {
    method: 'POST',
    credentials: 'include', // Important for cookies
    headers: {
      'authorization': `${username}:${password}`
    }
  });
  return await response.json();
};

// Check session
const checkSession = async (accessToken) => {
  const response = await fetch('http://localhost:3000/auth/session', {
    method: 'GET',
    credentials: 'include',
    headers: {
      'authorization': `Bearer ${accessToken}`
    }
  });
  return await response.json();
};
```

### Socket.IO Client

```javascript
import { io } from 'socket.io-client';

const socket = io('http://localhost:3000', {
  query: {
    accessToken: 'eyJhbGc...'
  }
});

// Listen for messages
socket.on('send_message', (message) => {
  console.log('New message:', message);
});

// Send message
socket.emit('send_message', {
  accessToken: 'eyJhbGc...',
  message: 'Hello!'
});
```

---

## 📝 Notes

1. **Access token** хранится в localStorage
2. **Refresh token** хранится в httpOnly cookie (защита от XSS)
3. Access token истекает через **15 минут**
4. Refresh token истекает через **30 дней**
5. При истечении access token, клиент автоматически вызывает refresh
6. WebSocket соединение требует валидный access token в каждом событии
