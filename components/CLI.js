'use strict';

const Promise = require('bluebird');

function CLI() {
  this.resolver = () => {};

  process.stdin.resume();
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', text => {
    // Resolve with the text minus /r/n
    this.resolver(text.trim());
  });
}

CLI.prototype.awaitInput = function(message) {
  if (message) {
    this.send(message);
  }
  return new Promise((resolve, reject) => {
    this.resolver = resolve;
  });
};

CLI.prototype.send = function(message) {
  console.log(message);
};

module.exports = CLI;
