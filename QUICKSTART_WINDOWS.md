# 🚀 Быстрый старт на Windows

Максимально простая инструкция для запуска на Windows.

## 1️⃣ Установите Bun

PowerShell (от имени администратора):
```powershell
powershell -c "irm bun.sh/install.ps1 | iex"
```

После установки **перезапустите терминал**.

## 2️⃣ Запустите PostgreSQL

**Docker (рекомендуется):**
```powershell
docker run -d --name chat-postgres -e POSTGRES_USER=chat_user -e POSTGRES_PASSWORD=chat_password -e POSTGRES_DB=chat -p 5432:5432 postgres:16-alpine
```

**Или** установите PostgreSQL с [postgresql.org](https://www.postgresql.org/download/windows/)

## 3️⃣ Backend

```powershell
cd server
bun install
copy .env.example .env
notepad .env  # Отредактируйте DATABASE_URL
bun run db:generate
bun run db:migrate
bun run dev
```

## 4️⃣ Frontend

**Новый терминал:**
```powershell
cd client
npm install
npm run dev
```

## 5️⃣ Откройте

http://localhost:5173

---

## 🐛 Проблемы?

**"Bun не найден"** → Перезапустите терминал

**"Cannot connect to database"** → Проверьте DATABASE_URL в .env

**"Port already in use"** → Измените PORT в .env

---

📚 **Полная документация:** [docs/WINDOWS_DEV.md](docs/WINDOWS_DEV.md)
