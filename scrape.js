const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');
const _ = require('lodash');
const puppeteer = require('puppeteer');

const searchItems = [{
    myPlace: '엘바노헤어',
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
        const dataResponse = await axios.get(encodeURI('https://map.naver.com/p/api/search/allSearch?query=' + keyword + '&type=all&searchCoord='));
        const dataRanks = dataResponse.data.result.place.list;

        const browser = await puppeteer.launch({
            headless: false,
            args: ['--lang=ko-KR,ko']
        });
        const page = await browser.newPage();
        await page.setExtraHTTPHeaders({...requestHeaders});
        await page.setViewport({width: 1080, height: 2000});

        await page.goto(encodeURI(`https://pcmap.place.naver.com/place/list?query=${keyword}&x=126.97824994606611&y=37.56655099999952&clientX=126.97825&clientY=37.566551&bounds=126.97499910874342%3B37.55644736586048%3B126.98171536011563%3B37.576483203449186&ts=1713941267941&mapUrl=https%3A%2F%2Fmap.naver.com%2Fp%2Fsearch%2F${keyword}`));
        await page.waitForSelector(`.place_ad_label_icon`, {timeout: 15_000})
            .catch(() => console.log(keyword + ' is no ad'));
        await page.screenshot({ path: keyword + '.png' }); //스크린샷찍기

        const content = await page.content();
        const $ = cheerio.load(content);

        const viewData = $('#_pcmap_list_scroll_container > ul > li')
        const viewRanks = [];

        for (i = 0; i < viewData.length; i++) {
            viewRanks.push({
                rank: i + 1,
                isAd: $(viewData[i]).find(`.place_ad_label_icon`).length > 0,
                name: $(viewData[i]).find('a > div:nth-child(1) > div > span:nth-child(1)').text()
            })
        }

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
