'use strict';

// Should not be instantiated.
function Content(title, type) {
  if (!title) {
    throw new Error('Content must have a title.');
  }
  this.title = title;
  this.type = type; // should be 'movie', 'episode', or 'collection'.
}

Content.prototype.getTitle = function() {
  return this.title;
};

Content.prototype.getType = function() {
  return this.type;
};

Content.prototype.isVideo = function() {
  return false;
};

Content.prototype.getIntersection = function(content) {
  throw new Error('Not implemented.');
};

Content.prototype.getObject = function() {
  throw new Error('Not implemented.');
};

module.exports = Content;
