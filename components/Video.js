'use strict';

function Video(title, type) {
  if (!title) {
    throw new Error('Video must have a title.');
  }
  this.title = title;
  this.type = type; // should be 'tv' or 'movie'.
  this.torrent = null;
}

Video.prototype.getTitle = function() {
  return this.title;
};

Video.prototype.getType = function() {
  return this.type;
};

Video.prototype.setTorrent = function(torrent) {
  this.torrent = torrent;
};

Video.prototype.isSubsetOf = function(video) {
  return this.title === video.title;
};

// Should be extended.
Video.prototype.getSearchTerm = function() {
  throw new Error("Not implemented");
};

module.exports = Video;
