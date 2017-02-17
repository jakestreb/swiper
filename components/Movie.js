const Video = require('./Video.js');

function Movie(title, year) {
  Video.call(this, title, 'movie');
  this.year = year;
}

Movie.prototype.getSearchTerm = function() {
  return this.title + " " + this.year;
};

module.exports = Movie;
