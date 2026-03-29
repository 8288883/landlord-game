// ================= 配置 =================
let roomId = "";
let playerId = "p" + Math.floor(Math.random() * 1000000);
let mode = "3p";
let players = [];
let isHost = false;
let ws;
let reconnectTimer = null;

// 游戏状态
let gameState = {
    started: false,
    currentTurn: 0,
    landlord: -1,
    players: {},
    lastPlayed: null,
    lastPlayer: -1,
    baseCards: [],
    callLordStage: false,
    callLordOrder: []
};

// 个人数据
let myCards = [];
let selectedCards = [];
let isMyTurn = false;
let hasCalledLord = false;

// 大厅回调
let lobbyUpdateCallback = null;
let isInGame = false;

// 你的 ZeroTier 虚拟IP（根据实际情况修改）
const WS_RELAY = "ws://10.195.69.95:3000";

// ================= 联机逻辑 =================
function connectWS() {
    if (ws) {
        ws.onclose = null;
        ws.onerror = null;
        ws.onmessage = null;
        clearInterval(ws.heartbeat);
        ws.close();
    }

    ws = new WebSocket(WS_RELAY);
    document.getElementById("roomStatus").innerText = "🔄 正在连接服务器...";

    ws.onopen = () => {
        document.getElementById("roomStatus").innerText = "✅ 已连接，可以开始游戏";
        ws.heartbeat = setInterval(() => {
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: "ping", roomId, playerId }));
            }
        }, 15000);

        if (roomId) {
            setTimeout(() => {
                isHost ? sendMsg({ type: "create", roomId, playerId, mode })
                    : sendMsg({ type: "join", roomId, playerId });
            }, 300);
        }
    };

    ws.onclose = () => {
        document.getElementById("roomStatus").innerText = "❌ 连接断开，正在重连...";
        clearInterval(ws.heartbeat);
        clearTimeout(reconnectTimer);
        reconnectTimer = setTimeout(connectWS, 3000);
    };

    ws.onerror = (e) => {
        console.error("WS 错误:", e);
    };

    ws.onmessage = (e) => {
        try {
            const msg = JSON.parse(e.data);
            if (msg.type === "pong") return;
            if (msg.roomId !== roomId) return;
            onRoomMessage(msg);
        } catch (e) {
            console.error("消息解析失败:", e);
        }
    };
}

function createRoom() {
    roomId = document.getElementById("roomId").value.trim();
    if (!roomId) return alert("请输入房间号");
    isHost = true;
    mode = document.getElementById("modeSelect").value;
    connectWS();
}

function joinRoom() {
    roomId = document.getElementById("roomId").value.trim();
    if (!roomId) return alert("请输入房间号");
    isHost = false;
    connectWS();
}

function sendMsg(data) {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
        alert("未连接服务器，自动重连中...");
        return;
    }
    data.playerId = playerId;
    data.roomId = roomId;
    ws.send(JSON.stringify(data));
}

function onRoomMessage(msg) {
    const statusEl = document.getElementById("roomStatus");
    switch (msg.type) {
        case "create":
            if (!players.includes(msg.playerId)) players = [msg.playerId];
            sendMsg({ type: "created", roomId, playerId });
            break;
        case "created":
            statusEl.innerText = "🏠 房间已创建";
            break;
        case "join":
            if (!players.includes(msg.playerId)) players.push(msg.playerId);
            sendMsg({ type: "joined", roomId, playerId: msg.playerId, players });
            break;
        case "joined":
            players = msg.players;
            if (!isInGame && lobbyUpdateCallback) {
                lobbyUpdateCallback(players);
            }
            if (statusEl) statusEl.innerText = `🎉 ${msg.playerId} 加入，当前：${msg.players.join(", ")}`;
            break;
        case "playerLeft":
            players = players.filter(p => p !== msg.playerId);
            if (!isInGame && lobbyUpdateCallback) {
                lobbyUpdateCallback(players);
            }
            if (statusEl) statusEl.innerText = `👋 ${msg.playerId} 离开，当前：${players.join(", ")}`;
            break;
        case "startGame":
            if (isHost) initGame();
            break;
        case "gameAction":
            handleGameAction(msg.data);
            break;
        case "syncState":
            syncGameState(msg.state);
            break;
    }
}

// ================= 游戏启动 =================
function startGame() {
    if (!isHost) return sendMsg({ type: "startGame" });
    if (mode === "3p" && players.length < 3) return alert("需要3人");
    if (mode === "2p1ai" && players.length < 2) return alert("需要2人");
    if (mode === "1p2ai" && players.length < 1) return alert("需要1人");

    // 补全AI
    if (mode === "1p2ai" && players.length === 1) players.push("ai1", "ai2");
    if (mode === "2p1ai" && players.length === 2) players.push("ai1");

    initGame();
}

function initGame() {
    const deck = generateDeck();
    shuffle(deck);

    gameState.players = {};
    players.forEach((p, i) => {
        gameState.players[p] = deck.slice(i * 17, (i + 1) * 17);
    });
    gameState.baseCards = deck.slice(51);
    gameState.started = true;
    gameState.callLordStage = true;
    gameState.currentTurn = 0;
    gameState.callLordOrder = [0, 1, 2];
    gameState.lastPlayed = null;
    gameState.lastPlayer = -1;

    enterGameMode(gameState);
    syncGameState(gameState);
}

function enterGameMode(state) {
    document.getElementById("roomDiv").style.display = "none";
    document.getElementById("gameDiv").style.display = "block";
    document.getElementById("displayRoomId").innerText = roomId;
    gameState = JSON.parse(JSON.stringify(state));
    myCards = gameState.players[playerId] || [];
    selectedCards = [];
    hasCalledLord = false;
    renderMyCards();
    updatePlayerUI();
    updateTurnUI();
}

// ================= 牌型与规则 =================
const CardType = {
    SINGLE: 1, PAIR: 2, TRIPLE: 3, TRIPLE_1: 4, TRIPLE_2: 5,
    STRAIGHT: 6, DOUBLE_STRAIGHT: 7, TRIPLE_STRAIGHT: 8,
    BOMB: 9, ROCKET: 10, INVALID: -1
};

function generateDeck() {
    const suits = ['♣', '♦', '♥', '♠'];
    const ranks = ['3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A', '2'];
    let deck = [];
    ranks.forEach(r => suits.forEach(s => deck.push(s + r)));
    deck.push('🃏小', '🃏大');
    return deck;
}

function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
}

function getCardType(cards) {
    if (!cards || cards.length === 0) return CardType.INVALID;
    const n = cards.length;
    const countMap = {};
    cards.forEach(c => {
        const r = getRank(c);
        countMap[r] = (countMap[r] || 0) + 1;
    });
    const counts = Object.values(countMap).sort((a, b) => b - a);
    const ranks = Object.keys(countMap).map(Number).sort((a, b) => a - b);

    if (n === 2 && cards.includes('🃏小') && cards.includes('🃏大')) return CardType.ROCKET;
    if (counts[0] === 4) return CardType.BOMB;
    if (counts[0] === 3) {
        if (n === 3) return CardType.TRIPLE;
        if (n === 4 && counts[1] === 1) return CardType.TRIPLE_1;
        if (n === 5 && counts[1] === 2) return CardType.TRIPLE_2;
    }
    if (n === 1) return CardType.SINGLE;
    if (n === 2 && counts[0] === 2) return CardType.PAIR;

    if (n >= 5 && counts.every(c => c === 1)) {
        if (ranks[ranks.length - 1] > 12) return CardType.INVALID;
        for (let i = 1; i < ranks.length; i++)
            if (ranks[i] - ranks[i - 1] !== 1) return CardType.INVALID;
        return CardType.STRAIGHT;
    }
    if (n >= 6 && n % 2 === 0 && counts.every(c => c === 2)) {
        if (ranks[ranks.length - 1] > 12) return CardType.INVALID;
        for (let i = 1; i < ranks.length; i++)
            if (ranks[i] - ranks[i - 1] !== 1) return CardType.INVALID;
        return CardType.DOUBLE_STRAIGHT;
    }
    if (n >= 6 && n % 3 === 0 && counts.every(c => c === 3)) {
        if (ranks[ranks.length - 1] > 12) return CardType.INVALID;
        for (let i = 1; i < ranks.length; i++)
            if (ranks[i] - ranks[i - 1] !== 1) return CardType.INVALID;
        return CardType.TRIPLE_STRAIGHT;
    }
    return CardType.INVALID;
}

function getRank(card) {
    if (card === '🃏小') return 14;
    if (card === '🃏大') return 15;
    const r = card.slice(1);
    const rankMap = {
        '3': 0, '4': 1, '5': 2, '6': 3, '7': 4, '8': 5, '9': 6, '10': 7,
        'J': 8, 'Q': 9, 'K': 10, 'A': 11, '2': 12
    };
    return rankMap[r];
}

function compareCards(c1, c2) {
    const t1 = getCardType(c1);
    const t2 = getCardType(c2);
    if (t1 === CardType.ROCKET) return true;
    if (t2 === CardType.ROCKET) return false;
    if (t1 === CardType.BOMB && t2 !== CardType.BOMB) return true;
    if (t2 === CardType.BOMB) return false;
    if (t1 !== t2) return false;

    const getMainRank = (cards) => {
        const countMap = {};
        cards.forEach(c => { const r = getRank(c); countMap[r] = (countMap[r] || 0) + 1; });
        const maxCnt = Math.max(...Object.values(countMap));
        return parseInt(Object.keys(countMap).find(r => countMap[r] === maxCnt));
    };
    return getMainRank(c1) > getMainRank(c2);
}

// ================= 叫地主 =================
function callLord(choice) {
    if (!gameState.callLordStage || hasCalledLord) return;
    hasCalledLord = true;
    sendMsg({ type: "gameAction", data: { action: "callLord", choice, playerId } });
}

function handleGameAction(data) {
    if (data.action === "callLord") {
        if (data.choice === 1) {
            gameState.landlord = players.indexOf(data.playerId);
            gameState.callLordStage = false;
            gameState.players[data.playerId].push(...gameState.baseCards);
            gameState.players[data.playerId].sort((a, b) => getRank(a) - getRank(b));
        } else {
            gameState.currentTurn = (gameState.currentTurn + 1) % 3;
            if (gameState.currentTurn === gameState.callLordOrder[0]) {
                gameState.callLordStage = false;
                gameState.landlord = 0;
            }
        }
        syncGameState(gameState);
    } else if (data.action === "play") {
        if (data.cards === null) {
            gameState.currentTurn = (gameState.currentTurn + 1) % 3;
        } else {
            if (gameState.lastPlayed && !compareCards(data.cards, gameState.lastPlayed)) return;
            gameState.lastPlayed = data.cards;
            gameState.lastPlayer = gameState.currentTurn;
            gameState.players[data.playerId] = gameState.players[data.playerId].filter(c => !data.cards.includes(c));
            gameState.currentTurn = (gameState.currentTurn + 1) % 3;

            if (gameState.players[data.playerId].length === 0) {
                alert(`${data.playerId} 胜利！`);
                gameState.started = false;
            }
        }
        syncGameState(gameState);
    }
    if (isHost) runAI();
}

function syncGameState(state) {
    gameState = JSON.parse(JSON.stringify(state));
    myCards = gameState.players[playerId] || [];
    renderMyCards();
    updatePlayerUI();
    updateTurnUI();
    sendMsg({ type: "syncState", state: gameState });
}

// ================= AI =================
function runAI() {
    if (!gameState.started || gameState.callLordStage) return;
    const curId = players[gameState.currentTurn];
    if (!curId?.startsWith("ai")) return;

    setTimeout(() => {
        const hand = gameState.players[curId];
        let play = null;
        if (!gameState.lastPlayed) {
            play = hand.length ? [hand[0]] : null;
        } else {
            for (const c of hand) {
                if (compareCards([c], gameState.lastPlayed)) {
                    play = [c];
                    break;
                }
            }
        }
        sendMsg({ type: "gameAction", data: { action: "play", cards: play, playerId: curId } });
    }, 800);
}

// ================= UI =================
function renderMyCards() {
    const el = document.getElementById("myCards");
    el.innerHTML = "";
    myCards.forEach(c => {
        const div = document.createElement("div");
        div.className = "card" + (c.includes('♥') || c.includes('♦') ? " red" : "");
        div.innerText = c.slice(1) || c;
        div.onclick = () => {
            if (selectedCards.includes(c)) {
                selectedCards = selectedCards.filter(x => x !== c);
                div.classList.remove("selected");
            } else {
                selectedCards.push(c);
                div.classList.add("selected");
            }
        };
        el.appendChild(div);
    });
}

function updatePlayerUI() {
    const myIdx = players.indexOf(playerId);
    document.getElementById("myInfo").innerHTML =
        `我: <span>${myCards.length}</span>张 <span id="landlordMark">${myIdx === gameState.landlord ? "地主" : ""}</span>`;
    const p2 = players[1] || "等待中";
    const p3 = players[2] || "等待中";
    document.getElementById("player2Info").innerHTML = `${p2}: <span>${gameState.players[p2]?.length || 0}</span>张`;
    document.getElementById("player3Info").innerHTML = `${p3}: <span>${gameState.players[p3]?.length || 0}</span>张`;

    const baseEl = document.getElementById("baseCards");
    baseEl.innerHTML = "";
    gameState.baseCards.forEach(c => {
        const d = document.createElement("div");
        d.className = "card" + (c.includes('♥') || c.includes('♦') ? " red" : "");
        d.innerText = c.slice(1) || c;
        baseEl.appendChild(d);
    });

    const lastEl = document.getElementById("lastPlayedArea");
    lastEl.innerHTML = "";
    if (gameState.lastPlayed) {
        gameState.lastPlayed.forEach(c => {
            const d = document.createElement("div");
            d.className = "card" + (c.includes('♥') || c.includes('♦') ? " red" : "");
            d.innerText = c.slice(1) || c;
            lastEl.appendChild(d);
        });
    }
}

function updateTurnUI() {
    isMyTurn = players[gameState.currentTurn] === playerId;
    document.getElementById("turnIndicator").innerText = gameState.callLordStage
        ? "叫地主阶段：" + players[gameState.currentTurn]
        : "当前回合：" + players[gameState.currentTurn];

    const playing = !gameState.callLordStage && gameState.started;
    document.getElementById("playBtn").disabled = !isMyTurn || !playing;
    document.getElementById("passBtn").disabled = !isMyTurn || !playing;
    document.getElementById("callLordBtn").style.display = gameState.callLordStage && isMyTurn ? "inline-block" : "none";
    document.getElementById("noLordBtn").style.display = gameState.callLordStage && isMyTurn ? "inline-block" : "none";
}

function playSelected() {
    if (!isMyTurn || selectedCards.length === 0) return;
    if (getCardType(selectedCards) === CardType.INVALID) return alert("牌型不合法");
    sendMsg({ type: "gameAction", data: { action: "play", cards: selectedCards, playerId } });
    selectedCards = [];
}

function pass() {
    if (!isMyTurn || gameState.lastPlayer === gameState.currentTurn) return;
    sendMsg({ type: "gameAction", data: { action: "play", cards: null, playerId } });
}

// ================= 大厅接口 =================
window.registerLobbyCallback = function(callback) {
    lobbyUpdateCallback = callback;
};

window.getCurrentPlayers = function() {
    return players;
};

window.getIsHost = function() {
    return isHost;
};

window.getRoomId = function() {
    return roomId;
};

window.startGameFromLobby = function() {
    if (isHost) {
        startGame();
    } else {
        sendMsg({ type: "startGame" });
    }
    // 隐藏大厅，显示游戏界面
    document.getElementById("lobbyDiv").style.display = "none";
    document.getElementById("gameDiv").style.display = "block";
    isInGame = true;
};

window.createRoomWithId = function(roomIdInput) {
    roomId = roomIdInput;
    isHost = true;
    mode = "3p";  // 默认3人联机，房主可在游戏开始前选择模式
    connectWS();
};

window.joinRoomWithId = function(roomIdInput) {
    roomId = roomIdInput;
    isHost = false;
    connectWS();
};

// 初始连接（如果直接作为游戏启动，保留原逻辑）
connectWS();
