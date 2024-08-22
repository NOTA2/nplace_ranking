import { createRequire } from "module";
const require = createRequire(import.meta.url);
const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const _ = require('lodash');
const puppeteer = require('puppeteer');
import { GoogleSpreadsheet } from 'google-spreadsheet';
import { JWT } from 'google-auth-library'
import path from 'path';
const __dirname = path.resolve();

const searchItems = [];

// local 테스트용
// const searchItems = [{
//     "myPlace": "엘바노헤어 오산궐동점",
//     "lastUpdateTime": "2024-08-22T14:04:18.051Z",
//     "keywords": ["오산미용실", "오산대역미용실","궐동미용실","세교미용실"]
// },{
//     "myPlace": "엘바노헤어 오산대역점",
//     "lastUpdateTime": "2024-08-22T14:03:02.650Z",
//     "keywords": ["오산미용실", "오산대역미용실","궐동미용실","세교미용실"]
// }]

const proxyServers = ['198.44.255.3:80',
    '133.18.234.13:80'
];

async function scraper(myPlace, keyword, result) {
    try {
        console.log(`=============${keyword}=============`)
        /**
         * data Rank
         */
        const dataResponse = await axios.get(encodeURI(`https://map.naver.com/p/api/search/allSearch?query=${keyword}&type=all&searchCoord=`));
        const dataRanks = _.map(dataResponse.data.result.place.list, item => {
          return {
              index: item.index,
              rank: item.rank,
              name: item.name
          }
        })
        console.log(dataRanks)

        /**
         * view Rank
         */
        const proxyServer = _.shuffle(proxyServers)

        const browser = await puppeteer.launch({
            args: [
                '--lang=ko-KR,ko',
                `--no-sandbox`,
                `--disable-setuid-sandbox`,
                // `--proxy-server=${proxyServer}`
            ]
        });
        const page = await browser.newPage();
        // `https://pcmap.place.naver.com/place/list?query=${keyword}`
        await page.goto(encodeURI(`https://m.map.naver.com/search2/search.naver?query=${keyword}`));

        await page.waitForSelector(`.place_ad_label_icon`, {timeout: 5_000})
            .catch(() => console.log(keyword + ' is no ad'));

        const content = await page.content();
        const $ = cheerio.load(content);

        // const viewData = $('#_pcmap_list_scroll_container > ul > li')
        const viewData = $('#ct > div.search_listview._content._ctList > ul > li')
        const viewRanks = [];

        for (let i = 0; i < viewData.length; i++) {
            viewRanks.push({
                rank: i + 1,
                // isAd: $(viewData[i]).find(`.place_ad_label_icon`).length > 0,
                // name: $(viewData[i]).find('a > div:nth-child(1) > div > span:nth-child(1)').text()
                name: $(viewData[i]).find('div.item_info > a.a_item.a_item_distance._linkSiteview > div > strong').text()
            })
        }

        console.log(viewRanks)

        result.keywords.push({
            name: keyword,
            dataRank: _.find(dataRanks, (dataRank) => {
                return _.includes(dataRank.name, myPlace);
            })?.rank,
            viewRankWithAd: _.find(viewRanks, (viewRank) => {
                return _.includes(viewRank.name, myPlace);
            })?.rank,
            // viewAdCount: $(viewData).find(`.place_ad_label_icon`).length
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
        console.log(`=============${searchItem.myPlace}=============`)
        // 검색어 순차적으로 실행하기
        for (const keyword of searchItem.keywords) {
            await scraper(searchItem.myPlace, keyword, result);
            await delay(2000); // 2초 대기
        }
    }
}

async function getSearchItem() {
    const serviceAccountAuth = new JWT({
        // email: credentials.client_email,
        // key: credentials.private_key,
        email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
        key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n"),
        scopes: [
            'https://www.googleapis.com/auth/spreadsheets.readonly',
        ],
    });

    const doc = new GoogleSpreadsheet('1swKGQKrItJ7J4Use_A5QqmSxbbov4dQp_A_88ya4JsE', serviceAccountAuth);

    await doc.loadInfo(); // loads document properties and worksheets
    const sheet = doc.sheetsByIndex[0]; // or use `doc.sheetsById[id]` or `doc.sheetsByTitle[title]`
    const rows = await sheet.getRows();
    rows.forEach(row => {
        searchItems.push({
            myPlace: row.get('내 가게'),
            keywords: _.tail(row._rawData)
        })
    })

    await fs.writeFileSync(path.join(__dirname + '/json', 'myPlace.json'), JSON.stringify(searchItems.map(s => s.myPlace), null, 4));
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

(async function() {
    await getSearchItem();
    await startScraping();
}());
