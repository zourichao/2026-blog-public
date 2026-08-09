import { GITHUB_CONFIG } from '@/consts'
import { toast } from 'sonner'
import { decrypt, encrypt } from './aes256-util'

const GH_API = 'https://api.github.com'
const GITHUB_TOKEN_CACHE_KEY = 'github_token'
const GITHUB_TOKEN_EXPIRES_AT_CACHE_KEY = 'github_token_expires_at'
const GITHUB_PEM_CACHE_KEY = 'p_info'

// GitHub App Installation Token 响应会返回 expires_at；提前 5 分钟视为需要续签，避免操作中途才遇到 401。
const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000

let tokenRefreshPromise: Promise<string> | null = null

type GetAuthTokenOptions = {
	silent?: boolean
}

function clearTokenCache(): void {
	if (typeof sessionStorage === 'undefined') return
	try {
		sessionStorage.removeItem(GITHUB_TOKEN_CACHE_KEY)
		sessionStorage.removeItem(GITHUB_TOKEN_EXPIRES_AT_CACHE_KEY)
	} catch (error) {
		console.error('Failed to clear token cache:', error)
	}
}

function getTokenFromCache(): string | null {
	if (typeof sessionStorage === 'undefined') return null
	try {
		const token = sessionStorage.getItem(GITHUB_TOKEN_CACHE_KEY)
		const expiresAtRaw = sessionStorage.getItem(GITHUB_TOKEN_EXPIRES_AT_CACHE_KEY)
		if (!token) return null

		// 兼容旧缓存：没有过期时间的旧 Token 不再继续使用，直接重新签发。
		if (!expiresAtRaw) {
			clearTokenCache()
			return null
		}

		const expiresAt = Number(expiresAtRaw)
		if (!Number.isFinite(expiresAt) || Date.now() >= expiresAt - TOKEN_REFRESH_BUFFER_MS) {
			clearTokenCache()
			return null
		}

		return token
	} catch {
		return null
	}
}

function saveTokenToCache(token: string, expiresAt: number): void {
	if (typeof sessionStorage === 'undefined') return
	try {
		sessionStorage.setItem(GITHUB_TOKEN_CACHE_KEY, token)
		sessionStorage.setItem(GITHUB_TOKEN_EXPIRES_AT_CACHE_KEY, String(expiresAt))
	} catch (error) {
		console.error('Failed to save token to cache:', error)
	}
}

export function invalidateAuthToken(): void {
	clearTokenCache()
}

async function createInstallationTokenWithExpiry(jwt: string, installationId: number): Promise<{ token: string; expiresAt: number }> {
	const res = await fetch(`${GH_API}/app/installations/${installationId}/access_tokens`, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${jwt}`,
			Accept: 'application/vnd.github+json',
			'X-GitHub-Api-Version': '2022-11-28'
		}
	})
	if (!res.ok) throw new Error(`create token failed: ${res.status}`)

	const data = (await res.json()) as { token?: unknown; expires_at?: unknown }
	if (typeof data.token !== 'string' || typeof data.expires_at !== 'string') {
		throw new Error('GitHub Installation Token 响应缺少 token 或 expires_at')
	}

	const expiresAt = Date.parse(data.expires_at)
	if (!Number.isFinite(expiresAt)) throw new Error('GitHub Installation Token 过期时间格式无效')
	return { token: data.token, expiresAt }
}

export async function getPemFromCache(): Promise<string | null> {
	const encryptionKey = GITHUB_CONFIG.ENCRYPT_KEY
	if (!encryptionKey.trim()) return null
	if (typeof sessionStorage === 'undefined') return null
	try {
		// 解密缓存中的 pem
		const encryptedPem = sessionStorage.getItem(GITHUB_PEM_CACHE_KEY)
		if (!encryptedPem) return null
		return await decrypt(encryptedPem, encryptionKey)
	} catch {
		return null
	}
}

export async function savePemToCache(pem: string): Promise<void> {
	const encryptionKey = GITHUB_CONFIG.ENCRYPT_KEY
	if (!encryptionKey.trim()) {
		if (typeof window !== 'undefined') toast.error('未配置加密键，无法缓存私钥')
		return
	}
	if (typeof sessionStorage === 'undefined') return
	try {
		// 加密 pem 后存储
		const encryptedPem = await encrypt(pem, encryptionKey)
		sessionStorage.setItem(GITHUB_PEM_CACHE_KEY, encryptedPem)
	} catch (error) {
		console.error('Failed to save pem to cache:', error)
	}
}

function clearPemCache(): void {
	if (typeof sessionStorage === 'undefined') return
	try {
		sessionStorage.removeItem(GITHUB_PEM_CACHE_KEY)
	} catch (error) {
		console.error('Failed to clear pem cache:', error)
	}
}

export function clearAllAuthCache(): void {
	clearTokenCache()
	clearPemCache()
}

export async function hasAuth(): Promise<boolean> {
	return !!getTokenFromCache() || !!(await getPemFromCache())
}

/**
 * 统一的认证 Token 获取。
 * - Token 未接近过期：直接复用缓存。
 * - Token 已过期或将在 5 分钟内过期：保留私钥并自动重新签发。
 * - 多个并发请求同时触发续签：只实际签发 1 次，其他请求复用同一 Promise。
 */
export async function getAuthToken(options: GetAuthTokenOptions = {}): Promise<string> {
	const { silent = false } = options

	const cachedToken = getTokenFromCache()
	if (cachedToken) {
		if (!silent) toast.info('使用缓存的令牌...')
		return cachedToken
	}

	if (tokenRefreshPromise) return tokenRefreshPromise

	tokenRefreshPromise = (async () => {
		// 顶层不静态引入 use-auth/github-client，避免 auth → github-client → use-auth → auth 循环依赖。
		const { useAuthStore } = await import('@/hooks/use-auth')

		// 优先读取 Zustand 当前状态；若页面刚刷新而 Store 尚未恢复，再直接从 sessionStorage 恢复私钥。
		let privateKey = useAuthStore.getState().privateKey
		if (!privateKey) {
			privateKey = await getPemFromCache()
			if (privateKey) {
				useAuthStore.setState({ privateKey, isAuth: true })
			}
		}

		if (!privateKey) {
			throw new Error('需要先设置私钥。请使用 useAuth().setPrivateKey()')
		}

		const { signAppJwt, getInstallationId } = await import('./github-client')

		if (!silent) toast.info('正在签发 JWT...')
		const jwt = signAppJwt(GITHUB_CONFIG.APP_ID, privateKey)
		if (!silent) toast.info('正在获取安装信息...')
		const installationId = await getInstallationId(jwt, GITHUB_CONFIG.OWNER, GITHUB_CONFIG.REPO)

		if (!silent) toast.info('正在创建安装令牌...')
		const { token, expiresAt } = await createInstallationTokenWithExpiry(jwt, installationId)

		saveTokenToCache(token, expiresAt)
		return token
	})()

	try {
		return await tokenRefreshPromise
	} finally {
		tokenRefreshPromise = null
	}
}
