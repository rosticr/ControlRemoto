var Service = require('node-windows').Service;
var svc = new Service({
  name:'ControlRemotoServer',
  description: 'Servidor de Señalización WebRTC',
  script: 'C:\\ControlRemoto\\signaling-server\\server.js'
});
svc.on('install', function(){
  svc.start();
});
svc.install();
