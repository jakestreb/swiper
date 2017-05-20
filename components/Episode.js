'use strict';

const _ = require('underscore');
const Video = require('./Video.js');
const util = require('../util/util.js');

function Episode(swiperId, title, seasonNum, episodeNum, optReleaseDate) {
  Video.call(this, swiperId, title, 'episode');
  this.seasonNum = seasonNum;
  this.episodeNum = episodeNum;
  this.releaseDate = optReleaseDate;
}
_.extend(Episode.prototype, Video.prototype);

Episode.prototype.isEarlierThan = function(ep) {
  if (this.title !== ep.title) {
    throw new Error('Cannot compare episodes of different shows.');
  }
  return this.seasonNum < ep.seasonNum || (this.seasonNum === ep.seasonNum &&
    this.episodeNum < ep.episodeNum);
};

Episode.prototype.equals = function(ep) {
  return this.type === ep.type && this.title === ep.title && this.seasonNum === ep.seasonNum &&
    this.episodeNum === ep.episodeNum;
};

Episode.prototype.getSearchTerm = function() {
  return `${this.title.replace(/[^a-zA-Z ]+/g, " ")} ` +
    `s${util.padZeros(this.seasonNum)}e${util.padZeros(this.episodeNum)}`;
};

Episode.prototype.setSeasonNum = function(seasonNum) {
  this.seasonNum = seasonNum;
};

Episode.prototype.setEpisodeNum = function(episodeNum) {
  this.episodeNum = episodeNum;
};

Episode.prototype.getPaddedEpisode = function() {
  return util.padZeros(this.episodeNum);
};

Episode.prototype.getPaddedSeason = function() {
  return util.padZeros(this.seasonNum);
};

Episode.prototype.getDesc = function() {
  return `${this.title} S${this.getPaddedSeason()}E${this.getPaddedEpisode()}`;
};

Episode.prototype.getObject = function() {
  return {
    type: this.type,
    title: this.title,
    seasonNum: this.seasonNum,
    episodeNum: this.episodeNum,
    releaseDateStr: this.releaseDate ? this.releaseDate.toISOString() : '',
    swiperId: this.swiperId
  };
};

module.exports = Episode;
