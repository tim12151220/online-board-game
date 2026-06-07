/**
 * 亞瑟傳奇 Quest - WebRTC P2P 連線管理器 (Peer Manager)
 */

import { MESSAGE_TYPES } from './types.js';

const PEER_CONFIG = {
  debug: 1,
  pingInterval: 5000, // 每 5 秒強制向雲端信令伺服器發送心跳，防止手機省電模式或運營商單方面中斷 Websocket 連線
  config: {
    iceServers: [
      // 1. 保留原本穩定的全球公共 STUN 伺服器群（負責幫一般網路環境打洞）
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:global.stun.twilio.com:3478' },
      { urls: 'stun:stun.cloudflare.com:3478' },
      { urls: 'stun:stun.relay.metered.ca:80' }, // Metered 提供的額外 STUN

      // 2. 填入你專屬的 Metered TURN 中繼伺服器群（負責在打洞失敗時強制中繼流量）
      {
        urls: "turn:global.relay.metered.ca:80",
        username: "faa72918a37f9ced0b56c5d7",
        credential: "ntqgqGL/72vNdnM1",
      },
      {
        urls: "turn:global.relay.metered.ca:80?transport=tcp",
        username: "faa72918a37f9ced0b56c5d7",
        credential: "ntqgqGL/72vNdnM1",
      },
      {
        urls: "turn:global.relay.metered.ca:443",
        username: "faa72918a37f9ced0b56c5d7",
        credential: "ntqgqGL/72vNdnM1",
      },
      {
        urls: "turns:global.relay.metered.ca:443?transport=tcp",
        username: "faa72918a37f9ced0b56c5d7",
        credential: "ntqgqGL/72vNdnM1",
      }
    ],
    iceCandidatePoolSize: 10
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

    // 螢幕常亮與斷線自動重連機制
    this.wakeLock = null;
    this.setupPageListeners();
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
      this.requestWakeLock(); // 啟用防休眠螢幕鎖
    });

    this.peer.on('connection', (conn) => {
      this.handleIncomingConnection(conn);
    });

    this.peer.on('disconnected', () => {
      console.warn('Host 與雲端握手伺服器中斷連線，嘗試自動重連中...');
      setTimeout(() => {
        if (this.peer && this.peer.disconnected && !this.peer.destroyed) {
          this.peer.reconnect();
        }
      }, 1000);
    });

    this.peer.on('error', (err) => {
      console.error('PeerJS Host 錯誤:', err);
      let errorMsg = `⚠️ 網路發生錯誤: ${err.message}`;
      if (err.type === 'unavailable-id') {
        errorMsg = '⚠️ 房號已被佔用或尚未釋放！請點擊下方「退隱江湖」重新開啟一個新房間再試試看！';
      } else if (err.type === 'server-error') {
        errorMsg = '⚠️ 雲端握手伺服器忙碌或限流中。請點擊「退隱江湖」重新開房，換一個新房號通常能秒連！';
      } else if (err.type === 'network') {
        errorMsg = '⚠️ 與雲端握手伺服器網路中線！請確認你的網路是否正常，或嘗試【關閉 Wi-Fi 改用 4G/5G 行動網路】！';
      }
      this.onStatus(errorMsg, true);
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
      
      // 主動連線至 Host (移除 reliable: true 以提升弱網環境下的 WebRTC 連線率)
      const conn = this.peer.connect(hostPeerId);
      
      this.setupClientConnection(conn);
      this.startKeepAlive();
      this.requestWakeLock(); // 啟用防休眠螢幕鎖
    });

    this.peer.on('disconnected', () => {
      console.warn('Client 與雲端握手伺服器中斷連線，嘗試自動重連中...');
      setTimeout(() => {
        if (this.peer && this.peer.disconnected && !this.peer.destroyed) {
          this.peer.reconnect();
        }
      }, 1000);
    });

    this.peer.on('error', (err) => {
      console.error('PeerJS Client 錯誤:', err);
      let errorMsg = `⚠️ 連線錯誤: ${err.message}`;
      if (err.type === 'peer-unavailable') {
        errorMsg = '⚠️ 找不到這個房間！請確認房長的房號是否輸入正確，或請房長保持手機螢幕亮著並重新開房！';
      } else if (err.type === 'network' || err.type === 'webrtc') {
        errorMsg = '⚠️ 網路直連通道建立失敗。請雙方都嘗試【關閉 Wi-Fi 改用 4G/5G 行動網路】並重新整理！';
      } else if (err.type === 'server-error') {
        errorMsg = '⚠️ 雲端信令伺服器發生抖動。請請房長重新開一個新房間（換個房號）通常能秒連！';
      }
      this.onStatus(errorMsg, true);
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

    // 建立 10 秒超時監控，避免 PeerJS 在打洞失敗時無限期掛起
    const connectionTimeout = setTimeout(() => {
      if (!this.hostConnection || !this.hostConnection.open) {
        console.warn('連線至 Host 逾時。');
        this.onStatus('尋找房間超時！請檢查房號是否正確，或嘗試切換網路環境（例如關閉 Wi-Fi 改用 4G 行動網路、或關閉 VPN/公司防火牆）。', true);
        conn.close();
      }
    }, 10000);

    conn.on('open', () => {
      clearTimeout(connectionTimeout);
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
    this.releaseWakeLock(); // 釋放螢幕防休眠鎖
    
    Object.values(this.connections).forEach(conn => conn.close());
    if (this.hostConnection) this.hostConnection.close();
    if (this.peer) this.peer.destroy();
    
    this.connections = {};
    this.hostConnection = null;
    this.isHost = false;
    this.roomCode = '';
  }

  /**
   * 設定網頁事件監聽，支援從背景切回前台時自動重連 PeerJS 雲端伺服器
   */
  setupPageListeners() {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        console.log('網頁切回前台，執行 Wake Lock 重新申請與 PeerJS 連線自動修復...');
        
        // 1. 重新申請螢幕防休眠鎖
        if (this.peer && !this.peer.destroyed) {
          this.requestWakeLock();
        }
        
        // 2. 如果 PeerJS 連線已斷開，自動發起 reconnect()
        if (this.peer && this.peer.disconnected && !this.peer.destroyed) {
          console.log('偵測到 PeerJS signaling 已斷開，執行 peer.reconnect()...');
          this.peer.reconnect();
        }
      }
    });
  }

  /**
   * 啟用 Screen Wake Lock 防休眠鎖
   */
  async requestWakeLock() {
    try {
      if ('wakeLock' in navigator) {
        this.wakeLock = await navigator.wakeLock.request('screen');
        console.log('✨ 螢幕 Wake Lock 已成功啟用，防止進入睡眠狀態！');
      }
    } catch (err) {
      console.warn(`Wake Lock 啟用失敗: ${err.message}`);
    }
  }

  /**
   * 釋放 Screen Wake Lock 防休眠鎖
   */
  releaseWakeLock() {
    if (this.wakeLock) {
      this.wakeLock.release().then(() => {
        this.wakeLock = null;
        console.log('螢幕 Wake Lock 已成功釋放。');
      }).catch(err => {
        console.error('釋放 Wake Lock 失敗:', err);
      });
    }
  }
}
