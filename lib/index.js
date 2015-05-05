import xmlbuilder from 'xmlbuilder';
import {
    chunkArray,
    validateURL,
    validateChangeFreq,
    validatePriority,
    validateLastMod
    } from './utils';

import {NoURLError} from './errors.js';


function _transformSitemapsTreeToList(sitemaps, result = []) {
    if (!Array.isArray(sitemaps)) {
        if (sitemaps.urls.length) {
            result.push(sitemaps);
        }
        sitemaps.sitemaps.forEach(sm => result.push(sm));
        return _transformSitemapsTreeToList(sitemaps.sitemaps, result);
    }

    let nestedSitemaps = [];
    sitemaps.forEach(sm => {
        sm.sitemaps.forEach(nestedSm => {
            nestedSitemaps.push(nestedSm);
        });
    });

    if (!nestedSitemaps.length) {
        return result;
    }
    nestedSitemaps.forEach(sm => result.push(sm));

    return _transformSitemapsTreeToList(nestedSitemaps, result);
}


export default class Sitemap {

    constructor(conf) {
        conf = conf || {};

        // This limit is defined by Google. See: http://sitemaps.org/protocol.php#index
        this.limit = conf.limit || 50000;
        this.hostName = conf.hostName || '';
        this.fileName = conf.fileName || '';
        this.urls = conf.urls || [];
        this.sitemaps = conf.sitemaps || [];
    }

    addUrl(urlData) {
        if (!urlData) {
            throw new NoURLError();
        }
        if (Array.isArray(urlData)) {
            urlData.forEach(url => this.addUrl(url));
            return this;
        }
        if (typeof urlData === 'string') {
            urlData = {url: urlData};
        }


        let data = {
            url: validateURL(urlData.url),
            changefreq: urlData.changefreq ? validateChangeFreq(urlData.changefreq) : 'weekly',
            priority: urlData.priority ? validatePriority(urlData.priority) : 0.5
        };

        if (urlData.lastmod || urlData.lastmodISO) {
            data.lastmod = validateLastMod(urlData.lastmod, urlData.lastmodISO);
        }

        this.urls.push(data);
        return this;
    }

    addSitemap(sitemap) {
        this.sitemaps.push(sitemap);
        return this;
    }

    toXML() {

        let sitemapsList = _transformSitemapsTreeToList(this)
            .map(Sitemap._setFileNameIfNotExist)
            .reduce(Sitemap._normalizeSize, []);

        let result = sitemapsList.map(Sitemap._toXMLWithUrls);

        if (sitemapsList.length > 1) {
            let sitemapIndexXML = xmlbuilder.create('sitemapindex');
            sitemapIndexXML.att('xmlns', 'http://www.sitemaps.org/schemas/sitemap/0.9');
            Sitemap._fillSitemapElement(sitemapIndexXML, sitemapsList);
            result.unshift({
                fileName: 'sitemap.xml',
                xml: sitemapIndexXML.end({pretty: true})
            });
        }

        return result;
    }

    static _normalizeSize(result, sitemap) {
        const shouldBeChunked = sitemap.urls.length >= sitemap.limit;
        if (!shouldBeChunked) {
            result.push(sitemap);
            return result;
        }

        const chunkedUrls = chunkArray(sitemap.urls, sitemap.limit);
        let chunkedSitemaps = chunkedUrls.map((urls, i) => {
            let surrogate = new Sitemap(sitemap);
            surrogate.urls = urls;
            surrogate.fileName = surrogate.fileName.replace(/(\.xml$|$)/, `-${i}$1`);
            surrogate.sitemaps = [];
            return surrogate;
        });

        //we should save nested sitemaps only for one of chunked sitemaps
        chunkedSitemaps[0].sitemaps = sitemap.sitemaps;
        chunkedSitemaps.forEach(sm => result.push(sm));
        return result;
    }


    static _setFileNameIfNotExist(sitemap, index) {
        if (!sitemap.fileName) {
            sitemap.fileName = `sitemap-${index}.xml`;
        }
        return sitemap;
    }

    static _toXMLWithUrls(sitemap) {
        let urls = sitemap.urls;
        let urlset = xmlbuilder.create('urlset');
        urlset.att('xmlns', 'http://www.sitemaps.org/schemas/sitemap/0.9');
        urls.forEach(url => {
            let urlEl = urlset.ele('url');
            urlEl.ele('loc', {}, url.url);
            urlEl.ele('changefreq', {}, url.changefreq);
            urlEl.ele('priority', {}, url.priority);
            if (url.lastmod) {
                urlEl.ele('lastmod', {}, url.lastmod);
            }
        });

        return {
            fileName: sitemap.fileName,
            xml: urlset.end({pretty: true})
        };
    }

    static _fillSitemapElement(sitemapIndexXML, sitemapsList) {
        sitemapsList.forEach(sm => {
            let fileName = sm.fileName;
            let hostName = sm.hostName;
            sitemapIndexXML
                .ele('sitemap')
                .ele('loc', {}, `${hostName}/${fileName}`);
        });
    }

}