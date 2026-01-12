import { eq, desc } from "drizzle-orm";
import { db } from "../db";
import { messages } from "../db/schema";

export class MessageService {
  async getAllMessages() {
    return await db.query.messages.findMany({
      orderBy: [desc(messages.date)],
    });
  }

  async createMessage(userId: number, username: string, message: string) {
    const [newMessage] = await db
      .insert(messages)
      .values({
        userId,
        username,
        message,
      })
      .returning();

    return newMessage;
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
