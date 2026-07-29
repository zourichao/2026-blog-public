import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import blogIndex from '@/../public/blogs/index.json'
import type { BlogIndexItem } from '@/app/blog/types'
import siteContent from '@/config/site-content.json'
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

	if (!blog) {
		notFound()
	}

	const title = `${blog.title || blog.slug}｜${OFFICIAL_SITE_NAME}`
	const description = blog.summary?.trim() || siteContent.meta.description
	const canonical = getOfficialSiteUrl(`/blog/${encodeURIComponent(blog.slug)}`)

	return {
		title,
		description,
		alternates: {
			canonical
		},
		robots: SEARCH_ENGINE_ROBOTS,
		openGraph: {
			title,
			description,
			url: canonical
		},
		twitter: {
			title,
			description
		}
	}
}

export default async function Page({ params }: BlogPageProps) {
	const { id } = await params
	const blog = findBlog(id)

	if (!blog) {
		notFound()
	}

	return <BlogPageClient slug={blog.slug} />
}
