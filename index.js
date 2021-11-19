const visca = require('./visca_over_ip')
visca.init('192.168.3.113')
visca.ptDrive('stop')

const readline = require('readline');
readline.emitKeypressEvents(process.stdin);
process.stdin.setRawMode(true);

process.stdin.on('keypress', (str, key) => {
  // console.log(key)
  if (key && key.ctrl && key.name == 'c')
    process.exit();

  switch (key.name) {
    case 'left': 
      visca.ptDrive('left')
      break;
    case 'up':
      visca.ptDrive('up')
      break;
    case 'right':
      visca.ptDrive('right')
      break;
    case 'down':
      visca.ptDrive('down')
      break;
    case 'space': // sapce
      visca.ptDrive('stop')
      break
  }

})
