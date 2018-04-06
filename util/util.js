'use strict';

const Promise = require('bluebird');
// const PirateBay = require('thepiratebay');
const TorrentSearchApi = require('torrent-search-api');
const fs = require('fs');
const path = require('path');
const rimraf = require('rimraf');
const access = Promise.promisify(fs.access);
const mkdir = Promise.promisify(fs.mkdir);
const rimrafAsync = Promise.promisify(rimraf);
const rp = require("request-promise");
const TVDB = require('node-tvdb');

const torrentSearch = new TorrentSearchApi();

torrentSearch.enableProvider('ThePirateBay');
torrentSearch.enableProvider('Rarbg');

const OMDB_ID = '399c42a2';
const TVDB_ID = '4B4DF40E7F46F41F';

var tvdb = new TVDB(TVDB_ID);

// API Key from: http://thetvdb.com/index.php?tab=apiregister
// Username: rearmostdrip
// Password: superman123

const Movie = require('../components/Movie.js');
const Episode = require('../components/Episode.js');
const Collection = require('../components/Collection.js');
const Torrent = require('../components/Torrent.js');

const rootDir = process.env.EXPORT_ROOT || path.resolve(__dirname, '../media');

// Options must include a title, may also include year, season, and episode.
function identifyContent(swiperId, options) {
  let season = options.season ? parseInt(options.season, 10) : null;
  let episode = options.episode ? parseInt(options.episode, 10) : null;
  // NOTE: OMDB is customized to work with apikeys.
  return rp({
    uri: `http://www.omdbapi.com/?apikey=${OMDB_ID}&t=${options.title}&y=${options.year}` +
      `&type=${options.type}`,
    method: 'GET'
  })
  .catch(err => {
    console.log('OMDB err:', err);
    throw new Error("I can't access the Open Movie Database, try again in a minute");
  })
  .then(omdbStr => {
    const omdbEntry = JSON.parse(omdbStr);
    if (!omdbEntry) {
      throw new Error("I don't know what that is, try being very explicit with spelling");
    } else if (omdbEntry.Type === 'movie') {
      // Movie
      return new Movie(swiperId, omdbEntry.Title, omdbEntry.Year);
    } else {
      return _searchTVDB(omdbEntry.imdbID)
      .then(resp => {
        if (season && episode) {
          let ep = resp.episodes.find(ep => ep.airedSeason === season &&
            ep.airedEpisodeNumber === episode);
          return new Episode(swiperId, omdbEntry.Title, ep.airedSeason, ep.airedEpisodeNumber,
            _getEpisodeDate(resp, ep));
        } else {
          let eps = resp.episodes.filter(ep => !season || ep.airedSeason === season)
            .map(ep => new Episode(swiperId, omdbEntry.Title, ep.airedSeason, ep.airedEpisodeNumber,
              _getEpisodeDate(resp, ep)));
          return new Collection(swiperId, omdbEntry.Title, eps,
            season ? 'season' : 'series', season);
        }
      })
      .catch(err => {
        console.log('TVDB error:', err);
        throw new Error("I can't find that show.");
      });
    }
  });
}
exports.identifyContent = identifyContent;

// Helper function to search TVDB and retry with a refreshed API token on error.
function _searchTVDB(imdbId, retryAttempt) {
  return tvdb.getSeriesByImdbId(imdbId)
  .then(tvdbEntries => tvdb.getSeriesAllById(tvdbEntries[0].id))
  .catch(err => {
    if (retryAttempt) {
      throw err;
    }
    // On initial failure, refresh authentication.
    tvdb = new TVDB(TVDB_ID);
    return _searchTVDB(imdbId, true);
  });
}

// Get the episode release date from tvdb response data.
function _getEpisodeDate(tvdbSeries, tvdbEpisode) {
  return tvdbEpisode.firstAired ?
    new Date(`${tvdbEpisode.firstAired} ${tvdbSeries.airsTime}`) : null;
}

// function torrentSearch(video, optRetryCount) {
//   return PirateBay.search(video.getSearchTerm(), {
//     category: 'video',
//     page: 0,
//     orderBy: 'seeds',
//     sortBy: 'desc'
//   })
//   .then(results => {
//     if (results.length === 0) {
//       if (optRetryCount > 0) {
//         return Promise.delay(100).then(() => torrentSearch(video, optRetryCount - 1));
//       }
//       return [];
//     } else {
//       return results.map(result =>
//         new Torrent(video, {
//           name: result.name,
//           size: result.size,
//           seeders: result.seeders,
//           leechers: result.leechers,
//           uploadTime: result.uploadDate,
//           magnetLink: result.magnetLink
//         })
//       );
//     }
//   });
// }
// exports.torrentSearch = torrentSearch;

function universalTorrentSearch(video, optRetryCount) {
  return torrentSearch.search(video.getSearchTerm())
  .then(results => {
    if (results.length === 0) {
      if (optRetryCount > 0) {
        return Promise.delay(100).then(() => universalTorrentSearch(video, optRetryCount - 1));
      }
      return [];
    } else {
      return results.filter(res => res && res.title && res.magnet).slice(0, 20).map(result =>
        new Torrent(video, {
          name: result.title,
          size: result.size,
          seeders: result.seeds,
          leechers: result.peers,
          uploadTime: result.time,
          magnetLink: result.magnet
        })
      );
    }
  });
}
exports.universalTorrentSearch = universalTorrentSearch;

// Save a video in the correct directory, adding any necessary directories.
function exportVideo(video) {
  let dirs = video.getType() === 'movie' ? ['movies', video.getSafeTitle()] :
    ['tv', video.getSafeTitle(), `Season ${video.seasonNum}`];
  return Promise.reduce(dirs, (acc, dir) => {
    // Check if all directories exist along the way, creating them if they don't.
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
          console.error(err);
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

function getAiredString(date) {
  if (!date) {
    return null;
  }
  let oneDay = 86400000;
  let twoDays = 2 * oneDay;
  let oneWeek = 7 * oneDay;
  let sixMonths = 182 * oneDay;
  let weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  let months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August',
    'September', 'October', 'November', 'December'];
  let weekday = weekdays[date.getDay()];
  let month = months[date.getMonth()];
  let calDay = date.getDate();
  let diff = date.getTime() - getMorning().getTime();
  if (diff < -sixMonths || diff > sixMonths) {
    return null;
  } else if (diff < -oneWeek) {
    // Over a week ago
    return `Aired ${weekday}, ${month} ${calDay}`;
  } else if (diff < -oneDay) {
    // In the week
    return `Aired ${weekday}`;
  } else if (diff < 0) {
    return `Aired yesterday`;
  } else if (diff < oneDay) {
    return `Airs today at ${_getTimeString(date)}`;
  } else if (diff < twoDays) {
    return `Airs tomorrow at ${_getTimeString(date)}`;
  } else if (diff < oneWeek) {
    // In the next week
    return `Airs ${weekday} at ${_getTimeString(date)}`;
  } else {
    // More than a week ahead
    return `Airs ${weekday}, ${month} ${calDay}`;
  }
}
exports.getAiredString = getAiredString;

function _getTimeString(date) {
  let hours = date.getHours();
  let minutesStr = (date.getMinutes() + '0').slice(0, 2);
  let ampm = hours < 12 ? 'am' : 'pm';
  return `${hours % 12 || 12}:${minutesStr}${ampm}`;
}

// Removes the first index which returns true from the callback from the array.
function removeFirst(arr, callback) {
  let index = arr.findIndex(arrItem => callback(arrItem));
  if (index > -1) {
    arr.splice(index, 1);
  }
}
exports.removeFirst = removeFirst;
