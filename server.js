'use strict';

const express = require("express");
const app = express();

const Dispatcher = require('./components/Dispatcher.js');

// Right now, starting Dispatcher means creating a single instance which responds to input
// on the command line.
let dispatcher = new Dispatcher();

app.get("/", (req, res, next) => {

});

app.post("/", (req, res, next) => {
  // TODO
});
