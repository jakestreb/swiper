'use strict';

const _ = require('underscore');
const Video = require('./Video.js');

function Movie(title, year) {
  Video.call(this, title, 'movie');
  this.year = year;
}
_.extend(Movie.prototype, Video.prototype);

Movie.prototype.getIntersection = function(content) {
  return content.getType() === 'movie' && content.title === this.title ? this : null;
};

Movie.prototype.getSearchTerm = function() {
  return this.title.replace(/[^a-zA-Z ]/g, "") + " " + this.year;
};

Movie.prototype.getObject = function() {
  return {
    type: this.type,
    title: this.title,
    year: this.year,
  };
};

module.exports = Movie;
