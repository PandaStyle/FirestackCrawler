/**
 * Created by zsnemeth on 12/21/16.
 */

'use strict';

const MetaInspector = require('node-metainspector');
const ineed = require("ineed");
const _ = require('lodash');
const feedAccounts = require('./feeds.js')


var config = {
    maxBodyLength: 150
}

const getImage = item => {

    return new Promise((resolve, reject) => {


            //reject if there is no link
            if (!item.link) {
        resolve({
            url: ""
        });
    }

    if (!_.isEmpty(item.image)) {
        resolve({
            url: item.image,
            type: 1
        })

    } else if (item.enclosures && item.enclosures.length > 0) {
        resolve({
            url: item.enclosures[0].url,
            type: 2
        })

    } else if (item.link) {


        //BD+C network force ineed instead of meta
        if (isBDCNetwork(item)) {
            resolve({url: "", type: 6});
            return;

            return ineed.collect.images.from(item.link,

                function(err, response, result) {
                    if (err) {
                        console.error(err)
                        resolve({
                            url: "",
                            type: 5
                        })
                    }

                    if (!result || !_.isNull(result) || !result.images) {
                        console.error("No image in ineed result")
                        resolve({
                            url: "",
                            type: 5
                        })
                    }

                    var a = _.find(result.images, i => {
                            return i.src.includes('content_feed')
                        })
                    if (a) {
                        resolve({
                            url: a.src,
                            type: 4
                        });
                    } else {
                        resolve({
                            url: "",
                            type: 5
                        })
                    }

                });
        }


        let client = new MetaInspector(item.link, {
            timeout: 10000
        });

        client.on("fetch", function() {

            if (!_.isEmpty(client.image)) {
                resolve({
                    url: client.image,
                    type: 3
                });

            } else {
                if (item.description && ineed.collect.images.fromHtml(item.description).images) {
                    resolve({
                        url: ineed.collect.images.fromHtml(item.description).images[0],
                        type: 4
                    });
                } else {
                    resolve({
                        url: "",
                        type: 5
                    })
                }
            }
        });
        client.on("error", function(err) {
            console.log("meta error")

            if (item.description && ineed.collect.images.fromHtml(item.description).images) {
                console.log("ineed")
                console.log(ineed.collect.images.fromHtml(item.description).images[0])
                resolve({
                    url: ineed.collect.images.fromHtml(item.description).images[0],
                    type: 4
                });
            } else {
                console.log("No image found for item: ", + item.link);
                resolve({
                    url: "",
                    type: 5
                })
            }


        });

        client.fetch();
    }
})
}

function getDescription(item) {
    var s = item.description;
    if (s == null) {
        s = "";
    }
    s = stripMarkup(s);
    s = trimWhitespace(s);
    if (s.length > config.maxBodyLength) {
        s = trimWhitespace(maxStringLength(s, config.maxBodyLength));
    }
    return s;
}

function stripMarkup(s) { //5/24/14 by DW
    if ((s === undefined) || (s == null) || (s.length == 0)) {
        return ("");
    }
    return (s.replace(/(<([^>]+)>)/ig, ""));
}

function maxStringLength(s, len, flWholeWordAtEnd, flAddElipses) {
    if ((s === undefined) || (s === null)) {
        return ("");
    } else {
        if (flWholeWordAtEnd === undefined) {
            flWholeWordAtEnd = true;
        }
        if (flAddElipses === undefined) { //6/2/14 by DW
            flAddElipses = true;
        }
        if (s.length > len) {
            s = s.substr(0, len);
            if (flWholeWordAtEnd) {
                while (s.length > 0) {
                    if (s[s.length - 1] == " ") {
                        if (flAddElipses) {
                            s += "...";
                        }
                        break;
                    }
                    s = s.substr(0, s.length - 1); //pop last char
                }
            }
        }
        return (s);
    }
}

function trimWhitespace(s) { //rewrite -- 5/30/14 by DW
    function isWhite(ch) {
        switch (ch) {
            case " ":
            case "\r":
            case "\n":
            case "\t":
                return (true);
        }
        return (false);
    }
    if (s === undefined) { //9/10/14 by DW
        return ("");
    }
    while (isWhite(s.charAt(0))) {
        s = s.substr(1);
    }
    while (s.length > 0) {
        if (!isWhite(s.charAt(0))) {
            break;
        }
        s = s.substr(1);
    }
    while (s.length > 0) {
        if (!isWhite(s.charAt(s.length - 1))) {
            break;
        }
        s = s.substr(0, s.length - 1);
    }
    return (s);
}

const isBDCNetwork = (item) => {
    const bdcid = 20;

    var link = _.find(feedAccounts, {
        id: bdcid
    }).link

    return item.meta.link.includes(link);
}


module.exports = {
    getImage: getImage,
    getDescription: getDescription,
    isBDCNetwork: isBDCNetwork
}