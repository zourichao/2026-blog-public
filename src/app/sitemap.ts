import type { MetadataRoute } from 'next'
import blogIndex from '@/../public/blogs/index.json'
import type { BlogIndexItem } from '@/app/blog/types'
import { getOfficialSiteUrl } from '@/config/site'
import { getCategoryEntries } from '@/lib/category-config'
import { PUBLIC_SEO_PAGES, staticSeoConfig } from '@/lib/seo-config'

export const dynamic = 'force-static'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
	const posts = (blogIndex as BlogIndexItem[]).filter(post => post?.slug && post.hidden !== true)
	const postEntries: MetadataRoute.Sitemap = posts.map(post => ({
		url: getOfficialSiteUrl(`/blog/${encodeURIComponent(post.slug)}`),
		...(post.date ? { lastModified: post.date } : {})
	}))
	const categoryEntries: MetadataRoute.Sitemap = getCategoryEntries().map(category => ({
		url: getOfficialSiteUrl(`/${category.slug}`)
	}))
	const pageEntries: MetadataRoute.Sitemap = PUBLIC_SEO_PAGES
		.filter(page => staticSeoConfig.pages[page.path].includeInSitemap)
		.map(page => ({ url: getOfficialSiteUrl(page.path) }))
	return [{ url: getOfficialSiteUrl('/') }, ...pageEntries, ...categoryEntries, ...postEntries]
}
