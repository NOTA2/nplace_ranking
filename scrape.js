const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');
const _ = require('lodash');
const puppeteer = require('puppeteer');

const searchItems = [{
    myPlace: '엘바노헤어 오산대역점',
    keywords: ['오산미용실', '궐동미용실', '오산대역미용실', '세교미용실']
}, {
    myPlace: '엘바노헤어 오산궐동점',
    keywords: ['오산미용실', '궐동미용실', '오산대역미용실', '세교미용실']
}];

const requestHeaders = {
    "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
    "accept-language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7,ja;q=0.6",
    "cache-control": "no-cache",
    "pragma": "no-cache",
    "sec-ch-ua": "\"Whale\";v=\"3\", \"Not-A.Brand\";v=\"8\", \"Chromium\";v=\"120\"",
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": "\"macOS\"",
    "sec-fetch-dest": "document",
    "sec-fetch-mode": "navigate",
    "sec-fetch-site": "same-origin",
    "sec-fetch-user": "?1",
    "upgrade-insecure-requests": "1"
};

async function scraper(myPlace, keyword, result) {
    try {
        const dataResponse = await axios.get(encodeURI(`https://map.naver.com/p/api/search/allSearch?query=${keyword}&type=all&searchCoord=`));
        const dataRanks = dataResponse.data.result.place.list;

        const browser = await puppeteer.launch({
            args: [
                '--lang=ko-KR,ko',
                `--no-sandbox`,
                `--disable-setuid-sandbox`
            ]
        });
        const page = await browser.newPage();
        await page.setExtraHTTPHeaders({...requestHeaders});

        await page.goto(encodeURI(`https://pcmap.place.naver.com/place/list?query=${keyword}`));

        await page.waitForSelector(`.place_ad_label_icon`, {timeout: 15_000})
            .catch(() => console.log(keyword + ' is no ad'));

        const content = await page.content();
        const $ = cheerio.load(content);

        const viewData = $('#_pcmap_list_scroll_container > ul > li')
        const viewRanks = [];

        for (let i = 0; i < viewData.length; i++) {
            viewRanks.push({
                rank: i + 1,
                isAd: $(viewData[i]).find(`.place_ad_label_icon`).length > 0,
                name: $(viewData[i]).find('a > div:nth-child(1) > div > span:nth-child(1)').text()
            })
        }
        // await page.goto(encodeURI(`https://m.place.naver.com/hairshop/list?ac=1&debug=0&ngn_country=KR&nscs=0&query=${keyword}&rev=37&sm=mtp_hty.top&spq=0&ssc=tab.m.all&where=m&deviceType=mobile&target=mobile&originalQuery=${keyword}&level=bottom&entry=pll`));
        // await page.goto(encodeURI(`https://m.map.naver.com/search2/search.naver?query=${keyword}`));
        await page.goto(encodeURI(`https://m.search.naver.com/search.naver?sm=mtp_hty.top&where=m&query=${keyword}`));

        await page.waitForSelector(`.place_ad_label_icon`, {timeout: 15_000})
            .catch(() => console.log(keyword + ' is no ad'));

        const mContent = await page.content();
        const $$ = cheerio.load(mContent);

        const mobileData = $$('#place-main-section-root > div > div > ul > li')
        const mobileRanks = [];

        for (let i = 0; i < mobileData.length; i++) {
            mobileRanks.push({
                rank: i + 1,
                isAd: $(mobileData[i]).find(`.place_ad_label_icon`).length > 0,
                name: $(mobileData[i]).find('.place_bluelink > span:nth-child(1)').text()
            })
        }

        let drank = 1
        console.log(`${myPlace} ===== ${keyword}`)
        console.log(_.map(dataRanks, d => {return {'rank': drank++, 'name': d.name}}));
        console.log(mobileRanks);
        console.log(viewRanks);

        result.keywords.push({
            name: keyword,
            dataRank: _.find(dataRanks, (dataRank) => {
                return _.includes(dataRank.name, myPlace);
            })?.rank,
            viewRankWithAd: _.find(viewRanks, (viewRank) => {
                return _.includes(viewRank.name, myPlace);
            })?.rank,
            viewAdCount: $(viewData).find(`.place_ad_label_icon`).length
        });

        await fs.writeFileSync(path.join(__dirname + '/json', myPlace + '.json'), JSON.stringify(result, null, 4));

        await page.close();
        await browser.close();
    } catch (error) {
        console.error('An error occurred during scraping:', error);
    }
}

async function startScraping() {
    for (const searchItem of searchItems) {
        const result = {
            myPlace: searchItem.myPlace,
            lastUpdateTime: new Date(),
            keywords: []
        };
        // 검색어 순차적으로 실행하기
        for (const keyword of searchItem.keywords) {
            await scraper(searchItem.myPlace, keyword, result);
            await delay(2000); // 2초 대기
        }
    }
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

startScraping();
