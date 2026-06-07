/**
 * 亞瑟傳奇 Quest - 常數與類型定義
 */

export const ALIGNMENT = {
  GOOD: 'GOOD',
  EVIL: 'EVIL'
};

export const GAME_PHASES = {
  LOBBY: 'LOBBY',             // 大廳創房、加入、等待
  REVEAL: 'REVEAL',           // 夜間睜眼相認階段
  LEADER_SELECTION: 'LEADER_SELECTION', // 現任領袖指派新任領袖
  TEAM_SELECTION: 'TEAM_SELECTION', // 領袖指派出任務成員與分發魔法
  VOTE: 'VOTE',               // 出任務成員投出成功/失敗牌
  VOTE_REVEAL: 'VOTE_REVEAL', // 開牌與揭曉任務勝負
  AMULET: 'AMULET',           // 護身符驗證陣營階段（6人以上特定回合）
  AMULET_REVEAL: 'AMULET_REVEAL', // 護身符檢視結果秘密傳遞
  FINAL_QUEST: 'FINAL_QUEST', // 最終任務討論指認（3次失敗時觸發）
  HUNT: 'HUNT',               // 盲眼殺手獵殺（3次成功且有盲眼殺手時觸發）
  END: 'END'                  // 遊戲結束揭曉贏家
};

export const MESSAGE_TYPES = {
  JOIN: 'JOIN',               // Client 請求加入房間
  ROSTER: 'ROSTER',           // Host 廣播當前玩家名單
  START: 'START',             // Host 發起開始遊戲
  SYNC: 'SYNC',               // Host 廣播遊戲狀態同步
  ACTION: 'ACTION',           // Client 送出操作行動給 Host
  CHAT: 'CHAT',               // 系統日誌或聊天訊息
  KEEPALIVE: 'KEEPALIVE'      // 心跳包，防止 P2P 斷線
};

// 角色名冊與配置資料
export const CHARACTERS = {
  // 正義陣營 (Good)
  LOYAL_SERVANT: {
    id: 'LOYAL_SERVANT',
    name: '亞瑟的忠臣',
    alignment: ALIGNMENT.GOOD,
    avatar: '🛡️',
    desc: '正義的普通成員，沒有特殊能力。',
    minPlayers: 4
  },
  ARTHUR: {
    id: 'ARTHUR',
    name: '亞瑟',
    alignment: ALIGNMENT.GOOD,
    avatar: '👑',
    desc: '知道誰是摩根勒菲。但若被盲眼殺手獵殺，正義方立刻輸掉。',
    minPlayers: 7
  },
  PRIEST: {
    id: 'PRIEST',
    name: '教士',
    alignment: ALIGNMENT.GOOD,
    avatar: '⛪',
    desc: '在夜間階段可以看見第一任領袖的陣營。',
    minPlayers: 6
  },
  DUKE: {
    id: 'DUKE',
    name: '公爵',
    alignment: ALIGNMENT.GOOD,
    avatar: '🎩',
    desc: '在「最終任務」指認中，可強行命令一名玩家放下手。',
    minPlayers: 7
  },
  ARCHDUKE: {
    id: 'ARCHDUKE',
    name: '大公',
    alignment: ALIGNMENT.GOOD,
    avatar: '🏰',
    desc: '「最終任務」中，邪惡方揭露身分後，可改變一名玩家指頭的指向。',
    minPlayers: 9
  },
  APPRENTICE: {
    id: 'APPRENTICE',
    name: '學徒',
    alignment: ALIGNMENT.GOOD,
    avatar: '📖',
    desc: '在「最終任務」中可分先後伸出雙手，待邪惡方認證後指認第二隻手。',
    minPlayers: 4
  },
  OUTSIDER: {
    id: 'OUTSIDER',
    name: '邊緣人',
    alignment: ALIGNMENT.GOOD,
    avatar: '👤',
    desc: '夜間相認時知道所有邪惡方，但邪惡方不知道他。',
    minPlayers: 4
  },
  PERCIVAL: {
    id: 'PERCIVAL',
    name: '帕西瓦里',
    alignment: ALIGNMENT.GOOD,
    avatar: '⚔️',
    desc: '夜間相認時，可以確認誰是教士。',
    minPlayers: 7
  },
  GUARD: {
    id: 'GUARD',
    name: '守衛',
    alignment: ALIGNMENT.GOOD,
    avatar: '👀',
    desc: '被護身符檢視陣營的玩家，必須把忠誠牌也給守衛看。',
    minPlayers: 6
  },
  BOASTER: {
    id: 'BOASTER',
    name: '吹噓者',
    alignment: ALIGNMENT.GOOD,
    avatar: '📢',
    desc: '如果成為任務五的領袖，指派隊員前必須當眾公開自己的身份。',
    minPlayers: 5
  },

  // 邪惡陣營 (Evil)
  MORGAN_LE_FAY: {
    id: 'MORGAN_LE_FAY',
    name: '摩根勒菲',
    alignment: ALIGNMENT.EVIL,
    avatar: '🔮',
    desc: '必選角色。不受魔法指示物效果影響，仍可出任務失敗牌。',
    minPlayers: 4
  },
  PRINCE: {
    id: 'PRINCE',
    name: '王儲',
    alignment: ALIGNMENT.EVIL,
    avatar: '🍷',
    desc: '邪惡陣營。自己不知道邪惡同夥，但夜間相認時閉眼並豎起大拇指，讓其他邪惡夥伴看得到他。',
    minPlayers: 4
  },
  CHANGELING: {
    id: 'CHANGELING',
    name: '幻形妖',
    alignment: ALIGNMENT.EVIL,
    avatar: '🎭',
    desc: '邪惡方不知道他是誰，他也不知道哪些人是邪惡方。',
    minPlayers: 6
  },
  MINION_OF_MORDRED: {
    id: 'MINION_OF_MORDRED',
    name: '莫德雷德的爪牙',
    alignment: ALIGNMENT.EVIL,
    avatar: '👿',
    desc: '邪惡的普通成員，夜間會與摩根勒菲相認。',
    minPlayers: 6
  },
  BLIND_ASSASSIN: {
    id: 'BLIND_ASSASSIN',
    name: '盲眼殺手',
    alignment: ALIGNMENT.EVIL,
    avatar: '🏹',
    desc: '邪惡相認時邪惡方知曉他，但他不知曉他人。3次成功時可揭露指認兩名正義獲勝。',
    minPlayers: 6
  },
  BARBARIAN: {
    id: 'BARBARIAN',
    name: '野蠻人',
    alignment: ALIGNMENT.EVIL,
    avatar: '🪓',
    desc: '任務失敗牌只能在前三個任務打出，任務四與五只能出成功。',
    minPlayers: 7
  },
  TRAITOR: {
    id: 'TRAITOR',
    name: '叛徒',
    alignment: ALIGNMENT.EVIL,
    avatar: '🐍',
    desc: '夜間舉手讓邪惡方相認。最終任務時若指認兩名正義，可轉化為正義陣營。',
    minPlayers: 4
  },
  MADMAN: {
    id: 'MADMAN',
    name: '瘋子',
    alignment: ALIGNMENT.EVIL,
    avatar: '🌀',
    desc: '平時必須出任務失敗牌，只有持有魔法指示物時才能出成功牌。',
    minPlayers: 4
  },
  TRICKSTER: {
    id: 'TRICKSTER',
    name: '騙徒',
    alignment: ALIGNMENT.EVIL,
    avatar: '🃏',
    desc: '被檢視陣營（教士或護身符）時，可以選擇說謊欺騙驗身者。',
    minPlayers: 6
  },
  SABOTEUR: {
    id: 'SABOTEUR',
    name: '破壞者',
    alignment: ALIGNMENT.EVIL,
    avatar: '💥',
    desc: '屬於邪惡方。在任務中可以自由選擇投出成功或失敗牌。',
    minPlayers: 4
  }
};

// 每個玩家人數所對應的角色人數與版圖配置
// 版圖配置包含：[任務一玩家數, 任務二玩家數, 任務三玩家數, 任務四玩家數, 任務五玩家數]
// 括號內的數字代表：[是否含有護身符]，如 0 代表無，1 代表有護身符
export const BOARD_CONFIGS = {
  4: {
    goodCount: 2,
    evilCount: 2,
    quests: [
      { players: 2, amulet: false, failsNeeded: 1 },
      { players: 3, amulet: false, failsNeeded: 1 },
      { players: 2, amulet: false, failsNeeded: 1 },
      { players: 3, amulet: false, failsNeeded: 1 }
    ]
  },
  5: {
    goodCount: 3,
    evilCount: 2,
    quests: [
      { players: 2, amulet: false, failsNeeded: 1 },
      { players: 3, amulet: false, failsNeeded: 1 },
      { players: 2, amulet: false, failsNeeded: 1 },
      { players: 4, amulet: false, failsNeeded: 1 },
      { players: 3, amulet: false, failsNeeded: 1 }
    ]
  },
  6: {
    goodCount: 3,
    evilCount: 3,
    quests: [
      { players: 2, amulet: false, failsNeeded: 1 },
      { players: 3, amulet: true, failsNeeded: 1 }, // 第二回合結束後有護身符
      { players: 4, amulet: false, failsNeeded: 1 },
      { players: 3, amulet: false, failsNeeded: 1 },
      { players: 4, amulet: false, failsNeeded: 1 }
    ]
  },
  7: {
    goodCount: 4,
    evilCount: 3,
    quests: [
      { players: 2, amulet: false, failsNeeded: 1 },
      { players: 3, amulet: true, failsNeeded: 1 }, // 第二回合結束後有護身符
      { players: 3, amulet: true, failsNeeded: 1 }, // 第三回合結束後有護身符
      { players: 4, amulet: false, failsNeeded: 2 }, // 第四回合需要兩張失敗牌才失敗
      { players: 4, amulet: false, failsNeeded: 1 }
    ]
  },
  8: {
    goodCount: 5,
    evilCount: 3,
    quests: [
      { players: 3, amulet: false, failsNeeded: 1 },
      { players: 4, amulet: true, failsNeeded: 1 }, // 第二回合結束後有護身符
      { players: 4, amulet: true, failsNeeded: 1 }, // 第三回合結束後有護身符
      { players: 5, amulet: true, failsNeeded: 2 }, // 第四回合結束後有護身符，且第四回合需要兩張失敗牌
      { players: 5, amulet: false, failsNeeded: 1 }
    ]
  },
  9: {
    goodCount: 6,
    evilCount: 3,
    quests: [
      { players: 3, amulet: false, failsNeeded: 1 },
      { players: 4, amulet: true, failsNeeded: 1 }, // 第二回合結束後有護身符
      { players: 4, amulet: true, failsNeeded: 1 }, // 第三回合結束後有護身符
      { players: 5, amulet: true, failsNeeded: 2 }, // 第四回合結束後有護身符，且第四回合需要兩張失敗牌
      { players: 5, amulet: false, failsNeeded: 1 }
    ]
  },
  10: {
    goodCount: 6,
    evilCount: 4,
    quests: [
      { players: 3, amulet: false, failsNeeded: 1 },
      { players: 4, amulet: true, failsNeeded: 1 }, // 第二回合結束後有護身符
      { players: 4, amulet: true, failsNeeded: 1 }, // 第三回合結束後有護身符
      { players: 5, amulet: true, failsNeeded: 2 }, // 第四回合結束後有護身符，且第四回合需要兩張失敗牌
      { players: 5, amulet: false, failsNeeded: 1 }
    ]
  }
};


// 官方各玩家人數推薦配置表
export const RECOMMENDED_SETUP = {
  4: ['LOYAL_SERVANT', 'LOYAL_SERVANT', 'MORGAN_LE_FAY', 'PRINCE'],
  5: ['LOYAL_SERVANT', 'LOYAL_SERVANT', 'LOYAL_SERVANT', 'MORGAN_LE_FAY', 'PRINCE'],
  6: ['LOYAL_SERVANT', 'LOYAL_SERVANT', 'LOYAL_SERVANT', 'MORGAN_LE_FAY', 'CHANGELING', 'MINION_OF_MORDRED'],
  7: ['LOYAL_SERVANT', 'LOYAL_SERVANT', 'LOYAL_SERVANT', 'DUKE', 'MORGAN_LE_FAY', 'CHANGELING', 'MINION_OF_MORDRED'],
  8: ['LOYAL_SERVANT', 'LOYAL_SERVANT', 'LOYAL_SERVANT', 'LOYAL_SERVANT', 'DUKE', 'MORGAN_LE_FAY', 'CHANGELING', 'MINION_OF_MORDRED'],
  9: ['LOYAL_SERVANT', 'LOYAL_SERVANT', 'LOYAL_SERVANT', 'LOYAL_SERVANT', 'DUKE', 'ARCHDUKE', 'MORGAN_LE_FAY', 'CHANGELING', 'MINION_OF_MORDRED'],
  10: ['LOYAL_SERVANT', 'LOYAL_SERVANT', 'LOYAL_SERVANT', 'LOYAL_SERVANT', 'DUKE', 'ARCHDUKE', 'MORGAN_LE_FAY', 'CHANGELING', 'MINION_OF_MORDRED', 'MINION_OF_MORDRED']
};
