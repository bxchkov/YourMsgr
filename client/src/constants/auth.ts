const TERMINAL_SESSION_MESSAGES = new Set([
    'Unauthorized',
    'Invalid or expired token',
    'Session expired',
    'Token mismatch',
    'Missing refresh token',
    'Invalid refresh token',
])

const RETRYABLE_AUTH_MESSAGES = new Set([
    'Unauthorized',
    'Invalid or expired token',
])

export function isTerminalSessionMessage(message: string | undefined) {
    return TERMINAL_SESSION_MESSAGES.has(message || '')
}

export function isRetryableAuthMessage(message: string | undefined) {
    return RETRYABLE_AUTH_MESSAGES.has(message || '')
}
