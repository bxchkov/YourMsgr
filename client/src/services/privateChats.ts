import { apiFetch } from '@/services/api'
import type { PrivateChatCreateData, PrivateChatsData } from '@/types/api'

export const privateChatsService = {
  async list() {
    return apiFetch<PrivateChatsData>('/api/private-chats')
  },

  async create(otherUserId: number) {
    return apiFetch<PrivateChatCreateData>('/api/private-chats', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({ otherUserId }),
    })
  },
}
