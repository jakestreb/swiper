'use strict';

module.exports = {
  quality: {
    tv: [/720p/gi, /1080p/gi, /HD/gi], // keyword preference order
    movie: [/1080p/gi, /720p/gi, /HD/gi]
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
  // Low seeder tier to determine download pick quality. Things with fewer seeders than this
  // will still be downloaded, but as a last priority.
  minSeeders: 20,
  checkPeriod: 86400, // seconds after which monitored shows/movies should be searched for
  displayTorrents: 4, // Number of torrents to show at a time after searching.
  concEps: 3 // Concurrent episodes to download of the same show on a large request.
};
