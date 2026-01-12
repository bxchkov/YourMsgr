export const storage = {
  get(key) {
    return localStorage.getItem(key);
  },

  set(key, value) {
    localStorage.setItem(key, value);
  },

  remove(key) {
    localStorage.removeItem(key);
  },

  clear() {
    localStorage.clear();
  },
};

export const getAccessToken = () => storage.get("accessToken");
export const setAccessToken = (token) => storage.set("accessToken", token);
export const getUserId = () => storage.get("userId");
export const getUserRole = () => storage.get("userRole");

export const saveUserData = (accessToken) => {
  const payload = JSON.parse(atob(accessToken.split(".")[1]));
  storage.set("accessToken", accessToken);
  storage.set("userId", payload.userId);
  storage.set("userRole", payload.userRole);
};

export const clearUserData = () => {
  storage.remove("accessToken");
  storage.remove("userId");
  storage.remove("userRole");
};
