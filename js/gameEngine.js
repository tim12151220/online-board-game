/**
 * 亞瑟傳奇 Quest - 核心規則引擎 (Game Engine)
 */

import { ALIGNMENT, GAME_PHASES, CHARACTERS, BOARD_CONFIGS } from './types.js';

// 洗牌函式
function shuffle(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * 初始化遊戲狀態
 * @param {Array} players - 玩家物件陣列，每個格式如：{ id: 'peerId', name: 'Name', isHost: true }
 * @param {Array} characterIds - 選定的角色 ID 陣列（若為空，則依人數自動配置基本組合）
 */
export function initGame(players, characterIds = []) {
  const playerCount = players.length;
  if (playerCount < 4 || playerCount > 10) {
    throw new Error('遊戲人數必須為 4 ~ 10 人！');
  }

  const boardConfig = BOARD_CONFIGS[playerCount];
  const { goodCount, evilCount } = boardConfig;

  // 1. 準備角色牌
  let finalRoles = [];
  if (characterIds.length === playerCount) {
    // 使用玩家自定義選擇的角色
    finalRoles = [...characterIds];
  } else {
    // 使用預設基本配置
    const defaultSetup = {
      4: ['LOYAL_SERVANT', 'LOYAL_SERVANT', 'MORGAN_LE_FAY', 'PRINCE'],
      5: ['LOYAL_SERVANT', 'LOYAL_SERVANT', 'LOYAL_SERVANT', 'MORGAN_LE_FAY', 'PRINCE'],
      6: ['LOYAL_SERVANT', 'LOYAL_SERVANT', 'LOYAL_SERVANT', 'MORGAN_LE_FAY', 'CHANGELING', 'MINION_OF_MORDRED'],
      7: ['LOYAL_SERVANT', 'LOYAL_SERVANT', 'LOYAL_SERVANT', 'DUKE', 'MORGAN_LE_FAY', 'CHANGELING', 'MINION_OF_MORDRED'],
      8: ['LOYAL_SERVANT', 'LOYAL_SERVANT', 'LOYAL_SERVANT', 'LOYAL_SERVANT', 'DUKE', 'MORGAN_LE_FAY', 'CHANGELING', 'MINION_OF_MORDRED'],
      9: ['LOYAL_SERVANT', 'LOYAL_SERVANT', 'LOYAL_SERVANT', 'LOYAL_SERVANT', 'DUKE', 'ARCHDUKE', 'MORGAN_LE_FAY', 'CHANGELING', 'MINION_OF_MORDRED'],
      10: ['LOYAL_SERVANT', 'LOYAL_SERVANT', 'LOYAL_SERVANT', 'LOYAL_SERVANT', 'DUKE', 'ARCHDUKE', 'MORGAN_LE_FAY', 'CHANGELING', 'MINION_OF_MORDRED', 'MINION_OF_MORDRED']
    };
    finalRoles = defaultSetup[playerCount];
  }

  // 洗牌分配身分
  const shuffledRoles = shuffle(finalRoles);
  const gamePlayers = players.map((p, idx) => {
    const roleId = shuffledRoles[idx];
    const roleMeta = CHARACTERS[roleId] || CHARACTERS.LOYAL_SERVANT;
    return {
      ...p,
      roleId: roleMeta.id,
      roleName: roleMeta.name,
      alignment: roleMeta.alignment,
      avatar: roleMeta.avatar,
      isLeader: false,
      isExLeader: false,
      hasBeenLeader: false,          // 曾擔任過領袖 (Veteran Token)
      hasAmulet: false,
      hasFailedAmulet: false, // 褪色的護身符
      hasUsedAmulet: false,   // 曾使用過護身符的玩家 (之後不可再當領袖)
      isOffline: false
    };
  });

  // 隨機指派第一位領袖
  const leaderIdx = Math.floor(Math.random() * playerCount);
  gamePlayers[leaderIdx].isLeader = true;
  gamePlayers[leaderIdx].hasBeenLeader = true;
  const currentLeader = gamePlayers[leaderIdx];

  const logs = [
    { type: 'system', text: `遊戲開始！當前玩家人數為 ${playerCount} 人（正義 x${goodCount}，邪惡 x${evilCount}）` },
    { type: 'highlight', text: `【${currentLeader.name}】被任命為第一任領袖，指引亞瑟的國度！` }
  ];

  return {
    phase: GAME_PHASES.REVEAL,
    players: gamePlayers,
    currentLeaderId: currentLeader.id,
    firstLeaderId: currentLeader.id,  // 首任領袖 ID
    exLeaderId: null,             // 上一任領袖 ID
    currentQuestIndex: 0,
    questResults: [null, null, null, null, null], // SUCCESS or FAILED
    questFailsCount: [0, 0, 0, 0, 0],             // 每回合實際開出失敗牌張數
    selectedTeamIds: [],
    magicUserId: null,
    votes: {},                    // 玩家投票 { playerId: 'SUCCESS' / 'FAILED' }
    revealedVotes: [],            // 開票結果洗混後的陣列 ['SUCCESS', 'FAILED']
    amuletHolderId: null,         // 當前持有護身符的人
    amuletCheckedHistory: [],     // 已經被驗證過陣營的人
    questHistory: [],             // 歷屆探索大事記歷史資料 [{ round, leaderName, teamNames, magicUserName, failsCount, result }]
    pointings: {},                // 最終指認投射 { voterId: [targetId1, targetId2] }
    logs
  };
}

/**
 * 計算特定玩家在夜間睜眼階段能看見的資訊
 * @param {Object} player - 正在查詢的玩家物件
 * @param {Object} gameState - 當前遊戲狀態
 */
export function getNightRevealInfo(player, gameState) {
  const info = {
    myRole: CHARACTERS[player.roleId],
    revealText: '',
    visiblePlayers: [] // 元素格式為：{ name: 'PlayerName', alignment: 'GOOD/EVIL', roleId: '...' }
  };

  const allPlayers = gameState.players;
  const myRole = CHARACTERS[player.roleId];

  if (!myRole) return info;

  switch (player.roleId) {
    // 1. 普通正義或不需要相認的角色
    case 'LOYAL_SERVANT':
    case 'DUKE':
    case 'ARCHDUKE':
    case 'APPRENTICE':
    case 'GUARD':
    case 'BOASTER':
      info.revealText = '天黑請閉眼，正義的忠臣不需要在夜間睜眼。請靜待黎明到來。';
      break;

    // 2. 亞瑟： know who is Morgan le Fay and the first leader's alignment
    case 'ARTHUR':
      const morgan = allPlayers.find(p => p.roleId === 'MORGAN_LE_FAY');
      if (morgan) {
        info.revealText = '【亞瑟】睜眼，你確認了邪惡的核心【摩根勒菲】是誰！';
        info.visiblePlayers.push({ id: morgan.id, name: morgan.name, roleName: '摩根勒菲', alignment: ALIGNMENT.EVIL });
      }
      const firstLeader = allPlayers.find(p => p.isLeader);
      if (firstLeader) {
        const isGood = firstLeader.alignment === ALIGNMENT.GOOD;
        const leaderAlignText = isGood ? '正義 🟢' : '邪惡 🔴';
        info.revealText = (info.revealText ? info.revealText + '\n' : '') + `你確認了第一任領主【${firstLeader.name}】是【${leaderAlignText}】陣營！`;
        info.visiblePlayers.push({ id: firstLeader.id, name: firstLeader.name, roleName: '首任領袖', alignment: firstLeader.alignment });
      }
      break;

    // 3. 教士：知道第一位領袖的陣營
    case 'PRIEST':
      const leader = allPlayers.find(p => p.isLeader);
      if (leader) {
        // 考慮騙徒 (Trickster) 或者是搗亂者 (Troublemaker)
        let alignment = leader.alignment;
        if (leader.roleId === 'TRICKSTER') {
          // 騙徒可以隨機或不誠實，我們在這裡顯示為正義，製造偽裝
          alignment = ALIGNMENT.GOOD; 
        } else if (leader.roleId === 'TROUBLEMAKER') {
          alignment = ALIGNMENT.EVIL;
        }
        info.revealText = `【教士】睜眼，你確認了第一任領袖【${leader.name}】的忠誠傾向！`;
        info.visiblePlayers.push({ id: leader.id, name: leader.name, roleName: '首任領袖', alignment });
      }
      break;

    // 4. 帕西瓦里：知道誰是教士
    case 'PERCIVAL':
      const priest = allPlayers.find(p => p.roleId === 'PRIEST');
      if (priest) {
        info.revealText = '【帕西瓦里】睜眼，你確認了傳說中的【教士】是誰！';
        info.visiblePlayers.push({ id: priest.id, name: priest.name, roleName: '教士', alignment: ALIGNMENT.GOOD });
      } else {
        info.revealText = '【帕西瓦里】睜眼，但這場局中沒有【教士】。';
      }
      break;

    // 5. 邊緣人：知道所有邪惡方
    case 'OUTSIDER':
      info.revealText = '【邊緣人】睜眼，你洞悉了所有的邪惡勢力！';
      allPlayers.forEach(p => {
        if (p.alignment === ALIGNMENT.EVIL && p.roleId !== 'CHANGELING') {
          info.visiblePlayers.push({ id: p.id, name: p.name, roleName: '邪惡方', alignment: ALIGNMENT.EVIL });
        }
      });
      break;

    // 6. 邪惡陣營互認 (除了幻形妖)
    case 'MORGAN_LE_FAY':
    case 'MINION_OF_MORDRED':
    case 'BARBARIAN':
    case 'SABOTEUR':
      info.revealText = '邪惡爪牙睜眼，你們確認了彼此的同夥！';
      allPlayers.forEach(p => {
        if (p.id === player.id) return;
        // 邪惡方互認 (不含幻形妖，但摩根勒菲能看到王儲)
        if (p.alignment === ALIGNMENT.EVIL && p.roleId !== 'CHANGELING') {
          info.visiblePlayers.push({ id: p.id, name: p.name, roleName: p.roleId === 'PRINCE' ? '王儲' : '邪惡同夥', alignment: ALIGNMENT.EVIL });
        }
      });
      break;

    // 7. 王儲：不知道邪惡方，但夜間相認時會被摩根勒菲看到。王儲自己看不到別人。
    case 'PRINCE':
      info.revealText = '【王儲】請閉眼並豎起大拇指，讓魔女【摩根勒菲】知曉你的存在。';
      break;

    // 8. 盲眼殺手：邪惡方知道他是誰，但他不知道邪惡同夥
    case 'BLIND_ASSASSIN':
      info.revealText = '【盲眼殺手】請閉眼並豎起大拇指，讓你的邪惡同盟指引你。';
      break;

    // 9. 叛徒：邪惡方知道他，他不知道邪惡方
    case 'TRAITOR':
      info.revealText = '【叛徒】請閉眼並豎起大拇指，讓邪惡方在暗中與你建立連結。';
      break;

    // 10. 瘋子：必須出失敗牌。
    case 'MADMAN':
      info.revealText = '【瘋子】天黑請閉眼。你內心的混亂驅使你破壞每一次任務，除非有強大的魔法引導你。';
      break;

    // 11. 幻形妖：誰都看不到，誰也不認識
    case 'CHANGELING':
      info.revealText = '【幻形妖】天黑請閉眼。你身在黑暗深淵中，孤身一人。';
      break;

    default:
      info.revealText = '天黑請閉眼。';
  }

  return info;
}

/**
 * 領袖提交出任務成員與魔法
 */
export function submitTeam(gameState, teamPlayerIds, magicUserId) {
  const questConfig = BOARD_CONFIGS[gameState.players.length].quests[gameState.currentQuestIndex];
  if (teamPlayerIds.length !== questConfig.players) {
    throw new Error(`指派人數不正確！此任務需要 ${questConfig.players} 人出任務！`);
  }

  if (magicUserId && !teamPlayerIds.includes(magicUserId)) {
    throw new Error('魔法指示物必須給予出任務的其中一位成員！');
  }

  const newPlayers = gameState.players.map(p => ({
    ...p,
    hasTeamToken: teamPlayerIds.includes(p.id),
    hasMagicToken: p.id === magicUserId
  }));

  const teamNames = newPlayers.filter(p => p.hasTeamToken).map(p => p.name).join('、');
  const magicName = magicUserId ? newPlayers.find(p => p.id === magicUserId).name : '無';

  const logs = [
    ...gameState.logs,
    { type: 'system', text: `領袖提交出任務名單：【${teamNames}】` },
    { type: 'highlight', text: `【${magicName}】獲得了護國「魔法指示物」的加持！` }
  ];

  return {
    ...gameState,
    players: newPlayers,
    selectedTeamIds: teamPlayerIds,
    magicUserId,
    votes: {},
    phase: GAME_PHASES.VOTE,
    logs
  };
}

/**
 * 玩家投票 (出成功或失敗牌)
 */
export function castVote(gameState, playerId, voteValue) {
  if (!gameState.selectedTeamIds.includes(playerId)) {
    throw new Error('你不是被指派出任務的隊員，無法投票！');
  }

  const voter = gameState.players.find(p => p.id === playerId);
  
  // 檢查投票合法性（強加規則約束，例如魔法或好人不能投失敗）
  let actualVote = voteValue;

  if (voter.alignment === ALIGNMENT.GOOD) {
    // 正義陣營必須投成功
    actualVote = 'SUCCESS';
  }

  if (voter.hasMagicToken) {
    // 擁有魔法者必須投成功！
    actualVote = 'SUCCESS';
    
    // 特殊角色例外
    if (voter.roleId === 'MORGAN_LE_FAY') {
      // 摩根勒菲免疫魔法，仍可投失敗！
      actualVote = voteValue;
    } else if (voter.roleId === 'SABOTEUR' && voter.isExLeader) {
      // 破壞者如果持有退伍領袖，魔法無效，必須出失敗！
      actualVote = 'FAILED';
    }
  }

  // 瘋子/破壞者/野蠻人限制
  if (voter.roleId === 'MADMAN' && !voter.hasMagicToken) {
    // 瘋子無魔法必須出失敗
    actualVote = 'FAILED';
  }
  if (voter.roleId === 'SABOTEUR' && voter.isExLeader) {
    // 破壞者拿著 Ex-Leader 必須出失敗
    actualVote = 'FAILED';
  }
  if (voter.roleId === 'BARBARIAN' && gameState.currentQuestIndex >= 3) {
    // 野蠻人第四和第五回合只能投成功
    actualVote = 'SUCCESS';
  }

  const newVotes = {
    ...gameState.votes,
    [playerId]: actualVote
  };

  // 檢查是否全員投票完畢
  const allVoted = gameState.selectedTeamIds.every(id => newVotes[id] !== undefined);

  if (allVoted) {
    // 全員投票完畢，進入開票階段！
    const rawVotes = Object.values(newVotes);
    const failsCount = rawVotes.filter(v => v === 'FAILED').length;
    
    const questConfig = BOARD_CONFIGS[gameState.players.length].quests[gameState.currentQuestIndex];
    const isFailed = failsCount >= questConfig.failsNeeded;

    const newQuestResults = [...gameState.questResults];
    newQuestResults[gameState.currentQuestIndex] = isFailed ? 'FAILED' : 'SUCCESS';

    const newQuestFailsCount = [...gameState.questFailsCount];
    newQuestFailsCount[gameState.currentQuestIndex] = failsCount;

    // 洗混開票內容（隱藏玩家投票投射關係）
    const revealedVotes = shuffle(rawVotes);

    const logs = [
      ...gameState.logs,
      { type: 'system', text: `任務開票完畢：共開出 ${rawVotes.length - failsCount} 張成功，${failsCount} 張失敗。` },
      { 
        type: isFailed ? 'alert' : 'highlight', 
        text: `任務 ${gameState.currentQuestIndex + 1} ${isFailed ? '宣告失敗！🔴' : '獲得勝利！🟢'} (需要 ${questConfig.failsNeeded} 張失敗)` 
      }
    ];

    return {
      ...gameState,
      votes: newVotes,
      revealedVotes,
      questResults: newQuestResults,
      questFailsCount: newQuestFailsCount,
      phase: GAME_PHASES.VOTE_REVEAL,
      logs
    };
  }

  return {
    ...gameState,
    votes: newVotes
  };
}

/**
 * 領袖確認開票結果，進行下一階段的結算
 */
export function confirmQuestResult(gameState) {
  // 紀錄歷史戰績
  const currentLeader = gameState.players.find(p => p.id === gameState.currentLeaderId);
  const teamNames = gameState.players.filter(p => p.hasTeamToken).map(p => p.name);
  const magicUser = gameState.players.find(p => p.hasMagicToken);
  
  const newHistory = [
    ...(gameState.questHistory || []),
    {
      round: gameState.currentQuestIndex + 1,
      leaderName: currentLeader ? currentLeader.name : '未知',
      teamNames: teamNames,
      magicUserName: magicUser ? magicUser.name : '無',
      failsCount: gameState.questFailsCount[gameState.currentQuestIndex],
      result: gameState.questResults[gameState.currentQuestIndex]
    }
  ];

  // 檢查是否有人達到 3 勝或規定敗場數結束遊戲 (4人遊戲為2敗，其餘人數為3敗)
  const successCount = gameState.questResults.filter(r => r === 'SUCCESS').length;
  const failedCount = gameState.questResults.filter(r => r === 'FAILED').length;
  const maxFails = gameState.players.length === 4 ? 2 : 3;

  if (successCount >= 3) {
    // 正義達到 3 勝！若有盲眼殺手，進入「獵殺階段」；否則正義直接獲勝
    const hasBlindAssassin = gameState.players.some(p => p.roleId === 'BLIND_ASSASSIN');
    if (hasBlindAssassin) {
      return {
        ...gameState,
        questHistory: newHistory,
        phase: GAME_PHASES.HUNT,
        logs: [
          ...gameState.logs,
          { type: 'highlight', text: '正義陣營獲得三次任務成功！進入【盲眼殺手獵殺階段】！' }
        ]
      };
    } else {
      return {
        ...gameState,
        questHistory: newHistory,
        phase: GAME_PHASES.END,
        winner: ALIGNMENT.GOOD,
        logs: [
          ...gameState.logs,
          { type: 'highlight', text: '正義陣營獲得三次任務成功！因場上無盲眼殺手，正義方獲勝！👑' }
        ]
      };
    }
  }

  if (failedCount >= maxFails) {
    // 邪惡達到規定敗場數！正義方進入「最終任務階段」進行討論指認
    return {
      ...gameState,
      questHistory: newHistory,
      phase: GAME_PHASES.FINAL_QUEST,
      pointings: {},
      submittedPointings: [],
      logs: [
        ...gameState.logs,
        { type: 'alert', text: `邪惡陣營累計 ${maxFails} 次任務失敗！進入【最終指認階段】，正義方還有最後五分鐘指認翻盤！` }
      ]
    };
  }

  // 普通過渡：現任領袖必須指派新領袖
  const logs = [
    ...gameState.logs,
    { type: 'system', text: `任務 ${gameState.currentQuestIndex + 1} 結算完畢！現任領袖【${currentLeader ? currentLeader.name : '未知'}】必須為下一回合指派一位沒當過領袖的新探索領袖。` }
  ];

  return {
    ...gameState,
    questHistory: newHistory,
    phase: GAME_PHASES.LEADER_SELECTION,
    logs
  };
}

export function selectNextLeader(gameState, nextLeaderId, amuletTargetId) {
  const newLeader = gameState.players.find(p => p.id === nextLeaderId);
  const currentLeader = gameState.players.find(p => p.id === gameState.currentLeaderId);
  
  if (!newLeader) {
    throw new Error('找不到指定的接任領袖！');
  }

  if (newLeader.hasUsedAmulet) {
    throw new Error('該玩家曾使用過護身符，不可再擔任領袖！');
  }

  // 1. 判斷剛結束的這回合是否有護身符
  const boardConfig = BOARD_CONFIGS[gameState.players.length];
  const currentQuestConfig = boardConfig.quests[gameState.currentQuestIndex];
  const hasAmuletInQuest = currentQuestConfig && currentQuestConfig.amulet && gameState.players.length >= 6;

  if (hasAmuletInQuest && !amuletTargetId) {
    throw new Error('此回合必須同時指派護身符接收者！');
  }

  const amuletTarget = hasAmuletInQuest ? gameState.players.find(p => p.id === amuletTargetId) : null;
  if (hasAmuletInQuest && !amuletTarget) {
    throw new Error('找不到指定的護身符接收者！');
  }

  if (hasAmuletInQuest) {
    // 檢查限制：不能是當前領袖 (currentLeaderId)、下一位領袖 (nextLeaderId)、擁有護身符或退伍領袖指示物 (hasBeenLeader) 玩家
    if (amuletTargetId === gameState.currentLeaderId) {
      throw new Error('現任領袖不能將護身符給予自己！');
    }
    if (amuletTargetId === nextLeaderId) {
      throw new Error('下一任探索領袖與護身符接收者不能是同一人！');
    }
    if (amuletTarget.hasBeenLeader) {
      throw new Error('不能將護身符給予退伍領袖（當過領袖）的玩家！');
    }
    if (amuletTarget.hasUsedAmulet || amuletTarget.hasAmulet || amuletTarget.hasFailedAmulet) {
      throw new Error('該玩家已經擁有過護身符或被檢視過身分！');
    }
  }

  // 2. 清除舊指示物，並移轉領袖權柄，以及分發護身符
  const updatedPlayers = gameState.players.map(p => {
    const isOldLeader = p.id === gameState.currentLeaderId;
    const isNewLeader = p.id === nextLeaderId;
    const isAmuletTarget = hasAmuletInQuest && p.id === amuletTargetId;
    
    return {
      ...p,
      isLeader: isNewLeader,
      isExLeader: isOldLeader, // 舊領袖獲得 Ex-Leader 標記
      hasBeenLeader: p.hasBeenLeader || isNewLeader, // 新領袖標記為當過領袖 (Veteran Token)
      hasTeamToken: false,
      hasMagicToken: false,
      hasAmulet: isAmuletTarget ? true : p.hasAmulet,
      hasUsedAmulet: isAmuletTarget ? true : p.hasUsedAmulet
    };
  });
  
  const nextQuestIndex = gameState.currentQuestIndex + 1;
  
  const logs = [
    ...gameState.logs,
    { type: 'highlight', text: `【${currentLeader ? currentLeader.name : '未知'}】卸任，並指定【${newLeader.name}】接任下任探索領袖！` }
  ];
  
  if (hasAmuletInQuest) {
    logs.push({ type: 'system', text: `此回合伴隨護身符！卸任領袖同時將「護身符」給予【${amuletTarget.name}】進行忠義檢視！` });
    return {
      ...gameState,
      players: updatedPlayers,
      currentLeaderId: nextLeaderId,
      exLeaderId: gameState.currentLeaderId,
      currentQuestIndex: nextQuestIndex,
      amuletHolderId: amuletTargetId,
      phase: GAME_PHASES.AMULET_REVEAL,
      votes: {},
      revealedVotes: [],
      selectedTeamIds: [],
      magicUserId: null,
      logs
    };
  } else {
    logs.push({ type: 'highlight', text: `新任領袖【${newLeader.name}】已就座！請挑選第 ${nextQuestIndex + 1} 回合出任務的成員與魔法。` });
    return {
      ...gameState,
      players: updatedPlayers,
      currentLeaderId: nextLeaderId,
      exLeaderId: gameState.currentLeaderId,
      currentQuestIndex: nextQuestIndex,
      phase: GAME_PHASES.TEAM_SELECTION,
      votes: {},
      revealedVotes: [],
      selectedTeamIds: [],
      magicUserId: null,
      logs
    };
  }
}

/**
 * 領袖分發護身符
 */
export function assignAmulet(gameState, targetPlayerId) {
  const target = gameState.players.find(p => p.id === targetPlayerId);
  if (target.isLeader || target.isExLeader) {
    throw new Error('不能將護身符給予當前領袖或退伍領袖！');
  }

  const updatedPlayers = gameState.players.map(p => ({
    ...p,
    hasAmulet: p.id === targetPlayerId,
    hasUsedAmulet: p.hasUsedAmulet || p.id === targetPlayerId
  }));

  const logs = [
    ...gameState.logs,
    { type: 'system', text: `領袖將「護身符」給予【${target.name}】，由其進行忠誠檢視！` }
  ];

  return {
    ...gameState,
    players: updatedPlayers,
    amuletHolderId: targetPlayerId,
    phase: GAME_PHASES.AMULET_REVEAL,
    logs
  };
}

/**
 * 使用護身符檢視陣營
 */
export function useAmulet(gameState, checkerId, targetPlayerId, declaredAlignment) {
  const target = gameState.players.find(p => p.id === targetPlayerId);
  if (target.id === checkerId) {
    throw new Error('不能對自己使用護身符！');
  }
  if (target.hasFailedAmulet) {
    throw new Error('此玩家之前已經被驗證過身分！');
  }

  // 取得真實身分或特殊能力偽裝
  let alignmentResult = target.alignment;

  if (target.roleId === 'TROUBLEMAKER') {
    // 搗亂者必顯為邪惡
    alignmentResult = ALIGNMENT.EVIL;
  }

  // 標記目標拿到「褪色護身符」
  const updatedPlayers = gameState.players.map(p => {
    if (p.id === targetPlayerId) {
      return { ...p, hasFailedAmulet: true };
    }
    // 清除 checker 的 Amulet Token
    if (p.id === checkerId) {
      return { ...p, hasAmulet: false };
    }
    return p;
  });

  const nextLeader = gameState.players.find(p => p.id === gameState.currentLeaderId);
  const checker = gameState.players.find(p => p.id === checkerId);

  // 根據宣告決定日誌
  let declaredText = '';
  if (declaredAlignment === 'GOOD') {
    declaredText = '宣稱其為【正義盟友 🟢】';
  } else if (declaredAlignment === 'EVIL') {
    declaredText = '宣稱其為【邪惡爪牙 🔴】';
  } else {
    declaredText = '選擇不公開檢視結果 🟡 (保持神祕)';
  }

  const logs = [
    ...gameState.logs,
    { type: 'system', text: `【${checker ? checker.name : '未知'}】使用護身符檢視了【${target.name}】的忠義，並${declaredText}！` },
    { type: 'highlight', text: `新探索領袖【${nextLeader.name}】已就座！請挑選第 ${gameState.currentQuestIndex + 1} 回合出任務的成員與魔法。` }
  ];

  // 寫入護身符歷史紀錄，交織大事記
  if (!gameState.amuletHistory) {
    gameState.amuletHistory = [];
  }
  gameState.amuletHistory.push({
    round: gameState.currentQuestIndex, // 剛用完護身符的回合數 (在 selectNextLeader 已經 +1 了，所以對應剛結束的 Quest 回合數)
    checkerName: checker ? checker.name : '未知',
    targetName: target.name,
    declaredAlignment: declaredAlignment || 'SECRET'
  });

  return {
    ...gameState,
    players: updatedPlayers,
    amuletHolderId: null,
    phase: GAME_PHASES.TEAM_SELECTION,
    logs,
    // 回傳驗身結果
    lastCheckResult: {
      checkerId,
      targetName: target.name,
      alignment: alignmentResult
    }
  };
}

/**
 * 盲眼殺手執行獵殺
 * @param {Object} gameState 
 * @param {Array} targetIds - 指認的兩個玩家 ID
 */
export function executeHunt(gameState, targetIds) {
  const targets = gameState.players.filter(p => targetIds.includes(p.id));
  
  // 檢查是否皆為正義方
  const allGood = targets.every(p => p.alignment === ALIGNMENT.GOOD);

  // 檢查是否包含亞瑟，且亞瑟為第一位指認 (targets[0])
  const hitArthurFirst = targets[0]?.roleId === 'ARTHUR';

  const targetNames = targets.map(p => p.name).join('、');

  if (allGood || hitArthurFirst) {
    // 獵殺成功！邪惡方反敗為勝！
    return {
      ...gameState,
      phase: GAME_PHASES.END,
      winner: ALIGNMENT.EVIL,
      logs: [
        ...gameState.logs,
        { type: 'alert', text: `盲眼殺手揭露身份！精準獵殺正義同盟【${targetNames}】！` },
        { type: 'alert', text: '獵殺成功！邪惡陣營反敗為勝，統治卡美洛王國！😈' }
      ]
    };
  } else {
    // 獵殺失敗！正義方獲勝！
    return {
      ...gameState,
      phase: GAME_PHASES.END,
      winner: ALIGNMENT.GOOD,
      logs: [
        ...gameState.logs,
        { type: 'highlight', text: `盲眼殺手揭露身份！獵殺了【${targetNames}】，但認錯了好人同伴！` },
        { type: 'highlight', text: '獵殺失敗！亞瑟的忠臣大獲全勝，正義終將戰勝黑暗！👑' }
      ]
    };
  }
}

/**
 * 最終指認（3敗時）
 * @param {Object} gameState 
 * @param {Object} fingerPointers - 玩家手指指向 { pointerPlayerId: [targetPlayerId1, targetPlayerId2] }
 */
export function executeFinalQuest(gameState) {
  // 邪惡方玩家名單（扣除特殊身份如 REVEALER，若有）
  const evilPlayers = gameState.players.filter(p => p.alignment === ALIGNMENT.EVIL && p.roleId !== 'REVEALER');
  const evilIds = evilPlayers.map(p => p.id);
  const evilNames = evilPlayers.map(p => p.name).join('、');

  // 正義方好人玩家名單
  const goodPlayers = gameState.players.filter(p => p.alignment === ALIGNMENT.GOOD);

  const logDetails = [];
  let pointingError = false;
  const goodTargetedErrors = [];
  const unionTargets = new Set();

  goodPlayers.forEach(p => {
    const targets = gameState.pointings[p.id] || [];
    const targetNames = gameState.players.filter(t => targets.includes(t.id)).map(t => t.name).join('、');
    logDetails.push(`  • 【${p.name}】指向 ➡️ 【${targets.length === 0 ? '無（放下雙手）' : targetNames}】`);

    targets.forEach(tid => {
      unionTargets.add(tid);
      const targetPl = gameState.players.find(x => x.id === tid);
      if (targetPl && targetPl.alignment === ALIGNMENT.GOOD) {
        pointingError = true;
        goodTargetedErrors.push(`【${p.name}】誤指認了同盟【${targetPl.name}】`);
      }
    });
  });

  // 檢查漏網之魚 (有沒有哪位壞人沒被任何好人指認到)
  const missedEvils = evilPlayers.filter(ep => !unionTargets.has(ep.id));
  const hasMissedEvil = missedEvils.length > 0;
  const missedNames = missedEvils.map(p => p.name).join('、');

  const isCorrect = !pointingError && !hasMissedEvil;

  // 拼接豐富的結算日誌
  const newLogs = [
    ...gameState.logs,
    { type: 'highlight', text: `🏁 最終任務 - 命運動態結算開始！` },
    { type: 'system', text: `😈 戰場邪惡爪牙名單為：【${evilNames}】` },
    { type: 'system', text: `🛡️ 正義盟友的手指秘密指向：\n${logDetails.join('\n')}` }
  ];

  if (pointingError) {
    newLogs.push({
      type: 'alert',
      text: `❌ 指認錯誤！好人內部產生猜忌：${goodTargetedErrors.join('，')}`
    });
  }

  if (hasMissedEvil) {
    newLogs.push({
      type: 'alert',
      text: `🕷️ 漏網之魚！邪惡爪牙【${missedNames}】成功隱匿於陰影之中，逃脫了指認！`
    });
  }

  if (isCorrect) {
    newLogs.push({
      type: 'highlight',
      text: `🎉 指認完全正確！沒有指錯好人，且所有壞人皆被揪出！正義方排除萬難，反敗為勝！國度重歸安寧！👑`
    });
    return {
      ...gameState,
      phase: GAME_PHASES.END,
      winner: ALIGNMENT.GOOD,
      logs: newLogs
    };
  } else {
    newLogs.push({
      type: 'alert',
      text: `😈 指認失敗！邪惡方成功滲透並隱藏，邪惡陣營奪得最終勝利！卡美洛淪入黑暗...`
    });
    return {
      ...gameState,
      phase: GAME_PHASES.END,
      winner: ALIGNMENT.EVIL,
      logs: newLogs
    };
  }
}
