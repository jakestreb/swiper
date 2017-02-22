
module.exports = {
  download: {
    func: 'download',
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
    isAlias: false,
    desc: "Returns a list of torrents for a show or movie."
  },
  monitor: {
    func: 'monitor',
    isAlias: false,
    aliases: ['watch'],
    desc: "Adds an item to check on intermittently until it's found.\n"
  },
  watch: {
    func: 'monitor',
    isAlias: true
  },
  remove: {
    func: 'remove',
    isAlias: false,
    aliases: ['delete'],
    desc: "Removes the given item from monitored, queued, or downloading."
  },
  abort: {
    func: 'abort',
    isAlias: false,
    desc: "Aborts the last download if started in the last minute."
  },
  cancel: {
    isAlias: false,
    desc: "Ends the current conversation.\n"
  },
  pause: {
    func: 'pause',
    isAlias: false,
    desc: "Pauses peer collection for the item download entered."
  },
  resume: {
    func: 'resume',
    isAlias: false,
    desc: "Resumes peer collection for the item download entered.\n"
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
    aliases: ['commands'],
    desc: "Returns the list of commands."
  },
  commands: {
    func: 'getCommands',
    isAlias: true
  },
  // TODO: there should be a way of manually calling for search of monitored content
  // TODO: remove pause/resume?
};
