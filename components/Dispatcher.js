'use strict';

const Promise = require('bluebird');
const AsyncLock = require('async-lock');
const fs = require('fs');
const readFile = Promise.promisify(fs.readFile);
const writeFile = Promise.promisify(fs.writeFile);

const Swiper = require('./Swiper.js');
const TorrentClient = require('./TorrentClient.js');
const Movie = require('./Movie.js');
const Episode = require('./Episode.js');
const Collection = require('./Collection.js');
const settings = require('../util/settings.js');

function Dispatcher() {
  this.swipers = {};
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

  // Start monitoring items.
  this.startMonitoring();
}

// Sends a message to the swiper with id, or creates a new swiper if it does not exist.
Dispatcher.prototype.acceptMessage = function(id, message, fromSwiper) {
  if (this.swipers[id]) {
    this.swipers[id].toSwiper(message);
  } else {
    // New swiper
    this.swipers[id] = new Swiper(this, id, fromSwiper);
  }
};

// Search for monitored items daily at the time given in settings.
// If episodes were released on a given day, repeat searching on failures after a delay
// for a set number of tries.
Dispatcher.prototype.startMonitoring = function() {
  let now = new Date();
  let toTen = new Date(now.getFullYear(), now.getMonth(), now.getDate(),
    settings.monitor.hour, settings.monitor.minute) - now;
  let dailyRepeats = 0;
  // If the time has passed, add a full day.
  return Promise.delay(toTen < 0 ? toTen + 86400000 : toTen)
  .then(() => this.searchMonitored())
  .then(() => {
    // If any episodes were released today, repeatedly search for them until they are
    // found (removed from the array) or until a max number or times.
    let repeatFunc = todayCount => {
      if (dailyRepeats < settings.repeatCount && todayCount > 0) {
        dailyRepeats++;
        return Promise.delay(settings.repeatWait * 60 * 1000)
        .then(() => this.searchMonitored(item => item.releaseDate &&
          item.releaseDate.toDateString() === new Date().toDateString()))
        .then(count => repeatFunc(count));
      }
    };
    return repeatFunc(1);
  })
  .finally(() => this.startMonitoring());
};

// Returns the length of the filtered monitor array.
Dispatcher.prototype.searchMonitored = function(optFilter) {
  optFilter = optFilter || (item => item);
  let owners = {};
  return this.readMemory()
  .then(memory => {
    let interested = memory.monitored.filter(item => optFilter(item));
    interested.forEach(item => {
      let swiper = this.swipers[item.swiperId];
      owners[swiper.id] = owners[swiper.id] || [];
      owners[swiper.id].push(item);
    });
    for (let id in owners) {
      // Make swipers find whichever items they added in sequence.
      owners[id].reduce((acc, item) => {
        return acc.then(() => this.swipers[id].queueDownload(item, true));
      }, Promise.resolve());
    }
    return interested.length;
  });
};

Dispatcher.prototype.readMemory = function() {
  return this.memoryLock.acquire('key', () => {
    return readFile('util/memory.json', 'utf8');
  })
  .then(file => this._parseFile(file));
};

Dispatcher.prototype._parseFile = function(file) {
  let data = JSON.parse(file);
  for (let key in data) {
    // Create classes from the objectified stored items.
    data[key] = data[key].map(item => _objToContent(item));
  }
  return data;
};

/**
 * method: 'add'|'remove',
 * items: [],
 * target: 'monitored'|'queued'
 */
Dispatcher.prototype.updateMemory = function(swiperId, target, method, item) {
  return this.memoryLock.acquire('key', () => {
    return readFile('util/memory.json', 'utf8')
    .then(file => this._parseFile(file))
    .then(memory => {
      let t = memory[target];
      // TODO: Remove
      // console.warn('origArr', t);
      let finalArr = method === 'add' ? this._addToArray(swiperId, t, item) :
        this._removeFromArray(swiperId, t, item);
      // TODO: Remove
      // console.warn('finalArr', finalArr);
      memory[target] = finalArr;
      if (finalArr) {
        return writeFile('util/memory.json', JSON.stringify(memory, null, 2));
      } else if (method === 'add') {
        return `${item.getTitle()} is already ${target}`;
      } else {
        return `${item.getTitle()} is not in ${target}`;
      }
    });
    // TODO: Uncomment.
    // .catch(() => `There was a problem ${method === 'add' ? `adding ${item.getTitle()} to ` +
    //   `${target}.` : `removing ${item.getTitle()} from ${target}.`}`);
  });
};

// Consolidate add with an item in the array with the same title, or just adds it.
// Returns null if the item is already there.
Dispatcher.prototype._addToArray = function(swiperId, arr, add) {
  let index = arr.findIndex(existing => existing.getTitle() === add.getTitle());
  if (index > -1) {
    let sameTitle = arr[index];
    let typeA = add.getType(), typeB = sameTitle.getType();
    if (typeA === 'movie' && typeB === 'movie') {
      // Both are movies. Already present.
      return null;
    } else if ((typeA === 'movie' || typeB === 'movie') && typeA !== typeB) {
      // One of them is a movie, the other is a show.
      arr.unshift(add);
      return arr;
    } else if (typeA === 'episode' && typeB === 'episode') {
      // Both are episodes.
      if (add.equals(sameTitle)) {
        return null;
      } else {
        let clc = new Collection(swiperId, add.getTitle(), [add, sameTitle]);
        arr.splice(index, 1, clc);
        return arr;
      }
    } else if ((typeA === 'episode' || typeB === 'episode') && typeA !== typeB) {
      // One is an episode, one is a collection.
      let ep = add, clc = sameTitle;
      if (typeA === 'collection') {
        // Make it so the collection is in and the episode is out.
        ep = sameTitle, clc = add;
        arr.splice(index, 1, clc);
      }
      if (clc.containsAll(ep)) {
        return null;
      } else {
        clc.addContent(ep);
        return arr;
      }
    } else {
      // Both are collections.
      if (sameTitle.containsAll(add)) {
        return null;
      } else {
        sameTitle.addContent(add);
        return arr;
      }
    }
  } else {
    // Nothing with the same title found.
    arr.unshift(add);
    return arr;
  }
};

// Delete remove from any items that include it in the array, or just remove it.
// Returns null if the item is not there.
Dispatcher.prototype._removeFromArray = function(swiperId, arr, remove) {
  let index = arr.findIndex(existing => existing.getTitle() === remove.getTitle());
  if (index > -1) {
    let sameTitle = arr[index];
    let typeA = remove.getType(), typeB = sameTitle.getType();
    if (typeA === 'movie' && typeB === 'movie') {
      // Both are movies, simple remove case.
      arr.splice(index, 1);
      return arr;
    } else if ((typeA === 'movie' || typeB === 'movie') && typeA !== typeB) {
      // One of them is a movie, the other is a show.
      return null;
    } else if (typeA === 'episode' && typeB === 'episode') {
      // Both are episodes.
      if (remove.equals(sameTitle)) {
        arr.splice(index, 1);
        return arr;
      } else {
        return null;
      }
    } else if (typeA === 'episode' && typeB === 'collection') {
      // Remove an episode from a collection.
      if (sameTitle.containsAll(remove)) {
        sameTitle.removeContent(remove);
        if (sameTitle.isEmpty()) {
          arr.splice(index, 1);
        }
        return arr;
      } else {
        return null;
      }
    } else if (typeA === 'collection' && typeB === 'episode') {
      // Remove a collection, but only an episode is present.
      if (remove.containsAll(sameTitle)) {
        arr.splice(index, 1);
        return arr;
      } else {
        return null;
      }
    } else {
      // Both are collections.
      if (sameTitle.containsAny(remove)) {
        sameTitle.removeContent(remove);
        if (sameTitle.isEmpty()) {
          arr.splice(index, 1);
        }
        return arr;
      } else {
        return null;
      }
    }
  } else {
    // Nothing with the same title found.
    return null;
  }
};

function _objToContent(obj) {
  switch (obj.type) {
    case 'movie':
      return new Movie(obj.swiperId, obj.title, obj.year);
    case 'episode':
      return new Episode(obj.swiperId, obj.title, obj.seasonNum, obj.episodeNum,
        new Date(obj.releaseDateStr));
    case 'collection':
      return new Collection(obj.swiperId, obj.title,
        obj.episodes.map(ep => _objToContent(ep)), obj.initialType);
  }
}

module.exports = Dispatcher;
