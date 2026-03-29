// ================= 配置 =================
let seats = [
    { type: 'human', name: '我', cards: [] },   // 玩家自己
    { type: 'empty', name: '空位', cards: [] }, // 座位2
    { type: 'empty', name: '空位', cards: [] }  // 座位3
];
let gameStarted = false;
let gameState = {
    started: false,
    currentTurn: 0,
    landlord: -1,
    players: {},   // 索引 -> 手牌数组
    lastPlayed: null,
    lastPlayer: -1,
    baseCards: [],
    callLordStage: false,
    callLordOrder: []
};
let myCards = [];
let selectedCards = [];
let isMyTurn = false;
let hasCalledLord = false;

// ================= 辅助函数 =================
function updateSeatUI() {
    for (let i = 1; i <= 2; i++) {
        const seat = seats[i];
        const nameEl = document.getElementById(`player${i+1}Name`);
        const countEl = document.getElementById(`player${i+1}CardsCount`);
        const hostBtn = document.getElementById(`player${i+1}HostBtn`);
        if (seat.type === 'empty') {
            nameEl.innerText = '空位';
            countEl.innerText = '0张';
            hostBtn.style.display = 'inline-block';
            hostBtn.innerText = '🤖 托管';
        } else {
            nameEl.innerText = seat.name;
            countEl.innerText = `${seat.cards.length}张`;
            hostBtn.style.display = 'none';
        }
    }
    // 更新自己的牌数
    document.getElementById("myInfo").innerHTML = `🃏 我: <span>${myCards.length}</span>张 <span id="landlordMark"></span>`;
}

function fillAI(index) {
    if (gameStarted) {
        alert("游戏已经开始，无法添加AI");
        return;
    }
    if (seats[index].type !== 'empty') return;
    seats[index] = { type: 'ai', name: 'AI', cards: [] };
    updateSeatUI();
    checkAllSeatsFilled();
}

function checkAllSeatsFilled() {
    const allFilled = seats.every(seat => seat.type !== 'empty');
    if (allFilled && !gameStarted) {
        startGame();
    }
}

// ================= 游戏初始化 =================
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

function startGame() {
    if (gameStarted) return;
    gameStarted = true;

    // 发牌
    const deck = generateDeck();
    shuffle(deck);
    const playersCount = 3;
    for (let i = 0; i < playersCount; i++) {
        seats[i].cards = deck.slice(i * 17, (i + 1) * 17);
    }
    const baseCards = deck.slice(51);
    myCards = seats[0].cards;

    // 初始化游戏状态
    gameState = {
        started: true,
        currentTurn: 0,
        landlord: -1,
        players: seats.map(s => s.cards),
        lastPlayed: null,
        lastPlayer: -1,
        baseCards: baseCards,
        callLordStage: true,
        callLordOrder: [0, 1, 2]
    };

    // 进入游戏模式
    enterGameMode();
}

function enterGameMode() {
    document.getElementById("turnIndicator").innerText = "叫地主阶段：我";
    renderMyCards();
    updatePlayerUI();
    updateTurnUI();
    // 开始叫地主流程
    nextCallLord();
}

function nextCallLord() {
    if (!gameState.callLordStage) return;
    const currentPlayer = gameState.currentTurn;
    if (currentPlayer === 0) {
        // 轮到玩家
        document.getElementById("callLordBtn").style.display = "inline-block";
        document.getElementById("noLordBtn").style.display = "inline-block";
        document.getElementById("turnIndicator").innerText = "叫地主阶段：轮到你叫地主";
    } else {
        // AI 叫地主
        setTimeout(() => {
            if (gameState.callLordStage && gameState.currentTurn === currentPlayer) {
                // AI 随机决定叫或不叫
                const choice = Math.random() < 0.3 ? 1 : 0; // 30%概率叫地主
                callLord(choice);
            }
        }, 800);
    }
}

function callLord(choice) {
    if (!gameState.callLordStage || hasCalledLord) return;
    hasCalledLord = true;
    if (choice === 1) {
        gameState.landlord = gameState.currentTurn;
        gameState.callLordStage = false;
        // 地主拿底牌
        gameState.players[gameState.landlord].push(...gameState.baseCards);
        gameState.players[gameState.landlord].sort((a,b) => getRank(a)-getRank(b));
        if (gameState.landlord === 0) myCards = gameState.players[0];
        // 开始出牌阶段
        gameState.currentTurn = gameState.landlord;
        gameState.lastPlayed = null;
        gameState.lastPlayer = -1;
        updateTurnUI();
        updatePlayerUI();
        document.getElementById("callLordBtn").style.display = "none";
        document.getElementById("noLordBtn").style.display = "none";
        document.getElementById("turnIndicator").innerText = `当前回合：${seats[gameState.currentTurn].name}`;
        runAITurn(); // 如果地主是AI，自动出牌
    } else {
        // 不叫，轮到下家
        gameState.currentTurn = (gameState.currentTurn + 1) % 3;
        hasCalledLord = false;
        if (gameState.currentTurn === gameState.callLordOrder[0]) {
            // 所有人都没叫，默认地主为第一个玩家
            gameState.landlord = gameState.callLordOrder[0];
            gameState.callLordStage = false;
            gameState.players[gameState.landlord].push(...gameState.baseCards);
            gameState.players[gameState.landlord].sort((a,b) => getRank(a)-getRank(b));
            if (gameState.landlord === 0) myCards = gameState.players[0];
            gameState.currentTurn = gameState.landlord;
            updateTurnUI();
            updatePlayerUI();
            document.getElementById("callLordBtn").style.display = "none";
            document.getElementById("noLordBtn").style.display = "none";
            document.getElementById("turnIndicator").innerText = `当前回合：${seats[gameState.currentTurn].name}`;
            runAITurn();
        } else {
            nextCallLord();
        }
    }
    updatePlayerUI();
    renderMyCards();
}

// ================= 牌型规则 =================
const CardType = {
    SINGLE: 1, PAIR: 2, TRIPLE: 3, TRIPLE_1: 4, TRIPLE_2: 5,
    STRAIGHT: 6, DOUBLE_STRAIGHT: 7, TRIPLE_STRAIGHT: 8,
    BOMB: 9, ROCKET: 10, INVALID: -1
};

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

// ================= 出牌逻辑 =================
function playSelected() {
    if (!isMyTurn || selectedCards.length === 0) return;
    if (getCardType(selectedCards) === CardType.INVALID) return alert("牌型不合法");
    // 检查是否能压过上家
    if (gameState.lastPlayed && !compareCards(selectedCards, gameState.lastPlayed)) {
        alert("牌型不能压过上家");
        return;
    }
    playCards(0, selectedCards);
    selectedCards = [];
}

function pass() {
    if (!isMyTurn || gameState.lastPlayer === gameState.currentTurn) return;
    playCards(0, null);
}

function playCards(playerIdx, cards) {
    if (cards === null) {
        // 过
        gameState.currentTurn = (gameState.currentTurn + 1) % 3;
    } else {
        // 出牌
        if (gameState.lastPlayed && !compareCards(cards, gameState.lastPlayed)) return;
        gameState.lastPlayed = cards;
        gameState.lastPlayer = gameState.currentTurn;
        // 移除手牌
        gameState.players[playerIdx] = gameState.players[playerIdx].filter(c => !cards.includes(c));
        if (playerIdx === 0) myCards = gameState.players[0];
        gameState.currentTurn = (gameState.currentTurn + 1) % 3;

        if (gameState.players[playerIdx].length === 0) {
            alert(`${seats[playerIdx].name} 胜利！`);
            gameState.started = false;
            gameStarted = false;
            // 可以重置游戏，这里简单提示
            return;
        }
    }
    updatePlayerUI();
    renderMyCards();
    updateTurnUI();
    runAITurn();
}

function runAITurn() {
    if (!gameState.started || gameState.callLordStage) return;
    const curIdx = gameState.currentTurn;
    if (seats[curIdx].type === 'ai') {
        setTimeout(() => {
            if (gameState.currentTurn === curIdx && gameState.started) {
                const hand = gameState.players[curIdx];
                let play = null;
                if (!gameState.lastPlayed) {
                    // AI 出最小单牌
                    play = hand.length ? [hand[0]] : null;
                } else {
                    // 简单 AI：找第一张能压过的单牌
                    for (const c of hand) {
                        if (compareCards([c], gameState.lastPlayed)) {
                            play = [c];
                            break;
                        }
                    }
                }
                playCards(curIdx, play);
            }
        }, 800);
    }
}

// ================= UI 更新 =================
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
    // 更新座位牌数显示
    for (let i = 0; i < 3; i++) {
        if (i === 0) {
            document.getElementById("myInfo").innerHTML = `🃏 我: <span>${myCards.length}</span>张 <span id="landlordMark">${gameState.landlord === i ? "地主" : ""}</span>`;
        } else {
            const nameEl = document.getElementById(`player${i+1}Name`);
            const countEl = document.getElementById(`player${i+1}CardsCount`);
            if (nameEl) {
                nameEl.innerText = seats[i].name;
                countEl.innerText = `${gameState.players[i]?.length || 0}张`;
            }
        }
    }
    // 底牌
    const baseEl = document.getElementById("baseCards");
    baseEl.innerHTML = "";
    if (gameState.baseCards) {
        gameState.baseCards.forEach(c => {
            const d = document.createElement("div");
            d.className = "card" + (c.includes('♥') || c.includes('♦') ? " red" : "");
            d.innerText = c.slice(1) || c;
            baseEl.appendChild(d);
        });
    }
    // 上一手
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
    const curIdx = gameState.currentTurn;
    isMyTurn = curIdx === 0;
    const playing = gameState.started && !gameState.callLordStage;
    document.getElementById("playBtn").disabled = !isMyTurn || !playing;
    document.getElementById("passBtn").disabled = !isMyTurn || !playing;
    if (!gameState.callLordStage) {
        document.getElementById("turnIndicator").innerText = `当前回合：${seats[curIdx].name}`;
    }
}

// 初始化
updateSeatUI();
