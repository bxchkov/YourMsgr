export const validateLogin = (login) => {
  return /^[a-zA-Z0-9_-]{6,16}$/.test(login);
};

export const validatePassword = (password) => {
  return /^.{8,16}$/.test(password);
};

export const validateUsername = (username) => {
  return /^.{2,16}$/.test(username);
};

export const validateKeyPress = (e, pattern) => {
  if (e.key.length === 1 && !e.ctrlKey && !pattern.test(e.key)) {
    e.preventDefault();
  }
};

export const validatePaste = (e, pattern) => {
  if (!pattern.test(e.clipboardData.getData("text"))) {
    e.preventDefault();
  }
};
