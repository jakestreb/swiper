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
  minSeeders: 20,
  monitor: {
    hour: 22, // 0-23, hour at which monitored should be searched.
    minute: 30,  // 0-59, minute after the hour at which monitored should be searched.
    // Minutes in each repeat interval. Stops retrying when the end of the array is reached.
    repeat: [15, 15, 15, 15, 15, 15, 15, 15, 30, 30, 30, 30, 60, 60]
  },
  displayTorrents: 4, // Number of torrents to show at a time after searching.
  maxDownloads: 3 // Concurrent downloads allowed per swiper instance.
};
