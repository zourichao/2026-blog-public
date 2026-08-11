'use client'

import { putFile, toBase64Utf8, readTextFileFromRepo } from '@/lib/github-client'

import type { BlogIndexItem } from '@/app/blog/types'

export type { BlogIndexItem } from '@/app/blog/types'
export async function upsertBlogsIndex(token: string, owner: string, repo: string, item: BlogIndexItem, branch: string): Promise<void> {
	const indexPath = 'public/blogs/index.json'
	let list: BlogIndexItem[] = []
	try {
		const txt = await readTextFileFromRepo(token, owner, repo, indexPath, branch)
		if (txt) list = JSON.parse(txt)
	} catch {
		// ignore parse errors and start from empty list
	}
	const map = new Map<string, BlogIndexItem>(list.map(i => [i.slug, i]))
	map.set(item.slug, item)
	const next = Array.from(map.values()).sort((a, b) => (b.date || '').localeCompare(a.date || ''))
	const base64 = toBase64Utf8(JSON.stringify(next, null, 2))
	await putFile(token, owner, repo, indexPath, base64, 'Update blogs index', branch)
}
export async function prepareBlogsIndex(
	token: string,
	owner: string,
	repo: string,
	item: BlogIndexItem,
	branch: string,
	replacedSlug?: string
): Promise<string> {
	const indexPath = 'public/blogs/index.json'
	let list: BlogIndexItem[] = []
	try {
		const txt = await readTextFileFromRepo(token, owner, repo, indexPath, branch)
		if (txt) list = JSON.parse(txt)
	} catch {
		// ignore parse errors and start from empty list
	}
	const map = new Map<string, BlogIndexItem>(list.map(i => [i.slug, i]))

	// 本次改动：只按新 slug upsert → 修改 slug 时先移除旧索引，并阻止覆盖已存在的新 slug。
	if (replacedSlug && replacedSlug !== item.slug) {
		if (map.has(item.slug)) throw new Error(`slug“${item.slug}”已存在，请更换后再发布`)
		map.delete(replacedSlug)
	}

	map.set(item.slug, item)
	const next = Array.from(map.values()).sort((a, b) => (b.date || '').localeCompare(a.date || ''))
	return JSON.stringify(next, null, 2)
}
export async function removeBlogsFromIndex(token: string, owner: string, repo: string, slugs: string[], branch: string): Promise<string> {
	const indexPath = 'public/blogs/index.json'
	let list: BlogIndexItem[] = []
	try {
		const txt = await readTextFileFromRepo(token, owner, repo, indexPath, branch)
		if (txt) list = JSON.parse(txt)
	} catch {
		// ignore parse errors and keep empty list
	}
	const slugSet = new Set(slugs.filter(Boolean))
	if (slugSet.size === 0) {
		return JSON.stringify(list, null, 2)
	}
	const next = list.filter(item => !slugSet.has(item.slug))
	return JSON.stringify(next, null, 2)
}
export async function removeBlogFromIndex(token: string, owner: string, repo: string, slug: string, branch: string): Promise<string> {
	return removeBlogsFromIndex(token, owner, repo, [slug], branch)
}
