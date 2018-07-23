'use strict';

require('dotenv').config();
const Promise = require('bluebird');
const rp = require("request-promise");
const rimraf = require("rimraf");
const rimrafAsync = Promise.promisify(rimraf);
const express = require("express");
const bodyParser = require("body-parser");
const readline = require('readline');

const app = express();

const Dispatcher = require('./components/Dispatcher.js');

const gatewayUrl = 'https://limitless-island-56260.herokuapp.com';
const port = process.env.PORT || 8250;
const maxLength = 640;
const terminal = readline.createInterface(process.stdin, process.stdout);

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

// Message from telegram
app.post("/telegram", (req, res) => {
  let id = req.body.id;
  let message = req.body.message;
  dispatcher.acceptMessage('telegram', id, message);
  res.send('ok');
});

app.listen(port, () => {
  console.log(`Listening on port ${port}`);
});

function sendEndpointMessage(id, text, destination) {
  if (!text || typeof text !== 'string') {
    console.error('Attempted to send non-String to endpoint:', text);
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
  return _sendEndpointMessages(id, chunks, destination);
}

// Send an array of text messages in sequence.
function _sendEndpointMessages(id, messageArray, destination) {
  return messageArray.reduce((acc, str) => {
    return acc.then(() => {
      return rp({
        uri: `${gatewayUrl}/swiper`,
        method: 'POST',
        json: {
          id: id,
          message: str,
          destination: destination
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
  facebook: (msg, id) => { sendEndpointMessage(id, msg, 'facebook'); },
  telegram: (msg, id) => { sendEndpointMessage(id, msg, 'telegram'); },
});

terminal.prompt();

terminal.on('line', (line) => {
  // Resolve with the text minus /r/n
  dispatcher.acceptMessage('cli', 'cli', line.trim());
  terminal.prompt();
});

terminal.on('close', () => {
  process.exit(0);
});
