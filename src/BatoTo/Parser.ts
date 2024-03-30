/* eslint-disable @typescript-eslint/no-unused-vars */
import {
    Chapter,
    LanguageCode,
    Manga,
    MangaStatus,
    MangaTile,
    Tag,
    TagSection
} from 'paperback-extensions-common'
import {reverseLangCode} from './Languages'

// eslint-disable-next-line @typescript-eslint/no-var-requires
const CryptoJS = require('./external/crypto.min.js')

export class Parser {

    parseMangaDetails($: any, mangaId: string): Manga {
        const titles = [this.decodeHTMLEntity($('a', $('.item-title')).text().trim())]
        const altTitles: string[] = $('.alias-set').text().split('/').map((s: string) => s.trim()) ?? ''
        for (const title of altTitles)
            titles.push(this.decodeHTMLEntity(title))

        const image = $('.shadow-6').attr('src')
        const summary = $('.limit-html').text().trim().length == 0 ? 'no description' : $('.limit-html').text().trim()
        const rating = 0

        const [status, author, artist, strViews, isHentai, tagArray0] = this.parseDetailsSet($)
        const views = this.calculateViews(strViews)
        const tagSections: TagSection[] = [createTagSection({id: '0', label: 'genres', tags: tagArray0})]

        return createManga({
            id: mangaId,
            rating: rating,
            titles: titles,
            image: image ?? '',
            status: status,
            author: this.decodeHTMLEntity(author ?? ''),
            artist: this.decodeHTMLEntity(artist ?? ''),
            tags: tagSections,
            desc: this.decodeHTMLEntity(summary),
            hentai: isHentai,
            views: views ?? 0,
        })
    }

    parseDetailsSet($:any): any {
        let status = MangaStatus.ONGOING, author='', artist='', strViews = '', isHentai = false
        let tagArray0: Tag[] = []
        // Function checks this array to determine if the manga is H-type
        const hentaiId = ['adult', 'mature', 'hentai', 'smut', 'gore']

        for (const item of $('.attr-item').toArray()) {
            const itemSpan = $('span', $(item))
            const type = $('b', $(item)).text().trim().toLowerCase()

            if      (type.includes('rank'))    strViews = $(itemSpan).text().split('/')[1].trim().split(' ')[0]
            else if (type.includes('author'))  author   = $(itemSpan).text().replace(/\s\s+/g, '').replace(/\n/g, '')
            else if (type.includes('artist'))  artist   = $(itemSpan).text().replace(/\s\s+/g, '').replace(/\n/g, '')
            else if (type.includes('status'))  status   = $(itemSpan).text().toLowerCase().includes('ongoing') ? MangaStatus.ONGOING : MangaStatus.COMPLETED

            else if (type.includes('genre')) {
                for (const obj of $(itemSpan).children().toArray()) {
                    const label = $(obj).text().trim()
                    if (typeof label === 'undefined') continue
                    if (hentaiId.includes(label.toLowerCase())) isHentai = true
                    tagArray0 = [...tagArray0, createTag({id: label, label: label})]
                }
            }
        }
        return [status, author, artist, strViews, isHentai, tagArray0]
    }

    calculateViews(str: string): number {
        // Example input and output: 3.4K -> 3400 | 4.1M -> 4100000 | 322 -> 322
        let ret = 0
        if      (str.toLowerCase().includes('k')) ret = parseFloat(str) * 1000    ?? 0
        else if (str.toLowerCase().includes('m')) ret = parseFloat(str) * 1000000 ?? 0
        else ret = parseFloat(str) ?? 0
        return Math.round(ret * 100) / 100
    }


    parseChapterList($: any, mangaId: string, source: any): Chapter[] {
        const chapters: Chapter[] = []

        const theArray = $('.item', $('.main')).toArray().reverse()
        theArray.forEach((obj: any, i: number) =>  {
            const chapterTile: any = $('a', $(obj))
            const chapterId = chapterTile.attr('href')?.replace('/chapter/', '')
            const chapGroup = $(chapterTile).text().trim().split('\n').pop()?.trim()
            const chapNamePart1 = $('b', chapterTile).text()
            let chapNamePart2 = $('span', $(chapterTile)).first().text().replace(':', '').trim()
            if (chapNamePart2 == chapGroup) chapNamePart2 = ''
            const chapter = $('b', chapterTile).text()
            const chapNum = i+1
            const volume = Number(chapter?.split('chapter')[0]?.replace('volume', '').trim())

            const language = $('.emoji').attr('data-lang') ?? 'gb'
            const time = source.convertTime($('i.ps-3', $(obj)).text())
            if ((typeof chapterId === 'undefined')) return

            chapters.push(createChapter({
                id: chapterId,
                mangaId: mangaId,
                volume: Number.isNaN(volume) ? 0 : volume,
                chapNum: Number(chapNum),
                group: this.decodeHTMLEntity(chapGroup ?? ''),
                langCode: reverseLangCode[language] ?? LanguageCode.UNKNOWN,
                name: chapNamePart1 + ' ' + this.decodeHTMLEntity(chapNamePart2),
                time: time
            }))
        })
        return chapters
    }

    parseChapterDetails($: any): string[] {
        // Get all of the pages
        const scripts = $('script').toArray()
        for (const scriptObj of scripts) {
            const script = scriptObj.children[0]?.data
            if (typeof script === 'undefined') continue
            if (script.includes('const batoWord =')) {
                /*
                  https://xfs-003.batcg.com/comic/7002/d32/60fb603d33142e3200f1223d/8351241_720_380_88450.jpeg?acc=Bg31t3HEbG1iSOK0lW_9XQ&exp=1654079974
                  imgArr[n] = https://xfs-003.batcg.com/comic/7002/d32/60fb603d33142e3200f1223d/8351241_720_380_88450.jpeg
                  tknArr[n] = acc=Bg31t3HEbG1iSOK0lW_9XQ&exp=1654079974
                */
                const batoJS = eval(script.split('const batoPass = ', 2)[1].split(';', 2)[0] ?? '').toString()
                const imgArray = JSON.parse(script.split('const imgHttps = ', 2)[1].split(';', 2)[0] ?? '')
                const encryptedToken = (script.split('const batoWord = ', 2)[1].split(';', 2)[0] ?? '').replace(/"/g, '')
                const decryptScript = CryptoJS.AES.decrypt(encryptedToken, batoJS).toString(CryptoJS.enc.Utf8)
                const tknArray = decryptScript.toString().replace(/"/g, '').replace(/[[\]']+/g,'', '').split(',')
                if (imgArray != null) { 
                    const pages = imgArray.map((value: string, index: number) => `${value}?${tknArray[index]}`)                      
                }
            }
        }
        return pages
    }

    filterUpdatedManga($: any, time: Date, ids: string[], source: any): { updates: string[], loadNextPage: boolean } {
        const foundIds: string[] = []
        let passedReferenceTime = false
        for (const item of $('.item', $('#series-list')).toArray()) {
            const id = $('a', item).attr('href')?.replace('/series/', '')!.trim().split('/')[0] ?? ''
            const mangaTime = source.convertTime($('i', item).text().trim())
            passedReferenceTime = mangaTime <= time
            if (!passedReferenceTime) {
                if (ids.includes(id)) {
                    foundIds.push(id)
                }
            } else break
        }
        if (!passedReferenceTime) {
            return {updates: foundIds, loadNextPage: true}
        } else {
            return {updates: foundIds, loadNextPage: false}
        }
    }

    parseSearchResults($: any, source: any): MangaTile[] {
        const mangaTiles: MangaTile[] = []
        const collectedIds: string[] = []
        for (const obj of $('.item', $('#series-list')).toArray()) {
            const id = $('.item-cover', obj).attr('href')?.replace('/series/', '')!.trim().split('/')[0] ?? ''
            const titleText = this.decodeHTMLEntity($('.item-title', $(obj)).text())
            const subtitle = $('.visited', $(obj)).text().trim()
            const time = source.convertTime($('i', $(obj)).text().trim())
            const image = $('img', $(obj)).attr('src')

            if (typeof id === 'undefined' || typeof image === 'undefined') continue
            if (!collectedIds.includes(id)) {
                mangaTiles.push(createMangaTile({
                    id: id,
                    title: createIconText({text: titleText}),
                    subtitleText: createIconText({text: subtitle}),
                    primaryText: createIconText({text: time.toDateString(), icon: 'clock.fill'}),
                    image: image
                }))
                collectedIds.push(id)
            }
        }
        return mangaTiles
    }

    parseHomePageSection($: any, source: any): MangaTile[] {
        const tiles: MangaTile[] = []
        const collectedIds: string[] = []
        for (const item of $('.item', $('#series-list')).toArray()) {
            const id = $('a', item).attr('href')?.replace('/series/', '')!.trim().split('/')[0] ?? ''
            const titleText = this.decodeHTMLEntity($('.item-title', $(item)).text())
            const subtitle = $('.visited', $(item)).text().trim()
            const time = source.convertTime($('i', $(item)).text().trim())
            const image = $('img', $(item)).attr('src')

            if (typeof id === 'undefined' || typeof image === 'undefined') continue
            if (!collectedIds.includes(id)) {
                tiles.push(createMangaTile({
                    id: id,
                    title: createIconText({text: titleText}),
                    subtitleText: createIconText({text: subtitle}),
                    primaryText: createIconText({text: time.toDateString(), icon: 'clock.fill'}),
                    image: image
                }))
                collectedIds.push(id)
            }
        }
        return tiles
    }

    isLastPage($: any): boolean {
        return $('.page-item').last().hasClass('disabled')
    }

    decodeHTMLEntity(str: string): string {
        return str.replace(/&#(\d+);/g, (_match, dec) => {
            return String.fromCharCode(dec)
        })
    }

}
