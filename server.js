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

// Get request from facebook to establish endpoint
app.get("/facebook", (req, res) => {
  if (req.query['hub.mode'] === "subscribe" && req.query['hub.challenge']) {
    if (req.query['hub.verify_token'] !== process.env.VERIFY_TOKEN) {
      res.send("Verification token mismatch");
    }
    res.send(req.query['hub.challenge']);
  }
  res.send('Unrecognized request');
});

// Message from facebook
app.post("/facebook", (req, res) => {
  let data = req.body;
  if (data.object === 'page') {
    data.entry.forEach(entry => {
      entry.messaging.forEach(messageEvent => {
        if (messageEvent.message) {
          // Message
          let senderId = messageEvent.sender.id;
          // let recipientId = messageEvent.recipient.id;
          let text = messageEvent.message.text;
          dispatcher.acceptMessage('facebook', senderId, text);
        } else if (messageEvent.delivery) {
          // Delivery confirmation
        } else if (messageEvent.optin) {
          // Opt in confirmation
        } else if (messageEvent.postback) {
          // User clicked postback button in earlier message
        }
      });
    });
  }
  res.send('ok');
});

app.listen(port, () => {
  console.log(`Listening on port ${port}`);
});

function sendFacebookMessage(id, text) {
  console.log(`Sending message to ${id}: ${text}`);
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
        url: 'https://graph.facebook.com/v2.6/me/messages',
        qs: {
          access_token: process.env.PAGE_ACCESS_TOKEN
        },
        method: 'POST',
        json: {
          recipient: {
            id: id
          },
          message: {
            text: str
          },
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
