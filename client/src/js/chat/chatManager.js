import { initSocket, getSocket } from "./socket.js";
import { addMessageToDOM, removeMessageFromDOM, loadMessages } from "./messageRenderer.js";
import { getAccessToken } from "../utils/storage.js";
import { authService } from "../auth/authService.js";

export class ChatManager {
  constructor() {
    this.messagesContainer = document.querySelector(".chat__messages");
    this.messageInput = document.querySelector(".message-input__textarea");
    this.sendButton = document.querySelector(".message-input__button");
    this.socket = null;

    this.setupEventListeners();
  }

  setupEventListeners() {
    // Send message on button click
    this.sendButton?.addEventListener("click", () => this.sendMessage());

    // Send message on Enter key
    this.messageInput?.addEventListener("keyup", (e) => {
      if (e.key === "Enter" && this.messageInput.value.trim()) {
        this.sendMessage();
      }
    });

    // Toggle send button active state
    this.messageInput?.addEventListener("input", () => {
      this.sendButton?.classList.toggle("active", this.messageInput.value.length > 0);
    });

    // Delete message
    document.addEventListener("click", (e) => {
      const deleteBtn = e.target.closest(".message__delete");
      if (deleteBtn) {
        const message = deleteBtn.closest(".message");
        this.deleteMessage(message.id);
      }
    });
  }

  init() {
    this.socket = initSocket();
    if (!this.socket) return;

    this.socket.on("load_messages", ({ messages }) => {
      loadMessages(messages, this.messagesContainer);
    });

    this.socket.on("send_message", (message) => {
      addMessageToDOM(message, this.messagesContainer);
    });

    this.socket.on("delete_message", ({ id }) => {
      removeMessageFromDOM(id);
    });

    this.socket.on("check_session", async () => {
      const result = await authService.checkSession();
      if (!result.success) {
        console.log("Session invalid, please login again");
        window.location.reload();
      }
    });

    this.socket.on("refresh_tokens", async () => {
      await authService.refreshTokens();
    });

    this.socket.on("client_logout", () => {
      authService.logout();
      window.location.reload();
    });
  }

  sendMessage() {
    if (!this.messageInput.value.trim() || !this.socket) return;

    const accessToken = getAccessToken();
    this.socket.emit("send_message", {
      accessToken,
      message: this.messageInput.value,
    });

    this.messageInput.value = "";
    this.sendButton.classList.remove("active");
  }

  deleteMessage(messageId) {
    if (!this.socket) return;

    const accessToken = getAccessToken();
    this.socket.emit("delete_message", {
      accessToken,
      id: Number(messageId),
    });
  }
}
