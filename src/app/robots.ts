import type { MetadataRoute } from 'next'
import { SEARCH_ENGINE_INDEXING_ENABLED, getOfficialSiteUrl } from '@/config/site'

export default function robots(): MetadataRoute.Robots {
	if (!SEARCH_ENGINE_INDEXING_ENABLED) {
		return {
			rules: {
				userAgent: '*',
				disallow: '/'
			}
		}
	}

	return {
		rules: {
			userAgent: '*',
			allow: '/'
		},
		sitemap: getOfficialSiteUrl('/sitemap.xml')
	}
}
