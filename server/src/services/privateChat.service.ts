import { eq, or, and, lt, inArray, asc, desc } from "drizzle-orm";
import { db, type Database } from "../db";
import { privateChats, messages, users } from "../db/schema";
import { attachReplyTarget, attachReplyTargets, validateReplyTarget } from "./reply.service";

export class PrivateChatService {
  constructor(private readonly database: Database = db) {}

  async getOrCreatePrivateChat(user1Id: number, user2Id: number) {
    const otherUser = await this.database.query.users.findFirst({
      where: eq(users.id, user2Id),
      columns: {
        id: true,
      },
    });

    if (!otherUser) {
      throw new Error("User not found");
    }

    const [smallerId, largerId] = user1Id < user2Id ? [user1Id, user2Id] : [user2Id, user1Id];

    const existingChat = await this.database.query.privateChats.findFirst({
      where: and(
        eq(privateChats.user1Id, smallerId),
        eq(privateChats.user2Id, largerId)
      ),
    });

    if (existingChat) {
      return existingChat;
    }

    const [newChat] = await this.database
      .insert(privateChats)
      .values({
        user1Id: smallerId,
        user2Id: largerId,
      })
      .returning();

    return newChat;
  }

  async getUserPrivateChats(userId: number) {
    const chats = await this.database.query.privateChats.findMany({
      where: or(
        eq(privateChats.user1Id, userId),
        eq(privateChats.user2Id, userId)
      ),
    });

    if (chats.length === 0) {
      return [];
    }

    const otherUserIds = [...new Set(
      chats.map((chat) => (chat.user1Id === userId ? chat.user2Id : chat.user1Id))
    )];
    const chatIds = chats.map((chat) => chat.id);

    const [otherUsers, lastMessages] = await Promise.all([
      this.database.query.users.findMany({
        where: inArray(users.id, otherUserIds),
        columns: {
          id: true,
          username: true,
          login: true,
          publicKey: true,
        },
      }),
      this.database
        .select({
          id: messages.id,
          chatId: messages.chatId,
          message: messages.message,
          date: messages.date,
          nonce: messages.nonce,
          isEncrypted: messages.isEncrypted,
          senderPublicKey: messages.senderPublicKey,
        })
        .from(messages)
        .where(
          and(
            inArray(messages.chatId, chatIds),
            eq(messages.chatType, "private")
          )
        )
        .orderBy(asc(messages.chatId), desc(messages.date), desc(messages.id)),
    ]);

    const otherUsersById = new Map(otherUsers.map((user) => [user.id, user]));
    const lastMessagesByChatId = new Map<number, (typeof lastMessages)[number]>();

    for (const lastMessage of lastMessages) {
      if (!lastMessage.chatId || lastMessagesByChatId.has(lastMessage.chatId)) {
        continue;
      }

      lastMessagesByChatId.set(lastMessage.chatId, lastMessage);
    }

    return chats.map((chat) => {
      const otherUserId = chat.user1Id === userId ? chat.user2Id : chat.user1Id;
      const lastMessage = lastMessagesByChatId.get(chat.id);

      return {
        chatId: chat.id,
        otherUser: otherUsersById.get(otherUserId) || null,
        lastMessage: lastMessage?.message || null,
        lastMessageDate: lastMessage?.date || chat.createdAt,
        lastMessageNonce: lastMessage?.nonce || null,
        lastMessageIsEncrypted: lastMessage?.isEncrypted || 0,
        lastMessageSenderPublicKey: lastMessage?.senderPublicKey || null,
        createdAt: chat.createdAt,
      };
    });
  }

  async getPrivateChatMessages(chatId: number, userId: number, lastMessageId?: number, limitMsgs = 50) {
    const chat = await this.database.query.privateChats.findFirst({
      where: and(
        eq(privateChats.id, chatId),
        or(
          eq(privateChats.user1Id, userId),
          eq(privateChats.user2Id, userId)
        )
      ),
    });

    if (!chat) {
      throw new Error("Chat not found or access denied");
    }

    const conditions = [
      eq(messages.chatId, chatId),
      eq(messages.chatType, "private"),
    ];

    if (lastMessageId) {
      conditions.push(lt(messages.id, lastMessageId));
    }

    const chatMessages = await this.database.query.messages.findMany({
      where: and(...conditions),
      orderBy: (messages, { desc }) => [desc(messages.id)],
      limit: limitMsgs,
    });

    return attachReplyTargets(chatMessages, this.database);
  }

  async sendPrivateMessage(
    chatId: number,
    userId: number,
    username: string,
    message: string,
    recipientId: number,
    nonce?: string,
    senderPublicKey?: string,
    isEncrypted?: number,
    replyToMessageId?: number | null
  ) {
    const chat = await this.database.query.privateChats.findFirst({
      where: and(
        eq(privateChats.id, chatId),
        or(
          eq(privateChats.user1Id, userId),
          eq(privateChats.user2Id, userId)
        )
      ),
    });

    if (!chat) {
      throw new Error("Chat not found or access denied");
    }

    const expectedRecipientId = chat.user1Id === userId ? chat.user2Id : chat.user1Id;
    if (recipientId !== expectedRecipientId) {
      throw new Error("Invalid recipient for chat");
    }

    const replyTarget = await validateReplyTarget(replyToMessageId, {
      chatType: "private",
      chatId,
    }, this.database);

    const [newMessage] = await this.database
      .insert(messages)
      .values({
        userId,
        username,
        message,
        chatId,
        chatType: "private",
        recipientId,
        nonce: nonce || null,
        senderPublicKey: senderPublicKey || null,
        isEncrypted: isEncrypted || 0,
        replyToMessageId: replyTarget?.id ?? null,
      })
      .returning();

    return attachReplyTarget(newMessage, this.database);
  }
}
