'use strict';

const Promise = require('bluebird');
const AsyncLock = require('async-lock');
const fs = require('fs');
const readFile = Promise.promisify(fs.readFile);
const writeFile = Promise.promisify(fs.writeFile);

const Swiper = require('./Swiper.js');
const CLI = require('./CLI.js');
const TorrentClient = require('./TorrentClient.js');
const Movie = require('../components/Movie.js');
const Episode = require('../components/Episode.js');
const Collection = require('../components/Collection.js');

function Dispatcher() {
  this.swipers = [];
  this.downloading = [];
  this.completed = [];

  // Lock should be acquired before reading/writing memory.json
  this.memoryLock = new AsyncLock({
    Promise: Promise,
    timeout: 5000
  });

  this.torrentClient = new TorrentClient(() => {
    // TODO: Restart all the downloads that were in progess, and tell the users.
  });

  // Counter to give ids to swipers.
  this._counter = 1;

  // Start a swiper on the command line.
  this.addCLISwiper();
}

Dispatcher.prototype.addCLISwiper = function() {
  let cli = new CLI();
  this.swipers.push(new Swiper(this, cli, this._counter++));
};

Dispatcher.prototype.readMemory = function() {
  return this.memoryLock.acquire('key', () => {
    return readFile('util/memory.json', 'utf8');
  })
  .then(file => {
    let data = JSON.parse(file);
    for (let key in data) {
      // Create classes from the objectified stored items.
      data[key].map(item => _objToContent(item));
    }
    return data;
  });
};

/**
 * method: 'add'|'remove'|'purge',
 * items: [],
 * target: 'monitored'|'queued'
 */
Dispatcher.prototype.updateMemory = function(target, method, items) {
  let objs = items.map(item => item.getObject());
  return this.readMemory()
  .then(memory => {
    let t = memory[target];
    switch (method) {
      case 'add':
        t = t.concat(objs);
        break;
      case 'remove':
        objs.forEach(item => {
          let i = t.indexOf(item);
          if (i > -1) { t.splice(i, 1); }
        });
        break;
      case 'purge':
        t = [];
        break;
    }
    return this.memoryLock.acquire('key', () => {
      return writeFile('util/memory.json', JSON.stringify(memory));
    });
  });
};

function _objToContent(obj) {
  switch (obj.type) {
    case 'movie':
      return new Movie(obj.title, obj.year);
    case 'episode':
      return new Episode(obj.title, obj.seasonNum, obj.episodeNum, new Date(obj.releaseDateStr));
    case 'collection':
      return new Collection(obj.title,
        obj.episodes.map(ep => new Episode(ep.title, ep.seasonNum, ep.episodeNum)));
  }
}

module.exports = Dispatcher;
