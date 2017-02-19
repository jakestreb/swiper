'use strict';

const _ = require('underscore');
const Video = require('./Video.js');

function Movie(title, year) {
  Video.call(this, title, 'movie');
  this.year = year;
}
_.extend(Movie.prototype, Video.prototype);

Movie.prototype.getSearchTerm = function() {
  return this.title.replace(/[^a-zA-Z ]/g, "") + " " + this.year;
};

module.exports = Movie;
