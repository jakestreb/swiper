const forever = require('forever-monitor');

// If the process fails within 3s, do not attempt to restart
const child = new (forever.Monitor)('server.js', {
  minUptime: 3000
});

child.on('exit', function () {
  console.log('Forever detected script has exited');
});

child.on('restart', function() {
  console.error('Forever restarting script for ' + child.times + ' time');
  process.stdin.pipe(child.child.stdin);
});

child.on('exit:code', function(code) {
  console.error('Forever detected script exited with code ' + code);
});

child.start();
process.stdin.pipe(child.child.stdin);
