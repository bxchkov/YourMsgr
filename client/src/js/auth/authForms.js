import { authService } from "./authService.js";
import { saveUserData } from "../utils/storage.js";
import { Modal } from "../utils/modal.js";
import {
  validateLogin,
  validatePassword,
  validateUsername,
  validateKeyPress,
  validatePaste,
} from "../utils/validation.js";

export class AuthForm {
  constructor(formSelector) {
    this.form = document.querySelector(formSelector);
    this.loginInput = this.form?.querySelector('input[name="login"]');
    this.passwordInput = this.form?.querySelector('input[name="password"]');
    this.submitBtn = this.form?.querySelector('button[type="submit"]');
    this.responseEl = this.form?.querySelector(".auth-response");

    this.setupValidation();
    this.form?.addEventListener("submit", (e) => this.handleSubmit(e));
  }

  setupValidation() {
    // Login validation
    this.loginInput?.addEventListener("keydown", (e) => {
      validateKeyPress(e, /^[a-zA-Z0-9_-]$/);
    });
    this.loginInput?.addEventListener("paste", (e) => {
      validatePaste(e, /^[a-zA-Z0-9_-]+$/);
    });

    // Password validation
    this.passwordInput?.addEventListener("keydown", (e) => {
      validateKeyPress(e, /^[a-zA-Z0-9!@#$%^&*()_+{}:"<>?[\]\\|/=-]$/);
    });
    this.passwordInput?.addEventListener("paste", (e) => e.preventDefault());

    // Form validation
    this.loginInput?.addEventListener("input", () => this.validateForm());
    this.passwordInput?.addEventListener("input", () => this.validateForm());
  }

  validateForm() {
    const isValid =
      validateLogin(this.loginInput.value) &&
      validatePassword(this.passwordInput.value);

    this.submitBtn?.classList.toggle("active", isValid);
  }

  showError(message) {
    this.responseEl.textContent = message;
    this.responseEl.classList.add("active");
    this.loginInput.classList.add("error");
    this.passwordInput.classList.add("error");
  }

  clearError() {
    this.responseEl.textContent = "";
    this.responseEl.classList.remove("active");
    this.loginInput.classList.remove("error");
    this.passwordInput.classList.remove("error");
  }

  async handleSubmit(e) {
    e.preventDefault();
  }
}

export class RegistrationForm extends AuthForm {
  constructor(formSelector, onSuccess) {
    super(formSelector);
    this.usernameInput = this.form?.querySelector('input[name="username"]');
    this.onSuccess = onSuccess;
    this.setupUsernameValidation();
  }

  setupUsernameValidation() {
    this.usernameInput?.addEventListener("keydown", (e) => {
      validateKeyPress(e, /[\p{L}\p{N}_-]/u);
    });
    this.usernameInput?.addEventListener("paste", (e) => {
      validatePaste(e, /[\p{L}\p{N}_-]/u);
    });
    this.usernameInput?.addEventListener("input", () => this.validateForm());
  }

  validateForm() {
    const isValid =
      validateUsername(this.usernameInput.value) &&
      validateLogin(this.loginInput.value) &&
      validatePassword(this.passwordInput.value);

    this.submitBtn?.classList.toggle("active", isValid);
  }

  async handleSubmit(e) {
    e.preventDefault();
    if (!this.submitBtn?.classList.contains("active")) return;

    const formData = new FormData(this.form);
    const { login, password, username } = Object.fromEntries(formData);

    const response = await authService.register(login, password, username);

    if (!response.success) {
      this.showError(response.message || "Ошибка регистрации");
      return;
    }

    saveUserData(response.data.accessToken);
    this.clearError();
    this.onSuccess?.();
  }
}

export class LoginForm extends AuthForm {
  constructor(formSelector, onSuccess) {
    super(formSelector);
    this.onSuccess = onSuccess;
  }

  async handleSubmit(e) {
    e.preventDefault();
    if (!this.submitBtn?.classList.contains("active")) return;

    const formData = new FormData(this.form);
    const { login, password } = Object.fromEntries(formData);

    const response = await authService.login(login, password);

    if (!response.success) {
      this.showError(response.message || "Неправильный логин или пароль");
      return;
    }

    saveUserData(response.data.accessToken);
    this.clearError();
    this.onSuccess?.();
  }
}
