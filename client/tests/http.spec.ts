import { describe, expect, it } from 'vitest'
import { createLocalErrorResponse, parseApiResponse, sanitizeUnexpectedMessage } from '@/services/http'

describe('http helpers', () => {
    it('parses API envelopes with typed data', async () => {
        const response = new Response(
            JSON.stringify({
                success: true,
                message: 'OK',
                data: {
                    accessToken: 'token-value',
                },
            }),
            {
                status: 200,
                headers: {
                    'content-type': 'application/json',
                },
            },
        )

        const result = await parseApiResponse<{ accessToken: string }>(response)

        expect(result.success).toBe(true)
        expect(result.data?.accessToken).toBe('token-value')
        expect(result.message).toBe('OK')
    })

    it('replaces technical messages with a user-friendly fallback', () => {
        expect(
            sanitizeUnexpectedMessage(
                "Cannot read properties of undefined (reading 'importKey')",
                'Неизвестная ошибка',
            ),
        ).toBe('Неизвестная ошибка')
    })

    it('creates typed local error responses', () => {
        const result = createLocalErrorResponse<{ accessToken: string }>('Session expired', 401)

        expect(result.success).toBe(false)
        expect(result.status).toBe(401)
        expect(result.message).toBe('Session expired')
        expect(result.data).toBeUndefined()
    })
})
