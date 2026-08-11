import { motion } from 'motion/react'
import { toast } from 'sonner'
import { useWriteStore } from '../stores/write-store'
import { INIT_DELAY } from '@/consts'
import { useRef, useState } from 'react'
import { createRichTextImportToken, insertRichTextImportToken, replaceRichTextImportToken } from '../lib/editor-insertion'
import { shouldPreferPlainMarkdown } from '../lib/clipboard-intent'
import { normalizeWordClipboardSemanticHtml } from '../lib/word-semantic-normalize'
import {
	captureWordClipboard,
	dedupeWordClipboardImageFiles,
	getWordImportFeedback,
	hasDirectWordImageBinary,
	isWordClipboardHtml,
	logWordClipboardDiagnostic
} from '../lib/word-clipboard-import'
const defaultText = 'text'
const RICH_HTML_PATTERN = /<(?:p|div|h[1-6]|ul|ol|li|a|table|img|blockquote|pre|code|strong|b|em|i|del|s|strike|br|hr|u|sub|sup)\b/i
const STYLED_INLINE_HTML_PATTERN = /<(?:span|font)\b[^>]*(?:class\s*=\s*["'][^"']*Mso|style\s*=\s*["'][^"']*(?:font-|font:|text-decoration))/i
const OFFICE_HTML_PATTERN = /<(?:o|v|w|st1):[a-z]/i
function collectClipboardImageFiles(dataTransfer: DataTransfer): File[] {
	const files = Array.from(dataTransfer.files || []).filter(file => file.type.startsWith('image/'))
	const itemFiles = Array.from(dataTransfer.items || []).flatMap(item => {
		if (!item.type.startsWith('image/')) return []
		const file = item.getAsFile()
		return file ? [file] : []
	})
	return files.length > 0 ? files : itemFiles
}
function imageImportMessage(localized: number, external: number, failed: number, richText: boolean): string {
	if (external > 0 && failed > 0) {
		return `内容已导入：${localized} 张图片已保存，${external} 张暂时保留为外部地址，${failed} 张无法读取，已在原位置标记。`
	}
	if (external > 0) return `内容已导入：${localized} 张图片已保存，${external} 张图片暂时保留为外部地址。`
	if (failed > 0) return `内容已导入：${localized} 张图片成功，${failed} 张无法读取，已在原位置标记。`
	if (localized > 0) return richText ? `已导入富文本，识别并添加 ${localized} 张图片。` : `已添加 ${localized} 张图片。`
	return richText ? '已将富文本转换为 Markdown。' : '剪贴板中没有可导入的图片。'
}
export function WriteEditor() {
	const { form, updateForm, addFilesWithMapping } = useWriteStore()
	const textareaRef = useRef<HTMLTextAreaElement>(null)
	const importingRef = useRef(false)
	const [isImporting, setIsImporting] = useState(false)

	const insertText = (text: string) => {
		const textarea = textareaRef.current
		if (!textarea) return

		textarea.focus()
		// Use execCommand to preserve undo/redo stack
		const success = document.execCommand('insertText', false, text)
		if (!success) {
			// Fallback for browsers that don't support execCommand
			const { selectionStart, selectionEnd, value } = textarea
			const before = value.substring(0, selectionStart)
			const after = value.substring(selectionEnd)
			updateForm({ md: before + text + after })
			setTimeout(() => {
				textarea.setSelectionRange(selectionStart + text.length, selectionStart + text.length)
				textarea.focus()
			}, 0)
		}
	}
	const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
		const textarea = textareaRef.current
		if (!textarea) return

		const { selectionStart, selectionEnd, value } = textarea
		const selectedText = value.substring(selectionStart, selectionEnd)

		// Ctrl/Cmd + B: Toggle Bold
		if ((e.ctrlKey || e.metaKey) && e.key === 'b') {
			e.preventDefault()
			const before = value.substring(0, selectionStart)
			const after = value.substring(selectionEnd)
			// Check if already bold
			const isBold = before.endsWith('**') && after.startsWith('**')
			if (isBold && selectedText) {
				// Remove bold - select including markers and replace
				textarea.setSelectionRange(selectionStart - 2, selectionEnd + 2)
				insertText(selectedText)
			} else {
				// Add bold
				const text = selectedText || defaultText
				insertText(`**${text}**`)
				if (!selectedText) {
					setTimeout(() => {
						textarea.setSelectionRange(selectionStart + 2, selectionStart + 2 + defaultText.length)
					}, 0)
				}
			}
			return
		}
		// Ctrl/Cmd + I: Toggle Italic
		if ((e.ctrlKey || e.metaKey) && e.key === 'i') {
			e.preventDefault()
			const before = value.substring(0, selectionStart)
			const after = value.substring(selectionEnd)

			// Check if already italic
			const isItalic = before.endsWith('*') && after.startsWith('*') && !(before.endsWith('**') && after.startsWith('**'))
			if (isItalic && selectedText) {
				// Remove italic and replace
				textarea.setSelectionRange(selectionStart - 1, selectionEnd + 1)
				insertText(selectedText)
			} else {
				// Add italic
				const text = selectedText || defaultText
				insertText(`*${text}*`)
				if (!selectedText) {
					// Select the default text
					setTimeout(() => {
						textarea.setSelectionRange(selectionStart + 1, selectionStart + 1 + defaultText.length)
					}, 0)
				}
			}
			return
		}
		// Ctrl/Cmd + K: Link
		if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
			e.preventDefault()
			const text = selectedText || defaultText
			insertText(`[${text}](url)`)
			// Select 'url' part
			setTimeout(() => {
				const urlStart = selectionStart + text.length + 3
				textarea.setSelectionRange(urlStart, urlStart + 3)
			}, 0)
			return
		}

		// Tab: Indent
		if (e.key === 'Tab' && !e.shiftKey) {
			e.preventDefault()
			insertText('\t')
			return
		}
		// Shift + Tab: Outdent
		if (e.key === 'Tab' && e.shiftKey) {
			e.preventDefault()
			const lineStart = value.lastIndexOf('\n', selectionStart - 1) + 1
			const line = value.substring(lineStart, value.indexOf('\n', selectionStart))

			if (line.startsWith('\t')) {
				textarea.setSelectionRange(lineStart, lineStart + 1)
				insertText('')
			} else if (line.startsWith('  ')) {
				textarea.setSelectionRange(lineStart, lineStart + 2)
				insertText('')
			}
			return
		}
	}
	const handlePaste = async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
		const clipboardData = e.clipboardData
		const html = clipboardData.getData('text/html')
		const plainText = clipboardData.getData('text/plain')
		const hasRichHtml = RICH_HTML_PATTERN.test(html) || STYLED_INLINE_HTML_PATTERN.test(html) || OFFICE_HTML_PATTERN.test(html)
		const isWordHtml = hasRichHtml && isWordClipboardHtml(html)
		const wordClipboard = isWordHtml ? captureWordClipboard(clipboardData, html) : null
		if (wordClipboard) logWordClipboardDiagnostic(wordClipboard.diagnostic)
		const imageFiles = wordClipboard?.imageFiles || collectClipboardImageFiles(clipboardData)
		const preservePlainMarkdown = imageFiles.length === 0 && shouldPreferPlainMarkdown(html, plainText)
		// Preserve native paste for plain text and already-authored Markdown.
		if (preservePlainMarkdown || (!hasRichHtml && imageFiles.length === 0)) return

		e.preventDefault()
		if (importingRef.current) {
			toast.info('正在处理上一次粘贴，请稍候。')
			return
		}
		const textarea = e.currentTarget
		const token = createRichTextImportToken()
		const pending = insertRichTextImportToken(textarea.value, textarea.selectionStart, textarea.selectionEnd, token)
		updateForm({ md: pending.value })
		const addImportedFiles = (files: File[]) => addFilesWithMapping(files, () => useWriteStore.getState().form.md.includes(token))
		importingRef.current = true
		setIsImporting(true)
		const loadingToast = toast.loading('正在导入富文本并处理图片…')
		try {
			const clipboardImages = await import('../lib/clipboard-image-import')
			let resolvedImageFiles = wordClipboard ? await dedupeWordClipboardImageFiles(wordClipboard.imageCandidates) : imageFiles
			let markdown = ''
			let localizedCount = 0
			let externalCount = 0
			let failedCount = 0
			let complexTableCount = 0
			let hasEmbeddedWordImageSource = false
			if (hasRichHtml) {
				const richText = await import('../lib/rich-text-import')
				// 本次改动：仅 Word HTML 在进入既有富文本转换器前补充语义标准化；图片链路与 Markdown 渲染不变。
				const htmlForConversion = isWordHtml ? normalizeWordClipboardSemanticHtml(html) : html
				const converted = richText.convertRichHtmlToMarkdown(htmlForConversion)
				if (converted.markdownTemplate === richText.RICH_TEXT_IMPORT_FAILURE_PLACEHOLDER) {
					throw new Error('富文本转换失败')
				}
				markdown = converted.markdownTemplate
				complexTableCount = converted.complexTableCount
				hasEmbeddedWordImageSource = converted.images.some(image => image.kind === 'data' || image.kind === 'blob')
				if (wordClipboard && resolvedImageFiles.length === 0 && wordClipboard.rtf) {
					const wordRtf = await import('../lib/word-rtf-image-import')
					const rtfResult = wordRtf.extractWordRtfRasterImages(wordClipboard.rtf)
					resolvedImageFiles = wordRtf.selectWordRtfFilesForHtmlImages(rtfResult, converted.images)
					wordRtf.logWordRtfImageDiagnostic(rtfResult, resolvedImageFiles.length)
				}
				if (converted.images.length > 0) {
					const imported = await clipboardImages.importRichTextImages(converted.images, resolvedImageFiles, addImportedFiles)
					markdown = richText.replaceRichTextImagePlaceholders(markdown, imported.replacements)
					localizedCount = imported.localizedCount
					externalCount = imported.externalCount
					failedCount = imported.failedCount
				} else if (resolvedImageFiles.length > 0) {
					const imported = await clipboardImages.importStandaloneClipboardImages(resolvedImageFiles, addImportedFiles)
					const imageMarkdown = imported.results.map(result => result.markdown).join('\n\n')
					markdown = [markdown, imageMarkdown].filter(Boolean).join('\n\n')
					localizedCount = imported.localizedCount
					externalCount = imported.externalCount
					failedCount = imported.failedCount
				}
				markdown = richText.normalizeMarkdownSpacing(markdown)
			} else {
				const imported = await clipboardImages.importStandaloneClipboardImages(resolvedImageFiles, addImportedFiles)
				const imageMarkdown = imported.results.map(result => result.markdown).join('\n\n')
				markdown = [plainText, imageMarkdown].filter(Boolean).join('\n\n')
				localizedCount = imported.localizedCount
				externalCount = imported.externalCount
				failedCount = imported.failedCount
			}
			if (!markdown.trim() && plainText) markdown = plainText
			if (!markdown.trim()) throw new Error('剪贴板内容为空或无法读取')

			const currentValue = useWriteStore.getState().form.md
			const replacement = replaceRichTextImportToken(currentValue, token, markdown)
			if (!replacement) throw new Error('导入位置已被移除')
			useWriteStore.getState().updateForm({ md: replacement.value })
			setTimeout(() => {
				const currentTextarea = textareaRef.current
				if (!currentTextarea) return
				currentTextarea.focus()
				currentTextarea.setSelectionRange(replacement.cursor, replacement.cursor)
			}, 0)
			toast.dismiss(loadingToast)
			const importMessage = imageImportMessage(localizedCount, externalCount, failedCount, hasRichHtml)
			const toastOptions = complexTableCount > 0 ? { description: '复杂表格已转换为简化文本格式。' } : undefined
			if (isWordHtml) {
				const noUsableBinary = Boolean(wordClipboard && !hasDirectWordImageBinary(wordClipboard) && !hasEmbeddedWordImageSource)
				const hasRtfRaster = Boolean(wordClipboard && (wordClipboard.diagnostic.rtf.pngCount > 0 || wordClipboard.diagnostic.rtf.jpegCount > 0))
				const feedback = getWordImportFeedback({ localizedCount, failedCount, noUsableBinary, hasRtfRaster, fallbackMessage: importMessage })
				if (feedback.level === 'warning') toast.warning(feedback.message, toastOptions)
				else toast.success(feedback.message, toastOptions)
			} else {
				toast.success(importMessage, toastOptions)
			}
		} catch {
			const fallback = plainText || '> 富文本导入失败：请重新粘贴，或改用纯文本粘贴。'
			const currentValue = useWriteStore.getState().form.md
			const replacement = replaceRichTextImportToken(currentValue, token, fallback)
			if (replacement) {
				useWriteStore.getState().updateForm({ md: replacement.value })
				setTimeout(() => {
					const currentTextarea = textareaRef.current
					if (!currentTextarea) return
					currentTextarea.focus()
					currentTextarea.setSelectionRange(replacement.cursor, replacement.cursor)
				}, 0)
			}
			toast.dismiss(loadingToast)
			toast.error(replacement ? '富文本格式未能转换，已按纯文本粘贴。' : '导入位置已被移除，请重新粘贴。')
		} finally {
			toast.dismiss(loadingToast)
			importingRef.current = false
			setIsImporting(false)
		}
	}
	return (
		<motion.div
			initial={{ opacity: 0, scale: 0.8 }}
			animate={{ opacity: 1, scale: 1 }}
			transition={{ delay: INIT_DELAY }}
			className='bg-card flex min-h-[800px] w-[800px] flex-col rounded-[40px] border p-6 shadow'>
			<div className='mb-3 flex gap-3'>
				<input
					type='text'
					placeholder='标题'
					className='bg-card flex-1 rounded-lg border px-3 py-2 text-sm'
					value={form.title}
					onChange={e => updateForm({ title: e.target.value })}
				/>
				<input
					type='text'
					placeholder='slug（xx-xx）'
					className='bg-card w-[200px] rounded-lg border px-3 py-2 text-sm'
					value={form.slug}
					onChange={e => updateForm({ slug: e.target.value })}
				/>
			</div>
			<textarea
				ref={textareaRef}
				placeholder='Markdown 内容'
				className='bg-card h-[650px] w-full flex-1 resize-none rounded-xl border p-4 text-sm'
				value={form.md}
				onChange={e => updateForm({ md: e.target.value })}
				onKeyDown={handleKeyDown}
				onPaste={handlePaste}
				aria-busy={isImporting}
			/>
		</motion.div>
	)
}
