import { eq, desc, or, isNull, lt, and } from "drizzle-orm";
import { db } from "../db";
import { messages } from "../db/schema";
import { attachReplyTarget, attachReplyTargets, validateReplyTarget } from "./reply.service";

export class MessageService {
  async getAllMessages() {
    const allMessages = await db.query.messages.findMany({
      orderBy: [desc(messages.date)],
    });

    return attachReplyTargets(allMessages);
  }

  async getGroupMessages(lastMessageId?: number, limitMsgs = 50) {
    const conditions = [or(eq(messages.chatType, "group"), isNull(messages.chatType))];

    if (lastMessageId) {
      conditions.push(lt(messages.id, lastMessageId));
    }

    const groupMessages = await db.query.messages.findMany({
      where: and(...conditions),
      orderBy: [desc(messages.date)],
      limit: limitMsgs,
    });

    return attachReplyTargets(groupMessages);
  }

  async createMessage(
    userId: number,
    username: string,
    message: string,
    nonce?: string,
    senderPublicKey?: string,
    isEncrypted?: number,
    replyToMessageId?: number | null
  ) {
    const replyTarget = await validateReplyTarget(replyToMessageId, { chatType: "group" });

    const [newMessage] = await db
      .insert(messages)
      .values({
        userId,
        username,
        message,
        nonce: nonce || null,
        senderPublicKey: senderPublicKey || null,
        isEncrypted: isEncrypted || 0,
        replyToMessageId: replyTarget?.id ?? null,
      })
      .returning();

    return attachReplyTarget(newMessage);
  }

  async deleteMessage(messageId: number) {
    await db.delete(messages).where(eq(messages.id, messageId));
  }

  async getMessageById(messageId: number) {
    return await db.query.messages.findFirst({
      where: eq(messages.id, messageId),
    });
  }
}
