
function InputError(message) {
    this.message = message;
    this.name = "InputError";
}
InputError.prototype = Object.create(Error.prototype);
InputError.prototype.constructor = InputError;

module.exports = InputError;
