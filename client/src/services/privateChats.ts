import { apiFetch } from '@/services/api'

export const privateChatsService = {
  async list() {
    return apiFetch('/api/private-chats')
  },

  async create(otherUserId: number) {
    return apiFetch('/api/private-chats', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({ otherUserId }),
    })
  },
}
