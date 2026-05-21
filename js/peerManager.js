/**
 * 亞瑟傳奇 Quest - WebRTC P2P 連線管理器 (Peer Manager)
 */

import { MESSAGE_TYPES } from './types.js';

const PEER_CONFIG = {
  debug: 1,
  config: {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
      { urls: 'stun:stun3.l.google.com:19302' },
      { urls: 'stun:stun4.l.google.com:19302' }
    ]
  }
};

export class PeerManager {
  constructor(onMessageCallback, onStatusCallback) {
    this.peer = null;
    this.connections = {}; // Host 端儲存所有連線：{ peerId: DataConnection }
    this.hostConnection = null; // Client 端儲存 Host 連線
    this.isHost = false;
    this.roomCode = '';
    this.myPeerId = '';
    this.myName = '';
    
    // 回呼函式
    this.onMessage = onMessageCallback; // (type, data, senderId)
    this.onStatus = onStatusCallback;   // (statusText, isError)

    // 心跳機制定時器
    this.keepAliveTimer = null;
  }

  /**
   * 生成 6 碼大寫隨機房號
   */
  generateRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 排除易混淆字元
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }

  /**
   * 建立房間 (Host 模式)
   * @param {string} playerName - Host 玩家名稱
   */
  createRoom(playerName) {
    this.isHost = true;
    this.myName = playerName;
    this.roomCode = this.generateRoomCode();
    const peerId = `quest-room-${this.roomCode}`;

    this.onStatus(`正在建立房間 ${this.roomCode}...`, false);

    // 實例化 PeerJS (使用免費的雲端伺服器)
    this.peer = new Peer(peerId, PEER_CONFIG);

    this.peer.on('open', (id) => {
      this.myPeerId = id;
      this.onStatus(`房間 ${this.roomCode} 建立成功！`, false);
      // 觸發初始 Host 自己加入
      this.onMessage(MESSAGE_TYPES.ROSTER, {
        players: [{ id: this.peer.id, name: this.myName, isHost: true }]
      }, this.peer.id);
      
      this.startKeepAlive();
    });

    this.peer.on('connection', (conn) => {
      this.handleIncomingConnection(conn);
    });

    this.peer.on('error', (err) => {
      console.error('PeerJS Host 錯誤:', err);
      if (err.type === 'unavailable-id') {
        this.onStatus('房號已被佔用，請重新嘗試創立房間！', true);
      } else {
        this.onStatus(`網路發生錯誤: ${err.message}`, true);
      }
    });
  }

  /**
   * 加入房間 (Client 模式)
   * @param {string} roomCode - 6碼房號
   * @param {string} playerName - 加入的玩家名稱
   */
  joinRoom(roomCode, playerName) {
    this.isHost = false;
    this.myName = playerName;
    this.roomCode = roomCode.trim().toUpperCase();
    const hostPeerId = `quest-room-${this.roomCode}`;

    this.onStatus(`正在尋找房間 ${this.roomCode}...`, false);

    // Client 端隨機生成隨機 Peer ID
    this.peer = new Peer(PEER_CONFIG);

    this.peer.on('open', (id) => {
      this.myPeerId = id;
      
      // 主動連線至 Host
      const conn = this.peer.connect(hostPeerId, {
        reliable: true
      });
      
      this.setupClientConnection(conn);
      this.startKeepAlive();
    });

    this.peer.on('error', (err) => {
      console.error('PeerJS Client 錯誤:', err);
      if (err.type === 'peer-unavailable') {
        this.onStatus(`找不到房號 ${this.roomCode}，請確認房號是否正確或 Host 已關閉！`, true);
      } else {
        this.onStatus(`連線錯誤: ${err.message}`, true);
      }
    });
  }

  /**
   * Host 端：處理傳入的 Client 連線
   */
  handleIncomingConnection(conn) {
    conn.on('open', () => {
      console.log(`玩家 ${conn.peer} 已連接！`);
      this.connections[conn.peer] = conn;

      // 監聽此 Client 傳來的訊息
      conn.on('data', (data) => {
        if (data.type === MESSAGE_TYPES.KEEPALIVE) return; // 忽略心跳
        
        console.log(`Host 收到來自 ${conn.peer} 的訊息:`, data);
        this.onMessage(data.type, data.payload, conn.peer);
      });

      conn.on('close', () => {
        console.log(`玩家 ${conn.peer} 連線關閉。`);
        delete this.connections[conn.peer];
        this.onMessage(MESSAGE_TYPES.ACTION, { actionType: 'DISCONNECT' }, conn.peer);
      });
      
      conn.on('error', (err) => {
        console.error(`連線 ${conn.peer} 發生錯誤:`, err);
      });
    });
  }

  /**
   * Client 端：設定與 Host 的連線監聽
   */
  setupClientConnection(conn) {
    this.hostConnection = conn;

    conn.on('open', () => {
      this.onStatus('已成功連線至圓桌！正在發送加入請求...', false);
      
      // 發送 JOIN 訊息給 Host
      this.sendToHost(MESSAGE_TYPES.JOIN, { name: this.myName });

      conn.on('data', (data) => {
        if (data.type === MESSAGE_TYPES.KEEPALIVE) return;
        
        console.log('Client 收到來自 Host 的同步訊號:', data);
        this.onMessage(data.type, data.payload, 'HOST');
      });

      conn.on('close', () => {
        this.onStatus('與亞瑟的圓桌斷開連線！正在嘗試重連...', true);
      });
      
      conn.on('error', (err) => {
        this.onStatus(`連線中斷: ${err.message}`, true);
      });
    });
  }

  /**
   * Client 發送訊息給 Host
   */
  sendToHost(type, payload) {
    if (this.hostConnection && this.hostConnection.open) {
      this.hostConnection.send({ type, payload });
    } else {
      console.warn('與 Host 的連線未開啟，無法發送訊息！');
    }
  }

  /**
   * Host 發送訊息給特定 Client
   */
  sendToClient(clientPeerId, type, payload) {
    const conn = this.connections[clientPeerId];
    if (conn && conn.open) {
      conn.send({ type, payload });
    }
  }

  /**
   * Host 廣播訊息給所有 Client
   */
  broadcast(type, payload) {
    if (!this.isHost) return;
    Object.values(this.connections).forEach((conn) => {
      if (conn.open) {
        conn.send({ type, payload });
      }
    });
    // 同時觸發本機 (Host 自己) 的更新
    this.onMessage(type, payload, this.peer.id);
  }

  /**
   * 啟動心跳機制，防止 P2P 連線因為標籤頁睡眠而斷線
   */
  startKeepAlive() {
    if (this.keepAliveTimer) clearInterval(this.keepAliveTimer);
    
    this.keepAliveTimer = setInterval(() => {
      const ping = { type: MESSAGE_TYPES.KEEPALIVE };
      if (this.isHost) {
        // Host 發給所有人
        Object.values(this.connections).forEach(conn => {
          if (conn.open) conn.send(ping);
        });
      } else {
        // Client 發給 Host
        if (this.hostConnection && this.hostConnection.open) {
          this.hostConnection.send(ping);
        }
      }
    }, 5000);
  }

  /**
   * 關閉與清空連線
   */
  destroy() {
    if (this.keepAliveTimer) clearInterval(this.keepAliveTimer);
    
    Object.values(this.connections).forEach(conn => conn.close());
    if (this.hostConnection) this.hostConnection.close();
    if (this.peer) this.peer.destroy();
    
    this.connections = {};
    this.hostConnection = null;
    this.isHost = false;
    this.roomCode = '';
  }
}
