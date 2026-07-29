import type { MetadataRoute } from 'next'
import blogIndex from '@/../public/blogs/index.json'
import type { BlogIndexItem } from '@/app/blog/types'
import { SEARCH_ENGINE_INDEXING_ENABLED, getOfficialSiteUrl } from '@/config/site'

export const dynamic = 'force-static'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
	if (!SEARCH_ENGINE_INDEXING_ENABLED) {
		return []
	}

	const posts = (blogIndex as BlogIndexItem[]).filter(post => post?.slug && post.hidden !== true)

	const postEntries: MetadataRoute.Sitemap = posts.map(post => ({
		url: getOfficialSiteUrl(`/blog/${encodeURIComponent(post.slug)}`),
		lastModified: post.date ? new Date(post.date) : new Date(),
		changeFrequency: 'weekly',
		priority: 0.8
	}))

	const staticEntries: MetadataRoute.Sitemap = [
		{
			url: getOfficialSiteUrl('/'),
			lastModified: new Date(),
			changeFrequency: 'daily',
			priority: 1
		}
	]

	return [...staticEntries, ...postEntries]
}
