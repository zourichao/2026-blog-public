'use client'

import { Mail } from 'lucide-react'
import { toast } from 'sonner'

interface EmailCopyButtonProps {
	email: string
}

export default function EmailCopyButton({ email }: EmailCopyButtonProps) {
	const copyEmail = async () => {
		try {
			await navigator.clipboard.writeText(email)
			toast.success('邮箱已复制到剪贴板')
		} catch {
			toast.error('复制失败，请稍后重试')
		}
	}

	return (
		<>
			{/* 本次改动：Email按钮改为小屏34px/12px、中屏38px/13px、PC44px/15px三级，并统一9px圆角。 */}
			<button
				type='button'
				onClick={copyEmail}
				className='focus-visible:ring-brand inline-flex min-h-[34px] min-w-[92px] items-center justify-center gap-1.5 rounded-[9px] border border-slate-200/90 bg-white/80 px-2.5 py-0.5 text-[12px] font-medium text-slate-700 shadow-sm transition-colors hover:border-sky-200 hover:text-sky-700 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none motion-reduce:transition-none min-[441px]:min-h-[38px] min-[441px]:min-w-[104px] min-[441px]:gap-2 min-[441px]:px-3 min-[441px]:py-1.5 min-[441px]:text-[13px] min-[801px]:min-h-[44px] min-[801px]:min-w-[116px] min-[801px]:px-4 min-[801px]:py-2 min-[801px]:text-[15px]'>
				<Mail aria-hidden='true' className='size-[15px] min-[441px]:size-[16px] min-[801px]:size-[18px]' />
				Email
			</button>
		</>
	)
}
