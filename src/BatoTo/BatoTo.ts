import {
    Chapter,
    ChapterDetails,
    ContentRating,
    HomeSection,
    Manga,
    MangaUpdates,
    PagedResults,
    SearchRequest,
    Source,
    SourceInfo,
    TagType,
    Request
} from 'paperback-extensions-common'

import { Parser } from './Parser'

const BATOTO_DOMAIN = 'https://batocomic.org'

export const BatoToInfo: SourceInfo = {
    version: '2.0.3',
    name: 'Bato.To',
    description: 'Extension that pulls western comics from bato.to',
    author: 'GameFuzzy & NmN',
    authorWebsite: 'http://github.com/gamefuzzy',
    icon: 'icon.png',
    contentRating: ContentRating.ADULT,
    websiteBaseURL: BATOTO_DOMAIN,
    sourceTags: [
        {
            text: 'Notifications',
            type: TagType.GREEN
        },
        {
            text: 'Cloudflare',
            type: TagType.RED
        }
    ]
}

export class BatoTo extends Source {
    parser = new Parser()

    requestManager = createRequestManager({
        requestsPerSecond: 5,
        requestTimeout: 20000
    })

    override getMangaShareUrl(mangaId: string): string {
        return `${BATOTO_DOMAIN}/series/${mangaId}`
    }

    async getMangaDetails(mangaId: string): Promise<Manga> {

        const request = createRequestObject({
            url: `${BATOTO_DOMAIN}/series/${mangaId}`,
            method: 'GET'
        })
        const data = await this.requestManager.schedule(request, 1)

        const $ = this.cheerio.load(data.data)

        return this.parser.parseMangaDetails($, mangaId)
    }


    async getChapters(mangaId: string): Promise<Chapter[]> {
        let chapters: Chapter[] = []
        const pageRequest = createRequestObject({
            url: `${BATOTO_DOMAIN}/series/${mangaId}`,
            method: 'GET'
        })
        const pageData = await this.requestManager.schedule(pageRequest, 1)
        const $ = this.cheerio.load(pageData.data)
        chapters = chapters.concat(this.parser.parseChapterList($, mangaId, this))

        return (chapters)
    }


    async getChapterDetails(mangaId: string, chapterId: string): Promise<ChapterDetails> {

        const request = createRequestObject({
            url: `${BATOTO_DOMAIN}/chapter/${chapterId}`,
            method: 'GET',
        })

        const data = await this.requestManager.schedule(request, 1)

        const $ = this.cheerio.load(data.data, {xmlMode: false})
        const pages: string[] = this.parser.parseChapterDetails($)

        return createChapterDetails({
            id: chapterId,
            mangaId: mangaId,
            pages: pages,
            longStrip: false
        })
    }

    override async filterUpdatedManga(mangaUpdatesFoundCallback: (updates: MangaUpdates) => void, time: Date, ids: string[]): Promise<void> {

        let loadNextPage = true
        let currPageNum = 1

        while (loadNextPage) {

            const request = createRequestObject({
                url: `${BATOTO_DOMAIN}/browse/?sort=update&page=${String(currPageNum)}`,
                method: 'GET'
            })

            const data = await this.requestManager.schedule(request, 1)
            const $ = this.cheerio.load(data.data)

            const updatedManga = this.parser.filterUpdatedManga($, time, ids, this)
            loadNextPage = updatedManga.loadNextPage
            if (loadNextPage) {
                currPageNum++
            }
            if (updatedManga.updates.length > 0) {
                mangaUpdatesFoundCallback(createMangaUpdates({
                    ids: updatedManga.updates
                }))
            }
        }
    }

    override async getSearchResults(query: SearchRequest, metadata: any): Promise<PagedResults> {
        const page: number = metadata?.page ?? 1

        const request = createRequestObject({
            url: `${BATOTO_DOMAIN}/search`,
            method: 'GET',
            param: `?word=${encodeURIComponent(query.title ?? '')}&page=${page}`
        })

        const data = await this.requestManager.schedule(request, 1)
        const $ = this.cheerio.load(data.data)
        const manga = this.parser.parseSearchResults($, this)
        let mData = undefined
        if (!this.parser.isLastPage($)) {
            mData = {page: (page + 1)}
        }

        return createPagedResults({
            results: manga,
            metadata: mData
        })

    }

    override async getHomePageSections(sectionCallback: (section: HomeSection) => void): Promise<void> {

        const sections = [
            {
                request: createRequestObject({
                    url: `${BATOTO_DOMAIN}/browse?sort=create`,
                    method: 'GET'
                }),
                section: createHomeSection({
                    id: '0',
                    title: 'RECENTLY ADDED',
                    view_more: true,
                }),
            },
            {
                request: createRequestObject({
                    url: `${BATOTO_DOMAIN}/browse?sort=update`,
                    method: 'GET'
                }),
                section: createHomeSection({
                    id: '1',
                    title: 'RECENTLY UPDATED',
                    view_more: true,
                }),
            },
            {
                request: createRequestObject({
                    url: `${BATOTO_DOMAIN}/browse?sort=views_a`,
                    method: 'GET'
                }),
                section: createHomeSection({
                    id: '2',
                    title: 'POPULAR',
                    view_more: true
                }),
            },
        ]

        const promises: Promise<void>[] = []

        for (const section of sections) {
            // Let the app load empty sections
            sectionCallback(section.section)

            // Get the section data
            promises.push(
                this.requestManager.schedule(section.request, 1).then(response => {
                    const $ = this.cheerio.load(response.data)
                    section.section.items = this.parser.parseHomePageSection($, this)
                    sectionCallback(section.section)
                }),
            )
        }

        // Make sure the function completes
        await Promise.all(promises)
    }


    override async getViewMoreItems(homepageSectionId: string, metadata: any): Promise<PagedResults> {
        let webPage = ''
        const page: number = metadata?.page ?? 1
        switch (homepageSectionId) {
            case '0': {
                webPage = `?sort=create&page=${page}`
                break
            }
            case '1': {
                webPage = `?sort=update&page=${page}`
                break
            }
            case '2': {
                webPage = `?sort=views_a&page=${page}`
                break
            }
            default:
                return Promise.resolve(createPagedResults({results: []}))
        }

        const request = createRequestObject({
            url: `${BATOTO_DOMAIN}/browse${webPage}`,
            method: 'GET'
        })

        const data = await this.requestManager.schedule(request, 1)
        const $ = this.cheerio.load(data.data)
        const manga = this.parser.parseHomePageSection($, this)
        let mData
        if (!this.parser.isLastPage($)) {
            mData = {page: (page + 1)}
        } else {
            mData = undefined  // There are no more pages to continue on to, do not provide page metadata
        }

        return createPagedResults({
            results: manga,
            metadata: mData
        })
    }

    override getCloudflareBypassRequest(): Request {
        return createRequestObject({
            url: `${BATOTO_DOMAIN}`,
            method: 'GET',
        })
    }

    protected convertTime(timeAgo: string): Date {
        let time: Date
        let trimmed = Number((/\d*/.exec(timeAgo) ?? [])[0])
        trimmed = (trimmed == 0 && timeAgo.includes('a')) ? 1 : trimmed
        if (timeAgo.includes('sec') || timeAgo.includes('secs')) {
            time = new Date(Date.now() - trimmed * 1000)
        } else if (timeAgo.includes('min') || timeAgo.includes('mins')) {
            time = new Date(Date.now() - trimmed * 60000)
        } else if (timeAgo.includes('hour') || timeAgo.includes('hours')) {
            time = new Date(Date.now() - trimmed * 3600000)
        } else if (timeAgo.includes('day') || timeAgo.includes('days')) {
            time = new Date(Date.now() - trimmed * 86400000)
        } else if (timeAgo.includes('year') || timeAgo.includes('years')) {
            time = new Date(Date.now() - trimmed * 31556952000)
        } else {
            time = new Date(Date.now())
        }

        return time
    }

}
