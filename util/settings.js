'use strict';

module.exports = {
  quality: {
    episode: [/720p/gi, /1080p/gi, /HD(?!CAM)/gi], // keyword preference order
    movie: [/1080p/gi, /720p/gi, /HD(?!CAM)/gi]
  },
  size: {
    episode: {
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
  monitor: {
    hour: 22, // 0-23, hour at which monitored should be searched.
    minute: 0,  // 0-59, minute after the hour at which monitored should be searched.
    repeatWait: 20, // minutes after failure to find content released the same day to search again.
    repeatCount: 9 // number of times after failure to find content released the same day.
  },
  displayTorrents: 4, // Number of torrents to show at a time after searching.
  maxDownloads: 3 // Concurrent downloads allowed per swiper instance.
};
