'use client'

import type { SiteContent } from '../../stores/config-store'

interface BeianFormProps {
	formData: SiteContent
	setFormData: React.Dispatch<React.SetStateAction<SiteContent>>
}

export function BeianForm({ formData, setFormData }: BeianFormProps) {
	const updateBeian = (patch: Partial<SiteContent['beian']>) => {
		setFormData({
			...formData,
			beian: {
				...formData.beian,
				...patch
			}
		})
	}

	return (
		<div className='space-y-2'>
			<label className='mb-2 block text-sm font-medium'>备案信息</label>

			<div className='grid grid-cols-1 gap-2 sm:grid-cols-2'>
				<div>
					<label className='mb-1 block text-xs text-gray-600'>ICP备案号</label>
					<input
						type='text'
						value={formData.beian?.text || ''}
						onChange={e => updateBeian({ text: e.target.value })}
						placeholder='例如：粤ICP备12345678号-1'
						className='bg-secondary/10 w-full rounded-lg border px-4 py-2 text-sm'
					/>
				</div>
				<div>
					<label className='mb-1 block text-xs text-gray-600'>ICP备案链接</label>
					<input
						type='url'
						value={formData.beian?.link || ''}
						onChange={e => updateBeian({ link: e.target.value })}
						placeholder='https://beian.miit.gov.cn/'
						className='bg-secondary/10 w-full rounded-lg border px-4 py-2 text-sm'
					/>
				</div>
			</div>

			{/* 本次改动：仅有 ICP 备案配置 → 同时支持公安备案号与公安备案链接。 */}
			<div className='grid grid-cols-1 gap-2 sm:grid-cols-2'>
				<div>
					<label className='mb-1 block text-xs text-gray-600'>公安备案号</label>
					<input
						type='text'
						value={formData.beian?.publicSecurityText || ''}
						onChange={e => updateBeian({ publicSecurityText: e.target.value })}
						placeholder='例如：粤公网安备44030002016071号'
						className='bg-secondary/10 w-full rounded-lg border px-4 py-2 text-sm'
					/>
				</div>
				<div>
					<label className='mb-1 block text-xs text-gray-600'>公安备案链接</label>
					<input
						type='url'
						value={formData.beian?.publicSecurityLink || ''}
						onChange={e => updateBeian({ publicSecurityLink: e.target.value })}
						placeholder='https://beian.mps.gov.cn/'
						className='bg-secondary/10 w-full rounded-lg border px-4 py-2 text-sm'
					/>
				</div>
			</div>
		</div>
	)
}
