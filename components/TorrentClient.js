'use strict';

const WebTorrent = require('webtorrent');
const path = require('path');

const downloadDir = process.env.DOWNLOAD_ROOT || path.resolve(__dirname, '../downloads');

function TorrentClient(optErrorCallback) {
  this.client = null;
  this.errorCallback = optErrorCallback || (() => {});

  this.startClient();
}

TorrentClient.prototype.startClient = function() {
  this.client = new WebTorrent();
  this.client.once('error', () => {
    this.errorCallback();
    this.startClient();
  });
  // TODO: Add automatic seeding when a file is in the output folder.
};

TorrentClient.prototype.download = function(torrent) {
  return new Promise((resolve, reject) => {
    this.client.add(torrent.getMagnet(), { path: downloadDir }, tfile => {
      torrent.setProgressFile(tfile);
      tfile.once('done', () => {
        torrent.removeDownloadFiles();
        resolve(torrent);
      });
      tfile.once('error', () => {
        torrent.removeDownloadFiles();
        reject(torrent);
      });
    });
  });
};

TorrentClient.prototype.onError = function(callback) {
  this.errorCallback = callback;
};

module.exports = TorrentClient;
