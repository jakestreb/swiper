'use strict';

require('dotenv').config();
const express = require("express");

const app = express();

const port = process.env.TEST_PORT || 8250;

// Helpful guide to exposing local port to the internet:
// https://stackoverflow.com/questions/822902/access-xampp-localhost-from-internet

app.get("/", (req, res) => {
  res.send('Running');
});

app.listen(port, () => {
  console.log(`Listening on port ${port}`);
});
