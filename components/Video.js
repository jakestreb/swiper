'use strict';

const _ = require('underscore');
const Content = require('./Content.js');

// Should not be instantiated.
function Video(swiperId, title, type) {
  Content.call(this, swiperId, title, type);
  if (!title) {
    throw new Error('Video must have a title.');
  }
  this.title = title;
  this.torrent = null;
}
_.extend(Video.prototype, Content.prototype);

Video.prototype.getTitle = function() {
  return this.title;
};

// Returns a title that is safe to name a directory after.
Video.prototype.getSafeTitle = function() {
  return this.title.replace(/[\/\\\:\*\?\"\<\>\|\']/g, '');
};

Video.prototype.getType = function() {
  return this.type;
};

Video.prototype.setTorrent = function(torrent) {
  this.torrent = torrent;
};

Video.prototype.isVideo = function() {
  return true;
};

// Indicates whether the video contains any of content.
Video.prototype.containsAny = function(content) {
  return content.getType() === this.getType() && this.equals(content);
};

// Indicates whether the video contains all of content.
Video.prototype.containsAll = function(content) {
  return content.getType() === this.getType() && this.equals(content);
};

Video.prototype.getSearchTerm = function() {
  throw new Error("Not implemented.");
};

Video.prototype.getObject = function() {
  throw new Error("Not implemented.");
};

module.exports = Video;
