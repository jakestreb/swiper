'use strict';

const Promise = require('bluebird');
const imdb = require('imdb-api');
const PirateBay = require('thepiratebay');
const fs = require('fs');
const readFile = Promise.promisify(fs.readFile);
const writeFile = Promise.promisify(fs.writeFile);

const Movie = require('../components/Movie.js');
const Episode = require('../components/Episode.js');
const Collection = require('../components/Collection.js');
const Torrent = require('../components/Torrent.js');

// Options must include a title, may also include year, season, and episode.
function identifyContent(options) {
  let season = options.season, episode = options.episode;
  return imdb.getReq({ name: options.title, year: options.year })
  .then(imdbEntry => {
    if (imdbEntry.type === 'movie') {
      // Movie
      return new Movie(imdbEntry.title, imdbEntry.year);
    } else if (season && episode) {
      // Episode
      return imdbEntry.episodes()
      .then(allEpisodes => {
        let ep = allEpisodes.filter(ep => ep.season === season && ep.episode === episode)[0];
        return new Episode(imdbEntry.title, ep.season, ep.episode, new Date(ep.released));
      });
    } else {
      // Collection
      return imdbEntry.episodes()
      .then(allEpisodes => {
        let eps = allEpisodes.filter(ep => !season || ep.season === season)
          .map(ep => new Episode(imdbEntry.title, ep.season, ep.episode));
        let collection = new Collection(imdbEntry.title, eps);
        if (season) {
          collection.trackSeason(season);
        } else {
          collection.trackNew(true);
        }
        return collection;
      });
    }
  })
  .catch(() => null);
}
exports.identifyContent = identifyContent;

function torrentSearch(str) {
  return PirateBay.search(str, {
    category: 'video',
    page: 0,
    orderBy: 'seeds',
    sortBy: 'desc'
  })
  .then(results =>
    results.map(result =>
      new Torrent({
        name: result.name,
        size: result.size,
        seeders: result.seeders,
        leechers: result.leechers,
        uploadDate: result.uploadDate,
        magnetLink: result.magnetLink
      })
    )
  );
}
exports.torrentSearch = torrentSearch;

function _objToContent(obj) {
  switch (obj.type) {
    case 'movie':
      return new Movie(obj.title, obj.year);
    case 'episode':
      return new Episode(obj.title, obj.seasonNum, obj.episodeNum, new Date(obj.releaseDateStr));
    case 'collection':
      let eps = obj.episodes.map(ep => new Episode(ep.title, ep.seasonNum, ep.episodeNum));
      return new Collection(obj.title, eps);
  }
}

function readMemory() {
  return readFile('util/memory.json', 'utf8')
  .then(file => {
    let data = JSON.parse(file);
    for (let key in data) {
      // Create classes from the objectified stored items.
      data[key].map(item => _objToContent(item));
    }
    return data;
  });
}
exports.readMemory = readMemory;

/**
 * method: 'add'|'remove'|'purge',
 * items: [],
 * target: 'monitored'|'queued'
 */
function updateMemory(target, method, items) {
  let objs = items.map(item => item.getObject());
  return readMemory()
  .then(memory => {
    let t = memory[target];
    switch (method) {
      case 'add':
        t = t.concat(objs);
        break;
      case 'remove':
        objs.forEach(item => {
          let i = t.indexOf(item);
          if (i > -1) { t.splice(i, 1); }
        });
        break;
      case 'purge':
        t = [];
        break;
    }
    return writeFile('util/memory.json', JSON.stringify(memory));
  });
}
exports.updateMemory = updateMemory;
