import { apiFetch } from '@/services/api'
import type { GroupMessagesData } from '@/types/api'

export const messagesService = {
  async listGroupMessages() {
    return apiFetch<GroupMessagesData>('/api/messages/group')
  },
}
