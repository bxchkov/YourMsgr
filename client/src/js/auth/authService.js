import { getAccessToken, saveUserData, clearUserData } from "../utils/storage.js";

const API_URL = "http://localhost:3000";

export const authService = {
  async register(login, password, username) {
    const response = await fetch(`${API_URL}/auth/registration`, {
      method: "POST",
      credentials: "include",
      headers: {
        authorization: `${login}:${password}:${encodeURIComponent(username)}`,
      },
    });
    return await response.json();
  },

  async login(login, password) {
    const response = await fetch(`${API_URL}/auth/login`, {
      method: "POST",
      credentials: "include",
      headers: {
        authorization: `${login}:${password}`,
      },
    });
    return await response.json();
  },

  async checkSession() {
    const accessToken = getAccessToken();
    if (!accessToken) return { success: false };

    const response = await fetch(`${API_URL}/auth/session`, {
      method: "GET",
      credentials: "include",
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
    });
    return await response.json();
  },

  async refreshTokens() {
    const accessToken = getAccessToken();
    if (!accessToken) return { success: false };

    const response = await fetch(`${API_URL}/auth/refresh`, {
      method: "GET",
      credentials: "include",
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
    });
    return await response.json();
  },

  async logout() {
    const accessToken = getAccessToken();
    if (accessToken) {
      await fetch(`${API_URL}/auth/logout`, {
        method: "POST",
        credentials: "include",
        headers: {
          authorization: `Bearer ${accessToken}`,
        },
      });
    }
    clearUserData();
  },
};
