import type { VercelRequest, VercelResponse } from '@vercel/node';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

function getDb() {
  if (getApps().length === 0) {
    initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      }),
    });
  }
  return getFirestore();
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

interface BotHandLog {
  hand_id: string;
  table_id: string;
  stake_id: string;
  started_at: string;
  ended_at: string;
  seats: {
    seat_index: number;
    user_id: string;
    display_name: string;
    starting_stack: number;
  }[];
  button_seat: number;
  small_blind: number;
  big_blind: number;
  actions: {
    seat: number;
    action: string;
    amount?: number;
    is_all_in: boolean;
    street: string;
    timestamp?: string;
  }[];
  hole_cards: Record<string, string[]>;
  board: string[];
  winners: {
    seat: number;
    user_id: string;
    amount_won: number;
    hand_description?: string;
    shown_cards?: string[];
  }[];
  stack_deltas: Record<string, number>;
}

interface SharedHand {
  share_id: string;
  hand_id: string;
  user_id: string;
  sharer_name: string;
  view_count: number;
}

interface WebReplayData {
  handId: string;
  seats: {
    seatIndex: number;
    displayName: string;
    isHero: boolean;
    startingStack: number;
    holeCards: string[] | null;
  }[];
  buttonSeat: number;
  smallBlind: number;
  bigBlind: number;
  actions: {
    seat: number;
    action: string;
    amount: number;
    street: string;
    isAllIn: boolean;
  }[];
  board: string[];
  winners: {
    seat: number;
    amountWon: number;
    handDescription: string | null;
    shownCards: string[] | null;
  }[];
  heroSeat: number;
  heroDelta: number;
  potSize: number;
  sharerName: string;
}

function transformHandForWeb(hand: BotHandLog, shared: SharedHand): WebReplayData {
  // Find hero seat (the sharer)
  const heroSeatRecord = hand.seats.find(s => s.user_id === shared.user_id);
  const heroSeat = heroSeatRecord?.seat_index ?? 0;

  // Calculate pot size (sum of positive deltas)
  const positiveSum = Object.values(hand.stack_deltas).filter(d => d > 0).reduce((a, b) => a + b, 0);
  const potSize = positiveSum > 0 ? positiveSum : Math.abs(Object.values(hand.stack_deltas).filter(d => d < 0).reduce((a, b) => a + b, 0));

  // Hero delta
  const heroDelta = hand.stack_deltas[String(heroSeat)] ?? 0;

  // Transform seats - only show hero's hole cards initially
  const seats = hand.seats.map(s => ({
    seatIndex: s.seat_index,
    displayName: s.display_name,
    isHero: s.user_id === shared.user_id,
    startingStack: s.starting_stack,
    holeCards: hand.hole_cards[String(s.seat_index)] ?? null,
  }));

  // Transform actions
  const actions = hand.actions.map(a => ({
    seat: a.seat,
    action: a.action,
    amount: a.amount ?? 0,
    street: a.street,
    isAllIn: a.is_all_in,
  }));

  // Transform winners - include shown cards at showdown
  const winners = hand.winners.map(w => ({
    seat: w.seat,
    amountWon: w.amount_won,
    handDescription: w.hand_description ?? null,
    shownCards: w.shown_cards ?? (hand.hole_cards[String(w.seat)] ?? null),
  }));

  return {
    handId: hand.hand_id,
    seats,
    buttonSeat: hand.button_seat,
    smallBlind: hand.small_blind,
    bigBlind: hand.big_blind,
    actions,
    board: hand.board,
    winners,
    heroSeat,
    heroDelta,
    potSize,
    sharerName: shared.sharer_name,
  };
}

function formatCents(cents: number): string {
  const dollars = Math.abs(cents) / 100;
  const sign = cents >= 0 ? '+' : '-';
  return `${sign}$${dollars.toFixed(2)}`;
}

function getHandDescription(data: WebReplayData): string {
  const winner = data.winners.find(w => w.seat === data.heroSeat);
  if (winner && data.heroDelta > 0) {
    return `Won ${formatCents(data.heroDelta)}${winner.handDescription ? ` with ${winner.handDescription}` : ''}`;
  } else if (data.heroDelta > 0) {
    return `Won ${formatCents(data.heroDelta)}`;
  } else if (data.heroDelta < 0) {
    return `Lost ${formatCents(data.heroDelta)}`;
  }
  return 'Watch the hand replay';
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { id } = req.query;

  if (!id || typeof id !== 'string') {
    return res.status(400).send('Missing share ID');
  }

  try {
    const db = getDb();

    // Fetch shared hand mapping
    const sharedDoc = await db.collection('shared_hands').doc(id).get();
    if (!sharedDoc.exists) {
      return res.status(404).send('Hand not found');
    }

    const shared = sharedDoc.data() as SharedHand;

    // Fetch actual hand data
    const handDoc = await db.collection('hands').doc(shared.hand_id).get();
    if (!handDoc.exists) {
      return res.status(404).send('Hand data not found');
    }

    const hand = handDoc.data() as BotHandLog;

    // Increment view count (fire and forget)
    db.collection('shared_hands').doc(id).update({
      view_count: FieldValue.increment(1),
    }).catch(() => {});

    // Transform for web replayer
    const replayData = transformHandForWeb(hand, shared);
    const replayJson = JSON.stringify(replayData);

    const title = `Hand shared by @${escapeHtml(shared.sharer_name)} on Stack`;
    const description = escapeHtml(getHandDescription(replayData));
    const ogImageUrl = `https://stackpoker.gg/images/og-hand-share.png`; // Static fallback

    const html = buildHandReplayPage(id, title, description, ogImageUrl, replayJson);

    res.setHeader('Content-Type', 'text/html');
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate');
    return res.status(200).send(html);
  } catch (error: any) {
    console.error('Error fetching hand:', error?.message, error?.code, error?.stack);
    return res.status(500).send(`Internal server error: ${error?.message || 'unknown'}`);
  }
}

function buildHandReplayPage(id: string, title: string, description: string, ogImageUrl: string, replayJson: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
  <title>${title}</title>
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="${description}">
  <meta property="og:image" content="${ogImageUrl}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:type" content="website">
  <meta property="og:url" content="https://stackpoker.gg/hands/${id}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${title}">
  <meta name="twitter:description" content="${description}">
  <meta name="twitter:image" content="${ogImageUrl}">
  <meta name="theme-color" content="#0B0E13">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <style>
    :root {
      --background: #0B0E13;
      --surface: #1A1D24;
      --surface-raised: #252A33;
      --text-primary: #F0F2F5;
      --text-secondary: #9BA3B0;
      --text-muted: #5C6370;
      --accent-green: #4ADE80;
      --negative-red: #EF4444;
      --warning-amber: #F59E0B;
      --card-red: #DC2626;
      --card-black: #1a1a2e;
    }
    * { margin: 0; padding: 0; box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
    html { -webkit-text-size-adjust: 100%; }
    body {
      background: var(--background);
      background-image: url('https://stackpoker.gg/images/table-bg.png');
      background-size: cover;
      background-position: top center;
      background-repeat: no-repeat;
      color: var(--text-primary);
      font-family: -apple-system, 'SF Pro Display', 'SF Pro Text', BlinkMacSystemFont, system-ui, sans-serif;
      min-height: 100vh;
      min-height: -webkit-fill-available;
      overflow-x: hidden;
      -webkit-font-smoothing: antialiased;
    }
    #app {
      max-width: 480px;
      margin: 0 auto;
      padding: max(16px, env(safe-area-inset-top)) 16px 120px;
      position: relative;
      min-height: 100vh;
    }

    .header {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      padding: 8px 0 4px;
    }
    .header img { height: 28px; }
    .header span {
      font-size: 15px;
      color: rgba(255,255,255,0.45);
      font-weight: 500;
      letter-spacing: 0.3px;
    }

    .sharer-info {
      text-align: center;
      font-size: 13px;
      color: rgba(255,255,255,0.45);
      margin-bottom: 8px;
    }

    .table-container {
      position: relative;
      width: 100%;
      aspect-ratio: 0.85;
      margin: 0 0 12px;
    }
    .felt {
      position: absolute;
      inset: 6% 3%;
      border-radius: 44%;
      background: rgba(255,255,255,0.03);
      border: 2px solid rgba(255,255,255,0.06);
      box-shadow: 0 0 60px rgba(0,0,0,0.3), inset 0 0 40px rgba(0,0,0,0.15);
    }

    .seat {
      position: absolute;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 3px;
      transform: translate(-50%, -50%);
      transition: opacity 0.4s ease;
      z-index: 2;
    }
    .seat.folded { opacity: 0.25; }
    .seat.winner { filter: drop-shadow(0 0 8px var(--accent-green)); }
    .seat-stack {
      font-size: 10px;
      color: rgba(255,255,255,0.35);
      font-weight: 500;
      font-variant-numeric: tabular-nums;
    }
    .seat-cards { display: flex; gap: 3px; }

    .card {
      width: 30px;
      height: 42px;
      border-radius: 5px;
      background: #fff;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      font-weight: 700;
      line-height: 1;
      position: relative;
      box-shadow: 0 1px 4px rgba(0,0,0,0.3);
    }
    .card .rank {
      font-size: 12px;
      position: absolute;
      top: 3px;
      left: 4px;
    }
    .card .suit { font-size: 15px; margin-top: 2px; }
    .card.red { color: var(--card-red); }
    .card.black { color: var(--card-black); }
    .card-back {
      width: 24px;
      height: 34px;
      border-radius: 4px;
      background: linear-gradient(145deg, #3b4a6b 0%, #2a3650 100%);
      border: 1px solid rgba(255,255,255,0.08);
      box-shadow: 0 1px 3px rgba(0,0,0,0.3);
    }

    .board-cards {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      display: flex;
      gap: 5px;
      z-index: 3;
    }
    .board-card {
      width: 36px;
      height: 50px;
      border-radius: 6px;
      background: #fff;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      font-weight: 700;
      opacity: 0;
      transition: opacity 0.35s ease, transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
      transform: scale(0.7) translateY(6px);
      box-shadow: 0 2px 8px rgba(0,0,0,0.3);
    }
    .board-card.visible { opacity: 1; transform: scale(1) translateY(0); }
    .board-card .rank { font-size: 14px; position: absolute; top: 3px; left: 5px; }
    .board-card .suit { font-size: 17px; margin-top: 2px; }
    .board-card.red { color: var(--card-red); }
    .board-card.black { color: var(--card-black); }

    .pot {
      position: absolute;
      top: 36%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: rgba(255,255,255,0.08);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      padding: 4px 14px;
      border-radius: 14px;
      font-size: 12px;
      font-weight: 600;
      color: rgba(255,255,255,0.65);
      z-index: 3;
      white-space: nowrap;
      opacity: 0;
      transition: opacity 0.3s;
      font-variant-numeric: tabular-nums;
    }
    .pot.visible { opacity: 1; }

    .bet-chip {
      position: absolute;
      font-size: 10px;
      font-weight: 700;
      color: #fbbf24;
      white-space: nowrap;
      opacity: 0;
      transition: opacity 0.25s;
      z-index: 4;
      font-variant-numeric: tabular-nums;
      text-shadow: 0 1px 2px rgba(0,0,0,0.5);
    }
    .bet-chip.visible { opacity: 1; }

    .dealer-btn {
      position: absolute;
      width: 20px;
      height: 20px;
      border-radius: 50%;
      background: #fff;
      color: #000;
      font-size: 9px;
      font-weight: 800;
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 5;
      transform: translate(-50%, -50%);
      box-shadow: 0 1px 4px rgba(0,0,0,0.4);
    }

    .controls {
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      display: flex;
      justify-content: center;
      align-items: center;
      gap: 16px;
      padding: 20px 24px max(24px, env(safe-area-inset-bottom));
      background: linear-gradient(to top, rgba(11,14,19,0.95) 0%, rgba(11,14,19,0.8) 70%, transparent 100%);
      z-index: 50;
    }
    .control-btn {
      padding: 14px 32px;
      border-radius: 12px;
      background: rgba(255,255,255,0.1);
      border: 1px solid rgba(255,255,255,0.15);
      color: #fff;
      font-size: 15px;
      font-weight: 500;
      cursor: pointer;
      transition: transform 0.15s ease, background 0.2s;
      touch-action: manipulation;
    }
    .control-btn:active { transform: scale(0.97); background: rgba(255,255,255,0.15); }
    .control-btn:disabled { opacity: 0.4; cursor: not-allowed; }

    .cta-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0);
      z-index: 100;
      display: flex;
      align-items: flex-end;
      justify-content: center;
      pointer-events: none;
      transition: background 0.5s ease;
    }
    .cta-overlay.visible { background: rgba(0,0,0,0.65); pointer-events: auto; }
    .cta-card {
      background: var(--surface);
      border-radius: 24px 24px 0 0;
      padding: 28px 24px max(36px, env(safe-area-inset-bottom));
      max-width: 480px;
      width: 100%;
      text-align: center;
      transform: translateY(100%);
      transition: transform 0.5s cubic-bezier(0.34, 1.3, 0.64, 1);
    }
    .cta-overlay.visible .cta-card { transform: translateY(0); }
    .cta-handle {
      width: 36px;
      height: 5px;
      border-radius: 3px;
      background: rgba(255,255,255,0.15);
      margin: 0 auto 20px;
    }
    .cta-title {
      font-size: 21px;
      font-weight: 700;
      margin-bottom: 6px;
      line-height: 1.3;
      letter-spacing: -0.4px;
    }
    .cta-sub {
      font-size: 14px;
      color: var(--text-muted);
      margin-bottom: 24px;
      line-height: 1.4;
    }
    .cta-appstore {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 16px 36px;
      background: #fff;
      color: #000;
      border-radius: 14px;
      font-size: 17px;
      font-weight: 600;
      text-decoration: none;
      transition: transform 0.15s ease;
      letter-spacing: -0.2px;
    }
    .cta-appstore:active { transform: scale(0.97); }
    .cta-appstore svg { width: 20px; height: 20px; }
    .cta-link {
      display: block;
      margin-top: 16px;
      font-size: 13px;
      color: var(--text-muted);
      text-decoration: none;
    }

    @media (max-width: 380px) {
      .card { width: 26px; height: 38px; }
      .card .rank { font-size: 10px; }
      .card .suit { font-size: 13px; }
      .card-back { width: 20px; height: 30px; }
      .board-card { width: 32px; height: 44px; }
      .board-card .rank { font-size: 12px; }
      .board-card .suit { font-size: 15px; }
    }
  </style>
</head>
<body>
  <div id="app">
    <div class="header">
      <img src="https://stackpoker.gg/images/logo.png" alt="Stack">
      <span>Hand Replay</span>
    </div>
    <div class="sharer-info" id="sharerInfo"></div>
    <div class="table-container" id="table">
      <div class="felt"></div>
      <div class="pot" id="pot">Pot: $0.00</div>
      <div class="board-cards" id="boardCards"></div>
    </div>
    <div class="controls">
      <button class="control-btn" id="replayBtn">Replay</button>
    </div>
  </div>
  <div class="cta-overlay" id="ctaOverlay">
    <div class="cta-card">
      <div class="cta-handle"></div>
      <div class="cta-title">Play poker hands like this on Stack</div>
      <div class="cta-sub">Practice against bots and improve your game with AI-powered analysis</div>
      <a class="cta-appstore" href="https://apps.apple.com/us/app/stack-poker-learn-train/id6745683972" target="_blank">
        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/></svg>
        Download on the App Store
      </a>
      <a class="cta-link" href="https://stackpoker.gg">stackpoker.gg</a>
    </div>
  </div>
  <script>
    const HAND = ${replayJson};

    // Seat positions (% of table-container) for 6-max
    // Rotated so hero is at bottom center
    const SEAT_POSITIONS = [
      { top: 90, left: 50 },  // 0: bottom center (hero)
      { top: 72, left: 5 },   // 1: left
      { top: 22, left: 10 },  // 2: top-left
      { top: 8, left: 50 },   // 3: top-center
      { top: 22, left: 90 },  // 4: top-right
      { top: 72, left: 95 },  // 5: right
    ];

    const BET_POSITIONS = [
      { top: 78, left: 50 },
      { top: 65, left: 20 },
      { top: 32, left: 20 },
      { top: 20, left: 50 },
      { top: 32, left: 80 },
      { top: 65, left: 80 },
    ];

    const DEALER_OFFSETS = [
      { top: -10, left: 8 },
      { top: -6, left: 10 },
      { top: 6, left: 10 },
      { top: 6, left: 8 },
      { top: 6, left: -6 },
      { top: -6, left: -6 },
    ];

    const suitSymbol = { h: '\\u2665', d: '\\u2666', c: '\\u2663', s: '\\u2660' };
    const suitColor = { h: 'red', d: 'red', c: 'black', s: 'black' };

    function parseCard(notation) {
      if (!notation || notation.length < 2) return null;
      return { rank: notation[0], suit: notation[1] };
    }

    function makeCardEl(rank, suit, cls) {
      const col = suitColor[suit] || 'black';
      return '<div class="' + (cls || 'card') + ' ' + col + '"><span class="rank">' + rank + '</span><span class="suit">' + suitSymbol[suit] + '</span></div>';
    }

    function formatCents(cents) {
      return '$' + (Math.abs(cents) / 100).toFixed(2);
    }

    // Rotate seats so hero is at position 0
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

    // State
    const seatEls = [];
    const betEls = [];
    const foldedSet = new Set();
    let pot = 0;
    let currentBets = {};
    let boardCardEls = [];
    let isPlaying = false;
    let currentActionIndex = 0;
    let currentStreet = 'preflop';

    function init() {
      const table = document.getElementById('table');

      // Show sharer info
      document.getElementById('sharerInfo').textContent = 'Shared by @' + HAND.sharerName;

      // Create seats
      rotatedSeats.forEach(function(seat, i) {
        const seatEl = document.createElement('div');
        seatEl.className = 'seat';
        seatEl.id = 'seat-' + seat.seatIndex;
        seatEl.style.top = SEAT_POSITIONS[i].top + '%';
        seatEl.style.left = SEAT_POSITIONS[i].left + '%';

        let cardsHtml = '';
        if (seat.holeCards && seat.holeCards.length === 2) {
          const cards = seat.holeCards.map(parseCard).filter(c => c);
          cardsHtml = '<div class="seat-cards">' + cards.map(c => makeCardEl(c.rank, c.suit)).join('') + '</div>';
        } else {
          cardsHtml = '<div class="seat-cards"><div class="card-back"></div><div class="card-back"></div></div>';
        }

        seatEl.innerHTML = cardsHtml + '<div class="seat-stack">' + formatCents(seat.startingStack) + '</div>';

        table.appendChild(seatEl);
        seatEls[i] = seatEl;

        // Bet chip
        const chip = document.createElement('div');
        chip.className = 'bet-chip';
        chip.id = 'bet-' + seat.seatIndex;
        chip.style.top = BET_POSITIONS[i].top + '%';
        chip.style.left = BET_POSITIONS[i].left + '%';
        table.appendChild(chip);
        betEls[i] = chip;
      });

      // Dealer button
      const btnSeat = HAND.seats.find(s => s.seatIndex === HAND.buttonSeat);
      if (btnSeat) {
        const btnVisIdx = seatToVisualIndex[HAND.buttonSeat];
        if (btnVisIdx !== undefined) {
          const db = document.createElement('div');
          db.className = 'dealer-btn';
          db.textContent = 'D';
          const sp = SEAT_POSITIONS[btnVisIdx];
          const off = DEALER_OFFSETS[btnVisIdx];
          db.style.top = (sp.top + off.top) + '%';
          db.style.left = (sp.left + off.left) + '%';
          table.appendChild(db);
        }
      }

      // Pre-create board card slots
      const boardContainer = document.getElementById('boardCards');
      for (let i = 0; i < 5; i++) {
        const el = document.createElement('div');
        el.className = 'board-card';
        boardContainer.appendChild(el);
        boardCardEls.push(el);
      }

      // Control button
      document.getElementById('replayBtn').onclick = startReplay;

      // Auto-start after 1s
      setTimeout(startReplay, 1000);
    }

    function escapeHtml(s) {
      return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    }

    function showBet(seatIdx, amount) {
      const visIdx = seatToVisualIndex[seatIdx];
      if (visIdx === undefined) return;
      const el = betEls[visIdx];
      el.textContent = formatCents(amount);
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
      if (pot > 0) {
        el.textContent = 'Pot: ' + formatCents(pot);
        el.classList.add('visible');
      }
    }

    function revealBoardCards(street) {
      collectPot();

      let startIdx, endIdx;
      if (street === 'flop') {
        startIdx = 0; endIdx = 3;
      } else if (street === 'turn') {
        startIdx = 3; endIdx = 4;
      } else if (street === 'river') {
        startIdx = 4; endIdx = 5;
      } else return;

      for (let i = startIdx; i < endIdx && i < HAND.board.length; i++) {
        const card = parseCard(HAND.board[i]);
        if (card && i < boardCardEls.length) {
          const el = boardCardEls[i];
          const col = suitColor[card.suit] || 'black';
          el.className = 'board-card ' + col;
          el.innerHTML = '<span class="rank">' + card.rank + '</span><span class="suit">' + suitSymbol[card.suit] + '</span>';
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
      boardCardEls.forEach(el => {
        el.classList.remove('visible');
        el.className = 'board-card';
        el.innerHTML = '';
      });

      // Restore original hole cards
      seatEls.forEach((el, i) => {
        const seat = rotatedSeats[i];
        const cardsContainer = el.querySelector('.seat-cards');
        if (cardsContainer) {
          if (seat.holeCards && seat.holeCards.length === 2) {
            const cards = seat.holeCards.map(parseCard).filter(c => c);
            cardsContainer.innerHTML = cards.map(c => makeCardEl(c.rank, c.suit)).join('');
          } else {
            cardsContainer.innerHTML = '<div class="card-back"></div><div class="card-back"></div>';
          }
        }
      });

      document.getElementById('pot').classList.remove('visible');
      document.getElementById('pot').textContent = 'Pot: $0.00';
      document.getElementById('ctaOverlay').classList.remove('visible');
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

      // Check for street change and deal board cards
      if (a.street !== currentStreet && a.street !== 'preflop') {
        revealBoardCards(a.street);
        currentStreet = a.street;
        setTimeout(playNextAction, 800);
        return;
      }

      // Visualize action
      const normalizedAction = capitalizeAction(a.action);
      if (normalizedAction === 'Fold') {
        foldSeat(a.seat);
      } else if (normalizedAction === 'Check') {
        // No visual for check
      } else if (a.amount > 0) {
        showBet(a.seat, a.amount);
      }

      currentActionIndex++;
      setTimeout(playNextAction, 600);
    }

    function finishReplay() {
      isPlaying = false;
      collectPot();

      // Reveal winner cards
      HAND.winners.forEach(w => {
        const visIdx = seatToVisualIndex[w.seat];
        if (visIdx !== undefined) {
          seatEls[visIdx].classList.add('winner');
          if (w.shownCards && w.shownCards.length === 2) {
            const seatEl = seatEls[visIdx];
            const cardsContainer = seatEl.querySelector('.seat-cards');
            if (cardsContainer) {
              const cards = w.shownCards.map(parseCard).filter(c => c);
              cardsContainer.innerHTML = cards.map(c => makeCardEl(c.rank, c.suit)).join('');
            }
          }
        }
      });

      document.getElementById('replayBtn').disabled = false;

      // Show CTA after 2s
      setTimeout(showCta, 2000);
    }

    function showCta() {
      document.getElementById('ctaOverlay').classList.add('visible');
    }

    init();
  </script>
</body>
</html>`;
}
