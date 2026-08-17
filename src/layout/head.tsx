import Script from 'next/script'
import { staticSeoConfig } from '@/lib/seo-config'

const ENABLE_GOOGLE_ANALYTICS = false
export default function Head() {
	const { verification } = staticSeoConfig
	return (
		<head>
			<meta name='viewport' content='width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no' />
			<link rel='manifest' href='/manifest.json' />
			<link rel='icon' href='/favicon.svg' type='image/svg+xml' />
			<link rel='icon' href='/favicon.ico' sizes='any' />
			<link rel='icon' href='/favicon-16.png' type='image/png' sizes='16x16' />
			<link rel='icon' href='/favicon-32.png' type='image/png' sizes='32x32' />
			<link rel='icon' href='/favicon.png' type='image/png' sizes='512x512' />
			<link rel='apple-touch-icon' href='/apple-touch-icon.png' sizes='180x180' />
			<link rel='preconnect' href='https://fonts.googleapis.cn' />
			<link rel='preconnect' href='https://fonts.gstatic.cn' crossOrigin='anonymous' />
			<link href='https://fonts.googleapis.cn/css2?family=Averia+Gruesa+Libre&display=swap' rel='stylesheet' />
			{verification.google.enabled && verification.google.value && <meta name='google-site-verification' content={verification.google.value} />}
			{verification.bing.enabled && verification.bing.value && <meta name='msvalidate.01' content={verification.bing.value} />}
			{verification.baidu.enabled && verification.baidu.value && <meta name='baidu-site-verification' content={verification.baidu.value} />}
			{/* GA4 继续保持关闭；SEO 改造不改变既有统计开关。 */}
			{ENABLE_GOOGLE_ANALYTICS && (
				<>
					<Script src='https://www.googletagmanager.com/gtag/js?id=G-ZNSFR7C9PM' />
					<Script id='google-analytics'>
						{`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', 'G-ZNSFR7C9PM');
        `}
					</Script>
				</>
			)}
		</head>
	)
}
