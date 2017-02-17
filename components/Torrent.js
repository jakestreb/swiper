
function Torrent(stats) {
  this.name = stats.name;
  this.size = stats.size;
  this.seeders = stats.seeders;
  this.leechers = stats.leechers;
  this.uploadDate = stats.uploadDate;
  this.magnetLink = stats.magnetLink;
}

Torrent.prototype.getMagnet = function() {
  return this.magnetLink;
};

Torrent.prototype.isEligible = function() {
  // TODO
};

Torrent.prototype.toString = function() {
  return this.name + "\n" +
    " | Size: " + this.size + "\n" +
    " | SE: " + this.seeders + "\n" +
    " | LE: " + this.leechers + "\n" +
    " | Uploaded: " + this.uploadDate + "\n";
};

module.exports = Torrent;
