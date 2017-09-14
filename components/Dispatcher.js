'use strict';

const _ = require('underscore');
const Promise = require('bluebird');
const BackboneEvents = require('backbone-events-standalone');
const onExit = require('signal-exit');
const fs = require('fs');
const rimrafAsync = Promise.promisify(require('rimraf'));
const lockFile = Promise.promisifyAll(require('lockfile'));
const readFile = Promise.promisify(fs.readFile);
const writeFile = Promise.promisify(fs.writeFile);

const Swiper = require('./Swiper.js');
const TorrentClient = require('./TorrentClient.js');
const Movie = require('./Movie.js');
const Episode = require('./Episode.js');
const Collection = require('./Collection.js');
const settings = require('../util/settings.js');
const util = require('../util/util.js');

// Time after release (ms) that an episode is no longer 'upcoming'.
const EPISODE_YIELD_TIME = settings.newEpisodeBackoff.reduce((a, b) => a + b, 0) * 60 * 1000;
const LOCK_PATH = 'util/memory.lock';

// Remove the lock file and any stale locks on start, if they exist.
rimrafAsync(LOCK_PATH + '*')
.then(err => {
  if (err) {
    console.error(err);
  }
});

// When the process exists, unlock the file.
onExit(() => {
  lockFile.unlockSync(LOCK_PATH);
});

function Dispatcher(respondFuncs) {
  this.respondFuncs = respondFuncs;
  this.swipers = {};
  this.downloading = [];
  // Monitored episodes that are currently or will soon actively be searched for.
  this.upcoming = [];

  this.torrentClient = new TorrentClient(() => {
    // TODO: Restart all the downloads that were in progess, and tell the users.
  });

  // Create established swipers.
  this.initSwipers();

  // Start monitoring items.
  this.startMonitoring();
  this.startSearchingUpcomingEpisodes();

  // When an item is added to monitored, add any upcoming episodes involved to be searched.
  this.on('monitored-add', item => {
    this._addUpcomingToSearch(item);
  });
  // When an item is removed from monitored, remove any upcoming episodes involved from searching.
  this.on('monitored-remove', item => {
    let episodes = [];
    if (item.type === 'collection') {
      episodes = item.episodes;
    } else if (item.type === 'episode') {
      episodes = [item];
    }
    episodes.forEach(ep => {
      this._removeFromUpcoming(ep);
    });
  });
}
_.extend(Dispatcher.prototype, BackboneEvents);

// Locks the memory file, should be called before reading/writing.
Dispatcher.prototype.lock = function() {
  return lockFile.lockAsync(LOCK_PATH, { wait: 5000, stale: 4500 });
};

// Unlocks the memory file, should be called after reading/writing.
Dispatcher.prototype.unlock = function() {
  return lockFile.unlockAsync(LOCK_PATH);
};

Dispatcher.prototype.initSwipers = function() {
  return this.readMemory()
  .then(memory => {
    memory.swipers.forEach(swiper => {
      this.swipers[swiper.id] = new Swiper(this, swiper.id, this.respondFuncs[swiper.type]);
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
    if (type !== 'cli') {
      this.saveSwiper(type, id);
    }
  }
};

// Search for monitored items daily at the time given in settings.
// If episodes were released on a given day, repeat searching on failures after a delay
// for a set number of tries.
Dispatcher.prototype.startMonitoring = function() {
  const DAY = 86400000;
  let now = new Date();
  let untilSearchTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(),
    settings.monitorAt) - now;
  // If the time has passed, add a full day.
  return Promise.delay(untilSearchTime < 0 ? untilSearchTime + DAY : untilSearchTime)
  .then(() => {
    // Don't search episodes that haven't been released yet.
    this.searchMonitored();
    // This is called daily to add newly upcoming episodes to be searched.
    this.startSearchingUpcomingEpisodes();
  })
  .finally(() => this.startMonitoring());
};

// Adds any upcoming episodes to the search array and prepares to check for them.
Dispatcher.prototype.startSearchingUpcomingEpisodes = function() {
  return this.readMemory()
  .then(memory => {
    // Iterate through monitored, adding all upcoming episodes to searching.
    memory.monitored.forEach(item => {
      this._addUpcomingToSearch(item);
    });
  });
};

// Add all upcoming episodes out of a collection or episodes to be searched.
Dispatcher.prototype._addUpcomingToSearch = function(item) {
  let search = this._getUpcomingEpisodes(item);
  search.forEach(episode => {
    if (!this._isInUpcoming(episode)) {
      console.log(`Adding ${episode.getDesc()} to upcoming`);
      this.upcoming.push(episode);
      this._repeatSearchEpisode(episode);
    }
  });
};

// Returns an array of all released episodes out of a collection or episode.
Dispatcher.prototype._getReleasedEpisodes = function(item) {
  let now = new Date();
  let isReleased = item => (item.type === 'episode') && item.releaseDate && (now > item.releaseDate);
  if (isReleased(item)) {
    return [item];
  } else if (item.type === 'collection') {
    return item.episodes.filter(ep => isReleased(ep));
  } else {
    return [];
  }
};

// Returns an array of all upcoming (in the next day or already released) episodes
// out of a collection or episode.
Dispatcher.prototype._getUpcomingEpisodes = function(item) {
  const oneDay = 1000 * 60 * 60 * 24;
  let now = new Date();
  let isUpcoming = item => (item.type === 'episode') && item.releaseDate &&
    ((item.releaseDate - now) <= oneDay) && ((now - item.releaseDate) < EPISODE_YIELD_TIME);
  if (isUpcoming(item)) {
    return [item];
  } else if (item.type === 'collection') {
    return item.episodes.filter(ep => isUpcoming(ep));
  } else {
    return [];
  }
};

// Repeatedly searched for an upcoming episode according to the repeat array in settings.
Dispatcher.prototype._repeatSearchEpisode = function(episode) {
  const schedule = settings.newEpisodeBackoff;
  let now = new Date();
  // Difference in minutes between now and the release date.
  let diff = Math.floor((now - episode.releaseDate) / 60000);
  let acc = schedule[0];
  for (let i = 1; diff > acc && i < schedule.length; i++) {
    acc += schedule[i];
  }
  if (diff > acc) {
    // Repeat search array has ended, remove from searching and resolve search Promise chain.
    this._removeFromUpcoming(episode);
    return Promise.resolve();
  }
  // Delay until the next check time.
  console.log(`Searching ${episode.getDesc()} in ${(acc - diff)} minutes`);
  return Promise.delay((acc - diff) * 60 * 1000)
  .then(() => {
    // If the episode is still in the searching array, look for it and repeat on failure.
    if (this._isInUpcoming(episode)) {
      console.log(`Searching ${episode.getDesc()}`);
      return this.searchMonitoredItem(episode)
      .delay(60 * 1000)	// After searching, always delay 1 minute before re-scheduling to prevent an endless loop.
      .then(() => this._repeatSearchEpisode(episode));
    }
  });
};

// Helper to indicate whether an episode is in the upcoming array. (Not just whether it's upcoming)
Dispatcher.prototype._isInUpcoming = function(ep) {
  return Boolean(this.upcoming.find(upcomingEp => upcomingEp.equals(ep)));
};

// Helper to remove an episode from the upcoming array.
Dispatcher.prototype._removeFromUpcoming = function(ep) {
  util.removeFirst(this.upcoming, upcomingEp => ep.equals(upcomingEp));
};

// Returns the length of the filtered monitor array.
Dispatcher.prototype.searchMonitored = function() {
  let owners = {};
  return this.readMemory()
  .then(memory => {
    let interested = memory.monitored;
    interested.forEach(item => {
      // TODO: Currently considers all movies to be released
      let released = (item.type === 'movie') ? [item] : this._getReleasedEpisodes(item);
      released.forEach(releasedItem => {
        console.log('Monitor searching:', releasedItem.getDesc());
        let swiper = this.swipers[item.swiperId];
        owners[swiper.id] = owners[swiper.id] || [];
        owners[swiper.id].push(item);
      });
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

Dispatcher.prototype.searchMonitoredItem = function(item) {
  let swiper = this.swipers[item.swiperId];
  return swiper.queueDownload(item, true);
};

Dispatcher.prototype.readMemory = function() {
  return this.lock()
  .then(() => readFile('util/memory.json', 'utf8'))
  .finally(() => this.unlock())
  .then(file => {
    let fileObj = JSON.parse(file);
    return {
      monitored: this._parseContent(fileObj.monitored),
      queued: this._parseContent(fileObj.queued),
      swipers: fileObj.swipers
    };
  });
};

Dispatcher.prototype.saveSwiper = function(type, id) {
  return this.lock()
  .then(() => readFile('util/memory.json', 'utf8'))
  .then(file => {
    let fileObj = JSON.parse(file);
    fileObj.swipers.push({
      type: type,
      id: id
    });
    return writeFile('util/memory.json', JSON.stringify(fileObj, null, 2));
  })
  .finally(() => this.unlock());
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
  return this.lock()
  .then(() => readFile('util/memory.json', 'utf8'))
  .then(file => {
    let fileObj = JSON.parse(file);
    let t = this._parseContent(fileObj[target]);
    let finalArr = method === 'add' ? this._addToArray(swiperId, t, item) :
      this._removeFromArray(swiperId, t, item);
    fileObj[target] = t.map(item => item.getObject());
    // finalArr is either an array or a failure message.
    if (Array.isArray(finalArr)) {
      return writeFile('util/memory.json', JSON.stringify(fileObj, null, 2))
        .then(() => `Added to ${target}`);
    } else {
      return finalArr;
    }
  })
  // Trigger an event when monitored is written successfully.
  .tap(() => this.trigger(`${target}-${method}`, item))
  .catch(err => {
    console.log('updateMemory err:', err);
    return `There was a problem ${method === 'add' ? `adding ${item.getTitle()} to ` +
      `${target}` : `removing ${item.getTitle()} from ${target}`}`;
  })
  .tap(() => this.unlock());
};

// Consolidate add with an item in the array with the same title, or just adds it.
// Returns a message if the item cannot be added.
Dispatcher.prototype._addToArray = function(swiperId, arr, add) {
  let index = arr.findIndex(existing => existing.getTitle() === add.getTitle());
  let typeA = add.getType();
  if (typeA === 'collection' && add.episodes.length === 0) {
    return `There are currently no such episodes`;
  } else if (index > -1) {
    let sameTitle = arr[index];
    let typeB = sameTitle.getType();
    if (typeA === 'movie' && typeB === 'movie') {
      // Both are movies. Already present.
      return `${add.getDesc()} is already there`;
    } else if ((typeA === 'movie' || typeB === 'movie') && typeA !== typeB) {
      // One of them is a movie, the other is a show.
      arr.unshift(add);
      return arr;
    } else if (typeA === 'episode' && typeB === 'episode') {
      // Both are episodes.
      if (add.equals(sameTitle)) {
        return `${add.getDesc()} is already there`;
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
        return `${add.getDesc()} is already there`;
      } else {
        clc.addContent(ep);
        return arr;
      }
    } else {
      // Both are collections.
      if (sameTitle.containsAll(add)) {
        return `${add.getDesc()} is already there`;
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
      return `${remove.getDesc()} is not there`;
    } else if (typeA === 'episode' && typeB === 'episode') {
      // Both are episodes.
      if (remove.equals(sameTitle)) {
        arr.splice(index, 1);
        return arr;
      } else {
        return `${remove.getDesc()} is not there`;
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
        return `${remove.getDesc()} is not there`;
      }
    } else if (typeA === 'collection' && typeB === 'episode') {
      // Remove a collection, but only an episode is present.
      if (remove.containsAll(sameTitle)) {
        arr.splice(index, 1);
        return arr;
      } else {
        return `${remove.getDesc()} is not there`;
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
        return `${remove.getDesc()} is not there`;
      }
    }
  } else {
    // Nothing with the same title found.
    return `${remove.getTitle()} is not there`;
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
