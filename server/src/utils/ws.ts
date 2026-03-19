export const WS_ERROR_MESSAGES = {
  rateLimit: "Слишком частая отправка сообщений (Rate Limit)",
  invalidMessageFormat: "Неверный формат сообщения",
  invalidDeleteRequest: "Неверный формат запроса удаления",
  messageNotFound: "Сообщение не найдено",
  insufficientDeletePermissions: "Недостаточно прав для удаления",
  invalidHistoryRequest: "Неверный формат запроса истории",
  actionFailed: "Не удалось обработать действие",
} as const;

export interface WsRateLimitState {
  count: number;
  resetTime: number;
}

export const getCookieValue = (cookieHeader: string | null, cookieName: string) => {
  if (!cookieHeader) {
    return null;
  }

  for (const cookie of cookieHeader.split(";")) {
    const [name, ...valueParts] = cookie.trim().split("=");
    if (name === cookieName) {
      return decodeURIComponent(valueParts.join("="));
    }
  }

  return null;
};

export const consumeWsRateLimit = (
  store: Map<string, WsRateLimitState>,
  key: string,
  now: number,
  limit: number,
  windowMs: number,
) => {
  const current = store.get(key);

  if (!current || now > current.resetTime) {
    store.set(key, { count: 1, resetTime: now + windowMs });
    return false;
  }

  const nextState = {
    count: current.count + 1,
    resetTime: current.resetTime,
  };

  store.set(key, nextState);
  return nextState.count > limit;
};
