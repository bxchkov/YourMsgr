import { z } from "zod";
import { dbClient, type DatabaseClient } from "../db";
import { logger } from "./logger";

export const REALTIME_EVENTS_CHANNEL = "yourmsgr_events";

const forceLogoutEventSchema = z.object({
  type: z.literal("force_logout"),
  userId: z.number().int().positive(),
});

const syncGroupMessagesEventSchema = z.object({
  type: z.literal("sync_group_messages"),
});

const syncPrivateChatsEventSchema = z.object({
  type: z.literal("sync_private_chats"),
  userIds: z.array(z.number().int().positive()).min(1),
});

const groupMessageCreatedEventSchema = z.object({
  type: z.literal("group_message_created"),
  messageId: z.number().int().positive(),
});

const realtimeEventSchema = z.discriminatedUnion("type", [
  forceLogoutEventSchema,
  syncGroupMessagesEventSchema,
  syncPrivateChatsEventSchema,
  groupMessageCreatedEventSchema,
]);

export type RealtimeEvent = z.infer<typeof realtimeEventSchema>;

export interface RealtimeListenerHandle {
  unlisten: () => Promise<void>;
}

const parseRealtimeEvent = (payload: string): RealtimeEvent | null => {
  try {
    const rawEvent = JSON.parse(payload) as unknown;
    const parsedEvent = realtimeEventSchema.safeParse(rawEvent);
    return parsedEvent.success ? parsedEvent.data : null;
  } catch {
    return null;
  }
};

export const publishRealtimeEvent = async (
  event: RealtimeEvent,
  client: DatabaseClient = dbClient,
  channel: string = REALTIME_EVENTS_CHANNEL,
) => {
  await client.notify(channel, JSON.stringify(event));
};

export const publishRealtimeEventSafe = async (
  event: RealtimeEvent,
  client: DatabaseClient = dbClient,
  channel: string = REALTIME_EVENTS_CHANNEL,
) => {
  try {
    await publishRealtimeEvent(event, client, channel);
    return true;
  } catch (error) {
    logger.warn(`Realtime publish failed for '${event.type}'`, error);
    return false;
  }
};

export const listenToRealtimeEvents = async (
  onEvent: (event: RealtimeEvent) => void | Promise<void>,
  client: DatabaseClient = dbClient,
  channel: string = REALTIME_EVENTS_CHANNEL,
): Promise<RealtimeListenerHandle> => {
  const handle = await client.listen(channel, (payload) => {
    const event = parseRealtimeEvent(payload);
    if (!event) {
      logger.warn("Ignored invalid realtime event payload", payload);
      return;
    }

    void Promise
      .resolve(onEvent(event))
      .catch((error) => {
        logger.error(`Realtime event handler failed for '${event.type}'`, error);
      });
  });

  logger.info(`Realtime event listener subscribed to '${channel}'`);

  return {
    async unlisten() {
      await handle.unlisten();
      logger.info(`Realtime event listener unsubscribed from '${channel}'`);
    },
  };
};
