import type { Metadata } from 'next'
import { buildPublicPageMetadata } from '@/lib/seo-metadata'

export const metadata: Metadata = buildPublicPageMetadata('/live2d')

export default function PageLayout({ children }: Readonly<{ children: React.ReactNode }>) {
	return children
}
