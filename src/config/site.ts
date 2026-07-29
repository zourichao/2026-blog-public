const officialSiteUrl = new URL('https://www.999562.xyz')

export const OFFICIAL_SITE_ORIGIN = officialSiteUrl.origin
export const OFFICIAL_SITE_NAME = officialSiteUrl.hostname.replace(/^www\./, '')
export const SEARCH_ENGINE_INDEXING_ENABLED = false

export const SEARCH_ENGINE_ROBOTS = {
	index: SEARCH_ENGINE_INDEXING_ENABLED,
	follow: SEARCH_ENGINE_INDEXING_ENABLED
}

export function getOfficialSiteUrl(pathname = '/'): string {
	return new URL(pathname, `${OFFICIAL_SITE_ORIGIN}/`).toString()
}
