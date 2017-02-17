const UserIO = require('./UserIO.js');
const InputError = require('./InputError.js');

const resp = require('../util/responses.js');
const searchUtil = require('../util/searchUtil.js');

const COMMAND = {
  status:   'getStatus',
  progress: 'getStatus',
  check:    'check',
  monitor:  'monitor',
  watch:    'monitor',
  download: 'download',
  get:      'download',
  search:   'search',
  help:     'getCommands',
  commands: 'getCommands'
  // remove/edit
  // pause
};

const TYPES = ['tv', 'movie'];

function Swiper() {
  this.userIO = new UserIO();

  this.awaitCommand('Hello');
}

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
      "I'm not sure I understand. " + message, possible, callCount + 1)
  })
};

Swiper.prototype.awaitCommand = function(message) {
  return this.awaitInput(message)
  .then(input => this.parseCommand(input))
  .then(() => this.awaitCommand('Anything else?'))
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

Swiper.prototype.getStatus = function(input) {

};

Swiper.prototype.check = function(input) {

};

Swiper.prototype.monitor = function(input) {

};

Swiper.prototype.download = function(input) {

};

Swiper.prototype.getCommands = function(input) {

};

Swiper.prototype.search = function(input) {
  if (!input) {
    throw new InputError('Search term cannot be blank.')
  }
  let videoData = this._parseTitle(input);
  if (!videoData.title) {
    throw new InputError('Title cannot be blank.')
  }
  return searchUtil.identifyVideo(videoData)
  .then(video => {
    if (!video) {
      throw new InputError("I can't anything with that title.");
    }
    return Promise.resolve(video.getSearchTerm() ? video :
      this._resolveSearchToEpisode(video));
  })
  .then(singleVideo => searchUtil.torrentSeach(singleVideo.getSearchTerm()))
  .then(torrents => this._showTorrents(torrents));
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
  })
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

Swiper.prototype._showTorrents = function(torrents) {

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
