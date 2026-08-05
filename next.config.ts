import { NextConfig } from 'next'
import { codeInspectorPlugin } from 'code-inspector-plugin'

const nextConfig: NextConfig = {
	devIndicators: false,
	reactStrictMode: false,
	reactCompiler: true,
	pageExtensions: ['ts', 'tsx', 'js', 'jsx', 'md', 'mdx'],
	typescript: {
		ignoreBuildErrors: true
	},
	experimental: {
		scrollRestoration: false
	},
	turbopack: {
		rules: {
			'*.svg': {
				loaders: ['@svgr/webpack'],
				as: '*.js'
			}
			// ...codeInspectorPlugin({
			// 	bundler: 'turbopack'
			// })
		},

		resolveExtensions: ['.mdx', '.tsx', '.ts', '.jsx', '.js', '.mjs', '.json', 'css']
	},
	webpack: config => {
		config.module.rules.push({
			test: /\.svg$/i,
			use: [{ loader: '@svgr/webpack', options: { svgo: false } }]
		})

		return config
	},

async redirects() {
	return [
		// 本次改动：EdgeOne 默认域名可直接访问 → 永久跳转到正式域名，并保留原路径和查询参数。
		{
			source: '/:path*',
			has: [
				{
					type: 'host',
					value: '2026-blog-public-iwen7fga.edgeone.cool'
				}
			],
			destination: 'https://www.999562.xyz/:path*',
			statusCode: 301
		},
		{
			source: '/zh',
			destination: '/',
			permanent: true
		},
		{
			source: '/en',
			destination: '/',
			permanent: true
		}
	]
}

export default nextConfig
