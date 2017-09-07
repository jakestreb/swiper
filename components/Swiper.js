'use strict';

const _ = require('underscore');
const Promise = require('bluebird');
const isOnline = require('is-online');
const InputError = require('./InputError.js');
const AbortError = require('./AbortError.js');
const resp = require('../util/responses.js');
const util = require('../util/util.js');
const settings = require('../util/settings.js');
const commands = require('../util/commands.js');

// TODO: Keep track of recently downloaded items, allow blacklisting and re-adding
//  to monitored.
// TODO: Automatically create memory.json file if not found.

// TODO: Figure out why there are so many listeners on client.add.
// TODO: Create readme (heroku address, how to check ips, etc).

function Swiper(dispatcher, id, fromSwiper) {
  this.dispatcher = dispatcher;
  this.id = id;

  this.torrentClient = dispatcher.torrentClient;
  this.downloading = dispatcher.downloading;

  this.downloadCount = 0;  // Should be kept in-sync with num downloads with this id.

  // This should be called by the dispatcher when there is a message for this swiper.
  this.toSwiper = () => {};
  this.fromSwiper = fromSwiper;

  // Immediately start downloading any items from the queue.
  this._downloadFromQueue(settings.maxDownloads);

  this.awaitCommand();
}

Swiper.prototype.send = function(message) {
  return this.fromSwiper(message, this.id);
};

// If given a message, sends it before waiting for input
Swiper.prototype.awaitInput = function(optMessage) {
  if (optMessage) {
    this.send(optMessage);
  }
  return new Promise((resolve, reject) => {
    this.toSwiper = resolve;
  })
  .then(input => {
    if (input.toLowerCase() === 'cancel') {
      throw new AbortError('Ok');
    } else {
      return input;
    }
  });
};

// possible is an array of possible entries from /util/responses.js
Swiper.prototype.awaitResponse = function(message, possible) {
  return this._awaitResponse(message, possible, 0);
};

Swiper.prototype._awaitResponse = function(message, possible, callCount) {
  let input;
  let failMessage = callCount > 0 ? message : `I don't understand\n\n${message}`;
  return this.awaitInput(message)
  .then(_input => {
    input = _input;
    let matched = null;
    possible.forEach(resp => {
      if (input.match(resp.regex)) {
        if (!matched) {
          matched = resp.value;
        } else {
          // Matched multiple responses at once, no good.
          throw new InputError();
        }
      }
    });
    if (!matched) {
      // If no response matches occur, allow short-circuiting with a new command.
      // This may still fail and trigger an InputError.
      return this.parseCommand(input, failMessage);
    }
    return {
      input: input,
      match: matched
    };
  })
  .catch(InputError, () => this._awaitResponse(failMessage, possible, callCount + 1));
};

Swiper.prototype.awaitCommand = function(message) {
  return this.awaitInput(message)
  .then(input => this.parseCommand(input))
  .then(doneStr => this.awaitCommand(doneStr))
  .catch(AbortError, e => this._handleError(e))
  .catch(InputError, e => this._handleError(e))
  .catch(e => {
    console.error(e);
    this.send('Something went wrong. What do you need?');
    return this.awaitCommand();
  });
};

Swiper.prototype._handleError = function(err) {
  this.send(err.message);
  return this.awaitCommand();
};

Swiper.prototype.parseCommand = function(input, optFailMessage) {
  // Calls the function mapped to the command in COMMANDS with the content
  // following the command.
  let [req, rem] = this._splitFirst(input);
  let cmd = commands[req.toLowerCase()];
  if (cmd && cmd.func) {
    return this[cmd.func](rem);
  } else {
    throw new InputError(optFailMessage || 'Type "help" to see what I can do');
  }
};

Swiper.prototype.getStatus = function() {
  let indentFunc = item => (item.swiperId === this.id ? '* ' : '- ');
  return this.dispatcher.readMemory()
  .then(memory => {
    let mstr = memory.monitored.map(item => {
      let nextAirs = item.type === 'collection' ? item.getNextAirs() : null;
      return indentFunc(item) + item.getDesc() + (nextAirs ? `  (${item.getNextAirs()})` : '');
    }).join("\n");
    let qstr = memory.queued.map(item => indentFunc(item) + item.getDesc()).join("\n");
    let dstr = this.downloading.reduce((acc, val) => {
      return acc + val.torrent.getDownloadInfo() + "\n";
    }, "");
    if (!mstr && !qstr && !dstr) {
      return "Nothing to report";
    }
    return (mstr ? `\nMonitoring:\n${mstr}\n` : '')
     + (qstr ? `\nQueued:\n${qstr}\n` : '')
     + (dstr ? `\nDownloading:\n${dstr}\n` : '');
  });
};

Swiper.prototype.monitor = function(input) {
  return this._identifyContentFromInput(input)
  .then(content => this._monitorContent(content));
};

Swiper.prototype._monitorContent = function(content) {
  return Promise.try(() => {
    if (!content.isVideo() && content.getInitialType() === 'series') {
      return this._resolveMonitorSeries(content);
    }
    return this.dispatcher.updateMemory(this.id, 'monitored', 'add', content);
  });
};

Swiper.prototype._resolveMonitorSeries = function(series) {
  return this.awaitResponse(`Use "series" to monitor the entire series or "new" to monitor new episodes only\n` +
    `otherwise specify the season or the season and episode`, [resp.series, resp.seasonOrEpisode, resp.new])
  .then(feedback => {
    if (feedback.match === 'series') {
      // Series
      return this.dispatcher.updateMemory(this.id, 'monitored', 'add', series);
    } else if (feedback.match === 'episode') {
      // Season or episode
      let season = this._captureSeason(feedback.input);
      let episode = this._captureEpisode(feedback.input);
      if (!season) {
        this.send(`I don't understand, you have to format it like "season 1" or "s1 e2"`);
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
      series.filterEpisodes(ep => ep.releaseDate && (ep.releaseDate > util.getMorning()));
      return this.dispatcher.updateMemory(this.id, 'monitored', 'add', series);
    }
  });
};

Swiper.prototype.check = function() {
  return this.dispatcher.searchMonitored()
  .then(() => 'Search in progress');
};

Swiper.prototype.download = function(input) {
  return isOnline().then(online => {
    if (!online) {
      return `I can't connect right now, try again in a minute`;
    } else {
      return this._identifyContentFromInput(input)
      .then(content => {
        return this.queueDownload(content);
      });
    }
  });
};

// This should always be called to download content. Adds a video to the queue
// or starts the download if max concurrent downloads is not met.
// If noPrompt is set, no prompts will be offered to the user.
// NOTE: This is usually called before the torrent is found, but may be called after it is selected.
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
  return Promise.try(() => queueItem ?
    this.dispatcher.updateMemory(this.id, 'queued', 'add', queueItem) : null)
  .then(() => {
    return Promise.all(ready.map(video => {
      if (video.torrent) {
        return this._startDownload(video, noPrompt || !content.isVideo());
      } else {
        return this._resolveVideoDownload(video, noPrompt || !content.isVideo())
        .then(success => {
          if (!content.isVideo() && !success) {
            // For collection download requests, monitor failures.
            if (!noPrompt) {
              this.send(`Failed to find ${video.getDesc()}, adding to monitored`);
            }
            this._monitorContent(video);
            this._downloadFromQueue();
          }
        });
      }
    }));
  });
};

// If noPrompt is set, no prompts will be offered to the user. Instead, returns
// a boolean success indicator.
// Sets the torrent for a video and downloads it.
Swiper.prototype._resolveVideoDownload = function(video, noPrompt) {
  noPrompt ? null : this.send(`Looking for ${video.getTitle()} downloads...`);
  return util.torrentSearch(video, 3)
  .then(torrents => {
    let best = this._autoPickTorrent(torrents, video.getType());
    if (torrents.length === 0) {
      return noPrompt ? false : this.awaitResponse(`I can't find any torrents. ` +
        `Should I try again? If not, you can also type "monitor" and I'll keep an eye out ` +
        `for ${video.getDesc()}`, [resp.monitor, resp.yes, resp.no])
        .then(resp => {
          return resp.match === 'yes' ? this._resolveVideoDownload(video) :
            this._monitorContent(video);
        });
    } else if (!best) {
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
        this._startDownload(video, noPrompt);
        return true;
      } else {
        return this._startDownload(video, noPrompt);
      }
    }
  });
};

Swiper.prototype._startDownload = function(video, noPrompt) {
  // Remove the video from monitoring and queueing, if it was in those places.
  if (!noPrompt) {
    this.send(`Downloading ${video.torrent.getName()}\n\n` +
      `Use "abort" to stop all downloads, or "status" for progess`);
  }
  this._removeContent(video, true, true);
  this.downloading.push(video);
  this.downloadCount++;
  this.torrentClient.download(video.torrent)
  .then(() => util.exportVideo(video))
  .then(() => {
    // Download and transfer complete, 'cancel' the download.
    this._cancelDownload(video);
    this.send(`${video.getDesc()} download complete!`);
    // Cancel download to destroy the tfile.
    // Try to download the next item in this swiper's queue.
    this.downloadCount--;
    this._downloadFromQueue();
  })
  .catch(() => {
    this.send(`${video.getDesc()} download process died, likely a bad torrent`);
    this._cancelDownload(video);
  });
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

Swiper.prototype.getCommands = function(optCommand) {
  if (optCommand) {
    return this._commandDetail(optCommand);
  }
  let output = 'Commands:\n' + Object.keys(commands).filter(cmd => !commands[cmd].isAlias).join(', ') +
    '\n\nType "help <command>" for details';
  return output;
};

Swiper.prototype._commandDetail = function(cmd) {
  let cmdInfo = commands[cmd.toLowerCase()];
  if (!cmdInfo || cmdInfo.isAlias) {
    return `${cmd} isn't something I respond to`;
  } else {
    let arg = cmdInfo.arg ? ' ' + cmdInfo.arg : '';
    let out = `${cmd}${arg}:  ${cmdInfo.desc}\n\n`;
    if (cmdInfo.arg === '<content>') {
      return out + `Where <content> is of the form:\n` +
        `    (movie/tv) <title> (<year>) (season <num>) (episode <num>)\n` +
        `Examples:\n` +
        `    game of thrones\n` +
        `    tv game of thrones season 2\n` +
        `    game of thrones 2011 s02e05\n`;
    }
    return out;
  }
};

// Aborts the all current downloads.
Swiper.prototype.abort = function() {
  this.downloading.filter(video => video.swiperId === this.id).forEach(video => {
    this._popDownload(video);
    video.torrent.cancelDownload();
  });
  this.downloadCount = 0;
  // Download the next things in the queue.
  this._downloadFromQueue(settings.maxDownload);
  return 'Aborted current downloads';
};

Swiper.prototype.remove = function(input) {
  return this._identifyContentFromInput(input)
  .then(content => this._removeContent(content));
};

Swiper.prototype._removeContent = function(content, ignoreDownloading, hidePrompts) {
  let prompts = [];
  return this.dispatcher.readMemory()
  .then(memory => {
    // The swipers are not content.
    memory = _.omit(memory, 'swipers');
    // Note that video here may refer to an entire season or series.
    // Handle monitored and queued.
    for (let name in memory) {
      let queue = memory[name];
      let memIsCandidate = queue.find(item => item.containsAny(content));
      if (memIsCandidate) {
        prompts.push(this._confirmAction.bind(this, `Remove ${content.getTitle()} from ${name}?`,
          () => this.dispatcher.updateMemory(this.id, name, 'remove', content), hidePrompts));
      }
    }
    // Handle downloading.
    if (!ignoreDownloading) {
      this.downloading.forEach(video => {
        if (content.containsAny(video)) {
          prompts.push(this._confirmAction.bind(this, `Abort downloading ${video.getDesc()}?`,
            () => this._cancelDownload(video), hidePrompts));
        }
      });
    }
    // Display the prompts one after the other.
    if (prompts.length > 0) {
      return prompts.reduce((acc, prompt) => {
        return acc.then(() => prompt());
      }, Promise.resolve())
      .then(() => 'Got it');
    } else {
      return `${content.getDesc()} is not being monitored, queued or downloaded`;
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
  return Promise.try(() => isOnline()).then(online => {
    if (!online) {
      return `I can't connect right now, try again in a minute`;
    } else {
      return this._identifyContentFromInput(input)
      .then(content => {
        if (content.isVideo()) {
          return this._searchVideo(content);
        } else {
          return this._resolveSearchToEpisode(content)
          .then(video => this._searchVideo(video));
        }
      });
    }
  });
};

Swiper.prototype._searchVideo = function(video) {
  return util.torrentSearch(video, 3)
  .then(torrents => {
    if (torrents.length > 0) {
      return this._showTorrents(video, torrents);
    } else {
      return this.awaitResponse(`I didn't find anything...try again?\n` +
        `Or type "monitor" and I'll keep an eye out for ${video.getDesc()}`,
        [resp.monitor, resp.yes, resp.no])
      .then(feedback => {
        if (feedback.match === 'yes') {
          return this._searchVideo(video);
        } else if (feedback.match === 'monitor') {
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
    throw new InputError("You didn't specify anything");
  }
  let videoData = this._parseTitle(input);
  if (!videoData.title) {
    throw new InputError("I don't understand what the title is");
  }
  return util.identifyContent(this.id, videoData)
  .then(content => {
    return content;
  })
  .catch(err => {
    // Rethrow identifyContent errors as input errors.
    throw new InputError(err.message);
  });
};

Swiper.prototype._resolveSearchToEpisode = function(collection) {
  let breadth = collection.getInitialType();
  let isSeries = breadth === 'series';
  return this.awaitResponse(`Either give the ${isSeries ? "season and " : ""}episode ` +
    `number${isSeries ? "s" : ""} to search or "download" to get the whole ${breadth}`,
    [isSeries ? resp.seasonOrEpisode : resp.number, resp.download]
  ).then(feedback => {
    if (feedback.match === 'download') {
      this.queueDownload(collection);
    } else if (isSeries) {
      let season = this._captureSeason(feedback.input);
      let episode = this._captureEpisode(feedback.input);
      if (!season || !collection.hasSeason(season)) {
        this.send(`I can't find that season of ${collection.getTitle()}`);
        return this._resolveSearchToEpisode(collection);
      } else if (!episode) {
        collection.filterToSeason(season);
        return this._resolveSeasonToEpisode(collection);
      } else {
        let pickedEp = collection.getEpisode(season, episode);
        if (!pickedEp) {
          this.send(`I can't find that episode`);
        }
        return pickedEp || this._resolveSearchToEpisode(collection);
      }
    } else {
      let [ episode ] = this._execCapture(feedback.input, /([0-9]+)/gi, 1);
      episode = parseInt(episode, 10);
      if (!episode) {
        this.send(`I don't understand`);
        return this._resolveSeasonToEpisode(collection);
      } else {
        let pickedEp = collection.getEpisode(collection.getInitialSeason(), episode);
        if (!pickedEp) {
          this.send(`I can't find that episode`);
        }
        return pickedEp || this._resolveSearchToEpisode(collection);
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
  .then(episodeNum => season.episodes.find(ep => ep.episodeNum === episodeNum));
};

// Parses a titleStr into constituent parts
Swiper.prototype._parseTitle = function(titleStr) {
  const titleFinder = /^([\w \'\"\-\:\,\&]+?)(?: (?:s(?:eason)? ?\d{1,2}.*)|(?:\d{4}\b.*))?$/gi;
  const yearFinder = /\b(\d{4})\b/gi;
  const epFinder = /\bs(?:eason)? ?(\d{1,2}) ?(?:ep?(?:isode)? ?(\d{1,2}))?\b/gi;

  let splitStr = titleStr.split(' ');
  let keyword = splitStr[0].toLowerCase();
  let type = null;
  if (keyword === 'tv' || keyword === 'movie') {
    // If the type was included, set it and remove it from the titleStr
    type = keyword === 'tv' ? 'series' : 'movie';
    titleStr = splitStr.slice(1).join(' ');
  }
  let [title] = this._execCapture(titleStr, titleFinder, 1);
  if (!title) {
    return {};
  }
  let rem = this._removePrefix(titleStr, title);
  let [year] = this._execCapture(rem, yearFinder, 1);
  let [season, episode] = this._execCapture(rem, epFinder, 2);
  if (season || episode) {
    // Assume it's a series if season or episode is given.
    type = 'series';
  }
  return {
    title: title,
    type: type,
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
  let responses = [resp.number], prev = false, next = false;
  if (startIndex > 0) {
    prev = true;
    responses.push(resp.prev);
  }
  if (startIndex + n < torrents.length) {
    next = true;
    responses.push(resp.next);
  }
  let prevNext = '';
  if (next && !prev) {
    prevNext = ' or use "next" to see more options';
  } else if (prev && !next) {
    prevNext = ' or use "prev" to see more options';
  } else if (prev && next) {
    prevNext = ' or use "prev" or "next" to see more options';
  }
  return this.awaitResponse(
    `${activeTorrents.reduce((acc, t, i) => acc + `${startIndex + i + 1} -\n` + t.toString(), "")}` +
    `Give the number to download${prevNext}`, responses
  )
  .then(resp => {
    let numStr, num;
    switch (resp.match) {
      case 'prev':
        return this._showSomeTorrents(video, torrents, type, startIndex - n);
      case 'next':
        return this._showSomeTorrents(video, torrents, type, startIndex + n);
      case 'number':
        [numStr] = this._execCapture(resp.input, /([0-9]+)/gi, 1);
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
  torrents.slice(0, type === 'movie' ? 8 : 12).forEach(torrent => {
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

Swiper.prototype._popDownload = function(video) {
  util.removeFirst(this.downloading, video, (a, b) => a.containsAny(b));
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
