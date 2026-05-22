/**
 * 亞瑟傳奇 Quest - UI 渲染器 (UI Renderer)
 */

import { GAME_PHASES, CHARACTERS, ALIGNMENT, BOARD_CONFIGS } from './types.js';
import { getNightRevealInfo } from './gameEngine.js';

export class UIRenderer {
  constructor(appContainerId, onActionCallback) {
    this.container = document.getElementById(appContainerId);
    this.onAction = onActionCallback; // (actionType, payload)
    
    // 用於記錄 Client 端的本地狀態（例如在指派隊伍時點選的人選）
    this.localState = {
      selectedTeamIds: [],
      magicUserId: null,
      selectedPointingIds: [], // 最終指認選擇的玩家 ID (上限 2 位)
      selectedHuntIds: [],     // 盲眼殺手獵殺選擇的玩家 ID (上限 2 位)
      tricksterLieAlignment: null, // 騙徒被驗身時選擇說謊的陣營
      amuletTargetId: null,      // 護身符被掃描的對象
      amuletScanned: false       // 護身符是否已在本地掃描完畢
    };
  }

  /**
   * 清除本地臨時狀態
   */
  clearLocalState() {
    this.localState.selectedTeamIds = [];
    this.localState.magicUserId = null;
    this.localState.selectedPointingIds = [];
    this.localState.selectedHuntIds = [];
    this.localState.tricksterLieAlignment = null;
    this.localState.amuletTargetId = null;
    this.localState.amuletScanned = false;
  }

  /**
   * 主渲染入口
   * @param {Object} gameState - 遊戲引擎的核心 State
   * @param {string} myPeerId - 本機玩家的 Peer ID
   * @param {Object} peerManager - 連線管理器實例
   */
  render(gameState, myPeerId, peerManager) {
    if (!gameState) {
      this.renderLobbySetup(peerManager);
      return;
    }

    const myPlayer = gameState.players.find(p => p.id === myPeerId);

    // 依據不同的遊戲階段進行畫面描繪
    switch (gameState.phase) {
      case GAME_PHASES.LOBBY:
        this.renderLobbyRoom(gameState, myPeerId, peerManager);
        break;
      case GAME_PHASES.REVEAL:
        this.renderRevealPhase(gameState, myPlayer);
        break;
      default:
        this.renderMainGameBoard(gameState, myPlayer, peerManager);
        break;
    }
  }

  /**
   * 渲染大廳設定與加入頁面 (Lobby Setup)
   */
  renderLobbySetup(peerManager) {
    this.container.innerHTML = `
      <div class="lobby-container">
        <h1 class="lobby-title">亞瑟傳奇</h1>
        <p class="lobby-subtitle">Quest － 阿瓦隆二代神級續作，多人 P2P 線上版</p>
        
        <div class="lobby-cards-grid">
          <!-- 創建房間 -->
          <div class="lobby-card">
            <h2 class="lobby-card-title">🛡️ 建立圓桌會議 (Host)</h2>
            <div class="lobby-form-group">
              <label for="host-name">你的英雄尊名</label>
              <input type="text" id="host-name" placeholder="輸入名號，如：亞瑟王" value="">
            </div>
            <button class="btn-primary" id="btn-create-room">發起聖杯探索</button>
          </div>
          
          <!-- 加入房間 -->
          <div class="lobby-card">
            <h2 class="lobby-card-title">⚔️ 投奔卡美洛 (Join)</h2>
            <div class="lobby-form-group">
              <label for="join-name">你的英雄尊名</label>
              <input type="text" id="join-name" placeholder="輸入名號，如：蘭斯洛特" value="">
            </div>
            <div class="lobby-form-group">
              <label for="join-code">探險房號 (Room Code)</label>
              <input type="text" id="join-code" placeholder="輸入6碼房號" maxlength="6">
            </div>
            <button class="btn-purple" id="btn-join-room">進入圓桌會議</button>
          </div>
        </div>
      </div>
    `;

    // 綁定事件
    document.getElementById('btn-create-room').onclick = () => {
      const name = document.getElementById('host-name').value.trim();
      if (!name) {
        alert('請輸入你的英雄尊名！');
        return;
      }
      this.onAction('CREATE_ROOM', { name });
    };

    document.getElementById('btn-join-room').onclick = () => {
      const name = document.getElementById('join-name').value.trim();
      const code = document.getElementById('join-code').value.trim().toUpperCase();
      if (!name || !code) {
        alert('請輸入尊名與 6 碼房號！');
        return;
      }
      this.onAction('JOIN_ROOM', { name, code });
    };
  }

  /**
   * 渲染等待大廳房內頁面 (Lobby Waiting Room)
   */
  renderLobbyRoom(gameState, myPeerId, peerManager) {
    const isHost = peerManager.isHost;
    const players = gameState.players;
    const playerCount = players.length;

    // 生成選角面板 (僅 Host 可操控，Client 只能觀看)
    const roleBadgesHTML = Object.values(CHARACTERS)
      .map(role => {
        const isSelected = gameState.selectedRoles && gameState.selectedRoles.includes(role.id);
        const alignmentClass = role.alignment === ALIGNMENT.GOOD ? 'good' : 'evil';
        const selectedClass = isSelected ? 'selected' : '';
        return `
          <div class="role-badge ${alignmentClass} ${selectedClass} ${isHost ? '' : 'disabled'}" data-role-id="${role.id}">
            <span style="font-size: 20px;">${role.avatar}</span>
            <span class="role-badge-name">${role.name}</span>
            <span class="role-badge-desc">人數 ≥ ${role.minPlayers}</span>
            <div class="role-tooltip" style="text-align: left;">
              <div class="tooltip-header" style="display: flex; align-items: center; gap: 8px; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 4px; margin-bottom: 6px;">
                <span style="font-size: 16px;">${role.avatar}</span>
                <span style="font-weight: bold; font-size: 13px; color: #e2e8f0;">${role.name}</span>
                <span class="role-alignment-badge ${role.alignment.toLowerCase()}" style="font-size: 9px; padding: 1px 4px; border-radius: 4px; border: 1px solid; margin-left: auto;">${role.alignment === ALIGNMENT.GOOD ? '正義' : '邪惡'}</span>
              </div>
              <div class="tooltip-desc" style="font-size: 11px; color: #cbd5e0; line-height: 1.4; white-space: normal;">${role.desc}</div>
              <div style="font-size: 9px; color: #a0aec0; border-top: 1px dashed rgba(255,255,255,0.1); padding-top: 4px; margin-top: 6px;">限制人數：${role.minPlayers} 人起</div>
            </div>
          </div>
        `;
      }).join('');

    // 官方人數推薦角色配置表
    const recommendedTableHTML = `
      <div class="lobby-card recommended-card" style="grid-column: span 1;">
        <h2 class="lobby-card-title">📋 官方推薦角色配置</h2>
        <p style="font-size:11px; color:#a0aec0; margin-top:-8px;">依就座人數高亮推薦。Host 點擊下方按鈕可快速套用配置。</p>
        
        <div class="recommended-table-wrapper" style="overflow-x: auto; margin-top: 10px;">
          <table class="recommended-table" style="width:100%; border-collapse:collapse; font-size:11px; text-align:center;">
            <thead>
              <tr style="border-bottom:1px solid rgba(255,255,255,0.1);">
                <th style="padding:6px; text-align:left;">角色</th>
                <th class="${playerCount === 4 ? 'active-col' : ''}" style="padding:6px;">4人</th>
                <th class="${playerCount === 5 ? 'active-col' : ''}" style="padding:6px;">5人</th>
                <th class="${playerCount === 6 ? 'active-col' : ''}" style="padding:6px;">6人</th>
                <th class="${playerCount === 7 ? 'active-col' : ''}" style="padding:6px;">7人</th>
                <th class="${playerCount === 8 ? 'active-col' : ''}" style="padding:6px;">8人</th>
                <th class="${playerCount === 9 ? 'active-col' : ''}" style="padding:6px;">9人</th>
                <th class="${playerCount === 10 ? 'active-col' : ''}" style="padding:6px;">10人</th>
              </tr>
            </thead>
            <tbody>
              <tr style="border-bottom:1px solid rgba(255,255,255,0.05);">
                <td class="good-role" style="padding:6px; text-align:left; font-weight:bold; color:var(--color-good);">🛡️ 忠臣</td>
                <td class="${playerCount === 4 ? 'active-col' : ''}">2</td>
                <td class="${playerCount === 5 ? 'active-col' : ''}">3</td>
                <td class="${playerCount === 6 ? 'active-col' : ''}">3</td>
                <td class="${playerCount === 7 ? 'active-col' : ''}">3</td>
                <td class="${playerCount === 8 ? 'active-col' : ''}">4</td>
                <td class="${playerCount === 9 ? 'active-col' : ''}">4</td>
                <td class="${playerCount === 10 ? 'active-col' : ''}">4</td>
              </tr>
              <tr style="border-bottom:1px solid rgba(255,255,255,0.05);">
                <td class="good-role" style="padding:6px; text-align:left; font-weight:bold; color:var(--color-good);">🎩 公爵</td>
                <td class="${playerCount === 4 ? 'active-col' : ''}">0</td>
                <td class="${playerCount === 5 ? 'active-col' : ''}">0</td>
                <td class="${playerCount === 6 ? 'active-col' : ''}">0</td>
                <td class="${playerCount === 7 ? 'active-col' : ''}">1</td>
                <td class="${playerCount === 8 ? 'active-col' : ''}">1</td>
                <td class="${playerCount === 9 ? 'active-col' : ''}">1</td>
                <td class="${playerCount === 10 ? 'active-col' : ''}">1</td>
              </tr>
              <tr style="border-bottom:1px solid rgba(255,255,255,0.05);">
                <td class="good-role" style="padding:6px; text-align:left; font-weight:bold; color:var(--color-good);">🏰 大公</td>
                <td class="${playerCount === 4 ? 'active-col' : ''}">0</td>
                <td class="${playerCount === 5 ? 'active-col' : ''}">0</td>
                <td class="${playerCount === 6 ? 'active-col' : ''}">0</td>
                <td class="${playerCount === 7 ? 'active-col' : ''}">0</td>
                <td class="${playerCount === 8 ? 'active-col' : ''}">0</td>
                <td class="${playerCount === 9 ? 'active-col' : ''}">1</td>
                <td class="${playerCount === 10 ? 'active-col' : ''}">1</td>
              </tr>
              <tr style="border-bottom:1px solid rgba(255,255,255,0.05);">
                <td class="evil-role" style="padding:6px; text-align:left; font-weight:bold; color:var(--color-error);">🔮 魔女</td>
                <td class="${playerCount === 4 ? 'active-col' : ''}">1</td>
                <td class="${playerCount === 5 ? 'active-col' : ''}">1</td>
                <td class="${playerCount === 6 ? 'active-col' : ''}">1</td>
                <td class="${playerCount === 7 ? 'active-col' : ''}">1</td>
                <td class="${playerCount === 8 ? 'active-col' : ''}">1</td>
                <td class="${playerCount === 9 ? 'active-col' : ''}">1</td>
                <td class="${playerCount === 10 ? 'active-col' : ''}">1</td>
              </tr>
              <tr style="border-bottom:1px solid rgba(255,255,255,0.05);">
                <td class="evil-role" style="padding:6px; text-align:left; font-weight:bold; color:var(--color-error);">🍷 王儲</td>
                <td class="${playerCount === 4 ? 'active-col' : ''}">1</td>
                <td class="${playerCount === 5 ? 'active-col' : ''}">1</td>
                <td class="${playerCount === 6 ? 'active-col' : ''}">0</td>
                <td class="${playerCount === 7 ? 'active-col' : ''}">0</td>
                <td class="${playerCount === 8 ? 'active-col' : ''}">0</td>
                <td class="${playerCount === 9 ? 'active-col' : ''}">0</td>
                <td class="${playerCount === 10 ? 'active-col' : ''}">0</td>
              </tr>
              <tr style="border-bottom:1px solid rgba(255,255,255,0.05);">
                <td class="evil-role" style="padding:6px; text-align:left; font-weight:bold; color:var(--color-error);">🎭 幻形</td>
                <td class="${playerCount === 4 ? 'active-col' : ''}">0</td>
                <td class="${playerCount === 5 ? 'active-col' : ''}">0</td>
                <td class="${playerCount === 6 ? 'active-col' : ''}">1</td>
                <td class="${playerCount === 7 ? 'active-col' : ''}">1</td>
                <td class="${playerCount === 8 ? 'active-col' : ''}">1</td>
                <td class="${playerCount === 9 ? 'active-col' : ''}">1</td>
                <td class="${playerCount === 10 ? 'active-col' : ''}">1</td>
              </tr>
              <tr style="border-bottom:1px solid rgba(255,255,255,0.05);">
                <td class="evil-role" style="padding:6px; text-align:left; font-weight:bold; color:var(--color-error);">👿 爪牙</td>
                <td class="${playerCount === 4 ? 'active-col' : ''}">0</td>
                <td class="${playerCount === 5 ? 'active-col' : ''}">0</td>
                <td class="${playerCount === 6 ? 'active-col' : ''}">1</td>
                <td class="${playerCount === 7 ? 'active-col' : ''}">1</td>
                <td class="${playerCount === 8 ? 'active-col' : ''}">1</td>
                <td class="${playerCount === 9 ? 'active-col' : ''}">1</td>
                <td class="${playerCount === 10 ? 'active-col' : ''}">2</td>
              </tr>
            </tbody>
          </table>
        </div>
        
        <div style="margin-top:15px; display:flex; justify-content:center;">
          <button class="btn-purple" id="btn-apply-recommend" style="width:100%; padding:8px; font-size:11px;" ${isHost && playerCount >= 4 ? '' : 'disabled'}>
            ${isHost ? `✨ 套用 ${playerCount} 人推薦配置 ✨` : `等待領袖套用推薦配置`}
          </button>
        </div>
      </div>
    `;

    this.container.innerHTML = `
      <div class="lobby-container">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <h1 class="lobby-title" style="margin: 0; font-size: var(--fs-xl);">圓桌大廳</h1>
          <div class="room-id-tag" id="btn-copy-code">房號：${peerManager.roomCode} 📋</div>
        </div>
        <p style="color: #a0aec0; font-size: var(--fs-sm);">點選房號可快速複製，分享給你的英雄盟友們！</p>
        
        <div class="lobby-cards-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 15px;">
          <!-- 玩家名冊 -->
          <div class="lobby-card" style="grid-column: span 1;">
            <h2 class="lobby-card-title" style="display:flex; justify-content:space-between;">
              <span>👥 已就座玩家</span>
              <span style="font-size: var(--fs-sm); color:#a0aec0;">${playerCount} / 10 人</span>
            </h2>
            <div class="lobby-players-list">
              ${players.map((p, idx) => `
                <div class="lobby-player-row">
                  <div class="lobby-player-info">
                    <div class="lobby-player-avatar">${p.name.charAt(0)}</div>
                    <span style="font-weight:bold;">${p.name} ${p.id === myPeerId ? ' (你)' : ''}</span>
                  </div>
                  ${idx === 0 ? '<span class="lobby-player-host-tag">創房領袖</span>' : ''}
                </div>
              `).join('')}
            </div>
            ${playerCount < 4 ? `<p style="color:var(--color-error); font-size:12px;">⚠️ 還需至少 ${4 - playerCount} 名玩家才能開啟聖杯探索！</p>` : ''}
          </div>

          <!-- 角色模組配置 -->
          <div class="lobby-card" style="grid-column: span 1;">
            <h2 class="lobby-card-title">🔮 身分與角色卡池</h2>
            <p style="font-size:11px; color:#a0aec0; margin-top:-8px;">點選牌組配置你想要的特殊能力英雄。基本版建議選【摩根勒菲】與【王儲】。</p>
            <div class="role-grid" style="margin-top: 10px; display: grid; grid-template-columns: repeat(2, 1fr); gap: 6px;">
              ${roleBadgesHTML}
            </div>
          </div>

          <!-- 官方人數推薦角色配置 -->
          ${recommendedTableHTML}
        </div>

        <div style="display:flex; justify-content:flex-end; gap: 15px; margin-top: 15px;">
          <button class="btn-danger" id="btn-leave-lobby">退隱江湖</button>
          ${isHost ? `
            <button class="btn-primary" id="btn-start-game" ${playerCount < 4 ? 'disabled' : ''}>開啟聖杯探索 (START)</button>
          ` : `
            <button class="btn-primary" disabled>等待創房領袖發出探索召集令...</button>
          `}
        </div>
      </div>
    `;

    // 複製房號
    document.getElementById('btn-copy-code').onclick = () => {
      navigator.clipboard.writeText(peerManager.roomCode);
      alert('房號已複製到剪貼簿！');
    };

    // 離開大廳
    document.getElementById('btn-leave-lobby').onclick = () => {
      if (confirm('確定要退出會議嗎？')) {
        peerManager.destroy();
        window.location.reload();
      }
    };

    // 點選特殊角色 (僅 Host 有效)
    if (isHost) {
      document.querySelectorAll('.role-badge').forEach(badge => {
        badge.onclick = () => {
          const roleId = badge.getAttribute('data-role-id');
          this.onAction('TOGGLE_ROLE', { roleId });
        };
      });

      const applyRecommendBtn = document.getElementById('btn-apply-recommend');
      if (applyRecommendBtn) {
        applyRecommendBtn.onclick = () => {
          this.onAction('APPLY_RECOMMENDED_ROLES');
        };
      }

      document.getElementById('btn-start-game').onclick = () => {
        this.onAction('START_GAME');
      };
    }
  }

  /**
   * 渲染夜間相認秘密階段 (Night Reveal Phase)
   */
  renderRevealPhase(gameState, myPlayer) {
    const info = getNightRevealInfo(myPlayer, gameState);
    
    // 生成可見玩家名單的 HTML
    const visibleListHTML = info.visiblePlayers.length > 0
      ? `
        <div class="reveal-info-list" style="margin-top: 15px;">
          ${info.visiblePlayers.map(p => `
            <div class="reveal-info-item">
              <span class="reveal-info-name">${p.name}</span>
              <span class="reveal-info-role ${p.alignment.toLowerCase()}">${p.roleName}</span>
            </div>
          `).join('')}
        </div>
      `
      : `
        <p style="color: #a0aec0; font-size: var(--fs-md); font-style: italic; margin-top: 20px;">
          你看向四周，一片迷霧...你什麼都沒看到。
        </p>
      `;

    // 檢查本機玩家是否已點擊 Ready
    const isReady = myPlayer.isRevealReady;

    this.container.innerHTML = `
      <div class="reveal-overlay">
        <h1 class="reveal-title">天黑請閉眼 - 神秘夜相認</h1>
        <div class="reveal-content-box">
          <div class="reveal-role-info">
            <span style="font-size: 11px; color: #a0aec0; letter-spacing: 2px;">你的秘密身份是</span>
            <div style="display: flex; align-items: center; gap: 10px; margin-top: 5px;">
              <span class="reveal-avatar">${myPlayer.avatar}</span>
              <span class="reveal-role-name ${myPlayer.alignment.toLowerCase()}">${myPlayer.roleName}</span>
            </div>
            <p class="reveal-role-desc">${CHARACTERS[myPlayer.roleId]?.desc || ''}</p>
          </div>
          
          <div class="reveal-info-title">🔮 你的黑夜視野 (Night Vision)</div>
          ${visibleListHTML}
          
          <button class="btn-primary" id="btn-reveal-ready" style="margin-top: 30px; width: 100%; padding: 12px; font-weight: bold; background: ${isReady ? 'rgba(72, 187, 120, 0.2)' : 'var(--color-good)'}; border: ${isReady ? '1px solid var(--color-good)' : 'none'}; color: ${isReady ? 'var(--color-good)' : '#0b0d19'};" ${isReady ? 'disabled' : ''}>
            ${isReady ? '✓ 已準備就緒，靜待探索啟程...' : '我已洞悉天機，準備啟程 ⚔️'}
          </button>
        </div>
      </div>
    `;

    // 綁定天黑確認按鈕的點擊事件
    const readyBtn = document.getElementById('btn-reveal-ready');
    if (readyBtn) {
      readyBtn.onclick = () => {
        this.onAction('REVEAL_READY');
      };
    }
  }

  renderMainGameBoard(gameState, myPlayer, peerManager) {
    const playerCount = gameState.players.length;
    const currentLeader = gameState.players.find(p => p.id === gameState.currentLeaderId);

    // === 左側常駐角色卡池與 Tooltip ===
    const activeRoleIds = gameState.selectedRoles || gameState.players.map(p => p.roleId);
    const activeRoles = activeRoleIds.map(id => CHARACTERS[id]).filter(Boolean);
    // 排序：正義在前，邪惡在後
    activeRoles.sort((a, b) => {
      if (a.alignment === b.alignment) {
        return a.name.localeCompare(b.name, 'zh-Hant');
      }
      return a.alignment === ALIGNMENT.GOOD ? -1 : 1;
    });

    const leftSideHTML = `
      <div class="game-left-panel">
        <h3 class="panel-title">🔮 本局角色名冊</h3>
        <div class="role-list">
          ${activeRoles.map(role => `
            <div class="game-role-card ${role.alignment.toLowerCase()}">
              <span class="role-avatar">${role.avatar}</span>
              <span class="role-name">${role.name}</span>
              <div class="role-tooltip">
                <div class="tooltip-header">
                  <span class="role-avatar">${role.avatar}</span>
                  <span class="role-name">${role.name}</span>
                  <span class="role-alignment-badge ${role.alignment.toLowerCase()}">${role.alignment === ALIGNMENT.GOOD ? '正義' : '邪惡'}</span>
                </div>
                <div class="tooltip-desc">${role.desc}</div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;

    // 1. 頂部資訊列
    const topBarHTML = `
      <div class="top-bar">
        <div style="display:flex; align-items:center; gap: 15px;">
          <h2 style="font-weight:900; letter-spacing:1px; background:linear-gradient(135deg, var(--color-good) 0%, #fff 100%); -webkit-background-clip:text; -webkit-text-fill-color:transparent;">亞瑟傳奇</h2>
          <span class="room-id-tag" id="btn-game-copy-code" title="點擊複製房號">房號：${peerManager.roomCode}</span>
        </div>
        <button class="btn-danger" id="btn-quit-game" style="padding: 6px 12px; font-size:12px;">棄服退隱</button>
      </div>
    `;

    // 2. 圓桌內任務盤面 (5個 Node)
    const boardQuests = BOARD_CONFIGS[playerCount].quests;
    const questsHTML = boardQuests.map((quest, idx) => {
      const result = gameState.questResults[idx];
      const isActive = gameState.currentQuestIndex === idx;
      let statusClass = '';
      if (isActive) statusClass = 'active';
      if (result === 'SUCCESS') statusClass = 'success';
      if (result === 'FAILED') statusClass = 'failed';

      // 檢查此回合是否有護身符
      const hasAmuletText = (quest.amulet && playerCount >= 6) 
        ? `<div class="board-quest-node-amulet">🛡️</div>` 
        : '';

      return `
        <div class="board-quest-node ${statusClass}">
          <span>T${idx + 1}</span>
          <span class="board-quest-node-players">${quest.players}人</span>
          ${quest.failsNeeded > 1 ? `<span style="font-size:8px; color:var(--color-error); font-weight:bold;">需${quest.failsNeeded}張失敗</span>` : ''}
          ${hasAmuletText}
        </div>
      `;
    }).join('');

    const centerBoardHTML = `
      <div class="table-board-info">
        <h3 style="font-weight:900; font-size:var(--fs-md); color:#a0aec0; letter-spacing:1px;">聖杯任務探索</h3>
        <div class="board-quests-row">
          ${questsHTML}
        </div>
        <p style="font-size:10px; color:#718096; margin-top:5px;">
          目前戰績：正義 ${gameState.questResults.filter(r=>r==='SUCCESS').length} 勝 / 邪惡 ${gameState.questResults.filter(r=>r==='FAILED').length} 敗
        </p>
      </div>
    `;

    // 3. 環繞圓桌的玩家 (Trigonometry polar layout)
    const playerNodesHTML = gameState.players.map((p, idx) => {
      // 計算極角角度 (均勻分佈在 360 度)
      const angleDeg = (idx * (360 / playerCount)) - 90; // -90 代表從正上方開始排
      const angleRad = (angleDeg * Math.PI) / 180;
      
      const isLeader = p.isLeader;
      const isExLeader = p.isExLeader;
      const hasMagic = p.hasMagicToken;
      const hasTeam = p.hasTeamToken;
      const hasAmulet = p.hasAmulet;
      const isOffline = p.isOffline;

      const activeClass = isLeader ? 'active-leader' : '';
      const offlineClass = isOffline ? 'offline' : '';

      // 指示物標章
      let badgesHTML = '';
      if (isLeader) badgesHTML += `<div class="badge-indicator badge-leader" title="領袖">👑</div>`;
      if (hasMagic) badgesHTML += `<div class="badge-indicator badge-magic" title="魔法保護">⚡</div>`;
      if (hasTeam) badgesHTML += `<div class="badge-indicator badge-team" title="出任務成員">🛡️</div>`;
      if (hasAmulet) badgesHTML += `<div class="badge-indicator badge-amulet" title="護身符">🔍</div>`;

      // 檢查此玩家是否被驗過陣營，顯示褪色護身符
      if (p.hasFailedAmulet) {
        badgesHTML += `<div class="badge-indicator" style="bottom:-4px; left:-4px; background:#718096; color:#000;" title="褪色護身符（已被驗證）">🔒</div>`;
      }

      // 亞瑟傳奇特別指示物：曾擔任領袖 (🎖️) 和 立即前任領袖 (📜)
      if (p.hasBeenLeader && !isLeader) {
        badgesHTML += `<div class="badge-indicator badge-veteran" style="bottom:-4px; right:-4px; background:#d69e2e; color:#fff; font-size:9px;" title="退伍領袖（Veteran）">🎖️</div>`;
      }
      if (isExLeader) {
        badgesHTML += `<div class="badge-indicator badge-ex-leader" style="bottom:12px; right:-4px; background:#cbd5e0; color:#1a202c; font-size:9px;" title="前任領袖（Ex-Leader）">📜</div>`;
      }

      // 身份提示標籤 (知情者提示)
      let tipHTML = '';
      const isMySelfEvil = myPlayer.alignment === ALIGNMENT.EVIL && myPlayer.roleId !== 'CHANGELING';
      
      if (p.id !== myPlayer.id) {
        // 1. 如果我是邪惡盟友且對方也是邪惡同夥 (不含幻形妖)
        if (isMySelfEvil && p.alignment === ALIGNMENT.EVIL && p.roleId !== 'CHANGELING') {
          let evilRoleText = '邪惡同夥';
          if (p.roleId === 'PRINCE') evilRoleText = '王儲';
          else if (p.roleId === 'BLIND_ASSASSIN') evilRoleText = '盲眼殺手';
          else if (p.roleId === 'TRAITOR') evilRoleText = '叛徒';
          tipHTML = `<div style="font-size:9px; background:rgba(229, 62, 62, 0.15); color:#fc8181; border:1px solid rgba(229,62,62,0.3); padding:1px 4px; border-radius:4px; margin-top:2px; display:inline-block; font-weight:bold;">😈 ${evilRoleText}</div>`;
        }
        
        // 2. 如果我是亞瑟
        if (myPlayer.roleId === 'ARTHUR') {
          if (p.roleId === 'MORGAN_LE_FAY') {
            tipHTML = `<div style="font-size:9px; background:rgba(159, 122, 234, 0.15); color:#d6bcfa; border:1px solid rgba(159,122,234,0.3); padding:1px 4px; border-radius:4px; margin-top:2px; display:inline-block; font-weight:bold;">🔮 摩根勒菲</div>`;
          }
          if (p.id === gameState.firstLeaderId) {
            const isGood = p.alignment === ALIGNMENT.GOOD;
            tipHTML = `<div style="font-size:9px; background:${isGood ? 'rgba(72,187,120,0.15)' : 'rgba(229,62,62,0.15)'}; color:${isGood ? '#68d391' : '#fc8181'}; border:1px solid ${isGood ? 'rgba(72,187,120,0.3)' : 'rgba(229,62,62,0.3)'}; padding:1px 4px; border-radius:4px; margin-top:2px; display:inline-block; font-weight:bold;">👑 首任領袖：${isGood ? '好人' : '壞人'}</div>`;
          }
        }

        // 3. 如果我是教士
        if (myPlayer.roleId === 'PRIEST' && p.id === gameState.firstLeaderId) {
          let alignmentToShow = p.alignment;
          if (p.roleId === 'TRICKSTER') alignmentToShow = ALIGNMENT.GOOD;
          else if (p.roleId === 'TROUBLEMAKER') alignmentToShow = ALIGNMENT.EVIL;
          const isGood = alignmentToShow === ALIGNMENT.GOOD;
          tipHTML = `<div style="font-size:9px; background:${isGood ? 'rgba(72,187,120,0.15)' : 'rgba(229,62,62,0.15)'}; color:${isGood ? '#68d391' : '#fc8181'}; border:1px solid ${isGood ? 'rgba(72,187,120,0.3)' : 'rgba(229,62,62,0.3)'}; padding:1px 4px; border-radius:4px; margin-top:2px; display:inline-block; font-weight:bold;">⛪ 首任傾向：${isGood ? '好人' : '壞人'}</div>`;
        }

        // 4. 如果我是帕西瓦里
        if (myPlayer.roleId === 'PERCIVAL' && p.roleId === 'PRIEST') {
          tipHTML = `<div style="font-size:9px; background:rgba(49, 151, 149, 0.15); color:#4fd1c5; border:1px solid rgba(49,151,149,0.3); padding:1px 4px; border-radius:4px; margin-top:2px; display:inline-block; font-weight:bold;">⛪ 教士</div>`;
        }

        // 5. 如果我是邊緣人
        if (myPlayer.roleId === 'OUTSIDER' && p.alignment === ALIGNMENT.EVIL && p.roleId !== 'CHANGELING') {
          tipHTML = `<div style="font-size:9px; background:rgba(229, 62, 62, 0.15); color:#fc8181; border:1px solid rgba(229,62,62,0.3); padding:1px 4px; border-radius:4px; margin-top:2px; display:inline-block; font-weight:bold;">😈 邪惡方</div>`;
        }
      }

      return `
        <div class="player-node ${activeClass} ${offlineClass}" style="--angle: ${angleRad}rad;">
          <div class="player-node-avatar">
            ${p.name.charAt(0)}
            <div class="player-badges-container">
              ${badgesHTML}
            </div>
          </div>
          <div class="player-node-name" style="${p.id === myPlayer.id ? 'color:var(--color-good); font-weight:900;' : ''}">
            ${p.name} ${p.id === myPlayer.id ? '(你)' : ''}
          </div>
          ${tipHTML}
        </div>
      `;
    }).join('');

    // 4. 系統日誌
    const logsHTML = gameState.logs.slice(-6).reverse().map(log => {
      let entryClass = '';
      if (log.type === 'highlight') entryClass = 'highlight';
      if (log.type === 'alert') entryClass = 'alert';
      if (log.type === 'system') entryClass = 'system';
      return `<div class="log-entry ${entryClass}">${log.text}</div>`;
    }).join('');

    // 5. 底部 Dashboard 與操作邏輯
    const currentQuest = BOARD_CONFIGS[playerCount].quests[gameState.currentQuestIndex];
    let dashboardCenterHTML = '';
    let dashboardRightHTML = '';

    // 左邊：我的防窺角色卡
    const myRoleMeta = CHARACTERS[myPlayer.roleId];
    const alignmentClass = myPlayer.alignment.toLowerCase();
    
    const dashboardLeftHTML = `
      <div class="dashboard-left">
        <div class="secret-role-card">
          <div class="secret-role-card-front ${alignmentClass}">
            <div class="secret-role-avatar">${myPlayer.avatar}</div>
            <div class="secret-role-name">${myPlayer.roleName}</div>
            <div class="secret-role-alignment">${myPlayer.alignment === ALIGNMENT.GOOD ? '正義盟友' : '邪惡爪牙'}</div>
          </div>
        </div>
      </div>
    `;

    // 依據不同遊玩狀態，決定中右方 Dashboard 控制器的顯示
    switch (gameState.phase) {
      case GAME_PHASES.LEADER_SELECTION:
        {
          const boardConfig = BOARD_CONFIGS[gameState.players.length];
          const lastQuest = boardConfig ? boardConfig.quests[gameState.currentQuestIndex] : null;
          const hasAmuletInQuest = lastQuest && lastQuest.amulet && gameState.players.length >= 6;

          if (myPlayer.isLeader) {
            dashboardCenterHTML = `
              <div class="dashboard-center">
                <span class="status-tip">👑 領袖傳承 - 指派新領袖${hasAmuletInQuest ? '與護身符' : ''}</span>
                <span class="status-main">${hasAmuletInQuest ? '請指定下任探索領袖，並選擇一名玩家領取護身符' : '請指定一名未曾擔任過領袖的玩家，接掌下一回合探索'}</span>
              </div>
            `;

            // 獲取符合指派領袖資格的候選人
            // 規則：沒當過領袖 (hasBeenLeader === false) 且沒使用過護身符 (hasUsedAmulet === false)
            let candidates = gameState.players.filter(p => !p.hasBeenLeader && !p.hasUsedAmulet);

            // 邊界情況：如果所有人都當過領袖/用過護身符了
            if (candidates.length === 0) {
              // 解鎖所有人 (除了自己)
              candidates = gameState.players.filter(p => p.id !== gameState.currentLeaderId);
            }

            // 獲取符合護身符接收資格的人
            // 規則：不能給退伍領袖指示物 (hasBeenLeader)、不能選擇當前領袖 (自己，即 currentLeaderId)、不能選擇拿過/使用過護身符的玩家 (hasUsedAmulet/hasAmulet/hasFailedAmulet)
            const eligibleAmuletTargets = gameState.players.filter(p => 
              p.id !== gameState.currentLeaderId && 
              !p.hasBeenLeader && 
              !p.hasUsedAmulet && 
              !p.hasAmulet && 
              !p.hasFailedAmulet
            );

            if (hasAmuletInQuest) {
              dashboardRightHTML = `
                <div style="display:flex; flex-direction:column; gap: 6px; width: 100%; max-width: 260px;">
                  <div style="font-size:10px; color:#a0aec0; text-align:left;">👑 下一任探索領袖：</div>
                  <select id="select-next-leader" style="background:#1a1d35; color:#fff; border:1px solid var(--glass-border); padding:5px; border-radius:6px; outline:none; font-size:11px;">
                    <option value="">-- 選擇下任探索領袖 --</option>
                    ${candidates.map(p => `<option value="${p.id}">${p.name}</option>`).join('')}
                  </select>
                  
                  <div style="font-size:10px; color:#a0aec0; text-align:left; margin-top:2px;">🛡️ 護身符接收者：</div>
                  <select id="select-amulet-target-simultaneous" style="background:#1a1d35; color:#fff; border:1px solid var(--glass-border); padding:5px; border-radius:6px; outline:none; font-size:11px;">
                    <option value="">-- 選擇護身符接收者 --</option>
                    ${eligibleAmuletTargets.map(p => `<option value="${p.id}">${p.name}</option>`).join('')}
                  </select>
                  
                  <button class="btn-primary" id="btn-confirm-next-leader" style="padding:6px; font-size:11px; margin-top:4px;">確認指派領袖與護身符 ➡️</button>
                </div>
              `;
            } else {
              dashboardRightHTML = `
                <div style="display:flex; flex-direction:column; gap: 8px; width: 100%; max-width: 260px;">
                  <select id="select-next-leader" style="background:#1a1d35; color:#fff; border:1px solid var(--glass-border); padding:6px; border-radius:6px; outline:none; font-size:11px;">
                    <option value="">-- 選擇下任探索領袖 --</option>
                    ${candidates.map(p => `<option value="${p.id}">${p.name}</option>`).join('')}
                  </select>
                  <button class="btn-primary" id="btn-confirm-next-leader" style="padding:6px; font-size:11px;">授勳傳承，指派下屆 ➡️</button>
                </div>
              `;
            }
          } else {
            let subText = hasAmuletInQuest 
              ? `現任領袖【${currentLeader.name}】正在指派新領袖並分發護身符...` 
              : `現任領袖【${currentLeader.name}】正在尋求適任的探索領袖人選...`;
            
            dashboardCenterHTML = `
              <div class="dashboard-center">
                <span class="status-tip">👑 領袖繼位儀式中</span>
                <span class="status-main">${subText}</span>
              </div>
            `;
            dashboardRightHTML = `
              <div style="text-align:center; color:#a0aec0; font-size:var(--fs-sm);">
                請静待下任領袖就座 🛡️
              </div>
            `;
          }
        }
        break;

      case GAME_PHASES.TEAM_SELECTION:
        if (myPlayer.isLeader) {
          dashboardCenterHTML = `
            <div class="dashboard-center">
              <span class="status-tip">🔮 領袖權能 - 指派出任務隊伍</span>
              <span class="status-main">請選擇 ${currentQuest.players} 名出任務成員與 1 名魔法受益者</span>
            </div>
          `;

          // 右方選人互動
          const nonLeaderPlayers = gameState.players;
          const selectedCount = this.localState.selectedTeamIds.length;
          
          dashboardRightHTML = `
            <div style="display:flex; flex-direction:column; gap: 10px; width: 100%; max-width: 320px;">
              <div style="font-size:11px; color:#a0aec0;">已選出任務隊員：(${selectedCount} / ${currentQuest.players})</div>
              <div style="display:flex; flex-wrap:wrap; gap:6px;">
                ${nonLeaderPlayers.map(p => {
                   const isChecked = this.localState.selectedTeamIds.includes(p.id);
                   return `
                     <button class="btn-select-player ${isChecked ? 'btn-primary' : ''}" 
                             style="padding:6px 12px; font-size:11px; border-radius:6px;" 
                             data-player-id="${p.id}">
                       ${p.name}
                     </button>
                   `;
                }).join('')}
              </div>
              
              <div style="display:flex; align-items:center; gap: 10px; margin-top:5px;">
                <label style="font-size:11px; color:#a0aec0; min-width:80px;">賦予魔法：</label>
                <select id="select-magic-user" style="background:#1a1d35; color:#fff; border:1px solid var(--glass-border); padding:6px; border-radius:6px; flex:1; outline:none;">
                  <option value="">-- 選擇魔法加持者 --</option>
                  ${nonLeaderPlayers.filter(p => this.localState.selectedTeamIds.includes(p.id)).map(p => `
                    <option value="${p.id}" ${this.localState.magicUserId === p.id ? 'selected' : ''}>${p.name}</option>
                  `).join('')}
                </select>
              </div>
              
              <button class="btn-primary" id="btn-confirm-team" style="margin-top:5px; padding:10px;" ${selectedCount !== currentQuest.players ? 'disabled' : ''}>
                指派完成，出發探索！
              </button>
            </div>
          `;
        } else {
          dashboardCenterHTML = `
            <div class="dashboard-center">
              <span class="status-tip">🛡️ 專注出發前準備...</span>
              <span class="status-main">領袖【${currentLeader.name}】正在指派第 ${gameState.currentQuestIndex + 1} 回合出任務成員與魔法...</span>
            </div>
          `;
          dashboardRightHTML = `
            <div style="text-align:center; color:#a0aec0; font-size:var(--fs-sm); display:flex; flex-direction:column; gap:4px; border: 1px dashed var(--glass-border); padding: 8px; border-radius: 6px; background: rgba(255,255,255,0.01);">
              <span style="font-weight:bold; color:var(--color-good);">📋 當前領袖挑選中：</span>
              <span style="color:#e2e8f0; font-size:11.5px;">
                ${gameState.selectedTeamIds.length > 0 
                  ? gameState.players.filter(p => gameState.selectedTeamIds.includes(p.id)).map(p => p.name).join('、')
                  : '⏳ 尚未選定隊員'
                }
              </span>
              ${gameState.magicUserId 
                ? `<span style="color:#00f0ff; font-size:10px; margin-top:2px;">⚡ 已指派魔法給：${gameState.players.find(p => p.id === gameState.magicUserId)?.name}</span>`
                : ''
              }
            </div>
          `;
        }
        break;

      case GAME_PHASES.VOTE:
        // 如果我在此次指派的隊伍中
        const inTeam = gameState.selectedTeamIds.includes(myPlayer.id);
        const hasVoted = gameState.votes[myPlayer.id] !== undefined;

        if (inTeam) {
          if (hasVoted) {
            dashboardCenterHTML = `
              <div class="dashboard-center">
                <span class="status-tip">🗳️ 投票完成</span>
                <span class="status-main">你已秘密投出這次探索的結果，等待其他隊員投完...</span>
              </div>
            `;
            dashboardRightHTML = `
              <div style="text-align:center; color:var(--color-success); font-weight:bold;">
                已投票 🔒
              </div>
            `;
          } else {
            dashboardCenterHTML = `
              <div class="dashboard-center">
                <span class="status-tip">⚔️ 聖杯任務交鋒 - 請投出結果</span>
                <span class="status-main">你是本次探索隊員！請秘密選擇投入你的任務牌。</span>
              </div>
            `;

            // 限制好人或持魔法者只能出成功牌
            const mustSuccess = myPlayer.alignment === ALIGNMENT.GOOD || myPlayer.hasMagicToken;
            
            // 特殊限制
            let failDisabled = false;
            let successDisabled = false;
            let extraTip = '';

            if (mustSuccess) {
              // 好人或一般魔法受益者
              failDisabled = true;
              extraTip = '正義陣營或魔法受益者必须投成功牌！';
              
              // 摩根勒菲免疫魔法
              if (myPlayer.roleId === 'MORGAN_LE_FAY') {
                failDisabled = false;
                extraTip = '你雖有魔法，但因你是【摩根勒菲】而可不受限制！';
              }
              // 破壞者如果持有退伍領袖必須投失敗
              if (myPlayer.roleId === 'SABOTEUR' && myPlayer.isExLeader) {
                successDisabled = true;
                failDisabled = false;
                extraTip = '你作為持有退伍領袖的【破壞者】，魔法失效且必須出失敗！';
              }
            }

            if (myPlayer.roleId === 'MADMAN' && !myPlayer.hasMagicToken) {
              // 瘋子沒魔法必須出失敗
              successDisabled = true;
              extraTip = '你是【瘋子】且沒有魔法加護，必須投入失敗牌！';
            }
            if (myPlayer.roleId === 'BARBARIAN' && gameState.currentQuestIndex >= 3) {
              // 野蠻人任務4,5必成功
              failDisabled = true;
              extraTip = '你是【野蠻人】，在第四和第五回合只能投成功牌！';
            }

            dashboardRightHTML = `
              <div style="display:flex; gap: 15px;">
                <button class="btn-primary" id="btn-vote-success" style="padding:15px; min-width:80px;" ${successDisabled ? 'disabled' : ''}>
                  🟢 成功
                </button>
                <button class="btn-danger" id="btn-vote-failed" style="padding:15px; min-width:80px;" ${failDisabled ? 'disabled' : ''}>
                  🔴 失敗
                </button>
              </div>
              ${extraTip ? `<div style="color:var(--color-warning); font-size:9px; text-align:center; width:100%; margin-top:5px;">${extraTip}</div>` : ''}
            `;
          }
        } else {
          // 我不是任務隊員，靜待結果
          dashboardCenterHTML = `
            <div class="dashboard-center">
              <span class="status-tip">🤫 探索交鋒中</span>
              <span class="status-main">指派隊員正在暗室內秘密交火，決定任務勝負...</span>
            </div>
          `;
          dashboardRightHTML = `
            <div style="text-align:center; color:#a0aec0; font-size:var(--fs-sm);">
              等待隊員投票...
            </div>
          `;
        }
        break;

      case GAME_PHASES.VOTE_REVEAL:
        dashboardCenterHTML = `
          <div class="dashboard-center">
            <span class="status-tip">📢 任務結果揭曉</span>
            <span class="status-main">本次開票結果已混洗並呈現於盤面中央！</span>
          </div>
        `;

        // 渲染開出來的混洗任務卡牌
        const cardsHTML = gameState.revealedVotes.map(v => `
          <div class="opened-card ${v.toLowerCase()}">${v === 'SUCCESS' ? '🟢 成功' : '🔴 失敗'}</div>
        `).join('');

        dashboardRightHTML = `
          <div style="display:flex; flex-direction:column; align-items:center; gap: 10px;">
            <div class="reveal-cards-area">
              ${cardsHTML}
            </div>
            ${myPlayer.isLeader ? `
              <button class="btn-primary" id="btn-confirm-quest" style="padding:6px 12px; font-size:11px;">
                領袖確認結果，下回合 ➡️
              </button>
            ` : `
              <span style="font-size:11px; color:#a0aec0;">等待領袖帶入下回合...</span>
            `}
          </div>
        `;
        break;

      case GAME_PHASES.AMULET:
        if (myPlayer.isLeader) {
          dashboardCenterHTML = `
            <div class="dashboard-center">
              <span class="status-tip">🛡️ 護身符降臨 - 領袖權能</span>
              <span class="status-main">請選擇一名符合資格的玩家分發「護身符」</span>
            </div>
          `;

          // 獲取符合護身符接收資格的人
          // 規則：不能給當前新領袖、不能給退伍領袖（剛卸任的領袖，即 exLeaderId）
          const eligiblePlayers = gameState.players.filter(p => 
            p.id !== gameState.currentLeaderId && 
            p.id !== gameState.exLeaderId
          );

          dashboardRightHTML = `
            <div style="display:flex; flex-direction:column; gap: 8px; width: 100%; max-width:240px;">
              <select id="select-amulet-target" style="background:#1a1d35; color:#fff; border:1px solid var(--glass-border); padding:8px; border-radius:6px; outline:none;">
                <option value="">-- 選擇目標玩家 --</option>
                ${eligiblePlayers.map(p => `<option value="${p.id}">${p.name}</option>`).join('')}
              </select>
              <button class="btn-primary" id="btn-confirm-amulet" style="padding:8px;">賦予護身符</button>
            </div>
          `;
        } else {
          dashboardCenterHTML = `
            <div class="dashboard-center">
              <span class="status-tip">🛡️ 護身符啟動中</span>
              <span class="status-main">領袖【${currentLeader.name}】正在將護身符交給一名探索勇士...</span>
            </div>
          `;
          dashboardRightHTML = `
            <div style="text-align:center; color:#a0aec0;">請靜候結果</div>
          `;
        }
        break;

      case GAME_PHASES.AMULET_REVEAL:
        // 當前護身符持有者
        const isHolder = myPlayer.id === gameState.amuletHolderId;
        const holderPlayer = gameState.players.find(p => p.id === gameState.amuletHolderId);
        if (isHolder) {
          const scanTargets = gameState.players.filter(p => 
            p.id !== myPlayer.id &&
            p.id !== gameState.currentLeaderId &&
            p.id !== gameState.exLeaderId &&
            !p.hasFailedAmulet
          );

          if (!this.localState.amuletScanned) {
            dashboardCenterHTML = `
              <div class="dashboard-center">
                <span class="status-tip">🔍 護身符啟動 - 探索驗身權</span>
                <span class="status-main">請挑選一名玩家，並點擊下方「開始秘密秘密驗證」以防旁人窺視。</span>
              </div>
            `;

            dashboardRightHTML = `
              <div style="display:flex; flex-direction:column; gap:8px; width:100%; max-width:240px;">
                <select id="select-scan-target" style="background:#1a1d35; color:#fff; border:1px solid var(--glass-border); padding:8px; border-radius:6px; outline:none; font-size:11px;">
                  <option value="">-- 選擇掃描對象 --</option>
                  ${scanTargets.map(p => `<option value="${p.id}">${p.name}</option>`).join('')}
                </select>
                <button class="btn-primary" id="btn-start-secret-scan" style="padding:8px; font-size:11px;">🔒 開始秘密驗證</button>
              </div>
            `;
          } else {
            const targetId = this.localState.amuletTargetId;
            const target = gameState.players.find(p => p.id === targetId);
            
            // 取得真實身分或特殊能力偽裝
            let alignmentResult = target.alignment;
            if (target.roleId === 'TROUBLEMAKER') {
              alignmentResult = ALIGNMENT.EVIL;
            }
            const isTrickster = target.roleId === 'TRICKSTER';
            
            const alignText = alignmentResult === ALIGNMENT.GOOD ? '正義盟友 🟢' : '邪惡爪牙 🔴';
            const alignColor = alignmentResult === ALIGNMENT.GOOD ? 'var(--color-good)' : 'var(--color-error)';

            dashboardCenterHTML = `
              <div class="dashboard-center">
                <span class="status-tip" style="color:${alignColor};">🔍 驗身結果已顯現 (限本機防窺)</span>
                <span class="status-main">【${target.name}】的真實陣營為：<b style="color:${alignColor}; font-size:14px;">${alignText}</b> ${isTrickster ? '<br><span style="color:#ecc94b; font-size:10px;">⚠️ 該玩家是【騙徒】，結果可能為偽裝！</span>' : ''}</span>
              </div>
            `;

            dashboardRightHTML = `
              <div style="display:flex; flex-direction:column; gap:6px; width:100%; max-width:260px;">
                <div style="font-size:10px; color:#a0aec0; text-align:center; font-weight:bold;">✨ 請選擇你要對圓桌會議宣告的陣營 ✨</div>
                <div style="display:flex; gap:4px; justify-content:center;">
                  <button class="btn-primary" id="btn-declare-good" style="padding:6px; font-size:10.5px; background:var(--color-good); border:none; flex:1; color:#0b0d19; font-weight:bold;">🟢 宣稱正義</button>
                  <button class="btn-danger" id="btn-declare-evil" style="padding:6px; font-size:10.5px; background:var(--color-error); border:none; flex:1; font-weight:bold;">🔴 宣稱邪惡</button>
                  <button class="btn-purple" id="btn-declare-secret" style="padding:6px; font-size:10.5px; background:#ecc94b; border:none; flex:1; color:#000; font-weight:bold;">🟡 不公開</button>
                </div>
              </div>
            `;
          }
        } else {
          dashboardCenterHTML = `
            <div class="dashboard-center">
              <span class="status-tip">🔍 護身符神光審理</span>
              <span class="status-main">【${holderPlayer.name}】正在手握護身符，掃描另一名成員的靈魂...</span>
            </div>
          `;
          dashboardRightHTML = `
            <div style="text-align:center; color:#a0aec0; font-size:var(--fs-sm);">
              天照神光，罪孽無形
            </div>
          `;
        }
        break;

      case GAME_PHASES.FINAL_QUEST:
        {
          const evilNum = gameState.players.filter(p=>p.alignment===ALIGNMENT.EVIL && p.roleId!=='REVEALER').length;
          const selectedPointedCount = this.localState.selectedPointingIds.length;
          
          const requiredPointers = gameState.players; // 全員指認
          const allSubmitted = requiredPointers.every(p => gameState.submittedPointings && gameState.submittedPointings.includes(p.id));

          if (!allSubmitted) {
            dashboardCenterHTML = `
              <div class="dashboard-center">
                <span class="status-tip" style="color:var(--color-warning); font-weight:900;">🚨 最終指認 - 秘密投射中...</span>
                <span class="status-main" style="font-size:11.5px;">請商議。所有玩家必須在右側秘密送出兩名嫌疑犯，待所有人送出後才揭露指向與開啟技能。</span>
              </div>
            `;
          } else {
            dashboardCenterHTML = `
              <div class="dashboard-center">
                <span class="status-tip" style="color:var(--color-error); font-weight:900;">🚨 最終指認 - 全員指向揭曉</span>
                <span class="status-main" style="font-size:11.5px;">指向已揭曉！公爵與大公可在右側發動神力。Host 勾選確認最終的 ${evilNum} 名壞人以定局。</span>
              </div>
            `;
          }

          const otherPlayers = gameState.players.filter(p => p.id !== myPlayer.id);
          const hasMySubmitted = gameState.submittedPointings && gameState.submittedPointings.includes(myPlayer.id);

          if (!allSubmitted) {
            // 第一步：秘密指認投射階段（所有人都要投，包括 Host）
            if (hasMySubmitted) {
              dashboardRightHTML = `
                <div style="display:flex; flex-direction:column; gap:6px; width:100%; max-width:280px; align-items:center; justify-content:center; border:1px dashed var(--glass-border); padding:10px; border-radius:8px;">
                  <span style="font-size:11px; color:var(--color-good); font-weight:bold;">👍 你已完成指認秘密投射！</span>
                  <span style="font-size:10px; color:#a0aec0; text-align:center; margin-top:2px;">正在等待其他玩家完成投射。<br>全部完成時將揭曉所有人的指向。</span>
                </div>
              `;
            } else {
              dashboardRightHTML = `
                <div style="display:flex; flex-direction:column; gap:6px; width:100%; max-width:280px;">
                  <div style="font-size:10px; color:#a0aec0; display:flex; justify-content:space-between;">
                    <span>指向兩位嫌疑爪牙：</span>
                    <span style="font-weight:bold; color:var(--color-good);">${selectedPointedCount} / 2</span>
                  </div>
                  <div style="display:flex; flex-wrap:wrap; gap:4px;">
                    ${otherPlayers.map(p => {
                      const isChecked = this.localState.selectedPointingIds.includes(p.id);
                      return `
                        <button class="btn-select-pointing-client ${isChecked ? 'btn-primary' : ''}" 
                                style="padding:3px 6px; font-size:10px; border-radius:4px;" 
                                data-player-id="${p.id}">
                          ${p.name}
                        </button>
                      `;
                    }).join('')}
                  </div>
                  <button class="btn-purple" id="btn-submit-pointing-client" style="padding:6px; font-size:11px; margin-top:3px;" ${selectedPointedCount !== 2 ? 'disabled' : ''}>
                    👉 送出秘密指認
                  </button>
                </div>
              `;
            }
          } else {
            // 第二步：指向揭曉與決意結算階段
            // 獲取所有現有指認關係
            const allPointings = [];
            gameState.players.forEach(p => {
              const targets = gameState.pointings && gameState.pointings[p.id] || [];
              targets.forEach(targetId => {
                const targetPlayer = gameState.players.find(x => x.id === targetId);
                if (targetPlayer) {
                  allPointings.push({
                    pointerId: p.id,
                    pointerName: p.name,
                    targetId: targetId,
                    targetName: targetPlayer.name
                  });
                }
              });
            });

            if (myPlayer.roleId === 'DUKE') {
              if (gameState.dukeIntervened) {
                dashboardRightHTML = `
                  <div style="display:flex; flex-direction:column; gap:6px; width:100%; max-width:280px; align-items:center; justify-content:center; border:1px dashed var(--glass-border); padding:10px; border-radius:8px;">
                    <span style="font-size:11px; color:var(--color-warning); font-weight:bold;">🎩 你已發動公爵神力！</span>
                    <span style="font-size:10px; color:#a0aec0; text-align:center; margin-top:2px;">強令已送出，正在靜候 Host 結算定局...</span>
                  </div>
                `;
              } else {
                const playersWithPointings = gameState.players.filter(p => {
                  const targets = gameState.pointings && gameState.pointings[p.id];
                  return targets && targets.length > 0;
                });
                dashboardRightHTML = `
                  <div style="display:flex; flex-direction:column; gap:6px; width:100%; max-width:280px;">
                    <span style="font-size:11px; color:#cbd5e0; font-weight:bold; display:flex; align-items:center; gap:4px;">🎩 公爵權能：令一隻指認手放下</span>
                    <div style="font-size:9.5px; color:#a0aec0; line-height:1.2; margin-bottom:2px;">
                      1. 勾選決定要干涉的玩家 (限選 1)；<br>
                      2. 勾選該玩家要放手的指認目標 (限選 1)。
                    </div>
                    <div style="display:flex; flex-direction:column; gap:5px; max-height:180px; overflow-y:auto; padding-right:4px;">
                      ${playersWithPointings.map(p => {
                        const targets = gameState.pointings[p.id] || [];
                        return `
                          <div class="duke-player-block" style="background:rgba(255,255,255,0.02); border:1px solid var(--glass-border); padding:6px; border-radius:8px; display:flex; flex-direction:column; gap:4px;">
                            <label style="display:flex; align-items:center; gap:6px; font-size:10.5px; color:#e2e8f0; font-weight:bold; cursor:pointer;">
                              <input type="checkbox" class="chk-duke-target-player" data-player-id="${p.id}" style="accent-color:var(--color-warning);">
                              <span>🎯 干涉 ${p.name} 的指向</span>
                            </label>
                            <div class="duke-pointing-options" id="duke-options-${p.id}" style="display:none; padding-left:18px; flex-direction:column; gap:3px; margin-top:2px;">
                              ${targets.map(targetId => {
                                const targetPlayer = gameState.players.find(x => x.id === targetId);
                                if (!targetPlayer) return '';
                                return `
                                  <label style="display:flex; align-items:center; gap:6px; font-size:10px; color:#cbd5e0; cursor:pointer;">
                                    <input type="checkbox" class="chk-duke-pointing-target" data-pointer-id="${p.id}" data-target-id="${targetId}" style="accent-color:var(--color-warning);">
                                    <span>放下指向 👉 <b>${targetPlayer.name}</b></span>
                                  </label>
                                `;
                              }).join('')}
                            </div>
                          </div>
                        `;
                      }).join('')}
                      ${playersWithPointings.length === 0 ? '<div style="font-size:10px; color:#a0aec0; text-align:center; padding:10px;">目前無任何指向手勢</div>' : ''}
                    </div>
                    <button class="btn-primary" id="btn-submit-duke-checkbox" style="padding:8px; font-size:11px; margin-top:3px; background:#d69e2e; border:none;" disabled>
                      ⚡ 發動放手神力
                    </button>
                  </div>
                `;
              }
            } else if (myPlayer.roleId === 'ARCHDUKE') {
              if (gameState.archdukeIntervened) {
                dashboardRightHTML = `
                  <div style="display:flex; flex-direction:column; gap:6px; width:100%; max-width:280px; align-items:center; justify-content:center; border:1px dashed var(--glass-border); padding:10px; border-radius:8px;">
                    <span style="font-size:11px; color:var(--color-primary); font-weight:bold;">🏰 你已發動大公神力！</span>
                    <span style="font-size:10px; color:#a0aec0; text-align:center; margin-top:2px;">扭轉已送出，正在靜候 Host 結算定局...</span>
                  </div>
                `;
              } else {
                const playersWithPointings = gameState.players.filter(p => {
                  const targets = gameState.pointings && gameState.pointings[p.id];
                  return targets && targets.length > 0;
                });
                dashboardRightHTML = `
                  <div style="display:flex; flex-direction:column; gap:4px; width:100%; max-width:280px;">
                    <span style="font-size:11px; color:#cbd5e0; font-weight:bold;">🏰 大公權能：將一隻手指向改向</span>
                    <div style="font-size:9.5px; color:#a0aec0; line-height:1.2;">
                      1. 勾選決定要干涉的玩家 (限選 1)；<br>
                      2. 勾選該玩家要轉移的舊目標 (限選 1)；<br>
                      3. 勾選一個全場新目標 (限選 1)。
                    </div>
                    
                    <div style="display:flex; flex-direction:column; gap:5px; max-height:130px; overflow-y:auto; padding-right:4px; margin-bottom:2px;">
                      ${playersWithPointings.map(p => {
                        const targets = gameState.pointings[p.id] || [];
                        return `
                          <div class="archduke-player-block" style="background:rgba(255,255,255,0.02); border:1px solid var(--glass-border); padding:6px; border-radius:8px; display:flex; flex-direction:column; gap:4px;">
                            <label style="display:flex; align-items:center; gap:6px; font-size:10.5px; color:#e2e8f0; font-weight:bold; cursor:pointer;">
                              <input type="checkbox" class="chk-archduke-target-player" data-player-id="${p.id}" style="accent-color:var(--color-primary);">
                              <span>🎯 干涉 ${p.name} 的指向</span>
                            </label>
                            <div class="archduke-pointing-options" id="archduke-options-${p.id}" style="display:none; padding-left:18px; flex-direction:column; gap:3px; margin-top:2px;">
                              ${targets.map(targetId => {
                                const targetPlayer = gameState.players.find(x => x.id === targetId);
                                if (!targetPlayer) return '';
                                return `
                                  <label style="display:flex; align-items:center; gap:6px; font-size:10px; color:#cbd5e0; cursor:pointer;">
                                    <input type="checkbox" class="chk-archduke-old-target" data-pointer-id="${p.id}" data-old-id="${targetId}" style="accent-color:var(--color-primary);">
                                    <span>轉移此指向 👉 <b>${targetPlayer.name}</b></span>
                                  </label>
                                `;
                              }).join('')}
                            </div>
                          </div>
                        `;
                      }).join('')}
                      ${playersWithPointings.length === 0 ? '<div style="font-size:9px; color:#a0aec0; text-align:center;">無任何有效指向</div>' : ''}
                    </div>

                    <div id="archduke-new-target-container" style="display:none; flex-direction:column; gap:3px;">
                      <div style="font-size:9.5px; color:#a0aec0;">3. 選擇扭轉指向的新對象：(限選 1)</div>
                      <div style="display:flex; flex-wrap:wrap; gap:3px; max-height:70px; overflow-y:auto; padding-right:4px;">
                        ${gameState.players.map(p => `
                          <label style="display:flex; align-items:center; gap:4px; background:rgba(255,255,255,0.03); border:1px solid var(--glass-border); padding:3px 6px; border-radius:6px; font-size:9.5px; color:#e2e8f0; cursor:pointer;">
                            <input type="checkbox" class="chk-archduke-new-target" data-new-id="${p.id}" style="accent-color:var(--color-good);">
                            <span>${p.name}</span>
                          </label>
                        `).join('')}
                      </div>
                    </div>

                    <button class="btn-primary" id="btn-submit-archduke-checkbox" style="padding:8px; font-size:11px; margin-top:4px; background:#3182ce; border:none;" disabled>
                      ⚡ 發動扭轉改向
                    </button>
                  </div>
                `;
              }
            } else if (peerManager.isHost) {
              dashboardRightHTML = `
                <div style="display:flex; flex-direction:column; gap:6px; width:100%; max-width:280px; align-items:center; justify-content:center; border:1px dashed var(--glass-border); padding:10px; border-radius:8px;">
                  <span style="font-size:11.5px; color:var(--color-warning); font-weight:bold;">🏁 指認投射揭曉，等待終局</span>
                  <span style="font-size:10px; color:#a0aec0; text-align:center; margin-top:2px;">好人已完成指向投射，大公/公爵亦可對手指發動干涉。</span>
                  <button class="btn-danger" id="btn-submit-final-quest-auto" style="padding:8px; font-size:11px; margin-top:5px; width:100%;">
                    🏁 進行自動勝負結算
                  </button>
                </div>
              `;
            } else {
              dashboardRightHTML = `
                <div style="display:flex; flex-direction:column; gap:6px; width:100%; max-width:280px; align-items:center; justify-content:center; border:1px dashed var(--glass-border); padding:10px; border-radius:8px;">
                  <span style="font-size:11px; color:var(--color-good); font-weight:bold;">✨ 全員秘密指認已解鎖！</span>
                  <span style="font-size:10px; color:#a0aec0; text-align:center; margin-top:2px;">請觀察圓桌與歷史的指向交鋒。<br>等待公爵/大公操作，或 Host 點擊進行自動結算...</span>
                </div>
              `;
            }
          }
        }
        break;

      case GAME_PHASES.HUNT:
        // 盲眼殺手獵殺（3勝時）
        const isAssassin = myPlayer.roleId === 'BLIND_ASSASSIN';
        const assassinPlayer = gameState.players.find(p => p.roleId === 'BLIND_ASSASSIN');

        if (isAssassin) {
          const selectedHuntCount = this.localState.selectedHuntIds.length;
          dashboardCenterHTML = `
            <div class="dashboard-center">
              <span class="status-tip">🏹 盲眼殺手獵殺行動</span>
              <span class="status-main">選擇指認兩名正義方玩家。若正確（或殺到首位亞瑟），邪惡方反敗為勝！</span>
            </div>
          `;

          dashboardRightHTML = `
            <div style="display:flex; flex-direction:column; gap:8px; width:100%; max-width:280px;">
              <div style="font-size:10px; color:#a0aec0;">選中目標：(${selectedHuntCount} / 2)</div>
              <div style="display:flex; flex-wrap:wrap; gap:6px;">
                ${gameState.players.filter(p=>p.id !== myPlayer.id).map(p => {
                   const isChecked = this.localState.selectedHuntIds.includes(p.id);
                   return `
                     <button class="btn-select-hunt ${isChecked ? 'btn-primary' : ''}" 
                             style="padding:4px 8px; font-size:10px; border-radius:4px;" 
                             data-player-id="${p.id}">
                       ${p.name}
                     </button>
                   `;
                }).join('')}
              </div>
              <button class="btn-danger" id="btn-execute-hunt" style="padding:8px;" ${selectedHuntCount !== 2 ? 'disabled' : ''}>
                發射毒箭，開始獵殺！
              </button>
            </div>
          `;
        } else {
          dashboardCenterHTML = `
            <div class="dashboard-center">
              <span class="status-tip">🏹 盲眼獵殺威脅</span>
              <span class="status-main">三勝勝利！但【${assassinPlayer.name}】正在盲眼獵殺中，好人同盟請屏息等待...</span>
            </div>
          `;
          dashboardRightHTML = `
            <div style="text-align:center; color:var(--color-error); font-weight:bold; animation:pulse 1s infinite;">
              箭在弦上... 🎯
            </div>
          `;
        }
        break;

      case GAME_PHASES.END:
        const isGoodWinner = gameState.winner === ALIGNMENT.GOOD;
        dashboardCenterHTML = `
          <div class="dashboard-center">
            <span class="status-tip" style="color:${isGoodWinner ? 'var(--color-success)' : 'var(--color-error)'}">
              🏆 聖杯探索終結
            </span>
            <span class="status-main" style="font-size:var(--fs-xl);">
              ${isGoodWinner ? '👑 正義陣營獲勝！👑' : '😈 邪惡陣營獲勝！😈'}
            </span>
          </div>
        `;

        dashboardRightHTML = `
          <div style="display:flex; flex-direction:column; gap:5px; align-items:center;">
            <button class="btn-primary" id="btn-back-lobby">返回圓桌大廳</button>
          </div>
        `;
        break;
    }

    // 6. 聖杯與護身符大事記 (Chronicles Interleaving History)
    const questHistory = gameState.questHistory || [];
    const amuletHistory = gameState.amuletHistory || [];
    const combinedHistory = [];
    
    questHistory.forEach(h => {
      combinedHistory.push({
        type: 'QUEST',
        round: h.round,
        data: h
      });
    });
    
    amuletHistory.forEach(h => {
      combinedHistory.push({
        type: 'AMULET',
        round: h.round,
        data: h
      });
    });
    
    // 依 round 排序，若 round 相同則 QUEST 排在前面
    combinedHistory.sort((a, b) => {
      if (a.round === b.round) {
        return a.type === 'QUEST' ? -1 : 1;
      }
      return a.round - b.round;
    });

    const chroniclesHTML = `
      <div class="chronicles-panel">
        <h3 class="chronicles-title" style="margin:0; font-size:13px; font-weight:bold; letter-spacing:1px; border-bottom:1px solid rgba(255,255,255,0.1); padding-bottom:8px; display:flex; align-items:center; gap:6px;">📜 探索大事記</h3>
        <div class="chronicles-list" style="display:flex; flex-direction:column; gap:10px; margin-top: 10px;">
          ${combinedHistory.length === 0 ? `
            <div class="chronicles-empty" style="font-size:11px; color:#a0aec0; text-align:center; padding:20px 0; font-style:italic;">尚無探索歷史。首個任務出發後將記錄於此...</div>
          ` : combinedHistory.map(item => {
            if (item.type === 'QUEST') {
              const h = item.data;
              const isSuccess = h.result === 'SUCCESS';
              return `
                <div class="chronicles-item" style="border-left:3px solid ${isSuccess ? 'var(--color-good)' : 'var(--color-error)'}; background:rgba(255,255,255,0.02); padding:8px; border-radius:4px; font-size:11px; display:flex; flex-direction:column; gap:4px;">
                  <div class="chronicles-item-header" style="display:flex; justify-content:space-between; font-weight:bold; border-bottom:1px solid rgba(255,255,255,0.05); padding-bottom:4px; margin-bottom:4px;">
                    <span style="color:#a0aec0;">任務 T${h.round}</span>
                    <span style="color:${isSuccess ? 'var(--color-good)' : 'var(--color-error)'};">
                      ${isSuccess ? '🟢 勝利' : '🔴 失敗'}
                    </span>
                  </div>
                  <div class="chronicles-item-body" style="display:flex; flex-direction:column; gap:2px; color:#e2e8f0;">
                    <div><span style="color:#718096;">👑 領袖：</span>${h.leaderName}</div>
                    <div><span style="color:#718096;">🛡️ 隊員：</span>${h.teamNames.join('、')}</div>
                    <div><span style="color:#718096;">⚡ 魔法：</span>${h.magicUserName || '無'}</div>
                    <div><span style="color:#718096;">❌ 失敗卡：</span>${h.failsCount} 張</div>
                  </div>
                </div>
              `;
            } else {
              const h = item.data;
              let alignmentText = '';
              let borderCol = '';
              if (h.declaredAlignment === 'GOOD') {
                alignmentText = '<span style="color:var(--color-good);">🟢 宣稱正義</span>';
                borderCol = 'var(--color-good)';
              } else if (h.declaredAlignment === 'EVIL') {
                alignmentText = '<span style="color:var(--color-error);">🔴 宣稱邪惡</span>';
                borderCol = 'var(--color-error)';
              } else {
                alignmentText = '<span style="color:#ecc94b;">🟡 選擇不公開</span>';
                borderCol = '#ecc94b';
              }
              return `
                <div class="chronicles-item" style="border-left:3px solid ${borderCol}; background:rgba(255,255,255,0.02); padding:8px; border-radius:4px; font-size:11px; display:flex; flex-direction:column; gap:4px;">
                  <div class="chronicles-item-header" style="display:flex; justify-content:space-between; font-weight:bold; border-bottom:1px solid rgba(255,255,255,0.05); padding-bottom:4px; margin-bottom:4px;">
                    <span style="color:#a0aec0;">護身符 T${h.round}</span>
                    <span>${alignmentText}</span>
                  </div>
                  <div class="chronicles-item-body" style="display:flex; flex-direction:column; gap:2px; color:#e2e8f0;">
                    <div><span style="color:#718096;">🔍 使用者：</span>${h.checkerName}</div>
                    <div><span style="color:#718096;">🎯 目標：</span>${h.targetName}</div>
                  </div>
                </div>
              `;
            }
          }).join('')}
        </div>
      </div>
    `;

    // 7. 全員指認現場追蹤面板 (Pointing Tracking Panel)
    let pointingSectionHTML = '';
    if (gameState.phase === GAME_PHASES.FINAL_QUEST) {
      const pointings = gameState.pointings || {};
      const requiredPointers = gameState.players; // 全員都必須投
      const allSubmitted = requiredPointers.every(p => gameState.submittedPointings && gameState.submittedPointings.includes(p.id));

      pointingSectionHTML = `
        <div class="pointing-panel" style="width:280px; background:var(--glass-bg); border:1px solid var(--glass-border); border-radius:12px; padding:15px; display:flex; flex-direction:column; gap:10px; max-height:220px; overflow-y:auto; box-shadow:0 8px 32px rgba(0,0,0,0.37);">
          <h3 style="margin:0; font-size:13px; font-weight:bold; color:var(--color-error); border-bottom:1px solid rgba(255,255,255,0.1); padding-bottom:8px; display:flex; align-items:center; gap:6px;">👉 指認現場追蹤</h3>
          <div style="display:flex; flex-direction:column; gap:8px;">
            ${gameState.players.map(p => {
              const hasSubmitted = gameState.submittedPointings && gameState.submittedPointings.includes(p.id);
              
              let statusText = '';
              let specialActionsHTML = '';

              if (!allSubmitted) {
                statusText = hasSubmitted 
                  ? '<span style="color:var(--color-success); font-weight:bold;">✅ 已送出指認 🔒</span>' 
                  : '<span style="color:#cbd5e0; font-style:italic;">⏳ 思考指認中...</span>';
              } else {
                // 已全員完成，揭曉指向，並且解鎖公爵與大公
                const targets = pointings[p.id] || [];
                const targetNames = gameState.players.filter(t => targets.includes(t.id)).map(t => t.name).join('、');
                statusText = targets.length === 0 
                  ? '<i style="color:#718096;">放下雙手 💤</i>' 
                  : `👉 【${targetNames}】`;

                // (公爵與大公已改用右側控制面板的 Checkbox 機制，此處行內不再重複渲染)
              }

              return `
                <div style="font-size:11px; display:flex; justify-content:space-between; align-items:center; background:rgba(255,255,255,0.02); padding:6px; border-radius:4px; border:1px solid rgba(255,255,255,0.05);">
                  <div>
                    <span style="font-weight:bold; color:#a0aec0;">${p.name}：</span>
                    <span>${statusText}</span>
                  </div>
                  <div style="display:flex; gap:2px;">
                    ${specialActionsHTML}
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      `;
    }

    // 整合右側欄
    const rightSideHTML = `
      <div class="game-right-panel" style="display:flex; flex-direction:column; gap:15px;">
        ${chroniclesHTML}
        ${pointingSectionHTML}
      </div>
    `;

    // 8. 常駐聖物 Legend 面板
    const legendPanelHTML = `
      <div class="legend-panel">
        <div class="legend-title">✨ 聖物指示物圖例說明 ✨</div>
        <div class="legend-grid">
          <div class="legend-item"><span class="legend-icon">👑</span> 領袖指示物 (當前探索指派者)</div>
          <div class="legend-item"><span class="legend-icon">📜</span> 退伍領袖 (Last Leader Token, 剛卸任)</div>
          <div class="legend-item"><span class="legend-icon">🎖️</span> 曾任領袖 (Veteran Token, 當過領袖)</div>
          <div class="legend-item"><span class="legend-icon">⚡</span> 魔法保護 (得票強迫成功，魔女/破壞者例外)</div>
          <div class="legend-item"><span class="legend-icon">🛡️</span> 出任務成員 (本回合探索隊員)</div>
          <div class="legend-item"><span class="legend-icon">🔍</span> 護身符 (擁有驗身特權)</div>
          <div class="legend-item"><span class="legend-icon">🔒</span> 褪色護身符 (已被檢視過，不可再拿)</div>
        </div>
      </div>
    `;

    // 結合主要盤面
    this.container.innerHTML = `
      <div class="game-container">
        ${topBarHTML}
        
        <div class="game-main-layout">
          <!-- 左側常駐角色名冊 -->
          ${leftSideHTML}
          
          <!-- 3D 圓桌與環繞玩家 -->
          <div class="table-area">
            <div class="game-table">
              ${centerBoardHTML}
            </div>
            ${playerNodesHTML}
          </div>
          
          <!-- 聖杯大事記與指認追蹤 -->
          ${rightSideHTML}
        </div>
        
        <!-- 常駐聖物圖例 Legend 面板 -->
        ${legendPanelHTML}
        
        <!-- 系統日誌日誌 -->
        <div class="logs-panel" style="width: 90vw; max-width: 800px; margin-top: 10px; margin-bottom: 10px;">
          ${logsHTML}
        </div>
        
        <!-- 玩家面板控制台 -->
        <div class="dashboard-area">
          <div class="dashboard-panel">
            ${dashboardLeftHTML}
            ${dashboardCenterHTML}
            <div style="flex: 1; display:flex; justify-content:flex-end;">
              ${dashboardRightHTML}
            </div>
          </div>
        </div>
      </div>
    `;

    this.bindGameEvents(gameState, myPlayer, peerManager);
  }

  /**
   * 綁定遊戲內 UI 事件
   */
  bindGameEvents(gameState, myPlayer, peerManager) {
    // 複製房號
    const copyBtn = document.getElementById('btn-game-copy-code');
    if (copyBtn) {
      copyBtn.onclick = () => {
        navigator.clipboard.writeText(peerManager.roomCode);
        alert('房號已複製！');
      };
    }

    // 退隱江湖
    const quitBtn = document.getElementById('btn-quit-game');
    if (quitBtn) {
      quitBtn.onclick = () => {
        if (confirm('確定要退出遊戲並關閉房間嗎？')) {
          peerManager.destroy();
          window.location.reload();
        }
      };
    }

    // --- LEADER_SELECTION 階段 ---
    if (gameState.phase === GAME_PHASES.LEADER_SELECTION && myPlayer.isLeader) {
      const confirmNextLeaderBtn = document.getElementById('btn-confirm-next-leader');
      if (confirmNextLeaderBtn) {
        confirmNextLeaderBtn.onclick = () => {
          const selectNextLeader = document.getElementById('select-next-leader');
          const nextLeaderId = selectNextLeader.value;
          if (!nextLeaderId) {
            alert('請先指定下一任探索領袖！');
            return;
          }

          // 判斷是否需要同時選擇護身符
          const boardConfig = BOARD_CONFIGS[gameState.players.length];
          const lastQuest = boardConfig ? boardConfig.quests[gameState.currentQuestIndex] : null;
          const hasAmuletInQuest = lastQuest && lastQuest.amulet && gameState.players.length >= 6;

          let amuletTargetId = null;
          if (hasAmuletInQuest) {
            const selectAmulet = document.getElementById('select-amulet-target-simultaneous');
            amuletTargetId = selectAmulet ? selectAmulet.value : '';
            if (!amuletTargetId) {
              alert('此回合包含護身符，請同時選擇護身符接收者！');
              return;
            }
            if (nextLeaderId === amuletTargetId) {
              alert('下一任探索領袖與護身符接收者不能是同一人！');
              return;
            }
          }

          this.onAction('SELECT_NEXT_LEADER', { nextLeaderId, amuletTargetId });
        };
      }
    }

    // --- TEAM_SELECTION 階段 ---
    if (gameState.phase === GAME_PHASES.TEAM_SELECTION && myPlayer.isLeader) {
      // 點選出任務隊員
      document.querySelectorAll('.btn-select-player').forEach(btn => {
        btn.onclick = () => {
          const playerId = btn.getAttribute('data-player-id');
          const currentQuest = BOARD_CONFIGS[gameState.players.length].quests[gameState.currentQuestIndex];
          
          let list = [...this.localState.selectedTeamIds];
          if (list.includes(playerId)) {
            list = list.filter(id => id !== playerId);
            // 同時移除 magic
            if (this.localState.magicUserId === playerId) this.localState.magicUserId = null;
          } else {
            if (list.length < currentQuest.players) {
              list.push(playerId);
            }
          }
          this.localState.selectedTeamIds = list;
          
          // 實時廣播隊伍選擇
          this.onAction('SELECT_TEAM_MEMBER', {
            teamPlayerIds: this.localState.selectedTeamIds,
            magicUserId: this.localState.magicUserId
          });
          
          this.renderMainGameBoard(gameState, myPlayer, peerManager);
        };
      });

      // 選擇魔法受益人
      const selectMagic = document.getElementById('select-magic-user');
      if (selectMagic) {
        selectMagic.onchange = (e) => {
          this.localState.magicUserId = e.target.value || null;
          
          // 實時廣播隊伍選擇
          this.onAction('SELECT_TEAM_MEMBER', {
            teamPlayerIds: this.localState.selectedTeamIds,
            magicUserId: this.localState.magicUserId
          });
          
          this.renderMainGameBoard(gameState, myPlayer, peerManager);
        };
      }

      // 確認出隊
      const confirmTeamBtn = document.getElementById('btn-confirm-team');
      if (confirmTeamBtn) {
        confirmTeamBtn.onclick = () => {
          this.onAction('SUBMIT_TEAM', {
            teamPlayerIds: this.localState.selectedTeamIds,
            magicUserId: this.localState.magicUserId
          });
          this.clearLocalState();
        };
      }
    }

    // --- VOTE 階段 ---
    if (gameState.phase === GAME_PHASES.VOTE) {
      const voteSuccess = document.getElementById('btn-vote-success');
      const voteFailed = document.getElementById('btn-vote-failed');
      
      if (voteSuccess) {
        voteSuccess.onclick = () => {
          this.onAction('CAST_VOTE', { voteValue: 'SUCCESS' });
        };
      }
      if (voteFailed) {
        voteFailed.onclick = () => {
          this.onAction('CAST_VOTE', { voteValue: 'FAILED' });
        };
      }
    }

    // --- VOTE_REVEAL 階段 ---
    if (gameState.phase === GAME_PHASES.VOTE_REVEAL && myPlayer.isLeader) {
      const confirmQuestBtn = document.getElementById('btn-confirm-quest');
      if (confirmQuestBtn) {
        confirmQuestBtn.onclick = () => {
          this.onAction('CONFIRM_QUEST');
        };
      }
    }

    // --- AMULET 階段 ---
    if (gameState.phase === GAME_PHASES.AMULET && myPlayer.isLeader) {
      const confirmAmuletBtn = document.getElementById('btn-confirm-amulet');
      if (confirmAmuletBtn) {
        confirmAmuletBtn.onclick = () => {
          const selectAmulet = document.getElementById('select-amulet-target');
          const targetId = selectAmulet.value;
          if (!targetId) {
            alert('請先選擇要給予護身符的隊員！');
            return;
          }
          this.onAction('ASSIGN_AMULET', { targetPlayerId: targetId });
        };
      }
    }

    // --- AMULET_REVEAL 階段 ---
    if (gameState.phase === GAME_PHASES.AMULET_REVEAL && myPlayer.id === gameState.amuletHolderId) {
      const scanBtn = document.getElementById('btn-start-secret-scan');
      if (scanBtn) {
        scanBtn.onclick = () => {
          const selectScan = document.getElementById('select-scan-target');
          const targetId = selectScan.value;
          if (!targetId) {
            alert('請選擇你要掃描驗證的對象！');
            return;
          }
          
          const target = gameState.players.find(p => p.id === targetId);
          let alignmentResult = target.alignment;
          if (target.roleId === 'TROUBLEMAKER') {
            alignmentResult = ALIGNMENT.EVIL;
          }
          const isTrickster = target.roleId === 'TRICKSTER';
          const alignText = alignmentResult === ALIGNMENT.GOOD ? '正義盟友 🟢' : '邪惡爪牙 🔴';
          const warnText = isTrickster ? '\n⚠️ 該玩家是【騙徒】，結果可能為偽裝！' : '';

          // 阻斷式防窺彈窗
          alert(`【🔍 護身符祕密驗證】\n你成功驗證了【${target.name}】的身份！\n真實陣營：${alignText}${warnText}\n\n點擊「確認」後，請在下方選擇你要對大夥公開宣稱的陣營。`);

          this.localState.amuletTargetId = targetId;
          this.localState.amuletScanned = true;
          this.renderMainGameBoard(gameState, myPlayer, peerManager);
        };
      }

      const declareGoodBtn = document.getElementById('btn-declare-good');
      if (declareGoodBtn) {
        declareGoodBtn.onclick = () => {
          const targetId = this.localState.amuletTargetId;
          this.onAction('USE_AMULET', { targetPlayerId: targetId, declaredAlignment: 'GOOD' });
          this.clearLocalState();
        };
      }

      const declareEvilBtn = document.getElementById('btn-declare-evil');
      if (declareEvilBtn) {
        declareEvilBtn.onclick = () => {
          const targetId = this.localState.amuletTargetId;
          this.onAction('USE_AMULET', { targetPlayerId: targetId, declaredAlignment: 'EVIL' });
          this.clearLocalState();
        };
      }

      const declareSecretBtn = document.getElementById('btn-declare-secret');
      if (declareSecretBtn) {
        declareSecretBtn.onclick = () => {
          const targetId = this.localState.amuletTargetId;
          this.onAction('USE_AMULET', { targetPlayerId: targetId, declaredAlignment: 'PRIVATE' });
          this.clearLocalState();
        };
      }
    }

    // --- FINAL_QUEST 階段 ---
    if (gameState.phase === GAME_PHASES.FINAL_QUEST) {
      const requiredPointers = gameState.players;
      const allSubmitted = requiredPointers.every(p => gameState.submittedPointings && gameState.submittedPointings.includes(p.id));

      if (!allSubmitted) {
        // 1. 秘密指認投射階段（所有人包括 Host）
        document.querySelectorAll('.btn-select-pointing-client').forEach(btn => {
          btn.onclick = () => {
            const playerId = btn.getAttribute('data-player-id');
            let list = [...this.localState.selectedPointingIds];
            if (list.includes(playerId)) {
              list = list.filter(id => id !== playerId);
            } else {
              if (list.length < 2) {
                list.push(playerId);
              }
            }
            this.localState.selectedPointingIds = list;
            this.renderMainGameBoard(gameState, myPlayer, peerManager);
          };
        });

        const submitPointingClientBtn = document.getElementById('btn-submit-pointing-client');
        if (submitPointingClientBtn) {
          submitPointingClientBtn.onclick = () => {
            this.onAction('CAST_POINTING', { targetIds: this.localState.selectedPointingIds });
            this.localState.selectedPointingIds = [];
            showToast('已送出你的指認指向 👉！');
          };
        }
      } else {
        // 2. 指向揭曉與判定階段（Host / 大公 / 公爵）
        // A. 公爵 Checkbox 處理
        if (myPlayer.roleId === 'DUKE') {
          const mainChks = document.querySelectorAll('.chk-duke-target-player');
          const subChks = document.querySelectorAll('.chk-duke-pointing-target');
          const submitBtn = document.getElementById('btn-submit-duke-checkbox');

          mainChks.forEach(mainChk => {
            mainChk.onchange = () => {
              const pId = mainChk.getAttribute('data-player-id');
              if (mainChk.checked) {
                // 互斥主 Checkbox，隱藏其他 options，並取消勾選其他主
                mainChks.forEach(c => {
                  if (c !== mainChk) {
                    c.checked = false;
                    const opt = document.getElementById(`duke-options-${c.getAttribute('data-player-id')}`);
                    if (opt) opt.style.display = 'none';
                  }
                });
                const targetOpt = document.getElementById(`duke-options-${pId}`);
                if (targetOpt) targetOpt.style.display = 'flex';
              } else {
                const targetOpt = document.getElementById(`duke-options-${pId}`);
                if (targetOpt) targetOpt.style.display = 'none';
              }
              // 清除所有子選中，因為換了主玩家或取消了主玩家
              subChks.forEach(c => c.checked = false);
              if (submitBtn) submitBtn.disabled = true;
            };
          });

          subChks.forEach(subChk => {
            subChk.onchange = () => {
              if (subChk.checked) {
                // 子 checkbox 限制單選
                subChks.forEach(c => { if (c !== subChk) c.checked = false; });
              }
              const checkedSub = Array.from(subChks).find(c => c.checked);
              if (submitBtn) {
                submitBtn.disabled = !checkedSub;
              }
            };
          });

          if (submitBtn) {
            submitBtn.onclick = () => {
              const selected = Array.from(subChks).find(c => c.checked);
              if (selected) {
                const targetPlayerId = selected.getAttribute('data-pointer-id');
                const cancelTargetId = selected.getAttribute('data-target-id');
                if (confirm(`🎩 是否確定發動公爵特權，強令該玩家放下此隻手指認？`)) {
                  this.onAction('DUKE_CANCEL_POINTING', { targetPlayerId, cancelTargetId });
                }
              }
            };
          }
        }

        // B. 大公 Checkbox 處理
        if (myPlayer.roleId === 'ARCHDUKE') {
          const mainChks = document.querySelectorAll('.chk-archduke-target-player');
          const oldChks = document.querySelectorAll('.chk-archduke-old-target');
          const newChks = document.querySelectorAll('.chk-archduke-new-target');
          const newContainer = document.getElementById('archduke-new-target-container');
          const submitBtn = document.getElementById('btn-submit-archduke-checkbox');

          const updateArchdukeBtn = () => {
            const hasMain = Array.from(mainChks).some(c => c.checked);
            const hasOld = Array.from(oldChks).some(c => c.checked);
            const hasNew = Array.from(newChks).some(c => c.checked);
            if (submitBtn) {
              submitBtn.disabled = !(hasMain && hasOld && hasNew);
            }
          };

          mainChks.forEach(mainChk => {
            mainChk.onchange = () => {
              const pId = mainChk.getAttribute('data-player-id');
              if (mainChk.checked) {
                // 互斥主 Checkbox，隱藏其他 options，並取消勾選其他主
                mainChks.forEach(c => {
                  if (c !== mainChk) {
                    c.checked = false;
                    const opt = document.getElementById(`archduke-options-${c.getAttribute('data-player-id')}`);
                    if (opt) opt.style.display = 'none';
                  }
                });
                const targetOpt = document.getElementById(`archduke-options-${pId}`);
                if (targetOpt) targetOpt.style.display = 'flex';
                if (newContainer) newContainer.style.display = 'flex';
              } else {
                const targetOpt = document.getElementById(`archduke-options-${pId}`);
                if (targetOpt) targetOpt.style.display = 'none';
                // 如果沒有任何主被勾選，隱藏新對象區域
                const anyMainChecked = Array.from(mainChks).some(c => c.checked);
                if (!anyMainChecked && newContainer) {
                  newContainer.style.display = 'none';
                }
              }
              // 清除所有舊目標與新目標的勾選
              oldChks.forEach(c => c.checked = false);
              newChks.forEach(c => c.checked = false);
              updateArchdukeBtn();
            };
          });

          oldChks.forEach(oldChk => {
            oldChk.onchange = () => {
              if (oldChk.checked) {
                // 限制單選
                oldChks.forEach(c => { if (c !== oldChk) c.checked = false; });
              }
              updateArchdukeBtn();
            };
          });

          newChks.forEach(newChk => {
            newChk.onchange = () => {
              if (newChk.checked) {
                // 限制單選
                newChks.forEach(c => { if (c !== newChk) c.checked = false; });
              }
              updateArchdukeBtn();
            };
          });

          if (submitBtn) {
            submitBtn.onclick = () => {
              const selOld = Array.from(oldChks).find(c => c.checked);
              const selNew = Array.from(newChks).find(c => c.checked);
              if (selOld && selNew) {
                const targetPlayerId = selOld.getAttribute('data-pointer-id');
                const oldTargetId = selOld.getAttribute('data-old-id');
                const newTargetId = selNew.getAttribute('data-new-id');
                if (confirm(`🏰 是否確定發動大公特權，將此隻手指向扭轉改向？`)) {
                  this.onAction('ARCHDUKE_REDIRECT_POINTING', { targetPlayerId, oldTargetId, newTargetId });
                }
              }
            };
          }
        }

        // C. Host 自動勝負結算
        if (peerManager.isHost) {
          const autoQuestBtn = document.getElementById('btn-submit-final-quest-auto');
          if (autoQuestBtn) {
            autoQuestBtn.onclick = () => {
              if (confirm('🏁 是否確認所有干涉已完成，正式開啟正義指認自動勝負判定？')) {
                this.onAction('EXECUTE_FINAL_QUEST');
                this.clearLocalState();
              }
            };
          }
        }
      }
    }

    // --- HUNT 階段 (3勝 盲眼殺手指認) ---
    if (gameState.phase === GAME_PHASES.HUNT && myPlayer.roleId === 'BLIND_ASSASSIN') {
      document.querySelectorAll('.btn-select-hunt').forEach(btn => {
        btn.onclick = () => {
          const playerId = btn.getAttribute('data-player-id');
          
          let list = [...this.localState.selectedHuntIds];
          if (list.includes(playerId)) {
            list = list.filter(id => id !== playerId);
          } else {
            if (list.length < 2) {
              list.push(playerId);
            }
          }
          this.localState.selectedHuntIds = list;
          this.renderMainGameBoard(gameState, myPlayer, peerManager);
        };
      });

      const executeHuntBtn = document.getElementById('btn-execute-hunt');
      if (executeHuntBtn) {
        executeHuntBtn.onclick = () => {
          this.onAction('EXECUTE_HUNT', { targetIds: this.localState.selectedHuntIds });
          this.clearLocalState();
        };
      }
    }

    // --- END 階段 ---
    if (gameState.phase === GAME_PHASES.END) {
      const backBtn = document.getElementById('btn-back-lobby');
      if (backBtn) {
        backBtn.onclick = () => {
          this.onAction('RESET_TO_LOBBY');
        };
      }
    }
  }
}
