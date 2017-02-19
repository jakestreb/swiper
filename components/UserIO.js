'use strict';

const Promise = require('bluebird');

function UserIO() {
  // Currently, creating a UserIO object means monitoring stdin.
  this.startCLI();
}

UserIO.prototype.startCLI = function() {
  process.stdin.resume();
  process.stdin.setEncoding('utf8');
};

UserIO.prototype.awaitInput = function(message) {
  return new Promise((resolve, reject) => {
    if (message) {
      this.send(message);
    }
    process.stdin.on('data', text => {
      if (text === 'quit\r\n' || text === 'exit\r\n') {
        process.exit();
      } else {
        // Resolve with the text minus /r/n
        resolve(text.trim());
      }
    });
  });
};

UserIO.prototype.send = function(message) {
  console.log(message);
};

module.exports = UserIO;
