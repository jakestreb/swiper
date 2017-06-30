'use strict';

require('dotenv').config();
const express = require("express");

const app = express();

const port = process.env.TEST_PORT || 8250;

app.get("/", (req, res) => {
  res.send('Running');
});

app.listen(port, () => {
  console.log(`Listening on port ${port}`);
});
