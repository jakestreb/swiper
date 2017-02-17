const imdb = require('imdb-api');
const PirateBay = require('thepiratebay');

const Movie = require('../components/Movie.js');
const Torrent = require('../components/Torrent.js');

// Options must include a title, may also include year, season, and episode.
function identifyVideo(options) {
  return imdb.getReq({ name: options.title, year: options.year })
  .then(imdbEntry => {
    if (imdbEntry.type === 'movie') {
      return new Movie(imdbEntry.title, imdbEntry.year);
    } else {
      return new TV(imdbEntry.title, options.season, options.epsiode);
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
