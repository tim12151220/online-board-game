/**
 * 亞瑟傳奇 Quest - 主入口協調器 (App Orchestrator)
 */

import { GAME_PHASES, MESSAGE_TYPES, CHARACTERS, ALIGNMENT, RECOMMENDED_SETUP } from './types.js';
import {
  initGame,
  submitTeam,
  castVote,
  confirmQuestResult,
  selectNextLeader,
  assignAmulet,
  useAmulet,
  executeHunt,
  executeFinalQuest
} from './gameEngine.js';
import { PeerManager } from './peerManager.js';
import { UIRenderer } from './ui.js';

// 全域狀態
let gameState = null;
let lastAlertedAmulet = null;

// 安全廣播同步狀態，防止最終指認全員提交前洩漏任何指向
function broadcastGameState() {
  if (gameState && gameState.phase === GAME_PHASES.FINAL_QUEST) {
    const requiredPointers = gameState.players; // 全員都必須指認投票
    const allSubmitted = requiredPointers.every(p => gameState.submittedPointings && gameState.submittedPointings.includes(p.id));
    
    if (!allSubmitted) {
      // 克隆並清空具體 pointings 隱私指向資訊，只留 submittedPointings 給 Client 端核對 Ready
      const clone = {
        ...gameState,
        pointings: {}
      };
      peerManager.broadcast(MESSAGE_TYPES.SYNC, clone);
      return;
    }
  }
  peerManager.broadcast(MESSAGE_TYPES.SYNC, gameState);
}

// 初始化 UI 渲染器
const uiRenderer = new UIRenderer('app', handleUIAction);

// 初始化 P2P 連線管理器
const peerManager = new PeerManager(handlePeerMessage, handlePeerStatus);

/**
 * 顯示頂級玻璃擬態 Toast 提示
 */
function showToast(message, isError = false) {
  let toast = document.getElementById('quest-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'quest-toast';
    toast.className = 'toast-notification';
    document.body.appendChild(toast);
  }
  toast.innerText = message;
  toast.className = `toast-notification ${isError ? 'error' : 'success'} show`;

  clearTimeout(toast.timeoutId);
  toast.timeoutId = setTimeout(() => {
    toast.className = 'toast-notification';
  }, 4000);
}

/**
 * 處理 Peer 連線狀態的變動
 */
function handlePeerStatus(statusText, isError) {
  console.log(`[Peer Status] ${statusText} (Error: ${isError})`);
  showToast(statusText, isError);
}

/**
 * 處理來自 P2P 網路的訊息
 */
function handlePeerMessage(type, payload, senderId) {
  console.log(`[P2P Recv] Type: ${type}, Sender: ${senderId}`, payload);

  // === HOST 端的邏輯：處理 Clients 的請求 ===
  if (peerManager.isHost) {
    if (type === MESSAGE_TYPES.JOIN) {
      handleClientJoin(payload, senderId);
      return;
    }

    if (type === MESSAGE_TYPES.ACTION) {
      handleClientAction(payload, senderId);
      return;
    }
  }

  // === CLIENT/HOST 兩端通用邏輯：接收 Host 廣播同步狀態 ===
  if (type === MESSAGE_TYPES.ROSTER) {
    // 大廳狀態更新
    gameState = {
      phase: GAME_PHASES.LOBBY,
      players: payload.players,
      selectedRoles: payload.selectedRoles || []
    };
    uiRenderer.render(gameState, peerManager.myPeerId, peerManager);
    return;
  }

  if (type === MESSAGE_TYPES.SYNC) {
    // 遊戲戰局同步
    if (!peerManager.isHost) {
      gameState = payload;
    }

    // 教士/護身符秘密彈窗檢視（僅被驗證者可見）
    if (gameState.lastCheckResult) {
      const result = gameState.lastCheckResult;
      const resultKey = `${result.checkerId}-${result.targetName}`;
      if (result.checkerId === peerManager.myPeerId && lastAlertedAmulet !== resultKey) {
        lastAlertedAmulet = resultKey;
        // 使用阻斷性 alert 確保安全感，玩家點選後才關閉
        alert(`【🔍 護身符祕密回報】\n你探測了【${result.targetName}】的靈魂深處，其真實陣營忠誠為：${result.alignment === ALIGNMENT.GOOD ? '正義盟友 🟢' : '邪惡爪牙 🔴'}`);
      }
    }

    uiRenderer.render(gameState, peerManager.myPeerId, peerManager);
    return;
  }

  if (type === MESSAGE_TYPES.CHAT) {
    // 顯示聊天或系統私訊
    alert(payload.text);
    return;
  }
}

/**
 * Host 處理新 Client 的加入 (JOIN)
 */
function handleClientJoin(payload, senderId) {
  // 1. 遊戲已經在進行中，嘗試重連 (Reconnection)
  if (gameState && gameState.phase !== GAME_PHASES.LOBBY) {
    const offlinePlayer = gameState.players.find(p => p.name === payload.name && p.isOffline);
    if (offlinePlayer) {
      const oldId = offlinePlayer.id;
      
      // 重新綁定 peerId 到新連線
      offlinePlayer.id = senderId;
      offlinePlayer.isOffline = false;

      // 替換遊戲狀態中所有舊 peerId 參考
      if (gameState.currentLeaderId === oldId) gameState.currentLeaderId = senderId;
      if (gameState.exLeaderId === oldId) gameState.exLeaderId = senderId;
      if (gameState.magicUserId === oldId) gameState.magicUserId = senderId;
      if (gameState.amuletHolderId === oldId) gameState.amuletHolderId = senderId;

      if (gameState.votes[oldId] !== undefined) {
        gameState.votes[senderId] = gameState.votes[oldId];
        delete gameState.votes[oldId];
      }

      if (gameState.selectedTeamIds.includes(oldId)) {
        gameState.selectedTeamIds = gameState.selectedTeamIds.map(id => id === oldId ? senderId : id);
      }

      gameState.logs.push({
        type: 'highlight',
        text: `⚔️ 勇士【${payload.name}】已成功重連回圓桌會議！`
      });

      showToast(`玩家 ${payload.name} 重連成功！`);
      broadcastGameState();
    } else {
      peerManager.sendToClient(senderId, MESSAGE_TYPES.CHAT, {
        text: '圓桌會議已在進行中，且未找到屬於你的重連身分！'
      });
    }
    return;
  }

  // 2. 常規加入大廳 (Lobby Join)
  if (!gameState) {
    // 萬一 Host 狀態未初始化
    gameState = {
      phase: GAME_PHASES.LOBBY,
      players: [{ id: peerManager.myPeerId, name: peerManager.myName, isHost: true }],
      selectedRoles: ['MORGAN_LE_FAY', 'PRINCE']
    };
  }

  // 檢查名字重覆
  const nameExists = gameState.players.some(p => p.name === payload.name);
  if (nameExists) {
    peerManager.sendToClient(senderId, MESSAGE_TYPES.CHAT, { text: '此名稱已有人使用，請更換英雄尊名！' });
    return;
  }

  // 檢查上限
  if (gameState.players.length >= 10) {
    peerManager.sendToClient(senderId, MESSAGE_TYPES.CHAT, { text: '圓桌已滿（上限 10 人），無法加入探索！' });
    return;
  }

  // 增加新玩家
  gameState.players.push({
    id: senderId,
    name: payload.name,
    isHost: false
  });

  showToast(`勇士 ${payload.name} 加入了圓桌！`);

  // 廣播最新大廳名單
  peerManager.broadcast(MESSAGE_TYPES.ROSTER, {
    players: gameState.players,
    selectedRoles: gameState.selectedRoles
  });
}

/**
 * Host 處理玩家提交的遊戲動作 (ACTION)
 */
function handleClientAction(action, senderId) {
  // 斷線事件處理 (由 peerManager 觸發的斷線)
  if (action.actionType === 'DISCONNECT') {
    if (gameState) {
      if (gameState.phase === GAME_PHASES.LOBBY) {
        // 大廳階段：直接移除玩家
        const quittingPlayer = gameState.players.find(p => p.id === senderId);
        if (quittingPlayer) {
          gameState.players = gameState.players.filter(p => p.id !== senderId);
          showToast(`玩家 ${quittingPlayer.name} 離開了房間。`, true);
          peerManager.broadcast(MESSAGE_TYPES.ROSTER, {
            players: gameState.players,
            selectedRoles: gameState.selectedRoles
          });
        }
      } else {
        // 遊戲進行中：標記為離線
        const player = gameState.players.find(p => p.id === senderId);
        if (player) {
          player.isOffline = true;
          gameState.logs.push({
            type: 'alert',
            text: `⚠️ 勇士【${player.name}】與圓桌中斷了連線！`
          });
          showToast(`玩家 ${player.name} 斷線了。`, true);
          broadcastGameState();
        }
      }
    }
    return;
  }

  const { type, payload } = action;

  try {
    switch (type) {
      case 'TOGGLE_ROLE':
        if (!peerManager.isHost) return;
        const roleId = payload.roleId;
        let selected = [...(gameState.selectedRoles || [])];
        if (selected.includes(roleId)) {
          selected = selected.filter(r => r !== roleId);
        } else {
          selected.push(roleId);
        }
        gameState.selectedRoles = selected;
        peerManager.broadcast(MESSAGE_TYPES.ROSTER, {
          players: gameState.players,
          selectedRoles: gameState.selectedRoles
        });
        break;

      case 'APPLY_RECOMMENDED_ROLES':
        if (!peerManager.isHost) return;
        const count = gameState.players.length;
        const recommended = RECOMMENDED_SETUP[count];
        if (recommended) {
          gameState.selectedRoles = [...recommended];
          peerManager.broadcast(MESSAGE_TYPES.ROSTER, {
            players: gameState.players,
            selectedRoles: gameState.selectedRoles
          });
        }
        break;

      case 'SELECT_TEAM_MEMBER':
        // 領袖即時點選出任務隊員或魔法
        if (senderId !== gameState.currentLeaderId) return;
        gameState.selectedTeamIds = payload.teamPlayerIds || [];
        gameState.magicUserId = payload.magicUserId || null;
        // 即時同步每個玩家的 token 屬性
        gameState.players = gameState.players.map(p => ({
          ...p,
          hasTeamToken: gameState.selectedTeamIds.includes(p.id),
          hasMagicToken: p.id === gameState.magicUserId
        }));
        broadcastGameState();
        break;

      case 'START_GAME':
        if (!peerManager.isHost) return;
        // 初始化遊戲引擎
        const newGame = initGame(gameState.players, gameState.selectedRoles);
        // 設定所有玩家夜間睜眼狀態為 false
        newGame.players = newGame.players.map(p => ({
          ...p,
          isRevealReady: false
        }));
        newGame.selectedRoles = gameState.selectedRoles; // 保存選擇的角色卡池，以便渲染左側常駐角色面板
        gameState = newGame;
        broadcastGameState();
        break;

      case 'REVEAL_READY':
        // 玩家確認睜眼相認完畢
        const rPlayer = gameState.players.find(p => p.id === senderId);
        if (rPlayer) {
          rPlayer.isRevealReady = true;
          
          // 檢查是否所有人均睜眼完畢
          const allReady = gameState.players.every(p => p.isRevealReady);
          if (allReady) {
            gameState.phase = GAME_PHASES.TEAM_SELECTION;
            gameState.logs.push({
              type: 'system',
              text: '🌌 所有英雄已完成夜相認，卡美洛圓桌會議正式召開！'
            });
          }
          broadcastGameState();
        }
        break;

      case 'SUBMIT_TEAM':
        gameState = submitTeam(gameState, payload.teamPlayerIds, payload.magicUserId);
        broadcastGameState();
        break;

      case 'CAST_VOTE':
        gameState = castVote(gameState, senderId, payload.voteValue);
        broadcastGameState();
        break;

      case 'CONFIRM_QUEST':
        gameState = confirmQuestResult(gameState);
        broadcastGameState();
        break;

      case 'ASSIGN_AMULET':
        gameState = assignAmulet(gameState, payload.targetPlayerId);
        broadcastGameState();
        break;

      case 'USE_AMULET':
        gameState = useAmulet(gameState, senderId, payload.targetPlayerId, payload.declaredAlignment);
        broadcastGameState();
        break;

      case 'SELECT_NEXT_LEADER':
        if (senderId !== gameState.currentLeaderId) return;
        gameState = selectNextLeader(gameState, payload.nextLeaderId, payload.amuletTargetId);
        broadcastGameState();
        break;

      case 'CAST_POINTING':
        if (!gameState.pointings) gameState.pointings = {};
        if (!gameState.submittedPointings) gameState.submittedPointings = [];
        
        gameState.pointings[senderId] = payload.targetIds || [];
        if (!gameState.submittedPointings.includes(senderId)) {
          gameState.submittedPointings.push(senderId);
        }
        
        // 記錄指認日誌
        const pointerName = gameState.players.find(p => p.id === senderId)?.name || '未知';
        
        // 計算需要提交秘密指認的全員玩家
        const requiredPointers = gameState.players; // 全員都必須投，包括 Host 與邪惡玩家
        const allSubmitted = requiredPointers.every(p => gameState.submittedPointings.includes(p.id));
        
        if (allSubmitted) {
          // 一次性生成所有人指認的日誌詳情，確保之前完全沒有任何指向洩密
          const details = requiredPointers.map(p => {
            const targets = gameState.pointings[p.id] || [];
            const targetNames = gameState.players.filter(t => targets.includes(t.id)).map(t => t.name).join('、');
            return `【${p.name}】指認了【${targetNames}】`;
          }).join('，');

          gameState.logs.push({
            type: 'highlight',
            text: `👉 【${pointerName}】已送出秘密指認。✨ 全員已完成指認！指向手勢正式揭曉：${details}！公爵與大公現在可以執行特殊行動！`
          });
        } else {
          gameState.logs.push({
            type: 'system',
            text: `👉 【${pointerName}】已送出秘密指認，正在等待其他夥伴... ⏳`
          });
        }
        broadcastGameState();
        break;

      case 'DUKE_CANCEL_POINTING':
        {
          const dukePlayer = gameState.players.find(p => p.id === senderId);
          // 公爵發動
          if (dukePlayer?.roleId === 'DUKE' || dukePlayer?.isHost) {
            const targetPlayerId = payload.targetPlayerId;
            const cancelTargetId = payload.cancelTargetId;
            if (gameState.pointings && gameState.pointings[targetPlayerId]) {
              const oldPointings = gameState.pointings[targetPlayerId];
              gameState.pointings[targetPlayerId] = oldPointings.filter(id => id !== cancelTargetId);
              const targetName = gameState.players.find(p => p.id === targetPlayerId)?.name || '未知';
              const cancelTargetName = gameState.players.find(p => p.id === cancelTargetId)?.name || '未知';
              gameState.logs.push({
                type: 'alert',
                text: `🎩 公爵【${dukePlayer.name}】發動強令！強迫【${targetName}】放下指向【${cancelTargetName}】的一隻手指認！`
              });
              gameState.dukeIntervened = true;
              broadcastGameState();
            }
          }
        }
        break;

      case 'ARCHDUKE_REDIRECT_POINTING':
        {
          const archdukePlayer = gameState.players.find(p => p.id === senderId);
          // 大公發動
          if (archdukePlayer?.roleId === 'ARCHDUKE' || archdukePlayer?.isHost) {
            const targetPlayerId = payload.targetPlayerId;
            const oldTargetId = payload.oldTargetId;
            const newTargetId = payload.newTargetId;
            if (gameState.pointings && gameState.pointings[targetPlayerId]) {
              const oldPointings = gameState.pointings[targetPlayerId];
              gameState.pointings[targetPlayerId] = oldPointings.map(id => id === oldTargetId ? newTargetId : id);
              const targetName = gameState.players.find(p => p.id === targetPlayerId)?.name || '未知';
              const oldTargetName = gameState.players.find(p => p.id === oldTargetId)?.name || '未知';
              const newTargetName = gameState.players.find(p => p.id === newTargetId)?.name || '未知';
              gameState.logs.push({
                type: 'highlight',
                text: `🏰 大公【${archdukePlayer.name}】扭轉局勢！將【${targetName}】指向【${oldTargetName}】的手強行扭轉指向【${newTargetName}】！`
              });
              gameState.archdukeIntervened = true;
              broadcastGameState();
            }
          }
        }
        break;

      case 'EXECUTE_FINAL_QUEST':
        gameState = executeFinalQuest(gameState);
        broadcastGameState();
        break;

      case 'EXECUTE_HUNT':
        gameState = executeHunt(gameState, payload.targetIds);
        broadcastGameState();
        break;

      case 'RESET_TO_LOBBY':
        // 將遊戲重置回大廳狀態
        const currentPlayers = gameState.players.map(p => ({
          id: p.id,
          name: p.name,
          isHost: p.isHost
        }));
        gameState = {
          phase: GAME_PHASES.LOBBY,
          players: currentPlayers,
          selectedRoles: ['MORGAN_LE_FAY', 'PRINCE']
        };
        peerManager.broadcast(MESSAGE_TYPES.ROSTER, {
          players: gameState.players,
          selectedRoles: gameState.selectedRoles
        });
        break;

      default:
        console.warn(`未知的操作指令類型: ${type}`);
    }
  } catch (err) {
    console.error(`Host 執行 Action [${type}] 發生錯誤:`, err);
    alert(`操作無效: ${err.message}`);
  }
}

/**
 * 處理來自 UI 模組的本地按鍵/交互動作 (Local UI Actions)
 */
function handleUIAction(actionType, payload) {
  console.log(`[UI Action] ${actionType}`, payload);

  // 1. 創房與加入房的操作
  if (actionType === 'CREATE_ROOM') {
    peerManager.createRoom(payload.name);
    return;
  }

  if (actionType === 'JOIN_ROOM') {
    peerManager.joinRoom(payload.code, payload.name);
    return;
  }

  // 2. 核心遊戲局內的動作：如果是 Host 直接執行，若是 Client 則透過 WebRTC 傳給 Host
  const packet = {
    type: actionType,
    payload: payload || {}
  };

  if (peerManager.isHost) {
    // Host 自己執行的動作，直接當成本地 client action 丟給 handleClientAction 執行
    handleClientAction(packet, peerManager.myPeerId);
  } else {
    // Client 的動作，傳送給 Host 會議處理
    peerManager.sendToHost(MESSAGE_TYPES.ACTION, packet);
  }
}

// 首次渲染 Lobby Setup 畫面，此時 gameState 為空，引導玩家創房或加房
uiRenderer.render(null, null, peerManager);
