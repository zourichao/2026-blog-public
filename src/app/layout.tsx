import '@/styles/globals.css'

import type { Metadata } from 'next'
import Layout from '@/layout'
import Head from '@/layout/head'
import siteContent from '@/config/site-content.json'
import { OFFICIAL_SITE_ORIGIN, SEARCH_ENGINE_ROBOTS } from '@/config/site'
import { staticSeoConfig } from '@/lib/seo-config'

const { theme } = siteContent
const { site } = staticSeoConfig
export const metadata: Metadata = {
	metadataBase: new URL(OFFICIAL_SITE_ORIGIN),
	authors: site.author ? [{ name: site.author }] : undefined,
	robots: SEARCH_ENGINE_ROBOTS
}
const htmlStyle = {
	cursor: 'url(/images/cursor.svg) 2 1, auto',
	'--color-brand': theme.colorBrand,
	'--color-primary': theme.colorPrimary,
	'--color-secondary': theme.colorSecondary,
	'--color-brand-secondary': theme.colorBrandSecondary,
	'--color-bg': theme.colorBg,
	'--color-border': theme.colorBorder,
	'--color-card': theme.colorCard,
	'--color-article': theme.colorArticle
}
export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
	return (
		<html lang={site.language || 'zh-CN'} suppressHydrationWarning style={htmlStyle}>
			<Head />

			<body>
				<script
					dangerouslySetInnerHTML={{
						__html: `
					if (/windows|win32/i.test(navigator.userAgent)) {
						document.documentElement.classList.add('windows');
					}
		      `
					}}
				/>

				<Layout>{children}</Layout>
			</body>
		</html>
	)
}
