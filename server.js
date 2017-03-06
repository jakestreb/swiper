'use strict';

require('dotenv').config();
const express = require("express");
const app = express();

const Dispatcher = require('./components/Dispatcher.js');

// For now, start the Dispatcher and create a single command line instance.
let dispatcher = new Dispatcher();
dispatcher.addCLISwiper();

app.get("/", (req, res, next) => {

});

app.post("/", (req, res, next) => {
  // TODO
});
