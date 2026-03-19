import type { Message, PrivateChat } from '@/stores/chat'

export interface AuthTokenData {
    accessToken: string
}

export interface AuthLoginData extends AuthTokenData {
    encryptedPrivateKey: string
    encryptedPrivateKeyIv: string
    encryptedPrivateKeySalt: string
}

export interface UpdateUsernameData extends AuthTokenData {
    username: string
}

export interface PublicKeyEntry {
    userId: number
    username: string
    publicKey: string
}

export interface PublicKeysData {
    publicKeys: PublicKeyEntry[]
}

export interface PrivateChatRecord {
    id: number
    user1Id: number
    user2Id: number
    createdAt: string
}

export interface PrivateChatCreateData {
    chat: PrivateChatRecord
}

export interface PrivateChatsData {
    chats: PrivateChat[]
}

export interface PrivateChatMessagesData {
    messages: Message[]
}

export interface GroupMessagesData {
    messages: Message[]
}
