'use strict';

const Promise = require('bluebird');
const path = require('path');
const rimraf = require('rimraf');
const settings = require('../util/settings.js');
const rimrafAsync = Promise.promisify(rimraf);

function Torrent(video, stats) {
  this.video = video;
  this.name = stats.name;
  this.size = _getSizeMb(stats.size);
  this.seeders = stats.seeders;
  this.leechers = stats.leechers;
  this.uploadDate = stats.uploadDate;
  this.magnetLink = stats.magnetLink;
  this.tfile = null;
}

Torrent.prototype.getName = function() {
  return this.name;
};

Torrent.prototype.getMagnet = function() {
  return this.magnetLink;
};

Torrent.prototype.setProgressFile = function(tfile) {
  this.tfile = tfile;
};

Torrent.prototype.isEligible = function(type) {
  return this.getTier(type) > 0;
};

// Get download quality tier. The tiers range from 0 <-> (2 * number of quality preferences)
Torrent.prototype.getTier = function(type) {
  let qs = settings.quality[type].length;
  let qIndex = settings.quality[type].findIndex(q => this.name.match(q));
  if (qIndex === -1) {
    return 0;
  }
  if (this.video.type === 'episode' && this.video.releaseDate > this.uploadDate) {
    // If its a TV episode that was uploaded before release, it's no good.
    return 0;
  }
  let size = this.size >= settings.size[type].min && this.size <= settings.size[type].max;
  return size ? (qs - qIndex) + (qs * (this.seeders >= settings.minSeeders ? 1 : 0)) : 0;
};

Torrent.prototype.cancelDownload = function() {
  this.tfile.files.map(file => {
    let fileDir = file.path.split('/').shift();
    let origPath = path.join(this.tfile.path, fileDir);
    rimrafAsync(origPath).then(err => {
      if (err) {
        console.warn(err);
      }
    });
  });
  this.tfile.destroy();
};

Torrent.prototype.getDownloadInfo = function() {
  if (!this.tfile) {
    return this.name + "\n";
  } else {
    return this.name + "\n" +
      "    Peers: " + this.tfile.numPeers + "\n" +
      "    Speed: " + (this.tfile.downloadSpeed / 1000000).toPrecision(3) + " Mb/s\n" +
      "    Progress: " + (this.tfile.progress * 100).toPrecision(3) + "%\n" +
      "    Time left: " + (this.tfile.timeRemaining / 60000).toPrecision(4) + " min\n";
  }
};

Torrent.prototype.toString = function() {
  return this.name + "\n" +
    "    Size: " + this.size + " Mb\n" +
    "    SE: " + this.seeders + "\n" +
    "    LE: " + this.leechers + "\n" +
    "    Uploaded: " + this.uploadDate + "\n";
};

// Expects a string which starts with a decimal number and either GiB, MiB, or kiB
function _getSizeMb(sizeStr) {
  try {
    const factorMap = { 'g': 1000.0, 'm': 1.0, 'k': 0.001 };
    let [ valStr, units ] = sizeStr.split(/\s/g);
    let val = parseFloat(valStr);
    let factor = factorMap[units[0].toLowerCase()];
    return val * factor;
  } catch (err) {
    throw new Error('Failed to get torrent size: ' + sizeStr);
  }
}

module.exports = Torrent;
