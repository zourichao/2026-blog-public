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
		<button
			type='button'
			onClick={copyEmail}
			className='focus-visible:ring-brand inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200/90 bg-white/80 px-3.5 py-2 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:border-sky-200 hover:text-sky-700 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none motion-reduce:transition-none'>
			<Mail aria-hidden='true' className='size-4' />
			Email
		</button>
	)
}
