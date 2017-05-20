'use strict';

const _ = require('underscore');
const Video = require('./Video.js');

function Movie(swiperId, title, year) {
  Video.call(this, swiperId, title, 'movie');
  this.year = year;
}
_.extend(Movie.prototype, Video.prototype);

Movie.prototype.getSearchTerm = function() {
  return this.title.replace(/[^a-zA-Z ]+/g, " ") + " " + this.year;
};

Movie.prototype.equals = function(content) {
  return this.type === content.type && this.title === content.title &&
    this.year === content.year;
};

Movie.prototype.getDesc = function() {
  return `${this.title} (${this.year})`;
};

Movie.prototype.getObject = function() {
  return {
    type: this.type,
    title: this.title,
    year: this.year,
    swiperId: this.swiperId
  };
};

module.exports = Movie;
