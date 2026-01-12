import { Modal, setupModalSwitcher } from "./utils/modal.js";
import { RegistrationForm, LoginForm } from "./auth/authForms.js";
import { authService } from "./auth/authService.js";
import { ChatManager } from "./chat/chatManager.js";
import { disconnectSocket } from "./chat/socket.js";
import { clearUserData, saveUserData } from "./utils/storage.js";

const loginModal = new Modal(".modal-login");
const registrationModal = new Modal(".modal-registration");

const chatManager = new ChatManager();

// Setup modal switching
const loginEl = document.querySelector(".modal-login");
const regEl = document.querySelector(".modal-registration");
setupModalSwitcher(loginEl, regEl);

// Auth forms
const onAuthSuccess = () => {
  loginModal.close();
  registrationModal.close();
  chatManager.init();
};

new RegistrationForm(".modal-registration__form", onAuthSuccess);
new LoginForm(".modal-login__form", onAuthSuccess);

// Logout button
document.querySelector('button[name="logout"]')?.addEventListener("click", async () => {
  await authService.logout();
  disconnectSocket();
  clearUserData();
  loginModal.open();
  document.querySelector(".chat__messages").innerHTML = "";
});

// Check session on load
const checkSession = async () => {
  const result = await authService.checkSession();

  if (!result.success) {
    loginModal.open();
    return;
  }

  if (result.data?.accessToken) {
    saveUserData(result.data.accessToken);
  }

  chatManager.init();
};

document.addEventListener("DOMContentLoaded", checkSession);
