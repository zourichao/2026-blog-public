import type { MetadataRoute } from 'next'
import { getOfficialSiteUrl } from '@/config/site'

export default function robots(): MetadataRoute.Robots {
	return {
		rules: {
			userAgent: '*',
			allow: '/',
			disallow: ['/write', '/write/', '/seo', '/seo/', '/api/']
		},
		sitemap: getOfficialSiteUrl('/sitemap.xml')
	}
}
