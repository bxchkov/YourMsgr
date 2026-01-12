// Инициализируем socket.io
let socket;

// Костыль?
function socketConnection() {
    if (!socket) {
        socket = io.connect({
            query: {
                accessToken: localStorage.getItem('accessToken')
            }});
        addSocketListeners();
    }
    return socket
}

const messages = document.querySelector('.chat__messages'); // Блок сообщений
const messageField = document.querySelector('.message-input__textarea'); // Поле отправки сообщения
const messageSendButton = document.querySelector('.message-input__button'); // Кнопка отправки сообщения

const userLocale = navigator.language || 'ru-RU';
const userTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

// Ф-ия, которая вызывает событие отправки сообщения через сокет
function sendMessage(message) {
    const accessToken = localStorage.getItem('accessToken');
    socketConnection().emit('send_message', {accessToken: accessToken, message: message});
    messageSendButton.classList.remove('active');
}
// Отслеживаем клик на кнопку отправки сообщения
document.addEventListener("click", e => {
    if (e.target !== messageSendButton) {
        return;
    }
    if (!messageField.value || !messageSendButton.classList.contains('active')){
        return;
    }
    sendMessage(messageField.value);
    messageField.value = '';
})
// Enter в поле отправки сообщения
messageField.addEventListener("keyup", e=> {
    if (e.keyCode === 13 && messageField.value) {
        sendMessage(messageField.value);
        messageField.value = '';
    }
});

function formatMessageDateTime(timestamp, locale = userLocale, timeZone = userTimeZone) {
    const date = new Date(timestamp);

    // Форматы для разных случаев

    return {
        time: date.toLocaleTimeString(locale, {
            timeZone,
            hour: '2-digit',
            minute: '2-digit'
        }),
        date: date.toLocaleDateString(locale, {
            timeZone,
            day: 'numeric',
            month: 'long',
            year: timestamp < new Date().setFullYear(new Date().getFullYear()) ? 'numeric' : undefined
        }),
        fullDateTime: date.toLocaleString(locale, {
            timeZone,
            hour: '2-digit',
            minute: '2-digit',
            day: 'numeric',
            month: 'short',
            year: 'numeric'
        })
    };
}

// Функция, которая добавляет проверенное сообщение(я) в вёрстке
function addMessage(data) {
    console.log(data);
    const messageDateTime = formatMessageDateTime(data.date);

    const currentTime = messageDateTime.time;
    const deleteButton = `
        <button class="message__delete">
            <svg viewBox="0 0 24 24" 
            fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M10 12V17" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M14 12V17" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M4 7H20" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M6 10V18C6 19.6569 7.34315 21 9 21H15C16.6569 21 18 19.6569 18 18V10" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M9 5C9 3.89543 9.89543 3 11 3H13C14.1046 3 15 3.89543 15 5V7H9V5Z" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
       </button>`
    const isUserOwnMessage = data.user_id-0 === localStorage.userId-0; // todo degenerat
    const isUserAdmin = localStorage.userRole >= 3;

    // if (isUserOwnMessage) { todo мб потом со скроллом что-нибудь придумать
        // messages.scrollTo({
        //     top: 0,
        //     behavior: "smooth",
        // });
    // }

    const message =
        `<div id="${data.id}" class="message ${isUserOwnMessage ? 'my-message' : ''}">
             <div class="message__username">
                ${data.username}
             </div>
             <div class="message__text">
                ${data.message}
             </div>
             ${(isUserOwnMessage || isUserAdmin) ? deleteButton : ''}
             <div class="message__time">
                ${currentTime}
             </div>
         </div>`

    messages.insertAdjacentHTML('afterbegin', message);
}

// Ф-ия, которая вызывает событие удаления сообщения через сокет
async function deleteMessage(accessToken, messageId) {
    socketConnection().emit('delete_message', {accessToken: accessToken, id: messageId});
}
// Отслеживаем клик на кнопку удаления сообщения
document.addEventListener('click', async e => {
    if (!e.target.closest('.message__delete')) {
        return
    }
    const messageDeleteButton = e.target;
    const deletedMessage = messageDeleteButton.closest('.message');
    const messageId = deletedMessage.id;
    const accessToken = localStorage.getItem('accessToken');
    if (!accessToken) {
        return
    }
    await deleteMessage(accessToken, messageId);
})

// Здесь отслеживаем события socket io
async function addSocketListeners() {
    socketConnection().on('send_message', data => {
        addMessage(data);
    });
    socketConnection().on('check_session', async () => {
        if (!await checkSession()) {
            console.log("Сессия невалидна, войдите снова");
        }
    });
    socketConnection().on('refresh_tokens', () => {
        refreshTokens();
    });
    socketConnection().on('delete_message', data => {
        const deletedMessage = document.getElementById(`${data.id}`)
        if (!deletedMessage.classList.contains('message')) {
            return
        }
        deletedMessage.remove();
    });
    socketConnection().on('load_messages', data => {
        messages.innerHTML = ""
        const dbMessages = data.messages;
        dbMessages.forEach((message) => {
            addMessage(message);
        })
    });
    socketConnection().on('client_logout', () => {
        logout()
    });
}
