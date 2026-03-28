const WebSocket = require('ws');
const wss = new WebSocket.Server({ port: 3000 });

console.log('WebSocket 服务已启动：ws://0.0.0.0:3000');

wss.on('connection', (ws) => {
  console.log('新客户端连接');

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data);
      // 心跳包直接忽略
      if (msg.type === 'ping') return;

      // 广播给所有已连接的客户端
      wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(data);
        }
      });
    } catch (e) {
      console.error('消息解析错误', e);
    }
  });

  ws.on('close', () => {
    console.log('客户端断开');
  });
});
