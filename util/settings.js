'use strict';

module.exports = {
  quality: {
    episode: [/720p/gi, /1080p/gi], // keyword preference order
    movie: [/1080p/gi, /720p/gi]
  },
  size: {
    episode: {
      min: 200, // Mb
      max: 2500
    },
    movie: {
      min: 500,
      max: 4500
    }
  },
  // Low seeder tier to determine download pick quality. Things with fewer seeders than this
  // will still be downloaded, but as a last priority.
  minSeeders: 30,
  monitor: {
    hour: 2, // 0-23, hour at which monitored should be searched for all items.
    // Minutes in each repeat interval after release. Stops retrying when the end of the array is
    // reached. When Swiper is started up, there's an immediate search for TV shows released in the
    // past 24 hours, then array search begins starting in the correct place.
    repeat: [45, 15, 15, 15, 15, 15, 15, 15, 15, 30, 30, 30, 30, 60, 60, 60, 60, 120, 120, 240, 480]
  },
  displayTorrents: 4, // Number of torrents to show at a time after searching.
  maxDownloads: 3 // Concurrent downloads allowed per swiper instance.
};
