
const express = require("express");

const app = express();
const Swiper = require('./components/Swiper.js');

// Right now, starting Swiper means creating a single instance which responds to input
// on the command line.
new Swiper();

app.get("/", (req, res, next) => {

});

app.post("/response", (req, res, next) => {
  // TODO
});
