'use client'

const GH_API = 'https://api.github.com'

function decodeBase64Utf8(content: string): string {
	const binary = atob(content.replace(/\s/g, ''))
	const bytes = Uint8Array.from(binary, char => char.charCodeAt(0))
	return new TextDecoder().decode(bytes)
}

/**
 * 读取公开 GitHub 仓库中的文本文件。
 * 仅用于只读数据，不携带私钥或 Installation Token。
 */
export async function readPublicTextFileFromRepo(
	owner: string,
	repo: string,
	path: string,
	ref: string
): Promise<string | null> {
	const encodedPath = path
		.split('/')
		.map(segment => encodeURIComponent(segment))
		.join('/')
	const url = `${GH_API}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encodedPath}?ref=${encodeURIComponent(ref)}`
	const res = await fetch(url, {
		cache: 'no-store',
		headers: {
			Accept: 'application/vnd.github+json',
			'X-GitHub-Api-Version': '2022-11-28'
		}
	})

	if (res.status === 404) return null
	if (!res.ok) {
		if (res.status === 403 && res.headers.get('x-ratelimit-remaining') === '0') {
			throw new Error('GitHub 公共读取频率已达上限，请稍后重新加载')
		}
		throw new Error(`GitHub 公共文件读取失败：${res.status}`)
	}

	const data = (await res.json()) as { content?: string; encoding?: string } | unknown[]
	if (Array.isArray(data) || !data.content) return null
	if (data.encoding && data.encoding !== 'base64') throw new Error(`不支持的 GitHub 文件编码：${data.encoding}`)
	return decodeBase64Utf8(data.content)
}
