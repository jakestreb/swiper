'use strict';

require('dotenv').config();
const bodyParser = require("body-parser");
const request = require("request");
const express = require("express");
const app = express();

const Dispatcher = require('./components/Dispatcher.js');

const port = 8300;
const gatewayUrl = 'https://limitless-island-56260.herokuapp.com/swiper';

// For now, start the Dispatcher and listen on the command line.
let dispatcher = new Dispatcher();

process.stdin.resume();
process.stdin.setEncoding('utf8');
process.stdin.on('data', text => {
  // Resolve with the text minus /r/n
  dispatcher.acceptMessage('cli', text.trim(), message => { console.log(message); });
});

app.use(bodyParser.urlencoded({
  extended: true
}));
app.use(bodyParser.json());

app.get("/", (req, res) => {
  res.send('Running');
});

// Message from facebook.
app.post("/facebook", (req, res) => {
  dispatcher.acceptMessage(`fb:${req.body.id}`, req.body.message, message => {
    // Send a post request to the gateway with messages from swiper.
    request({
      url: gatewayUrl,
      method: 'POST',
      json: {
        message: message
      }
    }, (error, response) => {
      if (error) {
        console.log('Error sending messages: ', error);
      } else if (response.body.error) {
        console.log('Error: ', response.body.error);
      }
    });
  });
  res.end();
});

app.listen(port, () => {
  console.log(`Listening on port ${port}`);
});
