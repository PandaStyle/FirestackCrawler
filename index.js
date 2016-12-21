const admin = require("firebase-admin");

const
    _ = require('lodash'),
    Base64 = require('js-base64').Base64,
    Promise = require('bluebird'),
    request = require('request'),
    FeedParser = require('feedparser'),
    CronJob = require('cron').CronJob,
    ent = require('ent'),
    moment = require('moment'),
    base32 = require('base32')

    logger = require('./logger.js'),
    utils = require('./utils.js'),

    feedAccounts = require('./feeds.js')



const serviceAccount = require("./coherent-code-118618-firebase-adminsdk-wkymf-74f5b4edce.json");
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: "https://coherent-code-118618.firebaseio.com"
});

// Get a database reference to our posts
const db = admin.database();
const postsRef = db.ref("posts");
postsRef.on('child_added', function(snapshot) {
    console.log("Child added. Snapshot key: ", snapshot.key)
});


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


const createFeedItem = (item) => {

    return new Promise(resolve => {
        utils.getImage(item)
            .then(function (image) {
                let feedItem = {};


                if(!_.isNull(item.guid)){
                    feedItem._id = base32.encode(item.guid.substring(0,50))
                } else {
                    //hopefully 'bcn network' feed only
                    feedItem._id = base32.encode(item.title.substring(0,50))
                }

                feedItem.title = item.title;
                feedItem.summary = !_.isEmpty(item.summary) ? ent.decode(item.summary).replace(/<\/?[^>]+(>|$)/g, "").replace(/[\n\t\r]/g,"") : item.summary;

                feedItem.description = utils.getDescription(item)

                feedItem.link = item.link;
                feedItem.origlink = item.origlink;

                feedItem.date = item.date;

                feedItem.pubDate = new Date(item.pubDate);

                feedItem.pubdate = item.pubdate;

                feedItem.image = image.url ? image.url : "";
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
                if(!feedItem.link)
                   console.log("*** no link: ", feedItem.title)


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

            //const bulk = Feed.collection.initializeUnorderedBulkOp();

            //flatten feed
            const flattened = [].concat.apply([], feeds);


            return Promise.map(flattened, item => createFeedItem(item))
                .then(res => {

                    var ids = res.map( i => i._id)
                    console.log("Read length: ", res.length)
                    console.log("Unique length: ", _.uniq(ids).length);

                    return res;
                })
                .then((posts) => {
                       // add to firebase
                        posts.forEach(post => {
                            postsRef.child(post._id).set(post, (err) => {
                                if(err) {
                                    console.log("error: ", err)
                                }
                            })
                        })
                })
                .catch(err => {
                    console.error("Feeditem creation error: ", err);
                })

        })
}

crawl();

/*
new CronJob('0 *!/15 * * * *', function() {
        console.log(" -------------------- crawl --------------------")
        crawl()
    },
    null,
    true
);
*/











