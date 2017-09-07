'use strict';

module.exports = {
  quality: {
    episode: [/720p/gi, /1080p/gi], // keyword preference order
    movie: [/1080p/gi, /720p/gi]
  },
  reject: [/\bHDCAM\b/gi, /\bCAMRip\b/gi, /\bCAM\b/gi, /\bTS\b/gi, /\bTELESYNC\b/gi,
    /\bPDVD\b/gi, /\bHD-?TS\b/gi, /\bHD-?TC\b/gi, /\bWP\b/gi, /\bWORKPRINT\b/gi, /\bTS-?RIP\b/gi],
  // Maximum and minimum sizes to automatically download content, in Mb
  size: {
    episode: {
      min: 150,
      max: 2800
    },
    movie: {
      min: 500,
      max: 5000
    }
  },
  // Low seeder tier to determine download pick quality. Things with fewer seeders than this
  // will still be downloaded, but as a last priority.
  minSeeders: 30,
  monitorAt: 2, // 0-23, hour at which monitored should be searched for all items.
  // Minutes in each repeat interval after release. Stops retrying when the end of the array is
  // reached. When Swiper is started up, search begins starting in the correct place.
  newEpisodeBackoff: [45,10,10,10,10,10,10,15,15,15,15,30,30,30,30,60,60,120,120,240,480],
  displayTorrents: 4, // Number of torrents to show at a time after searching.
  maxDownloads: 3 // Concurrent downloads allowed per swiper instance.
};
