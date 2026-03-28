const WebSocket = require('ws');

// 监听所有网络接口，端口 3000
const wss = new WebSocket.Server({ port: 3000, host: '0.0.0.0' });
console.log('WebSocket 服务已启动：ws://0.0.0.0:3000');

// 存储所有房间：roomId -> { players: [playerId], clients: [WebSocket] }
const rooms = {};

// 辅助函数：向房间内所有客户端广播消息
function broadcast(roomId, message) {
  const room = rooms[roomId];
  if (!room) return;
  const data = JSON.stringify(message);
  room.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  });
}

wss.on('connection', (ws) => {
  console.log('新客户端连接');
  ws.roomId = null;   // 当前所在房间
  ws.playerId = null; // 玩家标识

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data);
      const { type, roomId, playerId } = msg;

      // 1. 处理心跳包
      if (type === 'ping') {
        ws.send(JSON.stringify({ type: 'pong' }));
        return;
      }

      // 2. 创建房间
      if (type === 'create') {
        if (!rooms[roomId]) {
          rooms[roomId] = { players: [], clients: [] };
        }
        // 如果房间已存在且玩家不在其中，才加入（防止重复创建）
        if (!rooms[roomId].players.includes(playerId)) {
          rooms[roomId].players.push(playerId);
          rooms[roomId].clients.push(ws);
          ws.roomId = roomId;
          ws.playerId = playerId;
        }
        broadcast(roomId, { type: 'create', roomId, playerId });
        return;
      }

      // 3. 加入房间
      if (type === 'join') {
        const room = rooms[roomId];
        if (!room) {
          ws.send(JSON.stringify({ type: 'error', msg: '房间不存在' }));
          return;
        }
        if (room.players.includes(playerId)) {
          ws.send(JSON.stringify({ type: 'error', msg: '玩家已存在' }));
          return;
        }
        room.players.push(playerId);
        room.clients.push(ws);
        ws.roomId = roomId;
        ws.playerId = playerId;
        broadcast(roomId, { type: 'join', roomId, playerId, players: room.players });
        return;
      }

      // 4. 其他所有消息（游戏动作、状态同步等）仅转发给同房间的客户端
      if (ws.roomId && rooms[ws.roomId]) {
        // 注意：消息中已经包含了 roomId、playerId 等字段，直接转发
        broadcast(ws.roomId, msg);
      } else {
        console.warn('收到未加入房间的消息:', msg);
      }
    } catch (e) {
      console.error('消息解析错误:', e);
    }
  });

  ws.on('close', () => {
    console.log('客户端断开');
    if (ws.roomId && rooms[ws.roomId]) {
      const room = rooms[ws.roomId];
      // 移除该 WebSocket 连接
      const idx = room.clients.indexOf(ws);
      if (idx !== -1) room.clients.splice(idx, 1);
      // 移除玩家ID
      room.players = room.players.filter(p => p !== ws.playerId);
      // 如果房间为空，删除房间
      if (room.players.length === 0) {
        delete rooms[ws.roomId];
      } else {
        // 通知房间内其他玩家有人离开
        broadcast(ws.roomId, { type: 'playerLeft', playerId: ws.playerId });
      }
    }
  });
});
