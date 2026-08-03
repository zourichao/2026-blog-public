interface HomeShellProps {
	children: React.ReactNode
}

export default function HomeShell({ children }: HomeShellProps) {
	return (
		<div
			className='home-page relative min-h-svh min-w-0 overflow-x-clip bg-[#eaf7fd] bg-no-repeat p-2 sm:p-4 lg:p-5'
			style={{
				backgroundImage:
					'radial-gradient(circle at 12% 8%, rgba(14, 165, 233, 0.2), transparent 32%), radial-gradient(circle at 88% 60%, rgba(45, 212, 191, 0.18), transparent 34%), linear-gradient(160deg, #eaf7fd 0%, #edf9f5 48%, #e7f4f8 100%)'
			}}>
			<a
				href='#home-content'
				className='bg-primary fixed top-3 left-3 z-[100] -translate-y-20 rounded-xl px-4 py-2 text-sm text-white transition-transform focus:translate-y-0 motion-reduce:transition-none'>
				跳到主要内容
			</a>

			<div className='mx-auto w-full max-w-[1440px] min-w-0 overflow-hidden rounded-[24px] border border-white/75 bg-white/[0.24] shadow-[0_30px_90px_-62px_rgba(14,116,144,0.62)] backdrop-blur-2xl sm:rounded-[26px]'>
				{children}
			</div>
		</div>
	)
}
