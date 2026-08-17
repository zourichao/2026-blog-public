import type { Metadata } from 'next'
import { SEARCH_ENGINE_ROBOTS, getOfficialSiteUrl } from '@/config/site'
import { staticSeoConfig, type PublicSeoPagePath } from '@/lib/seo-config'

export function buildHomeMetadata(): Metadata {
	const { home, site } = staticSeoConfig
	const canonical = getOfficialSiteUrl('/')
	return {
		title: home.title,
		description: home.description,
		keywords: home.keywords,
		authors: site.author ? [{ name: site.author }] : undefined,
		alternates: { canonical },
		robots: SEARCH_ENGINE_ROBOTS,
		openGraph: {
			title: home.title,
			description: home.description,
			url: canonical
		},
		twitter: {
			title: home.title,
			description: home.description
		}
	}
}

export function buildPublicPageMetadata(path: PublicSeoPagePath): Metadata {
	const page = staticSeoConfig.pages[path]
	return {
		title: page.title,
		description: page.description,
		keywords: page.keywords,
		alternates: { canonical: getOfficialSiteUrl(path) },
		robots: page.indexable ? SEARCH_ENGINE_ROBOTS : { index: false, follow: false }
	}
}
