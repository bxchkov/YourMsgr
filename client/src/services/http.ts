export interface ApiEnvelope<T = any> {
  success: boolean
  message?: string
  data?: T
  error?: string
}

export interface ParsedApiResponse<T = any> {
  success: boolean
  message: string
  data?: T
  status: number
  ok: boolean
  raw: unknown
}

const TECHNICAL_ERROR_PATTERNS = [
  /cannot read/i,
  /undefined/i,
  /importkey/i,
  /typeerror/i,
  /referenceerror/i,
  /failed to fetch/i,
  /password hashing is unavailable/i,
  /length cannot be null/i,
  /unexpected token/i,
]

async function readResponseBody(response: Response): Promise<unknown> {
  const contentType = response.headers.get('content-type') || ''

  if (contentType.includes('application/json')) {
    try {
      return await response.json()
    } catch {
      return null
    }
  }

  try {
    return await response.text()
  } catch {
    return null
  }
}

export async function parseApiResponse<T = any>(response: Response): Promise<ParsedApiResponse<T>> {
  const raw = await readResponseBody(response)
  const envelope = (raw && typeof raw === 'object' ? raw : null) as ApiEnvelope<T> | null
  const messageFromEnvelope = typeof envelope?.message === 'string'
    ? envelope.message
    : typeof envelope?.error === 'string'
      ? envelope.error
      : ''
  const messageFromText = typeof raw === 'string' ? raw.trim() : ''
  const message = messageFromEnvelope || messageFromText || response.statusText || 'Request failed'

  return {
    success: Boolean(envelope?.success ?? response.ok),
    message,
    data: envelope?.data,
    status: response.status,
    ok: response.ok,
    raw,
  }
}

export function sanitizeUnexpectedMessage(message: string | undefined, fallback: string) {
  if (!message) {
    return fallback
  }

  const normalized = message.trim()
  if (!normalized) {
    return fallback
  }

  if (TECHNICAL_ERROR_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return fallback
  }

  return normalized
}

export function createLocalErrorResponse(message: string, status = 400): ParsedApiResponse<any> {
  return {
    success: false,
    message,
    data: undefined,
    status,
    ok: false,
    raw: null,
  }
}
