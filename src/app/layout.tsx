import '@/styles/globals.css'

import type { Metadata } from 'next'
import Layout from '@/layout'
import Head from '@/layout/head'
import siteContent from '@/config/site-content.json'
import { OFFICIAL_SITE_ORIGIN, SEARCH_ENGINE_ROBOTS, getOfficialSiteUrl } from '@/config/site'

const {
	meta: { description },
	seoTitle,
	theme
} = siteContent

export const metadata: Metadata = {
	metadataBase: new URL(OFFICIAL_SITE_ORIGIN),
	title: seoTitle,
	description,
	alternates: {
		canonical: getOfficialSiteUrl('/')
	},
	robots: SEARCH_ENGINE_ROBOTS,
	openGraph: {
		title: seoTitle,
		description,
		url: getOfficialSiteUrl('/')
	},
	twitter: {
		title: seoTitle,
		description
	}
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
		<html lang='zh-CN' suppressHydrationWarning style={htmlStyle}>
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
