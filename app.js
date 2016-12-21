'use strict';

/**
 * Module dependencies.
 */

const
    _ = require('lodash'),
    Base64 = require('js-base64').Base64,
    Promise = require('bluebird'),
    request = require('request'),
    FeedParser = require('feedparser'),
    CronJob = require('cron').CronJob,
    ent = require('ent'),
    moment = require('moment'),
    mongoose = require('mongoose'),
    Schema = mongoose.Schema,

    logger = require('./logger.js'),
    utils = require('./utils.js'),

    feedAccounts = require('./feeds.js')


mongoose.connect('mongodb://127.0.0.1:27017/test');

const feedSchema = new Schema({
    _id: String,
    pubDate: Date
}, {strict: false});
const Feed = mongoose.model('Feed', feedSchema);


const fetch = (url) => {
    return new Promise((resolve, reject) => {
        if (!url) {
            return reject(new Error(`Bad URL (url: ${url}`));
        }

        const
            feedparser = new FeedParser(),
            items = [];

        feedparser.on('error', (e) => {
            console.log("ERROR")
            console.error(e)
            return reject(e);
        }).on('readable', () => {
            // This is where the action is!
            var item;

            while (item = feedparser.read()) {
                if(items.length < 5)
                    items.push(item)
            }
        }).on('end', () => {
            resolve(items);
        });

        request({
            method: 'GET',
            url: url
        }, (e, res, body) => {
            if (e) {
                return reject(e);
            }

            if (res.statusCode != 200) {
                return reject(new Error(`Bad status code (status: ${res.statusCode}, url: ${url})`));
            }

            feedparser.end(body);
        });
    });
};


const createFeedItem = (item, bulk) => {

    return new Promise(resolve => {
        utils.getImage(item)
            .then(function (image) {
                let feedItem = {};

                if(!_.isNull(item.guid)){
                    feedItem._id = Base64.encode(item.guid)
                } else {
                    //hopefully 'bcn network' feed only
                    feedItem._id = Base64.encode(item.title)
                }

                feedItem.title = item.title;
                feedItem.summary = !_.isEmpty(item.summary) ? ent.decode(item.summary).replace(/<\/?[^>]+(>|$)/g, "").replace(/[\n\t\r]/g,"") : item.summary;

                feedItem.description = utils.getDescription(item)

                feedItem.link = item.link;
                feedItem.origlink = item.origlink;

                feedItem.date = item.date;

                feedItem.pubDate = new Date(item.pubDate);

                feedItem.pubdate = item.pubdate;

                feedItem.image = image.url;
                feedItem.imageType = image.type;

                feedItem.meta = {
                    link: item.meta.link,
                    description: item.meta.description
                }

                if(!_.find(feedAccounts, (feedAccount) => {
                        return item.meta.link.includes(feedAccount.link)
                    })) {
                    console.error("No feedId found for: ", item.meta.link);
                } else {
                    feedItem.feedId = _.find(feedAccounts, (feedAccount) => {
                        return item.meta.link.includes(feedAccount.link)
                    }).id
                }

                //Archdaily hack
                if(feedItem.feedId && _.find(feedAccounts, { 'id': feedItem.feedId}).timeZoneFix){
                    feedItem.pubDate = moment(new Date(feedItem.pubDate)).add(_.find(feedAccounts, { 'id': feedItem.feedId}).timeZoneFix, 'hours').toDate();
                }

                //only add to bulk if it has a link
                if(feedItem.link)
                    bulk.find({ _id: feedItem._id }).upsert().updateOne({ "$set": feedItem });

                
                resolve(feedItem);
            }).catch(err => {
            console.error(err);
                throw err
            })
    })
}


const crawl = () => {
    Promise.map(feedAccounts.map(item => item.url), (url) => fetch(url))
        .then((feeds) => {

            const bulk = Feed.collection.initializeUnorderedBulkOp();

            //flatten feed
            const flattened = [].concat.apply([], feeds);


            return Promise.map(flattened, item => createFeedItem(item, bulk))
                .then(res => {

                    var ids = res.map( i => i._id)
                    console.log("Read length: ", res.length)
                    console.log("Unique length: ", _.uniq(ids).length);

                    return res;
                })
                .then(() => {
                    bulk.execute((err, result) => {
                        if (err)
                            throw err

                        console.log(JSON.stringify(result, undefined, 4));
                    });
                })
                .catch(err => {
                    console.error("Feeditem creation error: ", err);
                })

        })
}

new CronJob('0 */15 * * * *', function() {
        console.log(" -------------------- crawl --------------------")
        crawl()
    },
    null,
    true
);