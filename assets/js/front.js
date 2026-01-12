/*

todo БД сообщений - чтение/запись на фронте и в БД, помимо имени и текста сделать время отправки
todo вёрстка сообщений

*/

function symbolsRange(from, to, elem) {
    const regex = new RegExp(`^.{${from},${to}}$`);
    return regex.test(elem);
}

function jwtGetPayload(token) {
    const tokenParts = token.split(".");
    return JSON.parse(atob(tokenParts[1]));
}

class Modal {
    modalElem;
    modalOpenButton;
    modalCloseButton;

    constructor(modalElem, modalOpenButton) {
        this.modalElem = modalElem;

        if (modalOpenButton) {
            this.modalOpenButton = modalOpenButton;
            this.modalCloseButton = modalElem.querySelector(`button[name="close"]`);

            this.modalOpenButton.addEventListener("click", this.openModal.bind(this));
            this.modalCloseButton.addEventListener("click", this.closeModal.bind(this));
        }
    }
    closeModal(e) {
        this.modalElem.classList.remove("active");
    }
    openModal(e) {
        this.modalElem.classList.add("active");
    }
    toggleModal(e){
        this.modalElem.classList.toggle("active");
    }
}

class ModalsSwitcher {
    modal1;
    modal1Button;
    modal2;
    modal2Button;

    constructor(modal1, modal2) {
        this.modal1 = modal1;
        this.modal1Button = modal1.querySelector(`button[name="switcher"]`);
        this.modal2 = modal2;
        this.modal2Button = modal2.querySelector(`button[name="switcher"]`);

        this.addListeners();
    }

    addListeners() {
        this.modal1Button.addEventListener("click", this.modalsSwitcher.bind(this));
        this.modal2Button.addEventListener("click", this.modalsSwitcher.bind(this));
    }

    modalsSwitcher() {
        this.modal1.classList.toggle("active");
        this.modal2.classList.toggle("active");
    }
}

class ModalForm extends Modal {
    modalForm
    constructor(modalElem) {
        super(modalElem);
        this.modalForm = modalElem.querySelector("form");
        this.modalForm.addEventListener("submit", this.onSubmitForm.bind(this));
    }

    async onSubmitForm(e) {
        e.preventDefault();
    }
}

class ModalFormAuth extends ModalForm {
    loginInput;
    passwordInput;

    constructor(modalForm) {
        super(modalForm);
        this.loginInput = modalForm.querySelector(`input[name="login"]`);
        this.passwordInput = modalForm.querySelector(`input[name="password"]`);

        this.addListeners();
    }

    addListeners() {
        this.loginInput.addEventListener("keydown", this.loginKeyValidation.bind(this));
        this.loginInput.addEventListener("paste",   this.loginPasteValidation.bind(this));
        this.loginInput.addEventListener("input",   this.fieldsLengthValidation.bind(this));

        this.passwordInput.addEventListener("keydown", this.passwordKeyValidation.bind(this));
        this.passwordInput.addEventListener("paste",   this.passwordPasteValidation.bind(this));
        this.passwordInput.addEventListener("input",   this.fieldsLengthValidation.bind(this));
    }
    loginKeyValidation(e) {
        if (e.key.length === 1 && !e.ctrlKey) {
            const regex = /^[a-zA-Z0-9_-]+$/;
            if (!regex.test(e.key)) {
                e.preventDefault();
            }
        }
    }
    loginPasteValidation(e) {
        const regex = /^[a-zA-Z0-9_-]+$/;
        if (!regex.test(e.clipboardData.getData('text'))) {
            e.preventDefault();
        }
    }
    passwordKeyValidation(e) {
        if (e.key.length === 1 && !e.ctrlKey) {
            const regex = /^[a-zA-Z0-9!@#$%^&*()_+{}:"<>?[\]\\|/=-]+$/;
            if (!regex.test(e.key)) {
                e.preventDefault();
            }
        }
    }
    passwordPasteValidation(e) {
        if (e.type === 'paste') {
            e.preventDefault();
        }
    }
    // todo Unused parameter e
    fieldsLengthValidation(e) {
        if (symbolsRange(6, 16, this.loginInput.value)){
            this.authButton.classList.add("active");
        } else {
            this.authButton.classList.remove("active");
            return
        }
        if (symbolsRange(8, 16, this.passwordInput.value)){
            this.authButton.classList.add("active");
        } else {
            this.authButton.classList.remove("active");
        }
    }
}

class ModalFormRegistration extends ModalFormAuth {
    authButton;
    authResponse;
    usernameInput;

    constructor(modalForm) {
        super(modalForm);
        this.usernameInput = modalForm.querySelector(`input[name="username"]`);
        this.authButton = modalForm.querySelector(`button[type="submit"]`);
        this.authResponse = modalForm.querySelector(`.auth-response`);

        this.addListeners2();
    }

    addListeners2() {
        this.usernameInput.addEventListener("keydown", this.usernameKeyValidation.bind(this));
        this.usernameInput.addEventListener("paste",   this.usernamePasteValidation.bind(this));
        this.usernameInput.addEventListener("input",   this.fieldsLengthValidation.bind(this));
    }

    usernameKeyValidation(e) {
        if (e.key.length === 1 && !e.ctrlKey) {
            const regex = /[\p{L}\p{N}_-]$/u;
            if (!regex.test(e.key)) {
                e.preventDefault();
            }
        }
    }
    usernamePasteValidation(e) {
        const regex = /[\p{L}\p{N}_-]$/u;
        if (!regex.test(e.clipboardData.getData('text'))) {
            e.preventDefault();
        }
    }
    fieldsLengthValidation(e) {
        if (symbolsRange(2, 16, this.usernameInput.value)){
            this.authButton.classList.add("active");
        } else {
            this.authButton.classList.remove("active");
            return
        }
        super.fieldsLengthValidation(e);
    }

    async onSubmitForm(e) {
        e.preventDefault();
        if (!e.submitter.classList.contains("active")) //todo активность кнопки, попробовать замену на disabled
            return
        let credentials = JSON.stringify(Object.fromEntries(new FormData(this.modalForm)));
        credentials = JSON.parse(credentials);
        const register = await fetch('/auth/registration', {
            method: e.target.method,
            headers: {
                "authorization": `${credentials.login}:${credentials.password}:${encodeURIComponent(credentials.username)}`
            },
            body: {},
        })
        const registrationResponse = await register.json();
        console.log(registrationResponse);
        if (!registrationResponse.success){
            this.authResponse.innerHTML = registrationResponse.message;
            this.authResponse.classList.add("active");
            this.loginInput.classList.add("error");
            return
        }
        const accessToken = registrationResponse.data.accessToken;
        const tokenPayload = jwtGetPayload(accessToken);
        const userId = tokenPayload.userId;
        const userRole = tokenPayload.userRole;
        localStorage.setItem('accessToken', accessToken);
        localStorage.setItem('userId', userId);
        localStorage.setItem('userRole', userRole);
        socketConnection();
        this.authResponse.innerHTML = "";
        this.authResponse.classList.remove("active");
        this.loginInput.classList.remove("error");
        this.closeModal();
    }
}
class ModalFormLogin extends ModalFormAuth {
    authButton;
    authResponse;

    constructor(modalForm) {
        super(modalForm);
        this.authButton = modalForm.querySelector(`button[type="submit"]`);
        this.authResponse = modalForm.querySelector(`.auth-response`);
    }

    async onSubmitForm(e) {
        e.preventDefault();
        if (!e.submitter.classList.contains("active")) //todo активность кнопки, попробовать замену на disabled
            return
        let data = JSON.stringify(Object.fromEntries(new FormData(this.modalForm)));

        data = JSON.parse(data);
        const login = await fetch('/auth/login', {
            method: e.target.method,
            headers: {
                "authorization": `${data.login}:${data.password}`
            },
            body: {},
        })
        const loginResponse = await login.json();
        console.log(loginResponse);
        if (!loginResponse.success){
            this.authResponse.innerHTML = loginResponse.message;
            this.authResponse.classList.add("active");
            this.loginInput.classList.add("error");
            this.passwordInput.classList.add("error");
            return
        }
        const accessToken = loginResponse.data.accessToken;
        const tokenPayload = jwtGetPayload(accessToken);
        const userId = tokenPayload.userId;
        const userRole = tokenPayload.userRole;
        localStorage.setItem('accessToken', accessToken);
        localStorage.setItem('userId', userId);
        localStorage.setItem('userRole', userRole);
        socketConnection();
        this.authResponse.innerHTML = "";
        this.authResponse.classList.remove("active");
        this.loginInput.classList.remove("error");
        this.passwordInput.classList.remove("error");
        this.closeModal();
    }
}

const modalRegistration = document.querySelector('.modal-registration');
const modalLogin = document.querySelector('.modal-login');
const formRegistration = new ModalFormRegistration(modalRegistration);
const formLogin = new ModalFormLogin(modalLogin);
const modalsSwitcher = new ModalsSwitcher(modalRegistration, modalLogin);

function userLogout() {
    socketConnection().disconnect();
    socket = null;
    localStorage.removeItem('accessToken');
    localStorage.removeItem('userId');
    localStorage.removeItem('userRole');
    messages.innerHTML = "";
    formLogin.openModal();
}
async function checkSession() {
    let accessToken = localStorage.getItem('accessToken');
    if (!accessToken) {
        formLogin.openModal();
        return false
    }
    const checkSession = await fetch('/auth/session', {
        method: "GET",
        headers: {
            "authorization": `Bearer ${accessToken}`
        },
    })
    const checkSessionResponse = await checkSession.json();
    if (!checkSessionResponse.success) {
        userLogout();
        return false
    }
    if (checkSessionResponse.data.accessToken) {
        console.log("Новая пара токенов");
        accessToken = checkSessionResponse.data.accessToken;
        const tokenPayload = jwtGetPayload(accessToken);
        const userId = tokenPayload.userId;
        const userRole = tokenPayload.userRole;
        localStorage.setItem('accessToken', accessToken);
        localStorage.setItem('userId', userId);
        localStorage.setItem('userRole', userRole);
    }
    socketConnection();
    console.log("Вход по сохранённой сессии");
    return true
}

document.addEventListener("DOMContentLoaded", function() {
    checkSession()
});

async function refreshTokens() {
    let accessToken = localStorage.getItem('accessToken');
    if (!accessToken) {
        userLogout();
        return
    }
    const refresh = await fetch('/auth/refresh', {
        method: "GET",
        headers: {
            "authorization": `Bearer ${accessToken}`
        }
    })
    const refreshResponse = await refresh.json();
    if (!refreshResponse.success) {
        userLogout();
        return
    }
    console.log("Пара токенов обновлена");
    accessToken = refreshResponse.data.accessToken;
    const tokenPayload = jwtGetPayload(accessToken);
    const userId = tokenPayload.userId;
    const userRole = tokenPayload.userRole;
    localStorage.setItem('accessToken', accessToken);
    localStorage.setItem('userId', userId);
    localStorage.setItem('userRole', userRole);
}

async function logout() {
    const accessToken = localStorage.getItem('accessToken');
    if (accessToken) {
        const logout = await fetch('/auth/logout', {
            method: "POST",
            headers: {
                "authorization": `Bearer ${accessToken}`
            }
        })
    }
    userLogout()
}

document.addEventListener('click', e=>{
    if (!e.target.closest(`button[name='logout']`)) {
        return
    }
    logout();
})

// Кнопка отправки сообщения
document.addEventListener("input", e => {
    const messageInputField = e.target.closest('.message-input__textarea');
    if (!messageInputField) return

    const messageInputBlock = messageInputField.closest('.message-input');
    const messageSendButton = messageInputBlock.querySelector('.message-input__button');

    messageSendButton.classList.toggle('active', messageInputField.value.length);
})
