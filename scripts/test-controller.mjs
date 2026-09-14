import os from 'node:os';

const nets = os.networkInterfaces();
for (const name of Object.keys(nets)) {
  for (const net of nets[name]) {
    if (net.family === 'IPv4') {
      console.log(`${name}: ${net.address}`);
    }
  }
}
