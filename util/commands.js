
module.exports = {
  download: {
    func: 'download',
    arg: '<content>',
    isAlias: false,
    aliases: ['get'],
    desc: "Downloads the best torrent for a show or movie."
  },
  get: {
    func: 'download',
    isAlias: true
  },
  search: {
    func: 'search',
    arg: '<content>',
    isAlias: false,
    desc: "Returns a list of torrents for a show or movie."
  },
  monitor: {
    func: 'monitor',
    arg: '<content>',
    isAlias: false,
    aliases: ['watch'],
    desc: "Adds an item to check on intermittently until it's found."
  },
  watch: {
    func: 'monitor',
    isAlias: true
  },
  check: {
    func: 'check',
    isAlias: false,
    desc: "Perform search for monitored items now."
  },
  remove: {
    func: 'remove',
    arg: '<content>',
    isAlias: false,
    aliases: ['delete'],
    desc: "Removes the given item from monitored, queued, or downloading."
  },
  abort: {
    func: 'abort',
    isAlias: false,
    desc: "Aborts any downloads started by you."
  },
  cancel: {
    isAlias: false,
    desc: "Ends the current conversation."
  },
  status: {
    func: 'getStatus',
    isAlias: false,
    aliases: ['progress', 'state'],
    desc: 'Shows items being monitored, queued, and downloaded.'
  },
  progress: {
    func: 'getStatus',
    isAlias: true
  },
  state: {
    func: 'getStatus',
    isAlias: true
  },
  help: {
    func: 'getCommands',
    isAlias: false,
    arg: '(<command>)',
    aliases: ['commands'],
    desc: "Returns the list of commands, or describes the given command."
  },
  commands: {
    func: 'getCommands',
    isAlias: true
  },
};
