import type { Metadata } from 'next'
import { buildHomeMetadata } from '@/lib/seo-metadata'

export const metadata: Metadata = buildHomeMetadata()

export default function HomeLayout({ children }: Readonly<{ children: React.ReactNode }>) {
	return children
}
