'use strict';

const _ = require('underscore');
const Content = require('./Content.js');

// Should not be instantiated.
function Video(title, type) {
  Content.call(this, title, type);
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

Video.prototype.getType = function() {
  return this.type;
};

Video.prototype.setTorrent = function(torrent) {
  this.torrent = torrent;
};

Video.prototype.isVideo = function() {
  return true;
};

Video.prototype.getIntersection = function(video) {
  throw new Error("Not implemented.");
};

Video.prototype.getSearchTerm = function() {
  throw new Error("Not implemented.");
};

Video.prototype.getObject = function() {
  throw new Error("Not implemented.");
};

module.exports = Video;
