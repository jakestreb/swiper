'use strict';

function UserIO() {

}

// Returns a promise resolved with user input.
UserIO.prototype.awaitInput = function(message) {
  throw new Error('Not implemented.');
};

UserIO.prototype.send = function(message) {
  throw new Error('Not implemented.');
};

module.exports = UserIO;
