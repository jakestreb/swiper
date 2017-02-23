'use strict';

const imdb = require('imdb-api');
const PirateBay = require('thepiratebay');

const Movie = require('../components/Movie.js');
const Episode = require('../components/Episode.js');
const Collection = require('../components/Collection.js');
const Torrent = require('../components/Torrent.js');

// Options must include a title, may also include year, season, and episode.
function identifyContent(options) {
  let season = options.season ? parseInt(options.season, 10) : null;
  let episode = options.episode ? parseInt(options.episode, 10) : null;
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

function torrentSearch(str, optRetryCount) {
  return PirateBay.search(str, {
    category: 'video',
    page: 0,
    orderBy: 'seeds',
    sortBy: 'desc'
  })
  .then(results => {
    if (!results) {
      return optRetryCount > 0 ? torrentSearch(str, optRetryCount - 1) : [];
    } else {
      return results.map(result =>
        new Torrent({
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
