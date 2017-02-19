'use strict';

const WebTorrent = require('webtorrent');

function TorrentClient(optErrorCallback) {
  this.client = null;
  this.errorCallback = optErrorCallback;

  this.startClient();
}

TorrentClient.prototype.startClient = function() {
  this.client = new WebTorrent();
  this.client.on('error', () => {
    if (this.errorCallback) {
      this.errorCallback();
    }
    this.startClient();
  });
  // TODO: Add automatic seeding when a file is in the output folder.
};

TorrentClient.prototype.download = function(torrent) {
  let client = new WebTorrent();
  return new Promise((resolve, reject) => {
    client.add(torrent.getMagnet(), tfile => {
      torrent.setProgressFile(tfile);
      tfile.on('done', () => { resolve(torrent); });
      tfile.on('error', () => { reject(torrent); });
    });
  });
};

TorrentClient.prototype.onError = function(callback) {
  this.errorCallback = callback;
};

module.exports = TorrentClient;
