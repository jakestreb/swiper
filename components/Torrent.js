'use strict';

const Promise = require('bluebird');
const path = require('path');
const rimraf = require('rimraf');
const ptn = require('parse-torrent-name');
const util = require('../util/util.js');
const settings = require('../util/settings.js');
const rimrafAsync = Promise.promisify(rimraf);

function Torrent(video, stats) {
  this.video = video;
  this.name = stats.name;
  this.size = _getSizeMb(stats.size);
  this.seeders = stats.seeders;
  this.leechers = stats.leechers;
  this.uploadTime = stats.uploadTime; // Note: Named uploadTime because it's not a date.
  this.magnetLink = stats.magnetLink;
  this.tfile = null;
  // TODO: Used parsed data for more accurate quality selection.
  this.parsed = ptn(this.name);
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
  // Check if any insta-reject strings match (ex. CAMRip).
  let rejectMatch = settings.reject.find(r => this.name.match(r));
  if (qIndex === -1 || rejectMatch) {
    return 0;
  }
  // If its a TV episode that hasn't been released, it's no good.
  let unreleasedEpisode = this.video.type === 'episode' &&
    this.video.releaseDate && (this.video.releaseDate >= util.getTomorrowMorning());
  // If it's not the right video, it's no good.
  let wrongTitle = this.parsed.title !== this.video.getSafeTitle();
  if (unreleasedEpisode || wrongTitle) {
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
  let prettyName = '';
  let splitName = this.name.split('.');
  let acc = 0;
  // Create a pretty name by truncating the torrent name
  for (let i = 0; i < splitName.length; i++) {
    let word = splitName[i];
    prettyName += word;
    acc += word.length;
    if (acc < 30) {
      prettyName += ' ';
    } else {
      prettyName += '...';
      break;
    }
  }
  if (!this.tfile) {
    return `${prettyName}\n`;
  } else {
    let progress = (this.tfile.progress * 100).toPrecision(3);
    let speed = (this.tfile.downloadSpeed / 1000000).toPrecision(3);
    let remaining = (this.tfile.timeRemaining / 60000).toPrecision(3);
    return `(${progress}%) ${prettyName}\n` +
      `${this.tfile.numPeers}PE | ${speed}MB/s | ${remaining}min remain\n`;
  }
};

Torrent.prototype.toString = function() {
  return `${this.name.replace('.', ' ')} (${this.size}MB)\n` +
    `${this.seeders}SE/${this.leechers}LE | UP ${this.uploadTime}\n\n`;
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
