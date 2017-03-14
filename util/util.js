'use strict';

const Promise = require('bluebird');
const imdb = require('imdb-api');
const PirateBay = require('thepiratebay');
const fs = require('fs');
const path = require('path');
const rimraf = require('rimraf');
const access = Promise.promisify(fs.access);
const mkdir = Promise.promisify(fs.mkdir);
const rimrafAsync = Promise.promisify(rimraf);

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
    if (results.length === 0) {
      if (optRetryCount > 0) {
        return Promise.delay(100).then(() => torrentSearch(video, optRetryCount - 1));
      }
      return [];
    } else {
      return results.map(result =>
        new Torrent(video, {
          name: result.name,
          size: result.size,
          seeders: result.seeders,
          leechers: result.leechers,
          uploadTime: result.uploadDate,
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
    ['tv', video.getSafeTitle(), `Season ${video.seasonNum}`];
  // TODO: remove
  // console.warn('dirs', dirs);
  // console.warn('rootDir', rootDir);
  return Promise.reduce(dirs, (acc, dir) => {
    // Check if all directories exist along the way, creating them if they don't.
    // TODO: remove
    // console.warn('acc', acc);
    // console.warn('dir', dir);
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
      // TODO: remove
      // console.warn('A', tfile.path);
      // console.warn('B', file.name);
      // console.warn('dwld path', origPath);
      // console.warn('final path', finalPath);
      return copy(origPath, path.join(finalPath, file.name))
      .then(() => {
        // Return the first download root subdirectory of each file for deletion.
        return file.path.split('/').shift();
      })
      .catch(err => {
        console.error('Failed to copy downloaded file: ', err);
      });
    }));
  })
  .then(subDirs => {
    let tfile = video.torrent.tfile;
    let tfilePath = video.torrent.tfile.path;
    tfile.destroy();
    subDirs.forEach(dir => {
      // Remove all file subdirectorys.
      rimrafAsync(path.join(tfilePath, dir)).then(err => {
        if (err) {
          console.warn(err);
        }
      });
    });
  });
}
exports.exportVideo = exportVideo;

// Copys a file from the src path to the dst path, returns a promise.
function copy(src, dst) {
  return new Promise((resolve, reject) => {
    var rd = fs.createReadStream(src);
    rd.on("error", err => {
      reject(err);
    });
    var wr = fs.createWriteStream(dst);
    wr.on("error", err => {
      reject(err);
    });
    wr.on("close", ex => {
      resolve();
    });
    rd.pipe(wr);
  });
}

// Pad zeros to give a 2 digit string number.
function padZeros(int) {
  return ('00' + int).slice(-2);
}
exports.padZeros = padZeros;

function getMorning() {
  let morn = new Date();
  morn.setHours(0);
  morn.setMinutes(0);
  morn.setSeconds(0, 0);
  return morn;
}
exports.getMorning = getMorning;

function getTomorrowMorning() {
  let morn = new Date();
  morn.setHours(0);
  morn.setMinutes(0);
  morn.setSeconds(0, 0);
  morn.setDate(morn.getDate() + 1);
  return morn;
}
exports.getTomorrowMorning = getTomorrowMorning;
