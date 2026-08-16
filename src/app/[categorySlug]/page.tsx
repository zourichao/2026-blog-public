import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import blogIndex from '@/../public/blogs/index.json'
import type { BlogIndexItem } from '@/app/blog/types'
import { SEARCH_ENGINE_ROBOTS, getOfficialSiteUrl } from '@/config/site'
import { findCategoryBySlug, getCategoryEntries } from '@/lib/category-config'
import { buildCategoryTitle, staticSeoConfig } from '@/lib/seo-config'

type CategoryPageProps = {
	params: Promise<{ categorySlug: string }>
}

const blogs = blogIndex as BlogIndexItem[]
export const dynamicParams = false

export function generateStaticParams(): Array<{ categorySlug: string }> {
	return getCategoryEntries().map(category => ({ categorySlug: category.slug }))
}

export async function generateMetadata({ params }: CategoryPageProps): Promise<Metadata> {
	const { categorySlug } = await params
	const category = findCategoryBySlug(categorySlug)
	if (!category) notFound()
	const seo = staticSeoConfig.categories[category.name]
	const title = buildCategoryTitle(category.name)
	const description = seo?.description?.trim() || ''
	const canonical = getOfficialSiteUrl(`/${category.slug}`)
	return {
		title,
		description,
		keywords: seo?.keywords ?? [],
		alternates: { canonical },
		robots: SEARCH_ENGINE_ROBOTS
	}
}

function formatDate(value: string): string {
	const date = new Date(value)
	return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('zh-CN')
}

export default async function CategoryPage({ params }: CategoryPageProps) {
	const { categorySlug } = await params
	const category = findCategoryBySlug(categorySlug)
	if (!category) notFound()
	const posts = blogs.filter(blog => blog.hidden !== true && blog.category === category.name)
	return (
		<main className='mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 lg:px-8'>
			<div className='mb-6'>
				<p className='text-secondary text-xs'>文章分类</p>
				<h1 className='mt-1 text-2xl font-semibold'>{category.name}</h1>
				<p className='text-secondary mt-2 text-sm'>共 {posts.length} 篇公开文章</p>
			</div>
			{posts.length === 0 ? (
				<div className='text-secondary rounded-2xl border border-dashed px-4 py-12 text-center text-sm'>该分类暂无公开文章。</div>
			) : (
				<div className='space-y-3'>
					{posts.map(post => (
						<Link key={post.slug} href={`/blog/${post.slug}`} className='bg-card block rounded-2xl border p-4 transition hover:-translate-y-0.5 hover:shadow-sm'>
							<h2 className='text-base font-medium'>{post.title}</h2>
							{post.summary && <p className='text-secondary mt-2 line-clamp-2 text-sm'>{post.summary}</p>}
							<div className='text-secondary mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs'>
								{post.author && <span>{post.author}</span>}
								{post.date && <span>{formatDate(post.date)}</span>}
							</div>
						</Link>
					))}
				</div>
			)}
		</main>
	)
}
