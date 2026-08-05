import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const EDGEONE_DEFAULT_HOST = '2026-blog-public-iwen7fga.edgeone.cool'
const OFFICIAL_ORIGIN = 'https://www.999562.xyz'

// 本次新增：访问 EdgeOne 默认域名 → 301 永久跳转到正式域名，并保留路径和查询参数。
export function proxy(request: NextRequest) {
	const requestHost = request.headers.get('host')?.split(':')[0]

	if (requestHost !== EDGEONE_DEFAULT_HOST) {
		return NextResponse.next()
	}

	const destination = new URL(request.nextUrl.pathname, OFFICIAL_ORIGIN)
	destination.search = request.nextUrl.search

	return NextResponse.redirect(destination, 301)
}

export const config = {
	matcher: '/:path*'
}