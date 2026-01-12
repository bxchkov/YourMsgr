// Подключение всех модулей к программе
const express = require('express');
const cookieParser = require("cookie-parser");
const cookie = require("cookie");
const http = require('http');
const https = require('https');
const app = express();
const PORT = 3000;

const server = http.createServer(app);
const io = require('socket.io')(server, {
    cors: {
        origin: '*'
    }
});

// Парсинг json
app.use(express.json());
// Парсинг cookies
app.use(cookieParser());

// Запуск сервера
const start = () => {
    try {
        server.listen(PORT, ()=> console.log(`Server listened on port ${PORT}`));
    } catch (err) {
        console.log(err);
    }
}
start();

// Отслеживание url адреса и отображение нужной HTML страницы
app.get('/', function (request, response) {
    response.sendFile(__dirname + '/index.html');
    // Добавление всей директории на сервер
    app.use(express.static(__dirname));
});
app.get('/admin', function (request, response) {
    response.sendFile(__dirname + '/admin.html');
    // Добавление всей директории на сервер
    app.use(express.static(__dirname));
});



const mysql = require('mysql2');
const argon2 = require('argon2');
const jwt = require('jsonwebtoken');
const {jwtAccessSecret, jwtRefreshSecret} = require("./config");

// Подключение к БД
const conn = mysql.createConnection({
    host: "localhost",
    user: "chat_admin",
    database: "chat",
    password: "191101mb"
})

// Валидация входящих пользовательских данных
function userDataValidate(login, password, username) {
    if (username){
        return (/^.{6,16}$/.test(login) && /^.{8,16}$/.test(password) && /^.{2,16}$/.test(username))
    }
    return (/^.{6,16}$/.test(login) && /^.{8,16}$/.test(password))
}
// Хеширование пароля
async function hashPassword(password) {
    try {
        return await argon2.hash(password);
    } catch (err) {
        console.error(err);
    }
}
// Проверка пароля
async function argonVerifier(hashedData, data) {
    try {
        return await argon2.verify(hashedData, data);
    } catch (err) {
        console.error(err);
    }
}
// Создание токена
function generateTokens(userId, userName, userRole = 1) {
    const payload = {
        userId,
        userName,
        userRole,
        iat: Math.floor(Date.now() / 1000)
    }
    const accessToken  = jwt.sign(payload, jwtAccessSecret,  {expiresIn: "10s"}); // todo test, потом сделать 15m 30d
    const refreshToken = jwt.sign(payload, jwtRefreshSecret, {expiresIn: "30d"});
    return {
        accessToken,
        refreshToken
    }
}
// Сохранение refreshToken
async function saveRefreshToken (response, userId, refreshToken) {
    response.cookie('refreshToken', refreshToken, {maxAge: 30 * 24 * 60 * 60 * 1000, httpOnly: true}); // todo secure: true (https)
    const dbSaveToken = await conn.promise().query(
        `UPDATE Users SET refresh_token = '${refreshToken}' WHERE id = '${userId}';`
    );
}
// Удаление рефреш токена с клиента (и бд)
async function removeRefreshToken (response, userId = null) {
    response.clearCookie('refreshToken');
    if (!userId) {
        return
    }
    const dbClearToken = await conn.promise().query(
        `UPDATE Users SET refresh_token = '' WHERE id = '${userId}';`
    );
}
// Валидация accessToken (Просто валидация с 1 арг. на входе или с рефрешем токенов при 2 арг.)
async function validateAccessToken(accessToken, refreshToken = null) {
    try {
        if (!refreshToken && jwt.verify(accessToken, jwtAccessSecret)) {
            return accessToken
        }
        if (jwt.verify(accessToken, jwtAccessSecret)) {
            return {accessToken, refreshToken}
        }
    } catch (err) {
        if (!refreshToken) {
            return null
        }
        if (err.message === "jwt expired") {
            console.log("срок действия accessToken'а истёк, обновляем...");
            const refreshedTokens = await refreshTokens(accessToken, refreshToken);
            if (!refreshedTokens) {
                return null
            }
            const refreshedAccessToken = refreshedTokens.accessToken;
            const refreshedRefreshToken = refreshedTokens.refreshToken;
            return validateAccessToken(refreshedAccessToken, refreshedRefreshToken);
        } else {
            console.log("accessToken не прошёл проверку");
            return null
        }
    }
}
// Валидация refreshToken
function validateRefreshToken(refreshToken) {
    try {
        return jwt.verify(refreshToken, jwtRefreshSecret)
    } catch (err) {
        console.log("refreshToken не прошёл проверку");
        return null
    }
}
// Обновление (рефреш) access и refresh токенов
async function refreshTokens (accessToken, refreshToken) {
    try {
        if (!validateRefreshToken(refreshToken)) {
            return null
        }
        const decodedAccessToken = jwt.decode(accessToken);
        const userId = decodedAccessToken.userId;
        const [dbUsers] = await conn.promise().query(
            `SELECT * FROM Users
             WHERE id = "${userId}"`
        );
        if (dbUsers.length === 0) {
            console.log("Искомый пользователь не найден в БД");
            return null
        }
        if (!dbUsers[0].refresh_token) {
            console.log("refreshToken не найден в БД");
            return null
        }
        if (dbUsers[0].refresh_token !== refreshToken) {
            console.log("refreshToken не совпадает с найденным в БД");
            return null
        }
        const userRole = decodedAccessToken.userRole;
        const userName = decodedAccessToken.userName;
        return generateTokens(userId, userName, userRole);
    } catch (err) {
        console.log(err);
    }
}
// Ответ пользователю
function responseToClient (response, status, success, message = "", data = {}) {
    response.status(status).json({
        "success": success,
        "message": message,
        "data": data,
    })
}

class authController {
    async registration (request, response) {
        try {
            const headersAuthorization = request.headers.authorization;
            if (!headersAuthorization){
                responseToClient(response, 400, false);
                return
            }
            let [login, password, userName] = headersAuthorization.split(":");
            if (!login || !password || !userName){
                responseToClient(response, 400, false);
                return
            }
            login = login.toLocaleLowerCase();
            userName = decodeURIComponent(userName);
            if (!userDataValidate(login, password, userName)){
                responseToClient(response, 400, false);
                return
            }
            const [dbUsers] = await conn.promise().query(
                `SELECT * FROM Users 
                 WHERE login = "${login}"`
            );
            if (dbUsers.length !== 0) {
                responseToClient(response, 401, false, "Такой логин уже существует");
                return
            }
            const hashedPassword = await hashPassword(password);
            const dbNewUser = await conn.promise().query(
                `INSERT INTO Users(login, username, password) 
                 VALUES ('${login}', '${userName}', '${hashedPassword}')`
            );
            const newUser = dbNewUser[0];
            const newUserId = newUser.insertId;
            const {accessToken, refreshToken} = generateTokens(newUserId, userName);
            await saveRefreshToken(response, newUserId, refreshToken);
            responseToClient(response, 201, true, "Пользователь зарегистрирован", {"accessToken": accessToken});
        } catch (err) {
            console.log(err);
            responseToClient(response, 500, false, "Ошибка сервера, попробуйте позже");
        }
    }
    async login (request, response) {
        try {
            const headersAuthorization = request.headers.authorization;
            if (!headersAuthorization){
                responseToClient(response, 400, false);
                return
            }
            let [login, password] = headersAuthorization.split(":");
            if (!login || !password){
                responseToClient(response, 400, false);
                return
            }
            login = login.toLocaleLowerCase();
            if (!userDataValidate(login, password)){
                responseToClient(response, 400, false);
                return
            }
            const [dbUsers] = await conn.promise().query(
                `SELECT * FROM Users 
                 WHERE login = "${login}"`
            );
            if (dbUsers.length === 0) {
                responseToClient(response, 401, false, "Неправильное имя или пароль");
                return
            }
            const user = dbUsers[0];
            const userId = user.id;
            const userRole = user.role;
            const userName = user.username;
            const hashedPassword = user.password;
            if (!(await argonVerifier(hashedPassword, password))) {
                responseToClient(response, 401, false, "Неправильное имя или пароль");
                return
            }
            const {accessToken, refreshToken} = generateTokens(userId, userName, userRole);
            await saveRefreshToken(response, userId, refreshToken);
            responseToClient(response, 200, true, "Логин - успешно", {"accessToken": accessToken});
        } catch (err) {
            console.log(err);
            responseToClient(response, 500, false, "Ошибка сервера, попробуйте позже");
        }
    }
    async session (request, response) {
        try {
            const headersAuthorization = request.headers.authorization;
            if (!headersAuthorization){
                responseToClient(response, 400, false);
                return
            }
            const accessToken = headersAuthorization.split(' ')[1];
            const refreshToken = request.cookies.refreshToken;
            if (!accessToken || !refreshToken){
                await removeRefreshToken(response);
                responseToClient(response, 403, false, "Сессия истекла, войдите снова");
                return
            }
            const validatedTokens = await validateAccessToken(accessToken, refreshToken);
            const validatedAccessToken = validatedTokens.accessToken;
            const validatedRefreshToken = validatedTokens.refreshToken;
            if (!validatedAccessToken || !validatedRefreshToken) {
                await removeRefreshToken(response);
                responseToClient(response, 403, false, "Сессия истекла, войдите снова");
                return
            }
            if (accessToken + refreshToken === validatedAccessToken + validatedRefreshToken) { // todo выглядит так себе
                responseToClient(response, 200, true, "Вход по сохраненной сессии");
                return
            }
            const decodedAccessToken = jwt.decode(accessToken);
            const userId = decodedAccessToken.userId;
            await saveRefreshToken(response, userId, validatedRefreshToken);
            responseToClient(response, 200, true, "Вход по сохраненной сессии (обновлены токены)", {"accessToken": validatedTokens.accessToken});
        } catch (err) {
            console.log(err);
            responseToClient(response, 500, false, "Ошибка сервера, попробуйте позже");
        }
    }
    async refresh (request, response) {
        try {
            const headersAuthorization = request.headers.authorization;
            if (!headersAuthorization) {
                responseToClient(response, 400, false);
                return
            }
            const accessToken = headersAuthorization.split(' ')[1];
            const refreshToken = request.cookies.refreshToken;
            if (!accessToken || !refreshToken) {
                responseToClient(response, 403, false);
                return
            }
            if (!await validateAccessToken(accessToken)) {
                responseToClient(response, 403, false);
                return
            }
            const newTokens = await refreshTokens(accessToken, refreshToken);
            const newAccessToken = newTokens.accessToken;
            const newRefreshToken = newTokens.refreshToken;
            if (!newAccessToken || !newRefreshToken) {
                responseToClient(response, 403, false);
                return
            }
            const decodedAccessToken = jwt.decode(newAccessToken);
            const userId = decodedAccessToken.userId;
            await saveRefreshToken(response, userId, newRefreshToken);
            responseToClient(response, 200, true, "Токены обновлены", {"accessToken": newAccessToken});
        } catch (err) {
            console.log(err);
            responseToClient(response, 500, false, "Ошибка сервера, попробуйте позже");
        }
    }
    async logout (request, response) {
        try {
            const headersAuthorization = request.headers.authorization;
            if (!headersAuthorization){
                responseToClient(response, 400, false);
                return
            }
            const accessToken = headersAuthorization.split(' ')[1];
            const refreshToken = request.cookies.refreshToken;
            if (!accessToken || !refreshToken) {
                responseToClient(response, 403, false);
                return
            }
            if (!await validateAccessToken(accessToken, refreshToken)) {
                responseToClient(response, 403, false);
                return
            }
            const decodedAccessToken = jwt.decode(accessToken);
            const userId = decodedAccessToken.userId;
            await removeRefreshToken(response, userId);
            responseToClient(response, 200, true, "Выход с аккаунта");
        } catch (err) {
            console.log(err);
            responseToClient(response, 500, false, "Ошибка сервера, попробуйте позже");
        }
    }
}
const auth = new authController();

// Функция, которая сработает при подключении к странице
io.sockets.on('connection', async socket => {
    async function checkSession(data) {
        const refreshToken = cookie.parse(socket.request.headers.cookie).refreshToken;
        const accessToken = data.accessToken;
        if (!accessToken || !refreshToken) {
            socket.emit('client_logout');
            socket.disconnect();
            return null
        }
        if (!await validateAccessToken(accessToken)) {
            socket.emit('check_session');
            return null;
        }
        return accessToken
    }
    await checkSession(socket.handshake.query);
    socket.emit('refresh_tokens');

    function getJwtRemainingTime(token) {
        const decodedPayload = jwt.decode(token);
        const tokenExpirationTime = decodedPayload.exp; // время, когда истёчёт токен
        const currentDate = Date.now(); // текущее время
        return Math.round(tokenExpirationTime - (currentDate / 1000)) // время оставшееся до истечения токена (секунды)
    }
    function getJwtLifetime(token) {
        const decodedPayload = jwt.decode(token);
        const tokenExpirationTime = decodedPayload.exp; // время, когда истёчёт токен
        const tokenCreatedTime = decodedPayload.iat; // время, когда был создан токен
        return tokenExpirationTime - tokenCreatedTime // время жизни токена (секунды)
    }
    let accessTokenLifetime = getJwtLifetime(socket.handshake.query.accessToken) * 0.85;
    let accessTokenExpTime = getJwtRemainingTime(socket.handshake.query.accessToken) * 0.85;
    console.log(`Оставшееся время жизни текущего accessToken'а - ${accessTokenExpTime} секунд`);
    console.log(`Время текущего accessToken'а - ${accessTokenLifetime} секунд`);
    let sessionUpdater;
    const sessionUpdaterOnReload = setTimeout(() => {
        socket.emit('refresh_tokens');
        console.log(`Первичное (при подключении к сокету) обновление сессии (токенов) на основе оставшегося\nвремени accessToken'а - ${accessTokenExpTime} секунд и запуск интервального обновления`)
        sessionUpdater = setInterval(() => {
            console.log(`Спустя время жизни accessToken'а - ${accessTokenLifetime} секунд,\nсработал интервал обновления токенов`);
            socket.emit('refresh_tokens');
        }, accessTokenLifetime * 1000);
    }, accessTokenExpTime * 1000);

    const [dbMessages] = await conn.promise().query(
        `SELECT * FROM Messages`
    );
    socket.emit('load_messages', {messages: dbMessages});

    socket.on('send_message', async data => {
        const accessToken = await checkSession(data);
        if (!accessToken) return

        const decodedAccessToken = jwt.decode(accessToken);
        const userId = decodedAccessToken.userId;
        const userName = decodedAccessToken.userName;
        const messageText = data.message;

        // const userRole = decodedAccessToken.userRole;

        const timestamp = Date.now();

        const [dbNewMessage] = await conn.promise().query(
            `INSERT INTO Messages(user_id, username, message, date)
             VALUES (?, ?, ?, ?)`,
            [userId, userName, messageText, timestamp]
        );

        const newMessage = {
            id: dbNewMessage.insertId,
            user_id: userId,
            username: userName,
            message: messageText,
            date: timestamp
        }

        socket.emit('send_message', newMessage);
        socket.broadcast.emit('send_message', newMessage);
    });

    socket.on('delete_message', async data => {
        const accessToken = await checkSession(data);
        if (!accessToken) {
            return
        }
        const messageId = data.id;
        const decodedAccessToken = jwt.decode(accessToken);
        const userId = decodedAccessToken.userId;
        const userRole = decodedAccessToken.userRole;
        const [dbMessage] = await conn.promise().query(
            `SELECT * FROM Messages WHERE id = '${messageId}';`
        );
        if (userRole < 3) {
            const [dbUsers] = await conn.promise().query(
                `SELECT * FROM Users WHERE id = '${userId}';`
            );
            if (dbUsers[0].id !== dbMessage[0].user_id) {
                socket.emit('check_session');
                return
            }
            const dbDeleteMessage = await conn.promise().query(
                `DELETE FROM Messages WHERE id = '${messageId}';`
            );
        }
        if (userRole >= 3) {
            const dbDeleteMessage = await conn.promise().query(
                `DELETE FROM Messages WHERE id = '${messageId}';`
            );
        }
        io.sockets.emit('delete_message', {id: messageId});
    });

    socket.on('disconnect', () => {
        clearTimeout(sessionUpdaterOnReload);
        clearInterval(sessionUpdater);
        console.log("Отключен чел");
    });
});



const Router = require('express');
const router = new Router();

// Отслеживание роутера
app.use(`/auth`, router); // app.use(`/auth`, authRouter);

router.post('/registration', auth.registration);
router.post('/login', auth.login);
router.get('/session', auth.session);
router.get('/refresh', auth.refresh);
router.post('/logout', auth.logout);
