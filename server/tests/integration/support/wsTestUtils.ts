type WsEnvelope = Record<string, unknown>;

export const waitForSocketMessage = async (socket: WebSocket, timeoutMs = 5_000): Promise<WsEnvelope> => {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error("Timed out while waiting for a WebSocket message"));
    }, timeoutMs);

    const cleanup = () => {
      clearTimeout(timeout);
      socket.removeEventListener("message", handleMessage);
      socket.removeEventListener("error", handleError);
    };

    const handleMessage = (event: MessageEvent) => {
      cleanup();
      resolve(JSON.parse(String(event.data)) as WsEnvelope);
    };

    const handleError = (event: Event) => {
      cleanup();
      reject(event);
    };

    socket.addEventListener("message", handleMessage, { once: true });
    socket.addEventListener("error", handleError, { once: true });
  });
};

export const openSocket = async (origin: string, cookie: string) => {
  const websocketOrigin = origin.replace("http://", "ws://").replace("https://", "wss://");
  const socket = new WebSocket(`${websocketOrigin}/ws`, {
    headers: {
      cookie,
    },
  } as never);

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error("Timed out while opening a WebSocket connection"));
    }, 5_000);

    const cleanup = () => {
      clearTimeout(timeout);
      socket.removeEventListener("open", handleOpen);
      socket.removeEventListener("error", handleError);
    };

    const handleOpen = () => {
      cleanup();
      resolve();
    };

    const handleError = (event: Event) => {
      cleanup();
      reject(event);
    };

    socket.addEventListener("open", handleOpen, { once: true });
    socket.addEventListener("error", handleError, { once: true });
  });

  return socket;
};
