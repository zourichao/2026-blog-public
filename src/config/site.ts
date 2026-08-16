import { staticSeoConfig } from '@/lib/seo-config'

export const OFFICIAL_SITE_ORIGIN = staticSeoConfig.site.officialOrigin
export const OFFICIAL_SITE_NAME = staticSeoConfig.site.siteName
export const SEARCH_ENGINE_INDEXING_ENABLED = true

export const SEARCH_ENGINE_ROBOTS = {
	index: true,
	follow: true
}

export function getOfficialSiteUrl(pathname = '/'): string {
	return new URL(pathname, `${OFFICIAL_SITE_ORIGIN}/`).toString()
}
