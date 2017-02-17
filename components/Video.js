
function Video(title, type) {
  if (!title) {
    throw new Error('Video must have a title.')
  }
  this.title = title;
  this.type = type; // should be 'tv' or 'movie'.
}

// Should be extended.
Video.prototype.getSearchTerm = function() {
  throw new Error("Not implemented");
};

module.exports = Video;
