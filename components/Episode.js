'use strict';

const _ = require('underscore');
const Video = require('./Video.js');

function Episode(title, seasonNum, episodeNum, releaseDate) {
  Video.call(this, title, 'episode');
  this.seasonNum = seasonNum;
  this.episodeNum = episodeNum;
  this.releaseDate = releaseDate;
}
_.extend(Episode.prototype, Video.prototype);

Episode.prototype.isEarlierThan = function(ep) {
  return this.seasonNum < ep.seasonNum || (this.seasonNum === ep.seasonNum &&
    this.episodeNum < ep.episodeNum);
};

Episode.prototype.getSearchTerm = function() {
  return `${this.title.replace(/[^a-zA-Z ]/g, "")} ` +
    `s${this._padZeros(this.seasonNum)}e${this._padZeros(this.episodeNum)}`;
};

Episode.prototype.getIntersection = function(content) {
  let sameEp = content.getType() === 'episode' && content.title === this.title &&
    content.episodeNum === this.episodeNum;
  let containsEp = content.getType() === 'collection' &&
    content.episodes.find(ep => ep.episodeNum === this.episodeNum && ep.title === this.title);
  return (sameEp || containsEp) ? this : null;
};

Episode.prototype._padZeros = function(int) {
  return ('00' + int).slice(-2);
};

Episode.prototype.setSeasonNum = function(seasonNum) {
  this.seasonNum = seasonNum;
};

Episode.prototype.setEpisodeNum = function(episodeNum) {
  this.episodeNum = episodeNum;
};

Episode.prototype.getObject = function() {
  return {
    type: this.type,
    title: this.title,
    seasonNum: this.seasonNum,
    episodeNum: this.episodeNum,
    releaseDateStr: this.releaseDate.toISOString()
  };
};

module.exports = Episode;
