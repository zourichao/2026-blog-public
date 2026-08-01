import assert from 'node:assert/strict'
import test from 'node:test'
import { shouldPreferPlainMarkdown } from './clipboard-intent'

test('prefers authored Markdown copied from a code editor HTML flavor', () => {
	const html = '<div style="font-family: Consolas, monospace"><span>## Heading</span><br><span>- item</span></div>'
	assert.equal(shouldPreferPlainMarkdown(html, '## Heading\n\n- item'), true)
})

test('prefers raw Markdown copied from a preformatted code block', () => {
	assert.equal(shouldPreferPlainMarkdown('<pre><code>**bold**</code></pre>', '**bold**'), true)
})

test('does not bypass real rich document structures or ordinary code', () => {
	assert.equal(shouldPreferPlainMarkdown('<p><strong>bold</strong></p>', '**bold**'), false)
	assert.equal(shouldPreferPlainMarkdown('<pre><code>const answer = 42</code></pre>', 'const answer = 42'), false)
	assert.equal(shouldPreferPlainMarkdown('<p class="MsoListParagraph">- item</p>', '- item'), false)
})
