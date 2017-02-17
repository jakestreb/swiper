const Promise = require('bluebird');
const util = require('util');

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
      console.log(message);
    }
    process.stdin.on('data', text => {
      if (text === 'quit\r\n' || text === 'exit\r\n') {
        process.exit();
      } else {
        // Resolve with the text minus /r/n
        resolve(text.slice(0, -2));
      }
    });
  });
};

module.exports = UserIO;
