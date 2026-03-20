import type { Message } from '@/stores/chat'

export interface LoadMessagesSocketEvent {
    type: 'load_messages'
    messages: Message[]
    isPagination?: boolean
    chatType?: 'group' | 'private'
}

export interface SendMessageSocketEvent extends Message {
    type: 'send_message'
}

export interface DeleteMessageSocketEvent {
    type: 'delete_message'
    id: number
}

export interface ErrorSocketEvent {
    type: 'error'
    message?: string
}

export interface CheckSessionSocketEvent {
    type: 'check_session'
}

export interface RefreshTokensSocketEvent {
    type: 'refresh_tokens'
}

export interface ClientLogoutSocketEvent {
    type: 'client_logout'
}

export interface SyncGroupMessagesSocketEvent {
    type: 'sync_group_messages'
}

export interface SyncPrivateChatsSocketEvent {
    type: 'sync_private_chats'
}

export interface SocketIncomingEventMap {
    load_messages: LoadMessagesSocketEvent
    send_message: SendMessageSocketEvent
    delete_message: DeleteMessageSocketEvent
    error: ErrorSocketEvent
    check_session: CheckSessionSocketEvent
    refresh_tokens: RefreshTokensSocketEvent
    client_logout: ClientLogoutSocketEvent
    sync_group_messages: SyncGroupMessagesSocketEvent
    sync_private_chats: SyncPrivateChatsSocketEvent
}

export type SocketIncomingEventType = keyof SocketIncomingEventMap
export type SocketIncomingEvent = SocketIncomingEventMap[SocketIncomingEventType]

export interface SendMessageSocketPayload {
    message: string
    isEncrypted: number
    replyToMessageId: number | null
    chatId?: number | null
    recipientId?: number | null
    nonce?: string
    senderPublicKey?: string | null
}

export interface DeleteMessageSocketPayload {
    id: number
}

export interface SocketOutgoingEventMap {
    send_message: SendMessageSocketPayload
    delete_message: DeleteMessageSocketPayload
}

export type SocketOutgoingEventType = keyof SocketOutgoingEventMap
