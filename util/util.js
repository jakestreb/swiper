'use strict';

const Promise = require('bluebird');
const imdb = require('imdb-api');
const PirateBay = require('thepiratebay');
const fs = require('fs');
const readFile = Promise.promisify(fs.readFile);
const writeFile = Promise.promisify(fs.writeFile);

const Movie = require('../components/Movie.js');
const TV = require('../components/TV.js');
const Torrent = require('../components/Torrent.js');

// Options must include a title, may also include year, season, and episode.
function identifyVideo(options) {
  return imdb.getReq({ name: options.title, year: options.year })
  .then(imdbEntry => {
    if (imdbEntry.type === 'movie') {
      return new Movie(imdbEntry.title, imdbEntry.year);
    } else {
      return new TV(imdbEntry.title, options.season, options.episode);
    }
  })
  .catch(() => null);
}
exports.identifyVideo = identifyVideo;

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

function readMemory() {
  return readFile('util/memory.json', 'utf8')
  .then(file => JSON.parse(file));
}
exports.readMemory = readMemory;

/**
 * method: 'add'|'remove'|'purge',
 * items: [],
 * target: 'monitored'|'queued'
 */
function updateMemory(target, method, items) {
  return readMemory()
  .then(memory => {
    let t = memory[target];
    switch (method) {
      case 'add':
        t = t.concat(items);
        break;
      case 'remove':
        items.forEach(item => {
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
