import { eq, inArray } from "drizzle-orm";
import { db } from "../db";
import { messages } from "../db/schema";

export type MessageRecord = typeof messages.$inferSelect;

export interface ReplyPreview {
  id: number;
  userId: number;
  username: string;
  message: string;
  isEncrypted: number;
  nonce: string | null;
  senderPublicKey: string | null;
  recipientId: number | null;
  mediaType: string | null;
  mediaName: string | null;
}

export interface MessageWithReply extends MessageRecord {
  replyTo: ReplyPreview | null;
}

interface ReplyContext {
  chatType: "group" | "private";
  chatId?: number | null;
}

function toReplyPreview(message: MessageRecord): ReplyPreview {
  return {
    id: message.id,
    userId: message.userId,
    username: message.username,
    message: message.message,
    isEncrypted: message.isEncrypted,
    nonce: message.nonce,
    senderPublicKey: message.senderPublicKey,
    recipientId: message.recipientId,
    mediaType: null,
    mediaName: null,
  };
}

export async function validateReplyTarget(
  replyToMessageId: number | null | undefined,
  context: ReplyContext
): Promise<MessageRecord | null> {
  if (!replyToMessageId) {
    return null;
  }

  const replyTarget = await db.query.messages.findFirst({
    where: eq(messages.id, replyToMessageId),
  });

  if (!replyTarget) {
    throw new Error("Reply target not found");
  }

  if (context.chatType === "private") {
    if (replyTarget.chatType !== "private" || replyTarget.chatId !== context.chatId) {
      throw new Error("Reply target is outside the current chat");
    }
  } else if (replyTarget.chatType === "private" || replyTarget.chatId !== null) {
    throw new Error("Reply target is outside the current chat");
  }

  return replyTarget;
}

export async function attachReplyTargets(messageList: MessageRecord[]): Promise<MessageWithReply[]> {
  const replyIds = Array.from(
    new Set(
      messageList
        .map((message) => message.replyToMessageId)
        .filter((replyId): replyId is number => typeof replyId === "number")
    )
  );

  if (replyIds.length === 0) {
    return messageList.map((message) => ({
      ...message,
      replyTo: null,
    }));
  }

  const replyMessages = await db.query.messages.findMany({
    where: inArray(messages.id, replyIds),
  });

  const replyMap = new Map(replyMessages.map((message) => [message.id, toReplyPreview(message)]));

  return messageList.map((message) => ({
    ...message,
    replyTo: message.replyToMessageId ? replyMap.get(message.replyToMessageId) ?? null : null,
  }));
}

export async function attachReplyTarget(message: MessageRecord): Promise<MessageWithReply> {
  const [result] = await attachReplyTargets([message]);
  return result;
}
