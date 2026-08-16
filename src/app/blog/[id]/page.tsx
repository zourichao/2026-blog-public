import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import blogIndex from '@/../public/blogs/index.json'
import type { BlogIndexItem } from '@/app/blog/types'
import { OFFICIAL_SITE_NAME, SEARCH_ENGINE_ROBOTS, getOfficialSiteUrl } from '@/config/site'
import { BlogPageClient } from './blog-page-client'

type BlogPageProps = {
	params: Promise<{ id: string }>
}

const blogs = blogIndex as BlogIndexItem[]
function findBlog(slug: string): BlogIndexItem | undefined {
	return blogs.find(blog => blog.slug === slug)
}

export const dynamicParams = false

export function generateStaticParams(): Array<{ id: string }> {
	return blogs.filter(blog => blog?.slug).map(blog => ({ id: blog.slug }))
}

export async function generateMetadata({ params }: BlogPageProps): Promise<Metadata> {
	const { id } = await params
	const blog = findBlog(id)

	if (!blog) notFound()
	const baseTitle = blog.title || blog.slug
	const title = OFFICIAL_SITE_NAME.trim() ? `${baseTitle}｜${OFFICIAL_SITE_NAME.trim()}` : baseTitle
	const description = blog.summary?.trim() || ''
	const canonical = getOfficialSiteUrl(`/blog/${encodeURIComponent(blog.slug)}`)
	const cover = blog.cover?.trim()

	return {
		title,
		description,
		keywords: blog.tags,
		authors: blog.author ? [{ name: blog.author }] : undefined,
		alternates: { canonical },
		robots: blog.hidden === true ? { index: false, follow: false } : SEARCH_ENGINE_ROBOTS,
		openGraph: {
			title,
			description,
			url: canonical,
			...(cover ? { images: [{ url: getOfficialSiteUrl(cover) }] } : {})
		},
		twitter: {
			title,
			description,
			...(cover ? { images: [getOfficialSiteUrl(cover)] } : {})
		}
	}
}

export default async function Page({ params }: BlogPageProps) {
	const { id } = await params
	const blog = findBlog(id)
	if (!blog) notFound()
	return <BlogPageClient slug={blog.slug} />
}
