'use client'

import useSWR from 'swr'
import { GITHUB_CONFIG } from '@/consts'
import { getAuthToken } from '@/lib/auth'
import { readTextFileFromRepo } from '@/lib/github-client'

export type CategoriesConfig = {
	categories: string[]
}

type UseCategoriesOptions = {
	preferRepository?: boolean
}

function normalizeCategories(data: unknown): CategoriesConfig {
	if (Array.isArray(data)) {
		return { categories: data.filter((item): item is string => typeof item === 'string') }
	}
	if (data && typeof data === 'object' && Array.isArray((data as { categories?: unknown }).categories)) {
		return {
			categories: (data as { categories: unknown[] }).categories.filter((item): item is string => typeof item === 'string')
		}
	}
	return { categories: [] }
}

const fetchCategoriesUrl = async (url: string): Promise<CategoriesConfig> => {
	const res = await fetch(url, { cache: 'no-store' })
	if (!res.ok) return { categories: [] }
	return normalizeCategories(await res.json())
}

async function fetchRepositoryCategories(): Promise<CategoriesConfig> {
	try {
		const token = await getAuthToken()
		const content = await readTextFileFromRepo(
			token,
			GITHUB_CONFIG.OWNER,
			GITHUB_CONFIG.REPO,
			'public/blogs/categories.json',
			GITHUB_CONFIG.BRANCH
		)
		if (content === null) throw new Error('GitHub 分类配置文件不存在')
		return normalizeCategories(JSON.parse(content) as unknown)
	} catch (error) {
		console.error('Failed to load categories from GitHub repository:', error)
		throw error instanceof Error ? error : new Error('GitHub 分类读取失败')
	}
}

// 本次改动：GitHub 分类读取失败后回退生产静态文件 → 写作页通过 GitHub API 严格读取目标分支，失败时显式报错，避免旧分类重新出现。
export function useCategories(options: UseCategoriesOptions = {}) {
	const { preferRepository = false } = options
	const key = preferRepository
		? `repository-categories:${GITHUB_CONFIG.OWNER}/${GITHUB_CONFIG.REPO}@${GITHUB_CONFIG.BRANCH}`
		: '/blogs/categories.json'
	const { data, error, isLoading, mutate } = useSWR<CategoriesConfig>(
		key,
		() => (preferRepository ? fetchRepositoryCategories() : fetchCategoriesUrl('/blogs/categories.json')),
		{
			revalidateOnFocus: false,
			revalidateOnReconnect: true
		}
	)

	return {
		categories: data?.categories ?? [],
		loading: isLoading,
		error,
		refreshCategories: () => mutate(),
		setCategories: (categories: string[]) => mutate({ categories }, { revalidate: false })
	}
}
