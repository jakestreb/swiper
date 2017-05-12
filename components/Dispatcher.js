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

function Dispatcher(respondFuncs) {
  this.respondFuncs = respondFuncs;
  this.swipers = {};
  this.downloading = [];

  // Lock should be acquired before reading/writing memory.json
  this.memoryLock = new AsyncLock({
    Promise: Promise,
    timeout: 5000
  });

  this.torrentClient = new TorrentClient(() => {
    // TODO: Restart all the downloads that were in progess, and tell the users.
  });

  // Create established Facebook swipers.
  this.initFacebookSwipers();

  // Start monitoring items.
  this.startMonitoring();
}

Dispatcher.prototype.initFacebookSwipers = function() {
  return this.memoryLock.acquire('key', () => {
    return readFile('util/memory.json', 'utf8');
  })
  .then(file => {
    let fileObj = JSON.parse(file);
    fileObj.swipers.forEach(id => {
      this.swipers[id] = new Swiper(this, id, this.respondFuncs.facebook);
    });
  });
};

// Sends a message to the swiper with id, or creates a new swiper if it does not exist.
Dispatcher.prototype.acceptMessage = function(type, id, message) {
  let swiper = this.swipers[id];
  if (swiper) {
    this.swipers[id].toSwiper(message);
  } else {
    // New swiper
    this.swipers[id] = new Swiper(this, id, this.respondFuncs[type]);
    if (type === 'facebook') {
      this.saveSwiper(id);
    }
  }
  // console.warn('ACCEPTED MESSAGE', message);
  // console.warn('id', id);
  // console.warn('swipers', this.swipers);
};

// Search for monitored items daily at the time given in settings.
// If episodes were released on a given day, repeat searching on failures after a delay
// for a set number of tries.
Dispatcher.prototype.startMonitoring = function() {
  let now = new Date();
  let untilSearchTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(),
    settings.monitor.hour, settings.monitor.minute) - now;
  let dailyRepeats = 0;
  // If the time has passed, add a full day.
  return Promise.delay(untilSearchTime < 0 ? untilSearchTime + 86400000 : untilSearchTime)
  .then(() => this.searchMonitored())
  .then(() => {
    // If any episodes were released today, repeatedly search for them until they are
    // found (removed from the array) or until a max number or times.
    let repeatFunc = todayCount => {
      if (dailyRepeats < settings.repeat.length && todayCount > 0) {
        return Promise.delay(settings.repeat[dailyRepeats] * 60 * 1000)
        .then(() => this.searchMonitored(item => item.releaseDate &&
          item.releaseDate.toDateString() === new Date().toDateString()))
        .then(count => {
          dailyRepeats++;
          return repeatFunc(count);
        });
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
      console.log('Searching for ' + item.getDesc());
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
  .then(file => {
    let fileObj = JSON.parse(file);
    return {
      monitored: this._parseContent(fileObj.monitored),
      queued: this._parseContent(fileObj.queued)
    };
  });
};

Dispatcher.prototype.saveSwiper = function(id) {
  return this.memoryLock.acquire('key', () => {
    return readFile('util/memory.json', 'utf8')
    .then(file => {
      let fileObj = JSON.parse(file);
      fileObj.swipers.push(id);
      return writeFile('util/memory.json', JSON.stringify(fileObj, null, 2));
    });
  });
};

Dispatcher.prototype._parseContent = function(arr) {
  return arr.map(item => _objToContent(item));
};

/**
 * method: 'add'|'remove',
 * items: [],
 * target: 'monitored'|'queued'
 */
Dispatcher.prototype.updateMemory = function(swiperId, target, method, item) {
  return this.memoryLock.acquire('key', () => {
    return readFile('util/memory.json', 'utf8')
    .then(file => {
      let fileObj = JSON.parse(file);
      let t = this._parseContent(fileObj[target]);
      let finalArr = method === 'add' ? this._addToArray(swiperId, t, item) :
        this._removeFromArray(swiperId, t, item);
      fileObj[target] = t.map(item => item.getObject());
      if (Array.isArray(finalArr)) {
        return writeFile('util/memory.json', JSON.stringify(fileObj, null, 2))
          .then(() => `Added to ${target}.`);
      } else {
        return finalArr;
      }
    })
    .catch(err => {
      console.log('updateMemory err:', err);
      return `There was a problem ${method === 'add' ? `adding ${item.getTitle()} to ` +
        `${target}.` : `removing ${item.getTitle()} from ${target}.`}`;
    });
  });
};

// Consolidate add with an item in the array with the same title, or just adds it.
// Returns a message if the item cannot be added.
Dispatcher.prototype._addToArray = function(swiperId, arr, add) {
  let index = arr.findIndex(existing => existing.getTitle() === add.getTitle());
  let typeA = add.getType();
  if (typeA === 'collection' && add.episodes.length === 0) {
    return `There are currently no such episodes.`;
  } else if (index > -1) {
    let sameTitle = arr[index];
    let typeB = sameTitle.getType();
    if (typeA === 'movie' && typeB === 'movie') {
      // Both are movies. Already present.
      return `${add.getDesc()} is already there.`;
    } else if ((typeA === 'movie' || typeB === 'movie') && typeA !== typeB) {
      // One of them is a movie, the other is a show.
      arr.unshift(add);
      return arr;
    } else if (typeA === 'episode' && typeB === 'episode') {
      // Both are episodes.
      if (add.equals(sameTitle)) {
        return `${add.getDesc()} is already there.`;
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
        return arr;
      }
      if (clc.containsAll(ep)) {
        return `${add.getDesc()} is already there.`;
      } else {
        clc.addContent(ep);
        return arr;
      }
    } else {
      // Both are collections.
      if (sameTitle.containsAll(add)) {
        return `${add.getDesc()} is already there.`;
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
      return `${remove.getDesc()} is not there.`;
    } else if (typeA === 'episode' && typeB === 'episode') {
      // Both are episodes.
      if (remove.equals(sameTitle)) {
        arr.splice(index, 1);
        return arr;
      } else {
        return `${remove.getDesc()} is not there.`;
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
        return `${remove.getDesc()} is not there.`;
      }
    } else if (typeA === 'collection' && typeB === 'episode') {
      // Remove a collection, but only an episode is present.
      if (remove.containsAll(sameTitle)) {
        arr.splice(index, 1);
        return arr;
      } else {
        return `${remove.getDesc()} is not there.`;
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
        return `${remove.getDesc()} is not there.`;
      }
    }
  } else {
    // Nothing with the same title found.
    return `${remove.getTitle()} is not there.`;
  }
};

function _objToContent(obj) {
  switch (obj.type) {
    case 'movie':
      return new Movie(obj.swiperId, obj.title, obj.year);
    case 'episode':
      return new Episode(obj.swiperId, obj.title, obj.seasonNum, obj.episodeNum,
        obj.releaseDateStr ? new Date(obj.releaseDateStr) : null);
    case 'collection':
      return new Collection(obj.swiperId, obj.title,
        obj.episodes.map(ep => _objToContent(ep)), obj.initialType);
  }
}

module.exports = Dispatcher;
