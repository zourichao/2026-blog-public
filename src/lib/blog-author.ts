import siteContent from '@/config/site-content.json'

export const DEFAULT_BLOG_AUTHOR = siteContent.meta.username

export function getBlogAuthor(author?: string): string {
	return author?.trim() || DEFAULT_BLOG_AUTHOR
}
