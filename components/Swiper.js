'use strict';

const UserIO = require('./UserIO.js');
const TorrentClient = require('./TorrentClient.js');
const InputError = require('./InputError.js');

const resp = require('../util/responses.js');
const util = require('../util/util.js');
const settings = require('../util/settings.js');
const commands = require('../util/commands.js');

function Swiper() {
  this.userIO = new UserIO();
  this.torrentClient = new TorrentClient(() => {
    this.send(`The torrent client just died. Restarting now.`);
    // TODO: Restart all the downloads that were in progess, and tell the user.
  });

  this.downloading = [];
  this.completed = [];
  this.lastDownload = null;

  this.awaitCommand('Hello.');
}

Swiper.prototype.send = function(message) {
  return this.userIO.send(message);
};

Swiper.prototype.awaitInput = function(message) {
  return this.userIO.awaitInput(message)
  .then(input => input === 'cancel' ?
    this.awaitCommand('Ok, nevermind. Need anything else?') : input
  );
};

// possible is an array of possible entries from /util/responses.js
Swiper.prototype.awaitResponse = function(message, possible) {
  return this._awaitResponse(message, possible, 0);
};

Swiper.prototype._awaitResponse = function(message, possible, callCount) {
  return this.awaitInput(message)
  .then(input => {
    let matched = null;
    possible.forEach(resp => {
      if (input.match(resp.regex)) {
        if (!matched) {
          matched = resp.value;
        } else {
          throw new InputError();
        }
      }
    });
    if (!matched) {
      throw new InputError();
    }
    return {
      input: input,
      match: matched
    };
  })
  .catch(InputError, () => {
    return this._awaitResponse(callCount > 0 ? message :
      "I'm not sure I understand. " + message, possible, callCount + 1);
  });
};

Swiper.prototype.awaitCommand = function(message) {
  return this.awaitInput(message)
  .then(input => this.parseCommand(input))
  .then(doneStr => this.awaitCommand(doneStr || 'Done.'))
  .catch(InputError, e => {
    this.send(e.message);
    return this.awaitCommand();
  });
};

Swiper.prototype.parseCommand = function(input) {
  // Calls the function mapped to the command in COMMANDS with the content
  // following the command.
  let [req, rem] = this._splitFirst(input);
  let func = commands[req].func;
  if (func) {
    return this[func](rem);
  } else {
    throw new InputError('Not recognized. Type "help" for supported commands.');
  }
};

Swiper.prototype.getStatus = function() {
  return util.getMemory(memory => {
    return "Monitoring:\n" +
      memory.monitored + "\n\n" +
      "Queued:\n" +
      memory.queued + "\n\n" +
      "Downloading:\n" +
      this.downloading.reduce((acc, val) => acc + val.getDownloadInfo(), "") + "\n\n" +
      "Completed:\n" +
      this.completed.reduce((acc, val) => acc + val.getName());
  });
};

Swiper.prototype.monitor = function(input) {
  return this._monitorContent(this._identifyContentFromInput(input));
};

Swiper.prototype._monitorContent = function(content) {
  return util.getMemory()
  .then(memory => {
    if (!content.isVideo()) {
      return content.getCreatedAs() === 'series' ?
        this._resolveMonitorSeries(content) : util.updateMemory('monitored', 'add', [content]);
    } else if (memory.monitored.find(m => m.isSubsetOf(content))) {
      // The video is already being monitored.
      return `I'm already monitoring that.`;
    } else {
      return util.updateMemory('monitored', 'add', [content]);
    }
  })
  .catch(() => {
    this.send(`There was a problem adding ${content} to monitored.`);
  });
};

Swiper.prototype._resolveMonitorSeries = function(series) {
  return this.awaitResponse(`Type "series" to monitor the entire series, otherwise specify ` +
    `the season, or also the episode, you'd like monitored. To monitor new episodes only, ` +
    `type "new".`, [resp.series, resp.seasonOrEpisode, resp.new])
  .then(feedback => {
    if (feedback.match === 'series') {
      // Series
      series.trackNew(true);
      return util.updateMemory('monitored', 'add', [series]);
    } else if (feedback.match === 'episode') {
      // Season or episode
      let season = this._captureSeason(feedback.input);
      let episode = this._captureEpisode(feedback.input);
      if (!season) {
        return this._resolveMonitorSeries(series);
      } else if (season && !episode) {
        // All season
        series.filterToSeason(season);
        return util.updateMemory('monitored', 'add', [series]);
      } else {
        // Season and episode
        let ep = series.getEpisode(season, episode);
        return util.updateMemory('monitored', 'add', [ep]);
      }
    } else {
      // New
      series.trackNew(true);
      let now = new Date();
      series.filterEpisodes(ep => ep.releaseDate > now);
      return util.updateMemory('monitored', 'add', series);
    }
  });
};

Swiper.prototype.download = function(input) {
  return this._identifyContentFromInput(input)
  .then(content => {
    if (!content.isVideo()) {
      return this._downloadCollection(content);
    } else {
      this._resolveVideoDownload(content);
    }
  });
};

Swiper.prototype._downloadCollection = function(collection) {
  let onDeck = collection.episodes.slice(0, settings.concEps);
  let onQueue = collection.episodes.slice(settings.concEps);
  // Add most items to the queue.
  util.updateMemory('queue', 'add', onQueue);
  return Promise.reduce(onDeck, (acc, video) => {
    return acc.then(() => this._resolveVideoDownload(video));
  }, Promise.resolve());
};

Swiper.prototype._resolveVideoDownload = function(video) {
  let searchTerm = video.getSearchTerm();
  this.send(`Searching for ${searchTerm}...`);
  return Promise.join(video, util.torrentSearch(searchTerm))
  .then((video, torrents) => {
    let best = this._autoPickTorrent(torrents, video.getType());
    if (!best) {
      return this._resolveNoEligibleTorrents(video);
    } else {
      video.setTorrent(best);
      return this._startDownload(video);
    }
  });
};

Swiper.prototype._startDownload = function(video) {
  this.lastDownload = video;
  // Clear the lastDownload in 60s so that it can no longer be aborted.
  setTimeout(60000, () => {
    if (this.lastDownload === video) {
      this.lastDownload = null;
    }
  });
  // Remove the video from monitoring and queueing, if it was in those places.
  this._removeVideo(video, true);
  this.downloading.push(video);
  this.torrentClient.download(video.torrent)
  .then(() => {
    this._removeFirst(this.downloading, video);
    this.completed.push(video);
    this.send(`${video.title} download complete!`);
    this._tryDownloadNext(video);
  })
  .catch(() => {
    this.send(`${video.title} download process died, restarting download.`);
    this._startDownload(video);
  });
  return `Downloading: \n${video.torrent.toString()}\nType "abort" to stop the download, or ` +
    `"status" to view progess. Is there anything else you need?`;
};

// Downloads the next queued download in a series after prevDownload.
Swiper.prototype._tryDownloadNext = function(prevDownload) {
  if (prevDownload.type() !== 'episode') {
    return;
  }
  return util.getMemory()
  .then(memory => {
    let next = null;
    memory.queue.forEach(content => {
      if (content.title === prevDownload.title) {
        if (content.type() === 'episode' && content.isEarlierThan(next)) {
          next = content;
        } else if (content.type() === 'collection') {
          let possible = content.getNextEpisode(prevDownload.seasonNum, prevDownload.episodeNum);
          if (possible.isEarlierThan(next)) {
            next = possible;
          }
        }
      }
    });
    if (!next) {
      return;
    }
    return Promise.join(next, util.updateMemory('queue', 'remove', [next]));
  })
  .then(next => this._startDownload(next));
};

Swiper.prototype._resolveNoEligibleTorrents = function(video) {
  return this.awaitResponse(`I can't find a good torrent. If you'd like to see the ` +
    `results for yourself, type search, otherwise type monitor and I'll keep an eye ` +
    `out for ${video.getTitle()}`, [resp.search, resp.monitor])
  .then(resp => {
    if (resp.match === 'search') {
      return this._searchVideo(video);
    } else {
      return this._monitorContent(video);
    }
  });
};

Swiper.prototype.getCommands = function() {
  let output = "";
  for (let cmd in commands) {
    let cmdInfo = commands[cmd];
    if (!cmdInfo.isAlias) {
      let aliases = cmdInfo.aliases || [];
      output += `${cmd}: Also ${aliases.join(' or ')}. commands[cmd].desc}\n\n`;
    }
  }
  return output;
};

// Aborts the most recent download if it was started in the last 60s.
Swiper.prototype.abort = function() {
  if (this.lastDownload) {
    this._removeFirst(this.downloading, this.lastDownload);
    this.lastDownload.destroy();
    this.lastDownload = null;
  }
};

Swiper.prototype.remove = function(input) {
  return this._removeVideo(this._identifyContentFromInput(input));
};

Swiper.prototype._removeVideo = function(video, hidePrompts) {
  let prompts = [];
  return util.getMemory()
  .then(memory => {
    // Note that video here may refer to an entire season or series.
    // Handle monitored and queued.
    for (let name in memory) {
      let queue = memory[name];
      let memRemovals = this._getSubsets(queue, video);
      let n = memRemovals.length;
      if (n > 0) {
        prompts.push(this._confirmAction.bind(this, `Remove ` +
          `${n > 1 ? `${n} instances of ${video.title}` : video.title} from ${name}?`,
          () => { util.updateMemory(name, 'remove', memRemovals); }, hidePrompts));
      }
    }
    // Handle downloading.
    let dwnRemovals = this._getSubsets(this.downloading, video);
    let n = dwnRemovals.length;
    if (n > 0) {
      prompts.push(this._confirmAction.bind(this, `Abort downloading ` +
        `${n > 1 ? `${n} instances of ${video.title}` : video.title}?`,
        () => { dwnRemovals.forEach(item => { this._cancelDownload(item); }); }, hidePrompts));
    }
    // Display the prompts one after the other.
    return Promise.reduce(prompts, (acc, prompt) => {
      return acc.then(() => prompt());
    }, Promise.resolve());
  });
};

// Create a yes/no prompt with the option to override the prompt with an immediate 'yes'.
Swiper.prototype._confirmAction = function(promptText, callback, optYes) {
  return Promise.resolve(optYes ? { match: 'yes' } :
    this.awaitRespose(promptText, [resp.yes, resp.no]))
  .then(resp => {
    if (resp.match === 'yes') {
      callback();
    }
  });
};

Swiper.prototype._cancelDownload = function(video) {
  video.torrent.cancelDownload();
  this.downloading._removeFirst(video);
};

Swiper.prototype.pause = function(input) {
  return this._pauseOrResume(input, true);
};

Swiper.prototype.resume = function(input) {
  return this._pauseOrResume(input, false);
};

// Helper to perform pause/resume action
Swiper.prototype._pauseOrResume = function(input, isPause) {
  let action = isPause ? 'Pause' : 'Resume';
  return this._identifyContentFromInput(input)
  .then(video => {
    let relevant = this._getSubsets(this.downloading, video);
    return this._confirmAction(`${action} ${relevant.length} relevant downloads?`,
      () => { relevant.forEach(item => {
        isPause ? item.torrent.pauseDownload() : item.torrent.resumeDownload();
      }); },
      relevant.length === 1
    ).then(() => '${action}d.');
  });
};

// Returns a filtered version of the array containing only items which are subsets of video.
Swiper.prototype._getSubsets = function(arr, video) {
  return arr.filter(item => item.isSubsetOf(video));
};

Swiper.prototype.search = function(input) {
  return this._identifyContentFromInput(input)
  .then(content => {
    return Promise.resolve(content.isVideo() ? content :
      this._resolveSearchToEpisode(content));
  })
  .then(video => this._searchVideo(video));
};

Swiper.prototype._searchVideo = function(video) {
  return util.torrentSearch(video.getSearchTerm())
  .then(torrents => this._showTorrents(video, torrents));
};

// Helper for handling initial input to search and download.
Swiper.prototype._identifyContentFromInput = function(input) {
  if (!input) {
    throw new InputError("You didn't specify anything.");
  }
  let videoData = this._parseTitle(input);
  if (!videoData.title) {
    throw new InputError("I don't understand what the title is.");
  }
  return util.identifyContent(videoData)
  .then(content => {
    if (!content) {
      throw new InputError("I can't find anything with that title.");
    }
    return content;
  });
};

Swiper.prototype._resolveSearchToEpisode = function(collection) {
  let isSeries = collection.initialType() === 'series';
  let breadth = isSeries ? 'series' : 'season';
  return this.awaitResponse(`I can't search for a ${breadth} all at once. Specify the ` +
    `${isSeries ? "season and " : ""}episode to continue searching or type download ` +
    `and I'll get the whole ${breadth}.`,
    [isSeries ? resp.seasonOrEpisode : resp.episode, resp.download]
  ).then(feedback => {
    if (feedback.match === 'download') {
      this._downloadCollection(collection);
    } else if (isSeries) {
      let season = this._captureSeason(feedback.input);
      let episode = this._captureEpisode(feedback.input);
      if (!season) {
        return this._resolveSearchToEpisode(collection);
      } else if (!episode) {
        collection.filterToSeason(season);
        return this._resolveSeasonToEpisode(collection);
      } else {
        return collection.getEpisode(season, episode);
      }
    } else {
      let episode = this._captureEpisode(feedback.input);
      if (!episode) {
        return this._resolveSeasonToEpisode(collection);
      } else {
        return collection.getEpisode(collection.trackSeason, episode);
      }
    }
  });
};

Swiper.prototype._resolveSeasonToEpisode = function(season) {
  return this.awaitInput(`And the episode?`)
  .then(input => {
    let episodeNum = this._captureEpisode(input);
    return episodeNum || this._resolveSeasonToEpisode(season);
  })
  .then(episodeNum => {
    return season.getEpisode(season.trackSeason, episodeNum);
  });
};

// Parses a titleStr into constituent parts
Swiper.prototype._parseTitle = function(titleStr) {
  const titleFinder = /^([\w \'\"\-\:\,\&]+?)(?: (?:s(?:eason)? ?\d{1,2}.*)|(?:\d{4}\b.*))?$/gi;
  const yearFinder = /\b\d{4}\b/gi;
  const epFinder = /\bs(?:eason)? ?(\d{1,2}) ?(?:ep?(?:isode)? ?(\d{1,2}))?\b/gi;

  let [ title ] = this._execCapture(titleStr, titleFinder, 1);
  if (!title) {
    return {};
  }
  let rem = this._removePrefix(titleStr, title);
  let [ year ] = this._execCapture(rem, yearFinder, 1);
  let [ season, episode ] = this._execCapture(rem, epFinder, 2);
  return {
    title: title,
    year: year,
    season: season,
    episode: episode
  };
};

Swiper.prototype._showTorrents = function(video, torrents, type) {
  return this._showSomeTorrents(video, torrents, type, 0);
};

Swiper.prototype._showSomeTorrents = function(video, torrents, type, startIndex) {
  let n = settings.displayTorrents;
  let activeTorrents = torrents.slice(startIndex, n);
  let responses = [resp.download], prev = false, next = false;
  if (startIndex > 0) {
    prev = true;
    responses.push(resp.prev);
  }
  if (startIndex + n < torrents.length) {
    next = true;
    responses.push(resp.next);
  }
  return this.awaitResponse(`Found torrents:\n` +
    `${activeTorrents.reduce((acc, t, i) => acc + `${startIndex + i + 1}.` + t.toString(), "")}` +
    `Type ${prev ? '"prev", ' : ""}${next ? '"next", ' : ""}or "download" followed` +
    `by the number of the torrent you'd like.`, responses)
  .then(resp => {
    switch (resp.match) {
      case 'prev':
        return this._showSomeTorrents(torrents, type, startIndex - n);
      case 'next':
        return this._showSomeTorrents(torrents, type, startIndex + n);
      case 'download':
        let [ numStr ] = this._execCapture(resp.input, /\bd(?:ownload)?\s*(\d)/, 1);
        if (!numStr) {
          return this._showSomeTorrents(torrents, type, startIndex);
        }
        let num = parseInt(numStr, 10);
        if (num > 0 && num <= torrents.length) {
          video.setTorrent(torrents[num - 1]);
          return this._startDownload(video);
        } else {
          return this._showSomeTorrents(torrents, type, startIndex);
        }
    }
  });
};

Swiper.prototype._autoPickTorrent = function(torrents, type) {
  let best = null;
  let bestTier = 0;
  torrents.forEach(torrent => {
    let tier = torrent.getTier(type);
    if (tier > bestTier) {
      best = torrent;
      bestTier = tier;
    }
  });
  return best;
};

// input length must be at least 1.
Swiper.prototype._splitFirst = function(input) {
  let broken = input.split(' ');
  return [broken[0], broken.slice(1).join(' ')];
};

// input length must be at least 1.
Swiper.prototype._splitLast = function(input) {
  let broken = input.split(' ');
  return [broken.slice(0, -1).join(' '), broken[broken.length - 1]];
};

Swiper.prototype._removePrefix = function(str, prefix) {
  let l = prefix.length;
  return str.slice(0, l) === prefix ? str.slice(l) : null;
};

// Removes the first index of the item from the array.
Swiper.prototype._removeFirst = function(arr, item) {
  let index = arr.indexOf(item);
  if (index > -1) {
    arr.splice(index, 1);
  }
};

Swiper.prototype._captureSeason = function(str) {
  const seasonFinder = /\bs?(?:eason)? ?(\d{1,2})\b/gi;
  let [ season ] = this._execCapture(str, seasonFinder, 1);
  return season;
};

Swiper.prototype._captureEpisode = function(str) {
  const epFinder = /\bep?(?:isode)? ?(\d{1,2})\b/gi;
  let [ ep ] = this._execCapture(str, epFinder, 1);
  return ep;
};

Swiper.prototype._execCapture = function(str, regex, numCaptures) {
  let match = regex.exec(str);
  if (!match) {
    return new Array(numCaptures);
  }
  return match.slice(1);
};

module.exports = Swiper;
