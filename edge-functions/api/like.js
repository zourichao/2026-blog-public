const JSON_HEADERS = {
	'content-type': 'application/json; charset=utf-8',
	'cache-control': 'no-store, no-cache, must-revalidate'
}

const DAILY_LIKE_LIMIT = 5

function json(data, status = 200, extraHeaders = {}) {
	return new Response(JSON.stringify(data), {
		status,
		headers: {
			...JSON_HEADERS,
			...extraHeaders
		}
	})
}

function getKv(env) {
	// EdgeOne Makers KV 可通过绑定变量名直接访问。
	if (typeof BLOG_LIKES !== 'undefined') return BLOG_LIKES

	// 兼容运行时通过 context.env 注入绑定。
	if (env?.BLOG_LIKES && typeof env.BLOG_LIKES.get === 'function') return env.BLOG_LIKES

	throw new Error('BLOG_LIKES KV binding is unavailable')
}

async function sha256_32(value) {
	const input = new TextEncoder().encode(value)
	const digest = await crypto.subtle.digest('SHA-256', input)

	return Array.from(new Uint8Array(digest))
		.map(byte => byte.toString(16).padStart(2, '0'))
		.join('')
		.slice(0, 32)
}

function getChinaDate() {
	return new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

function getClientIp(request) {
	return request.eo?.clientIp || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
}

function parseCount(value) {
	const count = Number(value || 0)
	return Number.isFinite(count) && count >= 0 ? Math.floor(count) : 0
}

function parseVisitorState(value) {
	if (!value) return { date: '', count: 0 }

	// 兼容 V2 旧格式：visitor Key 的 Value 仅保存 YYYY-MM-DD。
	if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
		return {
			date: value,
			count: 1
		}
	}

	try {
		const parsed = JSON.parse(value)
		const date = typeof parsed?.date === 'string' ? parsed.date : ''
		const count = Number(parsed?.count)

		return {
			date,
			count: Number.isFinite(count) && count >= 0 ? Math.floor(count) : 0
		}
	} catch {
		return { date: '', count: 0 }
	}
}

function normalizeArticleSlug(slug) {
	return slug
		.trim()
		.replace(/[^A-Za-z0-9_]/g, '_')
		.replace(/_+/g, '_')
		.replace(/^_+|_+$/g, '')
}

function getStorageId(slug) {
	if (slug === 'site') return 'index'

	if (!slug.startsWith('blog:')) return ''

	const articleSlug = normalizeArticleSlug(slug.slice(5))

	// index 已保留给首页 + About，禁止文章占用。
	if (!articleSlug || articleSlug === 'index') return ''

	return articleSlug
}

export async function onRequest({ request, env }) {
	try {
		const method = request.method.toUpperCase()

		if (method !== 'GET' && method !== 'POST') {
			return json({ error: 'method_not_allowed' }, 405, { allow: 'GET, POST' })
		}

		const url = new URL(request.url)
		const slug = (url.searchParams.get('slug') || '').trim()

		if (!slug) return json({ error: 'missing_slug' }, 400)
		if (slug.length > 200) return json({ error: 'invalid_slug' }, 400)

		const storageId = getStorageId(slug)
		if (!storageId) return json({ error: 'invalid_slug' }, 400)

		const kv = getKv(env)
		const countKey = `count_${storageId}`
		const count = parseCount(await kv.get(countKey))

		if (method === 'GET') {
			return json({ count })
		}

		const clientIp = getClientIp(request)
		const userAgent = request.headers.get('user-agent') || ''
		const visitorHash = await sha256_32(`${clientIp}\n${userAgent}`)
		const visitorKey = `visitor_${storageId}_${visitorHash}`
		const today = getChinaDate()
		const visitorState = parseVisitorState(await kv.get(visitorKey))
		const todayLikeCount = visitorState.date === today ? visitorState.count : 0

		if (todayLikeCount >= DAILY_LIKE_LIMIT) {
			return json({
				count,
				reason: 'rate_limited'
			})
		}

		const nextCount = count + 1
		const nextVisitorState = {
			date: today,
			count: todayLikeCount + 1
		}

		await kv.put(countKey, String(nextCount))
		await kv.put(visitorKey, JSON.stringify(nextVisitorState))

		return json({ count: nextCount })
	} catch (error) {
		console.error('like api error:', error)
		return json({ error: 'internal_error' }, 500)
	}
}
