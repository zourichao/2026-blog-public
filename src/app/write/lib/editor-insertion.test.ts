import assert from 'node:assert/strict'
import test from 'node:test'
import { insertRichTextImportToken, replaceRichTextImportToken } from './editor-insertion'

test('inserts a token at the original selection and replaces only that selection', () => {
	const token = '<!-- rich-text-import:test -->'
	const inserted = insertRichTextImportToken('前文需要替换后文', 2, 6, token)
	assert.equal(inserted.value, `前文${token}后文`)

	const replaced = replaceRichTextImportToken(inserted.value, token, '导入内容')
	assert.deepEqual(replaced, {
		value: '前文导入内容后文',
		cursor: 6
	})
})

test('keeps user edits made after the asynchronous import token', () => {
	const token = '<!-- rich-text-import:test -->'
	const currentValue = `开头${token}结尾（处理中新增）`
	const replaced = replaceRichTextImportToken(currentValue, token, '段落 A\n\n![](local-image:image-id)\n\n段落 B')

	assert.equal(replaced?.value, '开头\n\n段落 A\n\n![](local-image:image-id)\n\n段落 B\n\n结尾（处理中新增）')
	assert.equal(replaced?.cursor, '开头\n\n段落 A\n\n![](local-image:image-id)\n\n段落 B\n\n'.length)
})

test('returns null if the user removed the pending token', () => {
	assert.equal(replaceRichTextImportToken('正文', '<!-- missing -->', '导入内容'), null)
})
