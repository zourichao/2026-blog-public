import type { Metadata } from 'next'

export const metadata: Metadata = {
	title: 'SEO 设置',
	robots: { index: false, follow: false }
}

export default function SeoLayout({ children }: Readonly<{ children: React.ReactNode }>) {
	return children
}
