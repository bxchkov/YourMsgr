import { eq, or, and, lt, inArray, asc, desc } from "drizzle-orm";
import { db } from "../db";
import { privateChats, messages, users } from "../db/schema";
import { attachReplyTarget, attachReplyTargets, validateReplyTarget } from "./reply.service";

export class PrivateChatService {
  // РќР°Р№С‚Рё РёР»Рё СЃРѕР·РґР°С‚СЊ Р»РёС‡РЅС‹Р№ С‡Р°С‚ РјРµР¶РґСѓ РґРІСѓРјСЏ РїРѕР»СЊР·РѕРІР°С‚РµР»СЏРјРё
  async getOrCreatePrivateChat(user1Id: number, user2Id: number) {
    const otherUser = await db.query.users.findFirst({
      where: eq(users.id, user2Id),
      columns: {
        id: true,
      },
    });

    if (!otherUser) {
      throw new Error("User not found");
    }

    // Р’СЃРµРіРґР° С…СЂР°РЅРёРј РјРµРЅСЊС€РёР№ ID РїРµСЂРІС‹Рј РґР»СЏ РєРѕРЅСЃРёСЃС‚РµРЅС‚РЅРѕСЃС‚Рё
    const [smallerId, largerId] = user1Id < user2Id ? [user1Id, user2Id] : [user2Id, user1Id];

    // РџСЂРѕРІРµСЂСЏРµРј, СЃСѓС‰РµСЃС‚РІСѓРµС‚ Р»Рё СѓР¶Рµ С‡Р°С‚
    const existingChat = await db.query.privateChats.findFirst({
      where: and(
        eq(privateChats.user1Id, smallerId),
        eq(privateChats.user2Id, largerId)
      ),
    });

    if (existingChat) {
      return existingChat;
    }

    // РЎРѕР·РґР°РµРј РЅРѕРІС‹Р№ С‡Р°С‚
    const [newChat] = await db
      .insert(privateChats)
      .values({
        user1Id: smallerId,
        user2Id: largerId,
      })
      .returning();

    return newChat;
  }

  // РџРѕР»СѓС‡РёС‚СЊ РІСЃРµ Р»РёС‡РЅС‹Рµ С‡Р°С‚С‹ РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ
  async getUserPrivateChats(userId: number) {
    const chats = await db.query.privateChats.findMany({
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
      db.query.users.findMany({
        where: inArray(users.id, otherUserIds),
        columns: {
          id: true,
          username: true,
          login: true,
          publicKey: true,
        },
      }),
      db
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

  // РџРѕР»СѓС‡РёС‚СЊ СЃРѕРѕР±С‰РµРЅРёСЏ Р»РёС‡РЅРѕРіРѕ С‡Р°С‚Р° СЃ РїРѕРґРґРµСЂР¶РєРѕР№ РїР°РіРёРЅР°С†РёРё
  async getPrivateChatMessages(chatId: number, userId: number, lastMessageId?: number, limitMsgs = 50) {
    // РџСЂРѕРІРµСЂСЏРµРј, С‡С‚Рѕ РїРѕР»СЊР·РѕРІР°С‚РµР»СЊ СЏРІР»СЏРµС‚СЃСЏ СѓС‡Р°СЃС‚РЅРёРєРѕРј С‡Р°С‚Р°
    const chat = await db.query.privateChats.findFirst({
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
      eq(messages.chatType, "private")
    ];

    if (lastMessageId) {
      conditions.push(lt(messages.id, lastMessageId));
    }

    // РџРѕР»СѓС‡Р°РµРј СЃРѕРѕР±С‰РµРЅРёСЏ
    const chatMessages = await db.query.messages.findMany({
      where: and(...conditions),
      orderBy: (messages, { desc }) => [desc(messages.date)],
      limit: limitMsgs,
    });

    return attachReplyTargets(chatMessages);
  }

  // РћС‚РїСЂР°РІРёС‚СЊ СЃРѕРѕР±С‰РµРЅРёРµ РІ Р»РёС‡РЅС‹Р№ С‡Р°С‚
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
    // РџСЂРѕРІРµСЂСЏРµРј, С‡С‚Рѕ РїРѕР»СЊР·РѕРІР°С‚РµР»СЊ СЏРІР»СЏРµС‚СЃСЏ СѓС‡Р°СЃС‚РЅРёРєРѕРј С‡Р°С‚Р°
    const chat = await db.query.privateChats.findFirst({
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
    });

    const [newMessage] = await db
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

    return attachReplyTarget(newMessage);
  }
}
