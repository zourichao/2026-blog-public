export type BlogIndexItem = {
	slug: string
	title: string
	author?: string
	tags: string[]
	date: string
	summary?: string
	cover?: string
	hidden?: boolean
	category?: string
}

export type BlogConfig = {
	title?: string
	author?: string
	tags?: string[]
	date?: string
	summary?: string
	cover?: string
	hidden?: boolean
	category?: string
}

