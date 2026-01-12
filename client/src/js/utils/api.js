const API_BASE = "/api";

export const api = {
  async post(endpoint, data = {}, headers = {}) {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...headers,
      },
      body: JSON.stringify(data),
    });
    return await response.json();
  },

  async get(endpoint, headers = {}) {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        ...headers,
      },
    });
    return await response.json();
  },
};
