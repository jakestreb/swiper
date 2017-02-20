'use strict';

const _ = require('underscore');
const Content = require('./Content.js');

// A collection of episodes
function Collection(title, episodes, initialType) {
  Content.call(this, title, 'collection');
  this.episodes = episodes;
  this.initialType = initialType; // Should be 'series' or 'season'.
  this.createdAt = new Date();
  this.trackNew = false;
  this.trackSeason = null;
}
_.extend(Collection.prototype, Content.prototype);

Collection.prototype.trackNew = function(trackNew) {
  this.trackNew = trackNew;
};

Collection.prototype.trackSeason = function(seasonNum) {
  this.trackSeason = seasonNum;
};

Collection.prototype.filterEpisodes = function(callback) {
  this.episodes = this.episodes.map((ep, i) => callback(ep, i));
};

Collection.prototype.filterToSeason = function(seasonNum) {
  this.trackNew(false);
  this.trackSeason(seasonNum);
  this.filterEpisodes(ep => ep.seasonNum === seasonNum);
};

Collection.prototype.getEpisode = function(seasonNum, episodeNum) {
  return this.episodes.find(ep => ep.seasonNum === seasonNum && ep.episodeNum === episodeNum);
};

Collection.prototype.getInitialType = function() {
  return this.getInitialType;
};

// Finds the earliest episode and season (after optStartSeason and optStartEpisode)
Collection.prototype.getNextEpisode = function(optStartSeason, optStartEpisode) {
  let startSeason = optStartSeason || 1;
  let startEpisode = optStartEpisode || 0;
  let next = null;
  this.episodes.forEach(ep => {
    let afterInit = ep.seasonNum >= startSeason && ep.episodeNum > startEpisode;
    let earlierSeason = ep.seasonNum < next.seasonNum;
    let earlierEp = ep.seasonNum === next.seasonNum && ep.episodeNum < next.episodeNum;
    if (afterInit && (earlierSeason || earlierEp)) {
      next = ep;
    }
  });
  return next;
};

// Gets the intersection of this and another content item
Collection.prototype.getIntersection = function(content) {
  if (content.getType() === 'episode') {
    return this.episodes.find(ep => ep.episodeNum === content.episodeNum &&
      ep.title === content.title) || null;
  } else if (content.getType() === 'collection') {
    return this.episodes.filter(ep1 => {
      return content.episodes.find(ep2 => ep1.title === ep2.title &&
        ep1.episodeNum === ep2.episodeNum);
    });
  } else {
    return null;
  }
};

Collection.prototype.getObject = function() {
  return {
    type: this.type,
    title: this.title,
    episodes: this.episodes.map(ep => ep.getObject())
  };
};

module.exports = Collection;
