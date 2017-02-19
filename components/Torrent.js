'use strict';

const settings = require('../util/settings.js');

function Torrent(stats) {
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
  let size = this.size >= settings.size[type].min && this.size <= settings.size[type].max;
  return size ? (qs - qIndex) + (qs * (this.seeders >= settings.minSeeders ? 1 : 0)) : 0;
};

Torrent.prototype.getDownloadInfo = function() {
  if (!this.tfile) {
    return this.name + "\n";
  } else {
    return this.name + "\n" +
      "| Peers: " + this.tfile.peers + "\n" +
      "| Mb/s: " + (this.tfile.downloadSpeed / 1000000) + "\n" +
      "| Progress: " + (this.tfile.progress * 100) + "%\n" +
      "| Time left: " + (this.tfile.timeRemaining / 60000) + "min\n";
  }
};

Torrent.prototype.toString = function() {
  return this.name + "\n" +
    "| Size: " + this.size + " Mb\n" +
    "| SE: " + this.seeders + "\n" +
    "| LE: " + this.leechers + "\n" +
    "| Uploaded: " + this.uploadDate + "\n";
};

// Expects a string which starts with a decimal number and either GiB, MiB, or kiB
function _getSizeMb(sizeStr) {
  try {
    const factorMap = { 'g': 0.1, 'm': 1.0, 'k': 10.0 };
    let [ valStr, units ] = sizeStr.split(/\s/g);
    let val = parseFloat(valStr);
    let factor = factorMap[units[0].toLowerCase()];
    return val * factor;
  } catch (err) {
    console.error('Failed to get torrent size.', sizeStr);
  }
}

module.exports = Torrent;
