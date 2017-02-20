'use strict';

const _ = require('underscore');
const Video = require('./Video.js');

function Episode(title, season, episode) {
  Video.call(this, title, 'episode');
  this.season = season;
  this.episode = episode;
}
_.extend(Episode.prototype, Video.prototype);

Episode.prototype.getSearchTerm = function() {
  return this.isEpisode() ? `${this.title.replace(/[^a-zA-Z ]/g, "")} ` +
    `s${this._padZeros(this.season)}e${this._padZeros(this.episode)}` : null;
};

Episode.prototype.isEpisode = function() {
  return this.season && this.episode;
};

Episode.prototype.isSeason = function() {
  return this.season && !this.episode;
};

Episode.prototype.isSeries = function() {
  return !this.season;
};

Episode.prototype.isSubsetOf = function(tv) {
  return this.title === tv.title &&
    (!tv.season || (this.season === tv.season)) &&
    (!tv.episode || (this.episode === tv.episode));
};

Episode.prototype._padZeros = function(int) {
  return ('00' + int).slice(-2);
};

Episode.prototype.setSeason = function(season) {
  this.season = season;
};

Episode.prototype.setEpisode = function(episode) {
  this.episode = episode;
};

Episode.prototype.setSeasonEpisode = function(season, episode) {
  this.season = season;
  this.episode = episode;
};

module.exports = Episode;
