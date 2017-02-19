'use strict';

const UserIO = require('./UserIO.js');
const TorrentClient = require('./TorrentClient.js');
const InputError = require('./InputError.js');

const resp = require('../util/responses.js');
const util = require('../util/util.js');
const settings = require('../util/settings.js');

const COMMAND = {
  status:   'getStatus',
  progress: 'getStatus',
  monitor:  'monitor',
  watch:    'monitor',
  download: 'download',
  get:      'download',
  search:   'search',
  help:     'getCommands',
  commands: 'getCommands'
  // abort (removes last download if it is active)
  // remove/edit
  // pause
  // there should be a way of manually calling for search of monitored content
};

function Swiper() {
  this.userIO = new UserIO();
  this.torrentClient = new TorrentClient(() => {
    this.send(`The torrent client just died. I'm restarting all the downloads ` +
      `that were in progress.`);
    // TODO: Restart all the downloads that were in progess.
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
    console.warn(e.message);
    return this.awaitCommand();
  });
};

Swiper.prototype.parseCommand = function(input) {
  // Calls the function mapped to the command in COMMANDS with the content
  // following the command.
  let [req, rem] = this._splitFirst(input);
  let func = COMMAND[req];
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
  return this._identifyVideoFromInput(input)
  .then(video => {

  });
};

Swiper.prototype.download = function(input) {
  let foundVideo = null;
  return this._identifyVideoFromInput(input)
  .then(video => {
    let searchTerm = video.getSearchTerm();
    foundVideo = video;
    if (!searchTerm) {
      // TODO: Allow downloading a season or series.
      throw new Error('Not yet implemented');
    } else {
      this.send(`Searching for ${video.getSearchTerm()}...`);
      return util.torrentSearch(searchTerm);
    }
  })
  .then(torrents => {
    let best = this._autoPickTorrent(torrents, foundVideo.getType());
    if (!best) {
      return this._resolveNoEligibleTorrents(foundVideo);
    } else {
      return this._startDownload(best);
    }
  });
};

Swiper.prototype._startDownload = function(torrent) {
  this.lastDownload = torrent;
  this.downloading.push(torrent);
  this.torrentClient.download(torrent)
  .then(() => {
    let index = this.downloading.indexOf(torrent);
    if (index > -1) {
      this.downloading.splice(index, 1);
    }
    this.completed.push(torrent);
    this.send(`${torrent.name} download complete!`);
  })
  .catch(() => {
    this.send(`${torrent.name} download process died, restarting download.`);
    this._startDownload(torrent);
  });
  return `Downloading: \n${torrent.toString()}\nType "abort" to stop the download, or ` +
    `"status" to view progess. Is there anything else you need?`;
};

Swiper.prototype._resolveNoEligibleTorrents = function(video) {
  return this.awaitResponse(`I can't find a good torrent. If you'd like to see the ` +
    `results for yourself, type search, otherwise type monitor and I'll keep an eye ` +
    `out for ${video.getTitle()}`, [resp.search, resp.monitor])
  .then(resp => {
    if (resp.match === 'search') {
      return this._searchSingleVideo(video);
    } else {
      // TODO: Monitor video
    }
  });
};

Swiper.prototype.getCommands = function(input) {

};

Swiper.prototype.search = function(input) {
  this._identifyVideoFromInput(input)
  .then(video => {
    return Promise.resolve(video.getSearchTerm() ? video :
      this._resolveSearchToEpisode(video));
  })
  .then(singleVideo => this._searchSingleVideo(singleVideo));
};

Swiper.prototype._searchSingleVideo = function(video) {
  return util.torrentSearch(video.getSearchTerm())
  .then(torrents => this._showTorrents(torrents));
};

// Helper for handling initial input to search and download.
Swiper.prototype._identifyVideoFromInput = function(input) {
  if (!input) {
    throw new InputError("You didn't specify anything.");
  }
  let videoData = this._parseTitle(input);
  if (!videoData.title) {
    throw new InputError("I don't understand what the title is.");
  }
  return util.identifyVideo(videoData)
  .then(video => {
    if (!video) {
      throw new InputError("I can't find anything with that title.");
    }
    return video;
  });
};

Swiper.prototype._resolveSearchToEpisode = function(tv) {
  let isSeries = tv.isSeries();
  let breadth = isSeries ? 'series' : 'season';
  return this.awaitResponse(`I can't search for a ${breadth} all at once. Specify the ` +
    `${isSeries ? "season and " : ""}episode to continue searching or type download ` +
    `and I'll grab the whole ${breadth}.`,
    [isSeries ? resp.seasonOrEpisode : resp.episode, resp.download]
  ).then(feedback => {
    const seasonFinder = /\bs?(?:eason)? ?(\d{1,2})\b/gi;
    if (feedback.match === 'download') {
      // TODO
    } else if (isSeries) {
      let [ season ] = this._execCapture(feedback.input, seasonFinder, 1);
      let episode = this._captureEpisode(feedback.input);
      if (!season) {
        return this._resolveSearchToEpisode(tv);
      } else if (!episode) {
        tv.setSeason(season);
        return this._resolveSeasonToEpisode(tv);
      } else {
        tv.setSeasonEpisode(season, episode);
        return tv;
      }
    } else {
      let episode = this._captureEpisode(feedback.input);
      if (!episode) {
        return this._resolveSeasonToEpisode(tv);
      } else {
        tv.setEpisode(episode);
        return tv;
      }
    }
  });
};

Swiper.prototype._resolveSeasonToEpisode = function(tv) {
  return this.awaitInput(`And the episode?`)
  .then(input => {
    let episode = this._captureEpisode(input);
    return episode || this._resolveSeasonToEpisode(tv);
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

Swiper.prototype._showTorrents = function(torrents, type) {
  return this._showSomeTorrents(torrents, type, 0);
};

Swiper.prototype._showSomeTorrents = function(torrents, type, startIndex) {
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
          return this._startDownload(torrents[num - 1]);
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
