import { getUserId, getUserRole } from "../utils/storage.js";

const formatTime = (timestamp) => {
  const date = new Date(timestamp);
  return date.toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  });
};

export const renderMessage = (message) => {
  const isOwn = Number(message.userId) === Number(getUserId());
  const isAdmin = Number(getUserRole()) >= 3;
  const canDelete = isOwn || isAdmin;

  const time = formatTime(message.date);

  const deleteButton = canDelete
    ? `<button class="message__delete">
        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M10 12V17" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M14 12V17" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M4 7H20" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M6 10V18C6 19.6569 7.34315 21 9 21H15C16.6569 21 18 19.6569 18 18V10" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M9 5C9 3.89543 9.89543 3 11 3H13C14.1046 3 15 3.89543 15 5V7H9V5Z" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>`
    : "";

  return `
    <div id="${message.id}" class="message ${isOwn ? "my-message" : ""}">
      <div class="message__username">${message.username}</div>
      <div class="message__text">${message.message}</div>
      ${deleteButton}
      <div class="message__time">${time}</div>
    </div>
  `;
};

export const addMessageToDOM = (message, container) => {
  container.insertAdjacentHTML("afterbegin", renderMessage(message));
};

export const removeMessageFromDOM = (messageId) => {
  const messageEl = document.getElementById(messageId);
  if (messageEl?.classList.contains("message")) {
    messageEl.remove();
  }
};

export const loadMessages = (messages, container) => {
  container.innerHTML = "";
  messages.forEach((msg) => addMessageToDOM(msg, container));
};
