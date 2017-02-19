'use strict';

const _ = require('underscore');
const Video = require('./Video.js');

function TV(title, season, episode) {
  Video.call(this, title, 'tv');
  this.season = season;
  this.episode = episode;
}
_.extend(TV.prototype, Video.prototype);

TV.prototype.getSearchTerm = function() {
  return this.isEpisode() ? `${this.title.replace(/[^a-zA-Z ]/g, "")} ` +
    `s${this._padZeros(this.season)}e${this._padZeros(this.episode)}` : null;
};

TV.prototype.isEpisode = function() {
  return this.season && this.episode;
};

TV.prototype.isSeason = function() {
  return this.season && !this.episode;
};

TV.prototype.isSeries = function() {
  return !this.season;
};

TV.prototype._padZeros = function(int) {
  return ('00' + int).slice(-2);
};

TV.prototype.setSeason = function(season) {
  this.season = season;
};

TV.prototype.setEpisode = function(episode) {
  this.episode = episode;
};

TV.prototype.setSeasonEpisode = function(season, episode) {
  this.season = season;
  this.episode = episode;
};

module.exports = TV;
