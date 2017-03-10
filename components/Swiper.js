'use strict';

const Promise = require('bluebird');
const isOnline = require('is-online');
const InputError = require('./InputError.js');
const resp = require('../util/responses.js');
const util = require('../util/util.js');
const settings = require('../util/settings.js');
const commands = require('../util/commands.js');

// TODO: Test monitored found torrent and monitored released today.
// TODO: Restart on all exceptions.
// TODO: Create readme (heroku address, how to check ips, etc).
// TODO: Clear all TODOs in the project.
function Swiper(dispatcher, id, fromSwiper) {
  this.dispatcher = dispatcher;
  this.id = id;

  this.torrentClient = dispatcher.torrentClient;
  this.downloading = dispatcher.downloading;
  this.completed = dispatcher.completed;

  this.downloadCount = 0;  // Should be kept in-sync with num downloads with this id.

  // This should be called by the dispatcher when there is a message for this swiper.
  this.toSwiper = () => {};
  this.fromSwiper = fromSwiper;

  // Immediately start downloading any items from the queue.
  this._downloadFromQueue(settings.maxDownloads);

  this.awaitCommand(`I'm Swiper. Type "help" to see what I can do.`);
}

Swiper.prototype.send = function(message) {
  return this.fromSwiper(message);
};

// If given a message, sends it before waiting for input
Swiper.prototype.awaitInput = function(optMessage) {
  if (optMessage) {
    this.send(optMessage);
  }
  return new Promise((resolve, reject) => {
    this.toSwiper = resolve;
  })
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
  .then(doneStr => this.awaitCommand(doneStr || 'Got it.'))
  .catch(InputError, e => {
    this.send(e.message);
    return this.awaitCommand();
  });
};

Swiper.prototype.parseCommand = function(input) {
  // Calls the function mapped to the command in COMMANDS with the content
  // following the command.
  let [req, rem] = this._splitFirst(input);
  let cmd = commands[req];
  if (cmd && cmd.func) {
    return this[cmd.func](rem);
  } else {
    throw new InputError('Not recognized. Type "help" to see what I can do.');
  }
};

Swiper.prototype.getStatus = function() {
  let indentFunc = item => (item.swiperId === this.id ? '* ' : '  ');
  return this.dispatcher.readMemory()
  .then(memory => {
    return "\nMonitoring:\n" +
      (memory.monitored.map(item => indentFunc(item) + item.getDesc())
        .join("\n") || "None") + "\n\n" +
      "Queued:\n" +
      (memory.queued.map(item => indentFunc(item) + item.getDesc())
        .join("\n") || "None") + "\n\n" +
      "Downloading:\n" +
      (this.downloading.reduce((acc, val) =>
        acc + indentFunc(val) + val.torrent.getDownloadInfo() + "\n", "") || "None\n") + "\n" +
      "Completed:\n" +
      (this.completed.reduce((acc, val) => acc + indentFunc(val) + val.getDesc() + "\n", "")
        || "None\n");
  });
};

Swiper.prototype.monitor = function(input) {
  return this._identifyContentFromInput(input)
  .then(content => this._monitorContent(content));
};

Swiper.prototype._monitorContent = function(content) {
  if (!content.isVideo()) {
    return content.getInitialType() === 'series' ? this._resolveMonitorSeries(content) :
      this.dispatcher.updateMemory(this.id, 'monitored', 'add', content);
  } else {
    return this.dispatcher.updateMemory(this.id, 'monitored', 'add', content);
  }
};

Swiper.prototype._resolveMonitorSeries = function(series) {
  return this.awaitResponse(`Type "series" to monitor the entire series, otherwise specify ` +
    `the season, or also the episode, you'd like monitored. To monitor new episodes only, ` +
    `type "new".`, [resp.series, resp.seasonOrEpisode, resp.new])
  .then(feedback => {
    if (feedback.match === 'series') {
      // Series
      return this.dispatcher.updateMemory(this.id, 'monitored', 'add', series);
    } else if (feedback.match === 'episode') {
      // Season or episode
      let season = this._captureSeason(feedback.input);
      let episode = this._captureEpisode(feedback.input);
      if (!season) {
        return this._resolveMonitorSeries(series);
      } else if (season && !episode) {
        // All season
        series.filterToSeason(season);
        return this.dispatcher.updateMemory(this.id, 'monitored', 'add', series);
      } else {
        // Season and episode
        let ep = series.getEpisode(season, episode);
        return this.dispatcher.updateMemory(this.id, 'monitored', 'add', ep);
      }
    } else {
      // New
      let now = new Date();
      series.filterEpisodes(ep => ep.releaseDate > now);
      return this.dispatcher.updateMemory(this.id, 'monitored', 'add', series);
    }
  });
};

Swiper.prototype.check = function() {
  this.send('Searching for monitored content...');
  return this.dispatcher.searchMonitored()
  .then(() => 'Done searching.');
};

Swiper.prototype.download = function(input) {
  return isOnline().then(online => {
    if (!online) {
      return `I don't have a good connection right now. Try again in a few minutes.`;
    } else {
      return this._identifyContentFromInput(input)
      .then(content => {
        this.queueDownload(content, !content.isVideo());
        return "Queued the download.";
      });
    }
  });
};

// This should always be called to download content. Adds a video to the queue
// or starts the download if max concurrent downloads is not met.
// If noPrompt is set, no prompts will be offered to the user.
// NOTE: This is called before the torrent is found.
Swiper.prototype.queueDownload = function(content, noPrompt) {
  let addCount = settings.maxDownloads - this.downloadCount;
  let ready = [];
  let queueItem = null;
  if (content.getType() === 'collection') {
    ready = content.popArray(addCount);
    queueItem = content.isEmpty() ? null : content;
  } else if (addCount > 0) {
    ready = [content];
  } else if (addCount === 0) {
    queueItem = content;
  }
  Promise.try(() => queueItem ?
    this.dispatcher.updateMemory(this.id, 'queued', 'add', queueItem) : null)
  .then(() => {
    ready.forEach(video => {
      this._resolveVideoDownload(video, noPrompt)
      .then(success => {
        if (noPrompt && !success) {
          // Monitor failures.
          this.send(`Failed to find ${video.getDesc()}, adding to monitored.`);
          this._monitorContent(video);
          this._downloadFromQueue();
        }
      });
    });
  });
};

// If noPrompt is set, no prompts will be offered to the user. Instead, returns
// a boolean success indicator.
// Sets the torrent for a video and downloads it.
Swiper.prototype._resolveVideoDownload = function(video, noPrompt) {
  noPrompt ? null : this.send(`Looking for ${video.getTitle()} downloads...`);
  return util.torrentSearch(video, 2)
  .then(torrents => {
    let best = this._autoPickTorrent(torrents, video.getType());
    if (!best) {
      return noPrompt ? false : this.awaitResponse(`I can't find a good torrent. If you'd like ` +
        `to see the results for yourself, type "search", otherwise type "monitor" and I'll ` +
        `keep an eye out for ${video.getTitle()}`, [resp.search, resp.monitor])
        .then(resp => {
          return resp.match === 'search' ? this._searchVideo(video) :
            this._monitorContent(video);
        });
    } else {
      video.setTorrent(best);
      if (noPrompt) {
        this._startDownload(video);
        return true;
      } else {
        return this._startDownload(video);
      }
    }
  });
};

Swiper.prototype._startDownload = function(video) {
  // Remove the video from monitoring and queueing, if it was in those places.
  this._removeVideo(video, true, true);
  this.downloading.push(video);
  this.downloadCount++;
  this.torrentClient.download(video.torrent)
  .then(() => {
    this._popDownload(video);
    this.completed.push(video);
    return util.exportVideo(video);
  })
  .then(() => {
    this.send(`${video.getTitle()} download complete!`);
    // Try to download the next item in this swiper's queue.
    this.downloadCount--;
    this._downloadFromQueue();
  });
  // TODO: Uncomment
  // .catch(() => {
  //   this.send(`${video.title} download process died, restarting download.`);
  //   this._startDownload(video);
  // });
  return `Downloading: \n${video.torrent.toString()}\nType "abort" to stop the download, or ` +
    `"status" to view progess. Is there anything else you need?`;
};

// optCount gives the number of VIDEOS in the queue to attempt downloading.
Swiper.prototype._downloadFromQueue = function(optCount) {
  optCount = optCount || 1;
  return this.dispatcher.readMemory()
  .then(memory => {
    let myQueue = memory.queued.filter(item => item.swiperId === this.id);
    let next = myQueue.shift();
    if (next) {
      // If a collection is popped, enough videos may be starting already.
      let popCount = next.isVideo() ? 1 : next.episodes.length;
      return this.dispatcher.updateMemory(this.id, 'queued', 'remove', next)
      .then(() => this.queueDownload(next, true))
      .then(() => {
        optCount = optCount - popCount;
        if (optCount > 0) {
          return this._downloadFromQueue(optCount);
        }
      });
    }
  });
};

Swiper.prototype.getCommands = function() {
  let output = "\n";
  for (let cmd in commands) {
    let cmdInfo = commands[cmd];
    if (!cmdInfo.isAlias) {
      let arg = cmdInfo.arg ? ' <content>' : '';
      let tab = ' '.repeat(23 - cmd.length - arg.length);
      output += `${cmd}${arg}${tab}${cmdInfo.desc}\n`;
    }
  }
  output += `\nWhere <content> is one of:\n` +
    `    <movie> (<year>)\n` +
    `    <series> (<year>) (season <num>) (episode <num>)\n`;
  output += `\nOn mismatch, try including the year.\n`;
  return output;
};

// Aborts the all current downloads if it was started in the last 60s.
Swiper.prototype.abort = function() {
  this.downloading.filter(video => video.swiperId === this.id).forEach(video => {
    this._popDownload(video);
    video.torrent.cancelDownload();
  });
  this.downloadCount = 0;
  // Download the next things in the queue.
  this._downloadFromQueue(settings.maxDownload);
};

Swiper.prototype.remove = function(input) {
  return this._identifyContentFromInput(input)
  .then(content => this._removeVideo(content));
};

Swiper.prototype._removeVideo = function(video, ignoreDownloading, hidePrompts) {
  let prompts = [];
  return this.dispatcher.readMemory()
  .then(memory => {
    // Note that video here may refer to an entire season or series.
    // Handle monitored and queued.
    for (let name in memory) {
      let queue = memory[name];
      let memIsCandidate = queue.find(item => item.containsAny(video));
      if (memIsCandidate) {
        prompts.push(this._confirmAction.bind(this, `Remove ${video.getTitle()} from ${name}?`,
          () => this.dispatcher.updateMemory(this.id, name, 'remove', video), hidePrompts));
      }
    }
    // Handle downloading.
    if (!ignoreDownloading) {
      let dwnCancel = this.downloading.find(item => item.equals(video));
      if (dwnCancel) {
        prompts.push(this._confirmAction.bind(this, `Abort downloading ${video.getTitle()}?`,
          () => this._cancelDownload(dwnCancel), hidePrompts));
      }
    }
    // Display the prompts one after the other.
    if (prompts.length > 0) {
      return prompts.reduce((acc, prompt) => {
        return acc.then(() => prompt());
      }, Promise.resolve());
    } else {
      return `${video.getTitle()} is not being monitored, queued or downloaded.`;
    }
  });
};

// Create a yes/no prompt with the option to override the prompt with an immediate 'yes'.
Swiper.prototype._confirmAction = function(promptText, callback, optYes) {
  return Promise.resolve(optYes ? { match: 'yes' } :
    this.awaitResponse(promptText, [resp.yes, resp.no]))
  .then(resp => {
    if (resp.match === 'yes') {
      return callback();
    }
  });
};

Swiper.prototype._cancelDownload = function(video) {
  video.torrent.cancelDownload();
  this._popDownload(video);
};

Swiper.prototype.search = function(input) {
  return isOnline().then(online => {
    if (!online) {
      return `I don't have a good connection right now. Try again in a few minutes.`;
    } else {
      return this._identifyContentFromInput(input)
      .then(content => content.isVideo() ? content : this._resolveSearchToEpisode(content))
      .then(video => this._searchVideo(video));
    }
  });
};

Swiper.prototype._searchVideo = function(video) {
  return util.torrentSearch(video, 2)
  .then(torrents => {
    if (torrents.length > 0) {
      return this._showTorrents(video, torrents);
    } else {
      return this.awaitResponse("I can't seem to find that right now. Would you like me to " +
        "keep an eye out for it?", [resp.yes, resp.no])
      .then(feedback => {
        if (feedback.match === 'yes') {
          this._monitorContent(video);
        }
        return "Ok";
      });
    }
  });
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
  return util.identifyContent(this.id, videoData)
  .then(content => {
    if (!content) {
      throw new InputError("I can't find anything with that title.");
    }
    return content;
  });
};

Swiper.prototype._resolveSearchToEpisode = function(collection) {
  let breadth = collection.getInitialType();
  let isSeries = breadth === 'series';
  return this.awaitResponse(`Give the ${isSeries ? "season and " : ""}episode ` +
    `number${isSeries ? "s" : ""} to search or type "download" to get the whole ${breadth}.`,
    [isSeries ? resp.seasonOrEpisode : resp.episode, resp.download]
  ).then(feedback => {
    if (feedback.match === 'download') {
      this.queueDownload(collection);
    } else if (isSeries) {
      let season = this._captureSeason(feedback.input);
      let episode = this._captureEpisode(feedback.input);
      if (!season || !collection.hasSeason(season)) {
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
        return collection.getEpisode(collection.getInitialSeason(), episode);
      }
    }
  });
};

Swiper.prototype._resolveSeasonToEpisode = function(season) {
  return this.awaitInput(`And the episode?`)
  .then(input => {
    let [episodeNum] = this._execCapture(input, /(\d+)/g, 1);
    episodeNum = episodeNum ? parseInt(episodeNum, 10) : null;
    return episodeNum || this._resolveSeasonToEpisode(season);
  })
  .then(episodeNum => {
    console.warn('s -> e', season, episodeNum, season.episodes.find(ep => ep.episodeNum === episodeNum));
    return season.episodes.find(ep => ep.episodeNum === episodeNum);
  });
};

// Parses a titleStr into constituent parts
Swiper.prototype._parseTitle = function(titleStr) {
  const titleFinder = /^([\w \'\"\-\:\,\&]+?)(?: (?:s(?:eason)? ?\d{1,2}.*)|(?:\d{4}\b.*))?$/gi;
  const yearFinder = /\b(\d{4})\b/gi;
  const epFinder = /\bs(?:eason)? ?(\d{1,2}) ?(?:ep?(?:isode)? ?(\d{1,2}))?\b/gi;

  let [title] = this._execCapture(titleStr, titleFinder, 1);
  if (!title) {
    return {};
  }
  let rem = this._removePrefix(titleStr, title);
  let [year] = this._execCapture(rem, yearFinder, 1);
  let [season, episode] = this._execCapture(rem, epFinder, 2);
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
  let activeTorrents = torrents.slice(startIndex, startIndex + n);
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
    `Type ${prev ? '"prev", ' : ""}${next ? '"next", ' : ""}or "download" followed ` +
    `by the number of the torrent you'd like.`, responses)
  .then(resp => {
    let numStr, num;
    switch (resp.match) {
      case 'prev':
        return this._showSomeTorrents(video, torrents, type, startIndex - n);
      case 'next':
        return this._showSomeTorrents(video, torrents, type, startIndex + n);
      case 'download':
        [numStr] = this._execCapture(resp.input, /\bd(?:ownload)?\s*(\d)/, 1);
        if (!numStr) {
          return this._showSomeTorrents(video, torrents, type, startIndex);
        }
        num = parseInt(numStr, 10);
        if (num > 0 && num <= torrents.length) {
          video.setTorrent(torrents[num - 1]);
          return this.queueDownload(video);
        } else {
          return this._showSomeTorrents(video, torrents, type, startIndex);
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
Swiper.prototype._removeFirst = function(arr, item, optEqualityFunc) {
  optEqualityFunc = optEqualityFunc || ((a, b) => a === b);
  let index = arr.findIndex(arrItem => optEqualityFunc(item, arrItem));
  if (index > -1) {
    arr.splice(index, 1);
  }
};

Swiper.prototype._popDownload = function(video) {
  this._removeFirst(this.downloading, video, (a, b) => a.containsAny(b));
};

Swiper.prototype._captureSeason = function(str) {
  const seasonFinder = /(?:[^a-z]|\b)s(?:eason)? ?(\d{1,2})(?:\D|\b)/gi;
  let [season] = this._execCapture(str, seasonFinder, 1);
  return parseInt(season, 10);
};

Swiper.prototype._captureEpisode = function(str) {
  const epFinder = /(?:[^a-z]|\b)ep?(?:isode)? ?(\d{1,2})(?:\D|\b)/gi;
  let [ep] = this._execCapture(str, epFinder, 1);
  return parseInt(ep, 10);
};

Swiper.prototype._execCapture = function(str, regex, numCaptures) {
  let match = regex.exec(str);
  if (!match) {
    return new Array(numCaptures);
  }
  return match.slice(1);
};

module.exports = Swiper;
