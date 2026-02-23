export const getReplayScript = (): string => `
const SEAT_POSITIONS = [
  { top: 90, left: 50 },
  { top: 70, left: 10 },
  { top: 25, left: 12 },
  { top: 10, left: 50 },
  { top: 25, left: 88 },
  { top: 70, left: 90 },
];

const BET_POSITIONS = [
  { top: 75, left: 50 },
  { top: 62, left: 25 },
  { top: 38, left: 25 },
  { top: 25, left: 50 },
  { top: 38, left: 75 },
  { top: 62, left: 75 },
];


const suitSymbol = { h: '♥', d: '♦', c: '♣', s: '♠' };
const suitClass = { h: 'hearts', d: 'diamonds', c: 'clubs', s: 'spades' };

function parseCard(notation) {
  if (!notation || notation.length < 2) return null;
  return { rank: notation[0], suit: notation[1] };
}

function makeCardEl(rank, suit, cls) {
  const suitCls = suitClass[suit] || 'spades';
  return '<div class="' + (cls || 'card') + ' ' + suitCls + '"><span class="rank">' + (rank === 'T' ? '10' : rank) + '</span><span class="suit">' + suitSymbol[suit] + '</span></div>';
}

function formatCents(cents) {
  return '$' + (Math.abs(cents) / 100).toFixed(2);
}

function getRotatedSeats() {
  const heroIdx = HAND.seats.findIndex(s => s.seatIndex === HAND.heroSeat);
  if (heroIdx === -1) return HAND.seats;
  const rotated = [];
  for (let i = 0; i < HAND.seats.length; i++) {
    rotated.push(HAND.seats[(heroIdx + i) % HAND.seats.length]);
  }
  return rotated;
}

const rotatedSeats = getRotatedSeats();
const seatToVisualIndex = {};
rotatedSeats.forEach((s, i) => { seatToVisualIndex[s.seatIndex] = i; });

const seatEls = [];
const betEls = [];
const foldedSet = new Set();
let pot = 0;
let currentBets = {};
let boardCardEls = [];
let isPlaying = false;
let currentActionIndex = 0;
let currentStreet = 'preflop';

const BOT_EMOJIS = ['🤖', '🎰', '🎲', '🃏', '🎯', '🎪'];
const POSITION_LABELS = ['BTN', 'SB', 'BB', 'UTG', 'HJ', 'CO'];

function getPositionLabel(seatIdx) {
  const btnIdx = HAND.seats.findIndex(s => s.seatIndex === HAND.buttonSeat);
  const relPos = (seatIdx - (btnIdx >= 0 ? HAND.seats[btnIdx].seatIndex : 0) + 6) % 6;
  return POSITION_LABELS[relPos] || 'S' + seatIdx;
}

function init() {
  const table = document.getElementById('table');
  document.getElementById('sharerInfo').textContent = 'Shared by @' + HAND.sharerName;

  rotatedSeats.forEach(function(seat, i) {
    const seatEl = document.createElement('div');
    const isHero = seat.seatIndex === HAND.heroSeat;
    const isButton = seat.seatIndex === HAND.buttonSeat;
    seatEl.className = 'seat' + (isHero ? ' hero-seat' : '');
    seatEl.id = 'seat-' + seat.seatIndex;
    seatEl.style.top = SEAT_POSITIONS[i].top + '%';
    seatEl.style.left = SEAT_POSITIONS[i].left + '%';

    let cardsHtml = '';
    if (seat.holeCards && seat.holeCards.length === 2) {
      const cards = seat.holeCards.map(parseCard).filter(c => c);
      const cardClass = isHero ? 'hero-cards' : '';
      cardsHtml = '<div class="seat-cards ' + cardClass + '">' + cards.map(c => makeCardEl(c.rank, c.suit)).join('') + '</div>';
    } else {
      cardsHtml = '<div class="seat-cards"><div class="card-back"><img src="https://stackpoker.gg/images/logo.png" alt=""/></div><div class="card-back"><img src="https://stackpoker.gg/images/logo.png" alt=""/></div></div>';
    }

    const emoji = isHero ? '😎' : BOT_EMOJIS[seat.seatIndex % BOT_EMOJIS.length];
    const posLabel = getPositionLabel(seat.seatIndex);
    const youBadge = isHero ? '<span class="you-badge">YOU</span>' : '';
    const dealerHtml = isButton ? '<div class="seat-dealer">D</div>' : '';
    
    const infoHtml = '<div class="seat-info">' +
      '<span class="seat-emoji">' + emoji + '</span>' +
      '<div class="seat-details">' +
        '<div class="seat-name">' + escapeHtml(seat.displayName) + youBadge + '</div>' +
        '<div class="seat-position">' + posLabel + '</div>' +
      '</div>' +
      '<span class="seat-stack">' + formatCents(seat.startingStack) + '</span>' +
      dealerHtml +
    '</div>';

    seatEl.innerHTML = cardsHtml + infoHtml;
    table.appendChild(seatEl);
    seatEls[i] = seatEl;

    const chip = document.createElement('div');
    chip.className = 'bet-chip';
    chip.id = 'bet-' + seat.seatIndex;
    chip.style.top = BET_POSITIONS[i].top + '%';
    chip.style.left = BET_POSITIONS[i].left + '%';
    table.appendChild(chip);
    betEls[i] = chip;
  });

  const boardContainer = document.getElementById('boardCards');
  for (let i = 0; i < 5; i++) {
    const el = document.createElement('div');
    el.className = 'board-placeholder';
    boardContainer.appendChild(el);
    boardCardEls.push(el);
  }

  document.getElementById('replayBtn').onclick = startReplay;
  setTimeout(startReplay, 1200);
}

function escapeHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

const CHIP_COLORS = {
  1: { base: '#D9D9D9', edge: '#999999' },
  10: { base: '#A67340', edge: '#734D26' },
  50: { base: '#4D99E6', edge: '#3366B3' },
  100: { base: '#F2F2F2', edge: '#BFBFBF' },
  500: { base: '#E63333', edge: '#991A1A' },
  2500: { base: '#33B34D', edge: '#1A8033' },
  10000: { base: '#1A1A1A', edge: '#4D4D4D' }
};
const DENOMS = [10000, 2500, 500, 100, 50, 10, 1];

function makeChipHtml(denom, size) {
  const c = CHIP_COLORS[denom] || CHIP_COLORS[100];
  return '<div class="chip" style="width:' + size + 'px;height:' + size + 'px;background:' + c.edge + ';"><div class="chip-face" style="width:' + (size*0.88) + 'px;height:' + (size*0.88) + 'px;background:' + c.base + ';"></div></div>';
}

function makeChipStack(amount) {
  let remaining = amount;
  const stacks = [];
  for (const d of DENOMS) {
    const count = Math.floor(remaining / d);
    if (count > 0) {
      stacks.push({ denom: d, count: Math.min(count, 4) });
      remaining -= count * d;
      if (stacks.length >= 2) break;
    }
  }
  if (stacks.length === 0) return '<span class="chip-label">' + formatCents(amount) + '</span>';
  let html = '<div class="chip-stacks">';
  stacks.forEach(function(s, i) {
    html += '<div class="chip-column" style="z-index:' + (2-i) + ';">';
    for (let j = 0; j < s.count; j++) {
      html += '<div class="chip-item" style="top:-' + (j*3) + 'px;">' + makeChipHtml(s.denom, 18) + '</div>';
    }
    html += '</div>';
  });
  html += '</div><span class="chip-label">' + formatCents(amount) + '</span>';
  return html;
}

function showBet(seatIdx, amount) {
  const visIdx = seatToVisualIndex[seatIdx];
  if (visIdx === undefined) return;
  const el = betEls[visIdx];
  el.innerHTML = makeChipStack(amount);
  el.classList.add('visible');
  currentBets[seatIdx] = amount;
}

function clearBets() {
  betEls.forEach(el => el.classList.remove('visible'));
  currentBets = {};
}

function foldSeat(seatIdx) {
  const visIdx = seatToVisualIndex[seatIdx];
  if (visIdx === undefined) return;
  seatEls[visIdx].classList.add('folded');
  foldedSet.add(seatIdx);
}

function collectPot() {
  let total = 0;
  for (const k in currentBets) total += currentBets[k];
  pot += total;
  clearBets();
  updatePot();
}

function updatePot() {
  const el = document.getElementById('pot');
  const amountEl = el.querySelector('.pot-amount');
  if (pot > 0 && amountEl) {
    amountEl.textContent = formatCents(pot);
    el.classList.add('visible');
  }
}

function revealBoardCards(street) {
  collectPot();

  let startIdx, endIdx;
  if (street === 'flop') { startIdx = 0; endIdx = 3; }
  else if (street === 'turn') { startIdx = 3; endIdx = 4; }
  else if (street === 'river') { startIdx = 4; endIdx = 5; }
  else return;

  for (let i = startIdx; i < endIdx && i < HAND.board.length; i++) {
    const card = parseCard(HAND.board[i]);
    if (card && i < boardCardEls.length) {
      const el = boardCardEls[i];
      const suitCls = suitClass[card.suit] || 'spades';
      el.className = 'board-card ' + suitCls;
      el.innerHTML = '<span class="rank">' + (card.rank === 'T' ? '10' : card.rank) + '</span><span class="suit">' + suitSymbol[card.suit] + '</span>';
      setTimeout(() => el.classList.add('visible'), (i - startIdx) * 150);
    }
  }
}

function capitalizeAction(action) {
  if (!action) return action;
  const lower = action.toLowerCase();
  if (lower === 'post_blind' || lower === 'post') return 'Post';
  return action.charAt(0).toUpperCase() + action.slice(1).toLowerCase();
}

function resetState() {
  isPlaying = false;
  pot = 0;
  currentBets = {};
  currentStreet = 'preflop';
  foldedSet.clear();
  currentActionIndex = 0;

  seatEls.forEach(el => el.classList.remove('folded', 'winner'));
  betEls.forEach(el => el.classList.remove('visible'));
  boardCardEls.forEach((el, i) => {
    el.classList.remove('visible');
    el.className = 'board-placeholder';
    el.innerHTML = '';
  });

  seatEls.forEach((el, i) => {
    const seat = rotatedSeats[i];
    const cardsContainer = el.querySelector('.seat-cards');
    if (cardsContainer) {
      const isHero = seat.seatIndex === HAND.heroSeat;
      if (seat.holeCards && seat.holeCards.length === 2) {
        const cards = seat.holeCards.map(parseCard).filter(c => c);
        const cardClass = isHero ? 'hero-cards' : '';
        cardsContainer.className = 'seat-cards ' + cardClass;
        cardsContainer.innerHTML = cards.map(c => makeCardEl(c.rank, c.suit)).join('');
      } else {
        cardsContainer.className = 'seat-cards';
        cardsContainer.innerHTML = '<div class="card-back"><img src="https://stackpoker.gg/images/logo.png" alt=""/></div><div class="card-back"><img src="https://stackpoker.gg/images/logo.png" alt=""/></div>';
      }
    }
  });

  const potEl = document.getElementById('pot');
  potEl.classList.remove('visible');
  const potAmountEl = potEl.querySelector('.pot-amount');
  if (potAmountEl) potAmountEl.textContent = '$0.00';
  document.getElementById('ctaOverlay').classList.remove('visible');
  document.getElementById('winOverlay').classList.remove('visible');
  document.getElementById('replayBtn').disabled = false;
}

function startReplay() {
  if (isPlaying) return;
  resetState();
  isPlaying = true;
  document.getElementById('replayBtn').disabled = true;
  playNextAction();
}

function playNextAction() {
  if (!isPlaying) return;
  if (currentActionIndex >= HAND.actions.length) {
    finishReplay();
    return;
  }

  const a = HAND.actions[currentActionIndex];

  if (a.street !== currentStreet && a.street !== 'preflop') {
    revealBoardCards(a.street);
    currentStreet = a.street;
    setTimeout(playNextAction, 900);
    return;
  }

  const normalizedAction = capitalizeAction(a.action);
  if (normalizedAction === 'Fold') {
    foldSeat(a.seat);
  } else if (normalizedAction !== 'Check' && a.amount > 0) {
    showBet(a.seat, a.amount);
  }

  currentActionIndex++;
  setTimeout(playNextAction, 650);
}

function finishReplay() {
  isPlaying = false;
  collectPot();

  HAND.winners.forEach(w => {
    const visIdx = seatToVisualIndex[w.seat];
    if (visIdx !== undefined) {
      seatEls[visIdx].classList.add('winner');
      if (w.shownCards && w.shownCards.length === 2) {
        const seatEl = seatEls[visIdx];
        const cardsContainer = seatEl.querySelector('.seat-cards');
        if (cardsContainer) {
          const cards = w.shownCards.map(parseCard).filter(c => c);
          const isHero = w.seat === HAND.heroSeat;
          const cardClass = isHero ? 'hero-cards' : '';
          cardsContainer.className = 'seat-cards ' + cardClass;
          cardsContainer.innerHTML = cards.map(c => makeCardEl(c.rank, c.suit)).join('');
        }
      }
    }
  });

  showWinResult();
  document.getElementById('replayBtn').disabled = false;
  setTimeout(showCta, 2500);
}

function showWinResult() {
  const overlay = document.getElementById('winOverlay');
  const title = document.getElementById('winTitle');
  const amount = document.getElementById('winAmount');
  const desc = document.getElementById('winDescription');

  const isWin = HAND.heroDelta > 0;
  const winner = HAND.winners.find(w => w.seat === HAND.heroSeat);

  if (isWin) {
    title.textContent = 'You Win!';
    amount.textContent = '+' + formatCents(HAND.heroDelta);
    amount.className = 'win-amount';
    desc.textContent = winner?.handDescription || '';
  } else {
    const oppWinner = HAND.winners[0];
    title.textContent = oppWinner ? (oppWinner.seat !== HAND.heroSeat ? 'Opponent Wins' : 'You Win!') : 'Hand Complete';
    amount.textContent = '-' + formatCents(Math.abs(HAND.heroDelta));
    amount.className = 'win-amount loss';
    desc.textContent = oppWinner?.handDescription || '';
  }

  overlay.classList.add('visible');
}

function showCta() {
  document.getElementById('ctaOverlay').classList.add('visible');
}

init();
`;
