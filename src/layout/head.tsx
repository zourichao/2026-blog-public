import Script from 'next/script'

const ENABLE_GOOGLE_ANALYTICS = false

export default function Head() {
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
			{/* 本次改动：GA4 默认开启 → 默认关闭；保留原统计代码，需要时将 ENABLE_GOOGLE_ANALYTICS 改为 true。 */}
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
