import { eq, desc, or, isNull, lt, and } from "drizzle-orm";
import { db, type Database } from "../db";
import { messages } from "../db/schema";
import { attachReplyTarget, attachReplyTargets, validateReplyTarget } from "./reply.service";

export class MessageService {
  constructor(private readonly database: Database = db) {}

  async getAllMessages() {
    const allMessages = await this.database.query.messages.findMany({
      orderBy: [desc(messages.date)],
    });

    return attachReplyTargets(allMessages, this.database);
  }

  async getGroupMessages(lastMessageId?: number, limitMsgs = 50) {
    const conditions = [or(eq(messages.chatType, "group"), isNull(messages.chatType))];

    if (lastMessageId) {
      conditions.push(lt(messages.id, lastMessageId));
    }

    const groupMessages = await this.database.query.messages.findMany({
      where: and(...conditions),
      orderBy: [desc(messages.date)],
      limit: limitMsgs,
    });

    return attachReplyTargets(groupMessages, this.database);
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
    const replyTarget = await validateReplyTarget(replyToMessageId, { chatType: "group" }, this.database);

    const [newMessage] = await this.database
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

    return attachReplyTarget(newMessage, this.database);
  }

  async deleteMessage(messageId: number) {
    await this.database.delete(messages).where(eq(messages.id, messageId));
  }

  async getMessageById(messageId: number) {
    return await this.database.query.messages.findFirst({
      where: eq(messages.id, messageId),
    });
  }
}
