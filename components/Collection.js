'use strict';

const _ = require('underscore');
const Content = require('./Content.js');
const util = require('../util/util.js');

// A collection of episodes
function Collection(swiperId, title, episodes, optInitialType, optInitialSeason) {
  Content.call(this, swiperId, title, 'collection');

  // Invariant: Episodes are in order.
  this.episodes = episodes;

  // These are helpers indicating only the origins of the collection.
  // These are only used when created by the user do not determine the identity of the collection.
  this.initialType = optInitialType; // Should be 'series' or 'season'.
  this.initialSeason = optInitialSeason; // Should be the number of the season, if applicable.

  this.createdAt = new Date();

  // Make sure episodes invariant holds.
  this.sortEpisodes();
}
_.extend(Collection.prototype, Content.prototype);

Collection.prototype.filterEpisodes = function(callback) {
  this.episodes = this.episodes.filter((ep, i) => callback(ep, i));
};

Collection.prototype.filterToSeason = function(seasonNum) {
  this.filterEpisodes(ep => ep.seasonNum === seasonNum);
};

Collection.prototype.hasSeason = function(seasonNum) {
  return !!this.episodes.find(ep => ep.seasonNum === seasonNum);
};

Collection.prototype.getEpisode = function(seasonNum, episodeNum) {
  return this.episodes.find(ep => ep.seasonNum === seasonNum && ep.episodeNum === episodeNum);
};

Collection.prototype.sortEpisodes = function() {
  return this.episodes.sort((a, b) => a.isEarlierThan(b) ? -1 : 1);
};

Collection.prototype.getNextAirs = function() {
  let morning = util.getMorning();
  let leastOld = this.episodes.slice().reverse().find(ep => ep.releaseDate < morning);
  let leastNew = this.episodes.find(ep => ep.releaseDate >= morning);
  return util.getAiredString((leastNew || leastOld).releaseDate);
};

Collection.prototype.getInitialType = function() {
  return this.initialType;
};

Collection.prototype.getInitialSeason = function() {
  return this.initialSeason;
};

// Indicates whether the collection contains any of content.
Collection.prototype.containsAny = function(content) {
  if (content.getType() === 'episode') {
    return !!this.episodes.find(ep => ep.equals(content));
  } else if (content.getType() === 'collection') {
    // Find an episode in content that is in this.
    return content.episodes.find(ep1 => this.episodes.find(ep2 => ep1.equals(ep2)));
  }
};

// Indicates whether the collection contains all of content.
Collection.prototype.containsAll = function(content) {
  if (content.getType() === 'episode') {
    return !!this.episodes.find(ep => ep.equals(content));
  } else if (content.getType() === 'collection') {
    // Find an episode in content that is not in this.
    return !content.episodes.find(ep1 => {
      !this.episodes.find(ep2 => ep1.equals(ep2));
    });
  }
};

Collection.prototype.addContent = function(content) {
  if (content.getType() === 'episode' && !this.episodes.find(ep => ep.equals(content))) {
    this.episodes.unshift(content);
  } else if (content.getType() === 'collection') {
    let newStuff = content.episodes.filter(ep1 => {
      return !this.episodes.find(ep2 => ep1.equals(ep2));
    });
    this.episodes.unshift(newStuff);
  }
  // Maintain episodes invariant after addition.
  this.sortEpisodes();
};

Collection.prototype.removeContent = function(content) {
  if (content.getType() === 'episode') {
    this.episodes = this.episodes.filter(ep => !ep.equals(content));
  } else if (content.getType() === 'collection') {
    this.episodes = this.episodes.filter(ep1 => {
      return !content.episodes.find(ep2 => ep1.equals(ep2));
    });
  }
};

Collection.prototype.popArray = function(count) {
  count = count || 1;
  let removed = this.episodes.slice(0, count);
  this.episodes = this.episodes.slice(count);
  return removed;
};

Collection.prototype.isEmpty = function() {
  return this.episodes.length === 0;
};

// Gives episodes in the following format:
// S01E01-12, S02E01-04 & E06-08, S04E10
Collection.prototype.getDesc = function() {
  let epDesc = "";
  let epChain = 0;
  let lastEpisode = null;
  let lastSeason = null;
  this.episodes.forEach((ep, i) => {
    if (!lastSeason && !lastEpisode) {
      epDesc += `S${ep.getPaddedSeason()}E${ep.getPaddedEpisode()}`;
    } else if (ep.seasonNum > lastSeason) {
      // New season
      epDesc += `-${util.padZeros(lastEpisode)}, S${ep.getPaddedSeason()}E${ep.getPaddedEpisode()}`;
      epChain = 0;
    } else if (ep.seasonNum === lastSeason && (ep.episodeNum > lastEpisode + 1)) {
      // Same season, later episode
      epDesc += `${epChain > 1 ?
        `-${util.padZeros(lastEpisode)}` : ``} & E${ep.getPaddedEpisode()}`;
      epChain = 0;
    } else if (i === this.episodes.length - 1) {
      // Last episode
      epDesc += `-${ep.getPaddedEpisode()}`;
    } else {
      epChain++;
    }
    lastSeason = ep.seasonNum;
    lastEpisode = ep.episodeNum;
  });
  return `${this.title} ${epDesc}`;
};

Collection.prototype.getObject = function() {
  return {
    type: this.type,
    initialType: this.initialType,
    title: this.title,
    episodes: this.episodes.map(ep => ep.getObject()),
    swiperId: this.swiperId
  };
};

module.exports = Collection;
