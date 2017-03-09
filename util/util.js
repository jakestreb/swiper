'use strict';

const Promise = require('bluebird');
const imdb = require('imdb-api');
const PirateBay = require('thepiratebay');
const fs = require('fs');
const path = require('path');
const access = Promise.promisify(fs.access);
const mkdir = Promise.promisify(fs.mkdir);
const rename = Promise.promisify(fs.rename);

const Movie = require('../components/Movie.js');
const Episode = require('../components/Episode.js');
const Collection = require('../components/Collection.js');
const Torrent = require('../components/Torrent.js');

const rootDir = process.env.EXPORT_ROOT || path.resolve(__dirname, '../media');

// Options must include a title, may also include year, season, and episode.
function identifyContent(swiperId, options) {
  let season = options.season ? parseInt(options.season, 10) : null;
  let episode = options.episode ? parseInt(options.episode, 10) : null;
  return imdb.getReq({ name: options.title, year: options.year })
  .then(imdbEntry => {
    if (imdbEntry.type === 'movie') {
      // Movie
      return new Movie(swiperId, imdbEntry.title, imdbEntry.year);
    } else if (season && episode) {
      // Episode
      return imdbEntry.episodes()
      .then(allEpisodes => {
        let ep = allEpisodes.find(ep => ep.season === season && ep.episode === episode);
        return new Episode(swiperId, imdbEntry.title, ep.season, ep.episode, ep.released);
      });
    } else {
      // Collection
      return imdbEntry.episodes()
      .then(allEpisodes => {
        let eps = allEpisodes.filter(ep => !season || ep.season === season)
          .map(ep => new Episode(swiperId, imdbEntry.title, ep.season, ep.episode, ep.released));
        let collection = new Collection(swiperId, imdbEntry.title, eps, season ? 'season' : 'series',
          season);
        return collection;
      });
    }
  });
  // .catch(() => null);
}
exports.identifyContent = identifyContent;

function torrentSearch(video, optRetryCount) {
  return PirateBay.search(video.getSearchTerm(), {
    category: 'video',
    page: 0,
    orderBy: 'seeds',
    sortBy: 'desc'
  })
  .then(results => {
    if (!results) {
      return optRetryCount > 0 ? torrentSearch(video.getSearchTerm(), optRetryCount - 1) : [];
    } else {
      return results.map(result =>
        new Torrent(video, {
          name: result.name,
          size: result.size,
          seeders: result.seeders,
          leechers: result.leechers,
          uploadDate: result.uploadDate,
          magnetLink: result.magnetLink
        })
      );
    }
  });
}
exports.torrentSearch = torrentSearch;

// Save a video in the correct directory, adding any necessary directories.
function exportVideo(video) {
  let dirs = video.getType() === 'movie' ? ['movies'] :
    ['tv', video.getTitle(), `Season ${video.seasonNum}`];
  console.warn('dirs', dirs);
  console.warn('rootDir', rootDir);
  return Promise.reduce(dirs, (acc, dir) => {
    // Check if all directories exist along the way, creating them if they don't.
    console.warn('acc', acc);
    console.warn('dir', dir);
    return Promise.resolve(acc).then(prevPath => {
      let newPath = path.join(prevPath, dir);
      return access(newPath, fs.constants.F_OK)
      .then(() => newPath)
      .catch(() => mkdir(newPath).then(() => newPath));
    });
  }, rootDir)
  .then(finalPath => {
    // Move the file(s) to the final directory.
    let tfile = video.torrent.tfile;
    return Promise.all(tfile.files.map(file => {
      let origPath = path.join(tfile.path, file.path);
      console.warn('A', tfile.path);
      console.warn('B', file.name);
      console.warn('dwld path', origPath);
      console.warn('final path', finalPath);
      return rename(origPath, path.join(finalPath, file.name));
    }));
  });
}
exports.exportVideo = exportVideo;

// Pad zeros to give a 2 digit string number.
function padZeros(int) {
  return ('00' + int).slice(-2);
}
exports.padZeros = padZeros;
