
module.exports = {
  quality: {
    tv: ['720p', '1080p', 'HD'], // keyword preference order
    movie: ['1080p', '720p', 'HD']
  },
  size: {
    tv: {
      min: 300, // Mb
      max: 2000
    },
    movie: {
      min: 600,
      max: 4000 
    }
  },
  minSeeders: 10,
  checkPeriod: 86400, // seconds after which monitored shows/movies should be searched for
  displayTorrents: 4, // Number of torrents to show at a time after searching.
  concEps: 3 // Concurrent episodes to download of the same show on a large request.
};
