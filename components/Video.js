'use strict';

function Video(title, type) {
  if (!title) {
    throw new Error('Video must have a title.');
  }
  this.title = title;
  this.type = type; // should be 'tv' or 'movie'.
}

Video.prototype.getTitle = function() {
  return this.title;
};

Video.prototype.getType = function() {
  return this.type;
};

// Should be extended.
Video.prototype.getSearchTerm = function() {
  throw new Error("Not implemented");
};

module.exports = Video;
