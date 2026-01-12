import { io } from "socket.io-client";
import { getAccessToken } from "../utils/storage.js";

let socket = null;

export const initSocket = () => {
  if (socket) return socket;

  const accessToken = getAccessToken();
  if (!accessToken) return null;

  socket = io("http://localhost:3000", {
    query: { accessToken },
  });

  return socket;
};

export const getSocket = () => socket;

export const disconnectSocket = () => {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
};
