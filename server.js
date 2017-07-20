'use strict';

require('dotenv').config();
const Promise = require('bluebird');
const rp = require("request-promise");
const rimraf = require("rimraf");
const rimrafAsync = Promise.promisify(rimraf);
const express = require("express");
const bodyParser = require("body-parser");

const app = express();

const Dispatcher = require('./components/Dispatcher.js');

const gatewayUrl = 'https://limitless-island-56260.herokuapp.com';
const port = process.env.PORT || 8250;
const maxLength = 640;

// Delete everything in downloads folder.
rimrafAsync('./downloads/*').then(err => {
  if (err) {
    console.warn(err);
  }
});

app.use(bodyParser.urlencoded({
  extended: true
}));
app.use(bodyParser.json());

app.get("/", (req, res) => {
  res.send('Running');
});

// Message from facebook
app.post("/facebook", (req, res) => {
  let id = req.body.id;
  let message = req.body.message;
  dispatcher.acceptMessage('facebook', id, message);
  res.send('ok');
});

app.listen(port, () => {
  console.log(`Listening on port ${port}`);
});

function sendFacebookMessage(id, text) {
  if (!text || typeof text !== 'string') {
    console.error('Attempted to send non-String to Facebook:', text);
    return;
  }
  // console.log(`Sending message to ${id}: ${text}`);
  let chunks = text.split('\n\n');
  // Split the text up if it's too long for Facebook.
  let tooLong = true;
  while (tooLong) {
    tooLong = false;
    let newArr = [];
    chunks.forEach(str => {
      if (str.length > maxLength) {
        // An element is too long, gotta loop through again.
        tooLong = true;
        let nSplit = str.split('\n');
        if (nSplit.length > 1) {
          // This could work, try it. But clean up the split pieces first.
          nSplit = nSplit.map(str => str.trim()).filter(str => str.length > 0);
          newArr = newArr.concat(nSplit);
        } else {
          // This isn't working, just cut it in half.
          let halfLen = str.length / 2;
          newArr.push(str.substring(0, halfLen));
          newArr.push(str.substring(halfLen));
        }
      } else {
        newArr.push(str);
      }
    });
    chunks = newArr;
  }
  // Send all the chunks
  return _sendFacebookMessages(id, chunks);
}

// Send an array of text messages in sequence.
function _sendFacebookMessages(id, messageArray) {
  return messageArray.reduce((acc, str) => {
    return acc.then(() => {
      return rp({
        uri: `${gatewayUrl}/swiper`,
        method: 'POST',
        json: {
          id: id,
          message: str
        }
      });
    })
    .catch(err => {
      console.warn(err);
    });
  }, Promise.resolve());
}

// Start the Dispatcher.
let dispatcher = new Dispatcher({
  cli: (msg, id) => { console.log(msg); },
  facebook: (msg, id) => { sendFacebookMessage(id, msg); }
});

// Initialize command line Swiper.
process.stdin.resume();
process.stdin.setEncoding('utf8');
process.stdin.on('data', text => {
  // Resolve with the text minus /r/n
  dispatcher.acceptMessage('cli', 'cli', text.trim());
});
