'use strict';

function AbortError(message) {
  this.message = message;
  this.name = "AbortError";
}
AbortError.prototype = Object.create(Error.prototype);
AbortError.prototype.constructor = AbortError;

module.exports = AbortError;
