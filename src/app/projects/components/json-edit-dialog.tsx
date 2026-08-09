'use client'

import { useMemo, useState } from 'react'
import type { Project } from './project-card'

interface JsonEditDialogProps {
	projects: Project[]
	onClose: () => void
	onApply: (projects: Project[]) => void
}

type ValidationResult =
	| { ok: true; projects: Project[] }
	| { ok: false; message: string }

function getJsonErrorMessage(error: unknown, text: string) {
	const rawMessage = error instanceof Error ? error.message : '未知 JSON 错误'
	const positionMatch = rawMessage.match(/position\s+(\d+)/i)
	if (!positionMatch) return `JSON 格式错误：${rawMessage}`

	const position = Number(positionMatch[1])
	const beforeError = text.slice(0, position)
	const lines = beforeError.split('\n')
	const line = lines.length
	const column = (lines.at(-1)?.length ?? 0) + 1
	return `JSON 格式错误：第 ${line} 行，第 ${column} 列附近，请检查逗号、引号或括号。`
}

function validateProjectsJson(text: string): ValidationResult {
	let parsed: unknown
	try {
		parsed = JSON.parse(text)
	} catch (error) {
		return { ok: false, message: getJsonErrorMessage(error, text) }
	}

	if (!Array.isArray(parsed)) {
		return { ok: false, message: 'JSON 根节点必须是项目数组，例如 [ { ... } ]。' }
	}

	const seenUrls = new Set<string>()
	for (let index = 0; index < parsed.length; index += 1) {
		const item = parsed[index]
		const label = `第 ${index + 1} 个项目`

		if (typeof item !== 'object' || item === null || Array.isArray(item)) {
			return { ok: false, message: `${label}必须是 JSON 对象。` }
		}

		const project = item as Record<string, unknown>
		if (typeof project.name !== 'string' || project.name.trim() === '') {
			return { ok: false, message: `${label}的 name 必须是非空字符串。` }
		}
		if (typeof project.year !== 'number' || !Number.isInteger(project.year)) {
			return { ok: false, message: `${label}的 year 必须是整数。` }
		}
		if (typeof project.description !== 'string') {
			return { ok: false, message: `${label}的 description 必须是字符串。` }
		}
		if (typeof project.image !== 'string' || project.image.trim() === '') {
			return { ok: false, message: `${label}的 image 必须是非空字符串。` }
		}
		if (project.image.trim().startsWith('blob:')) {
			return { ok: false, message: `${label}的 image 不能直接填写 blob: 临时地址，请使用正式图片路径或通过图片上传功能更换。` }
		}
		if (typeof project.url !== 'string' || project.url.trim() === '') {
			return { ok: false, message: `${label}的 url 必须是非空字符串。` }
		}
		if (seenUrls.has(project.url)) {
			return { ok: false, message: `${label}的 url 与其他项目重复。项目 URL 必须唯一，否则页面编辑和排序会出现异常。` }
		}
		seenUrls.add(project.url)
		if (!Array.isArray(project.tags) || project.tags.some(tag => typeof tag !== 'string')) {
			return { ok: false, message: `${label}的 tags 必须是字符串数组。` }
		}
		if (project.github !== undefined && typeof project.github !== 'string') {
			return { ok: false, message: `${label}的 github 如填写，必须是字符串。` }
		}
		if (project.npm !== undefined && typeof project.npm !== 'string') {
			return { ok: false, message: `${label}的 npm 如填写，必须是字符串。` }
		}
	}

	return { ok: true, projects: parsed as Project[] }
}

export default function JsonEditDialog({ projects, onClose, onApply }: JsonEditDialogProps) {
	const initialText = useMemo(() => JSON.stringify(projects, null, '\t'), [projects])
	const [jsonText, setJsonText] = useState(initialText)
	const [errorMessage, setErrorMessage] = useState('')

	const handleFormat = () => {
		const result = validateProjectsJson(jsonText)
		if (!result.ok) {
			setErrorMessage(result.message)
			return
		}
		setJsonText(JSON.stringify(result.projects, null, '\t'))
		setErrorMessage('')
	}

	const handleReset = () => {
		setJsonText(initialText)
		setErrorMessage('')
	}

	const handleApply = () => {
		const result = validateProjectsJson(jsonText)
		if (!result.ok) {
			setErrorMessage(result.message)
			return
		}
		setErrorMessage('')
		onApply(result.projects)
	}

	return (
		<div className='fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-6 backdrop-blur-sm'>
			{/* 本次改动：无 list.json 可视化编辑能力 → 新增独立弹框，外层点击不关闭，避免误触导致未应用内容丢失。 */}
			<div className='bg-card flex max-h-[88vh] w-full max-w-[900px] flex-col overflow-hidden rounded-2xl border shadow-2xl'>
				<div className='flex items-start justify-between gap-6 border-b px-6 py-5'>
					<div>
						<h2 className='text-lg font-semibold'>编辑 src/app/projects/list.json</h2>
						<p className='text-secondary mt-1 text-sm'>可直接调整项目内容和数组顺序。应用后仅更新当前页面，仍需点击页面右上角“保存”提交到 GitHub。</p>
					</div>
					<button type='button' onClick={onClose} className='text-secondary shrink-0 rounded-lg px-2 py-1 text-sm transition-colors hover:bg-black/5 hover:text-black'>
						关闭
					</button>
				</div>

				<div className='flex min-h-0 flex-1 flex-col px-6 py-5'>
					<textarea
						value={jsonText}
						onChange={e => {
							setJsonText(e.target.value)
							if (errorMessage) setErrorMessage('')
						}}
						spellCheck={false}
						className='bg-bg min-h-[420px] flex-1 resize-none rounded-xl border p-4 font-mono text-[13px] leading-6 outline-none transition-colors focus:border-blue-400'
						aria-label='projects list.json 内容'
					/>
					{errorMessage && <p className='mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600'>{errorMessage}</p>}
				</div>

				<div className='flex flex-wrap items-center justify-between gap-3 border-t px-6 py-4'>
					<div className='flex gap-2'>
						<button type='button' onClick={handleFormat} className='rounded-xl border bg-white/60 px-4 py-2 text-sm transition-colors hover:bg-white'>
							格式化 JSON
						</button>
						<button type='button' onClick={handleReset} className='rounded-xl border bg-white/60 px-4 py-2 text-sm transition-colors hover:bg-white'>
							恢复当前内容
						</button>
					</div>
					<div className='flex gap-2'>
						<button type='button' onClick={onClose} className='rounded-xl border bg-white/60 px-5 py-2 text-sm transition-colors hover:bg-white'>
							取消
						</button>
						<button type='button' onClick={handleApply} className='brand-btn px-5'>
							应用修改
						</button>
					</div>
				</div>
			</div>
		</div>
	)
}
