
module.exports = {
  status: {
    func: 'getStatus',
    isAlias: false,
    aliases: ['progress', 'state'],
    desc: 'Shows the full state including items being monitored, queued, ' +
      'downloaded and completed.'
  },
  progress: {
    func: 'getStatus',
    isAlias: true
  },
  state: {
    func: 'getStatus',
    isAlias: true
  },
  monitor: {
    func: 'monitor',
    isAlias: false,
    aliases: ['watch'],
    desc: "Adds a movie or show to be intermittently searched automatically until it's found."
  },
  watch: {
    func: 'monitor',
    isAlias: true
  },
  download: {
    func: 'download',
    isAlias: false,
    aliases: ['get'],
    desc: "Downloads what I think is the best torrent for a show or movie."
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
  abort: {
    func: 'abort',
    isAlias: false,
    desc: "Aborts the most recent download if it was started in the last 60 seconds."
  },
  remove: {
    func: 'remove',
    isAlias: false,
    aliases: ['delete'],
    desc: "Removes the given show or movie from monitored, queued, or downloading."
  },
  pause: {
    func: 'pause',
    isAlias: false,
    desc: "Pauses peer collection for the downloading show or movie entered."
  },
  resume: {
    func: 'resume',
    isAlias: false,
    desc: "Resumes peer collection for the downloading show or movie entered."
  }
  // TODO: there should be a way of manually calling for search of monitored content
};
