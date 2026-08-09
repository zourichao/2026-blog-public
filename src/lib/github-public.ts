'use client'

import { getAuthToken, invalidateAuthToken } from './auth'

const GH_API = 'https://api.github.com'
const GH_RAW = 'https://raw.githubusercontent.com'

function encodePath(path: string): string {
	return path
		.split('/')
		.map(segment => encodeURIComponent(segment))
		.join('/')
}

function decodeBase64Utf8(content: string): string {
	const binary = atob(content.replace(/\s/g, ''))
	const bytes = Uint8Array.from(binary, char => char.charCodeAt(0))
	return new TextDecoder().decode(bytes)
}

class GitHubUnauthorizedReadError extends Error {}

async function readAuthenticatedTextFileFromRepo(
	token: string,
	owner: string,
	repo: string,
	path: string,
	ref: string
): Promise<string | null> {
	const encodedPath = encodePath(path)
	const url = `${GH_API}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encodedPath}?ref=${encodeURIComponent(ref)}`
	const res = await fetch(url, {
		cache: 'no-store',
		headers: {
			Authorization: `Bearer ${token}`,
			Accept: 'application/vnd.github+json',
			'X-GitHub-Api-Version': '2022-11-28'
		}
	})

	if (res.status === 401) throw new GitHubUnauthorizedReadError('GitHub 认证 Token 已失效')
	if (res.status === 404) return null
	if (!res.ok) throw new Error(`GitHub 认证文件读取失败：${res.status}`)

	const data = (await res.json()) as { content?: string; encoding?: string } | unknown[]
	if (Array.isArray(data) || !data.content) return null
	if (data.encoding && data.encoding !== 'base64') throw new Error(`不支持的 GitHub 文件编码：${data.encoding}`)
	return decodeBase64Utf8(data.content)
}

/**
 * 公开仓库只读兜底：直接读取 raw.githubusercontent.com。
 * 不调用 GitHub REST API，因此不消耗匿名 REST API 的 60 次/小时/IP 配额。
 */
export async function readPublicTextFileFromRepo(
	owner: string,
	repo: string,
	path: string,
	ref: string
): Promise<string | null> {
	const url = `${GH_RAW}/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/${encodeURIComponent(ref)}/${encodePath(path)}`
	const res = await fetch(url, { cache: 'no-store' })

	if (res.status === 404) return null
	if (!res.ok) throw new Error(`GitHub Raw 文件读取失败：${res.status}`)
	return res.text()
}

/**
 * 写作后台首选读取策略：
 * 1. 已导入私钥 / 已有有效 Token：静默使用认证 REST API。
 * 2. 若认证 Token 意外返回 401：仅清 Token、不清私钥，自动续签后重试 1 次。
 * 3. 未认证或认证读取临时失败：回退 GitHub Raw，只读功能继续可用。
 */
export async function readPreferredTextFileFromRepo(
	owner: string,
	repo: string,
	path: string,
	ref: string
): Promise<string | null> {
	try {
		let token = await getAuthToken({ silent: true })
		try {
			return await readAuthenticatedTextFileFromRepo(token, owner, repo, path, ref)
		} catch (error) {
			if (!(error instanceof GitHubUnauthorizedReadError)) throw error

			invalidateAuthToken()
			token = await getAuthToken({ silent: true })
			return await readAuthenticatedTextFileFromRepo(token, owner, repo, path, ref)
		}
	} catch (error) {
		// “未导入私钥”属于正常匿名只读场景；其他认证读取失败也允许 Raw 兜底，避免后台分类整体不可用。
		if (error instanceof Error && !error.message.includes('需要先设置私钥')) {
			console.warn('Authenticated GitHub read failed, falling back to Raw:', error)
		}
		return readPublicTextFileFromRepo(owner, repo, path, ref)
	}
}
