'use strict';

require('dotenv').config();
const Promise = require('bluebird');
const rp = require("request-promise");
const rimraf = require("rimraf");
const rimrafAsync = Promise.promisify(rimraf);

const Dispatcher = require('./components/Dispatcher.js');

const gatewayUrl = 'https://limitless-island-56260.herokuapp.com/swiper';
const reqTimeout = 20000;

// Delete everything in downloads folder.
rimrafAsync('./downloads/*').then(err => {
  if (err) {
    console.warn(err);
  }
});

function longPoll() {
  return gatewayGet()
  .then(resp => {
    console.log('Received messages from the gateway: ' + resp);
    let data = JSON.parse(resp);
    if (data.messages) {
      data.messages.forEach(item => {
        let message = item.message;
        let id = item.id;
        // Send the message to the dispatcher, which will route it to the correct Swiper.
        // Respond by POSTing to the gateway.
        dispatcher.acceptMessage('facebook', id, message);
      });
    }
  })
  .catch(err => {
    // console.warn('err', err);
  })
  .then(() => longPoll());
}


// GET request to gateway.
function gatewayGet() {
  console.log('Requesting messages from the gateway: ' + new Date());
  return rp({
    url: gatewayUrl,
    method: 'GET',
    timeout: reqTimeout
  });
}

// POST request to gateway.
function gatewayPost(json) {
  console.log('Posting messages to gateway: ' + new Date());
  return rp({
    url: gatewayUrl,
    method: 'POST',
    json: json
  });
}

// For now, start the Dispatcher and listen on the command line.
let dispatcher = new Dispatcher({
  cli: (msg, id) => { console.log(msg); },
  facebook: (msg, id) => { gatewayPost({ id: id, message: msg }); }
});

// Initialize command line Swiper.
process.stdin.resume();
process.stdin.setEncoding('utf8');
process.stdin.on('data', text => {
  // Resolve with the text minus /r/n
  dispatcher.acceptMessage('cli', 'cli', text.trim());
});

// Start long polling the gateway for Facebook messages.
longPoll();
