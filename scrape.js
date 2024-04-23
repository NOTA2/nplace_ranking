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

async function scraper(myPlace, keyword, result) {
    try {
        const dataResponse = await axios.get(encodeURI('https://map.naver.com/p/api/search/allSearch?query=' + keyword + '&type=all&searchCoord='));
        const dataRanks = dataResponse.data.result.place.list;

        const browser = await puppeteer.launch();
        const page = await browser.newPage();
        await page.goto(encodeURI('https://pcmap.place.naver.com/hairshop/list?query=' + keyword));
        const content = await page.content();
        const $ = cheerio.load(content);

        const viewData = $('#_pcmap_list_scroll_container > ul > li')
        const viewRanks = [];

        for (i = 0; i < viewData.length; i++) {
            viewRanks.push({
                rank: i + 1,
                isAd: _.includes($(viewData[i]).find('a').text(), '광고') ? true : false,
                name: $(viewData[i]).find('a > div:nth-child(1) > div > span:nth-child(1)').text()
            })
        }

        viewAdCount = _.countBy(_.map(viewRanks, (viewRank) => viewRank.isAd), (a) => a).true ?? 0;

        result.keywords.push({
            name: keyword,
            dataRank: _.find(dataRanks, (dataRank) => {
                return _.includes(dataRank.name, myPlace);
            })?.rank,
            viewRankWithAd: _.find(viewRanks, (viewRank) => {
                return _.includes(viewRank.name, myPlace);
            })?.rank,
            viewAdCount: viewAdCount
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
