import type { VercelRequest, VercelResponse } from '@vercel/node';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// --- Action Queue Builder (ported from DailySpotModels.swift) ---

interface HandAction {
  position: string;
  action: string;
  amount: number;
  isBoard: boolean;
  boardCards?: string;
}

const PREFLOP_ORDER = ["UTG", "HJ", "CO", "BTN", "SB", "BB"];
const POSTFLOP_ORDER = ["SB", "BB", "UTG", "HJ", "CO", "BTN"];
const ALL_POSITIONS = new Set(["SB", "BB", "UTG", "HJ", "CO", "BTN"]);

function normalizeAction(action: string): string {
  if (/^[345]-?[Bb]et$/i.test(action) || ["3Bet", "3bet", "4Bet", "4bet", "5Bet", "5bet"].includes(action)) {
    return "Raise";
  }
  return action;
}

function parsePositionKey(key: string): { position: string; isSecondAction: boolean } | null {
  if (ALL_POSITIONS.has(key)) return { position: key, isSecondAction: false };
  for (const pos of ALL_POSITIONS) {
    if (key.startsWith(pos + "_")) return { position: pos, isSecondAction: true };
  }
  return null;
}

function extractBoardCards(streetData: Record<string, any>, expectedLength: number): string | null {
  if (typeof streetData["Cards"] === "string" && streetData["Cards"].length > 0) {
    return streetData["Cards"];
  }
  for (const value of Object.values(streetData)) {
    if (value && typeof value === "object" && typeof value["Cards"] === "string" && value["Cards"].length >= expectedLength) {
      return value["Cards"];
    }
  }
  return null;
}

type ActionPair = { action: string; amount: number };

function buildPreflopActions(preflop: Record<string, any>, hero: string): { actions: HandAction[]; folded: Set<string> } {
  const actions: HandAction[] = [];
  const foldedPositions = new Set<string>();

  actions.push({ position: "SB", action: "Post", amount: 0.5, isBoard: false });
  actions.push({ position: "BB", action: "Post", amount: 1.0, isBoard: false });

  const positionActions = new Map<string, ActionPair>();
  const secondActions = new Map<string, ActionPair>();
  let lastRaiseAmount = 1.0;

  for (const [key, value] of Object.entries(preflop)) {
    const parsed = parsePositionKey(key);
    if (!parsed) continue;
    if (!value || typeof value !== "object" || typeof value["Action"] !== "string") continue;

    const amount = typeof value["Amount"] === "number" ? value["Amount"] : 0;
    const normalized = normalizeAction(value["Action"]);

    if (normalized === "Raise" && amount > 0) lastRaiseAmount = amount;

    if (parsed.isSecondAction) {
      secondActions.set(parsed.position, { action: normalized, amount });
    } else {
      positionActions.set(parsed.position, { action: normalized, amount });
    }
  }

  for (const [pos, data] of positionActions) {
    if (data.action === "Call" && data.amount === 0) positionActions.set(pos, { action: "Call", amount: lastRaiseAmount });
  }
  for (const [pos, data] of secondActions) {
    if (data.action === "Call" && data.amount === 0) secondActions.set(pos, { action: "Call", amount: lastRaiseAmount });
  }

  const hasRaise = [...positionActions.values()].some(a => a.action === "Raise");

  for (const position of PREFLOP_ORDER) {
    if (position === hero) break;
    const data = positionActions.get(position);
    if (data) {
      actions.push({ position, action: data.action, amount: data.amount, isBoard: false });
      if (data.action === "Fold") foldedPositions.add(position);
    } else if (position !== "SB" && position !== "BB") {
      actions.push({ position, action: "Fold", amount: 0, isBoard: false });
      foldedPositions.add(position);
    } else if (hasRaise) {
      actions.push({ position, action: "Fold", amount: 0, isBoard: false });
      foldedPositions.add(position);
    }
  }

  const heroAction = positionActions.get(hero);
  if (heroAction) {
    actions.push({ position: hero, action: heroAction.action, amount: heroAction.amount, isBoard: false });
  }

  const heroIndex = PREFLOP_ORDER.indexOf(hero);
  for (let i = heroIndex + 1; i < PREFLOP_ORDER.length; i++) {
    const position = PREFLOP_ORDER[i];
    if (foldedPositions.has(position)) continue;
    const data = positionActions.get(position);
    if (data) {
      actions.push({ position, action: data.action, amount: data.amount, isBoard: false });
      if (data.action === "Fold") foldedPositions.add(position);
    } else {
      actions.push({ position, action: "Fold", amount: 0, isBoard: false });
      foldedPositions.add(position);
    }
  }

  let originalRaiser: string | null = null;
  let finalRaiseAmount = lastRaiseAmount;
  let raiseCount = 0;

  for (const position of PREFLOP_ORDER) {
    const data = positionActions.get(position);
    if (data && data.action === "Raise") {
      raiseCount++;
      if (raiseCount === 1) originalRaiser = position;
      finalRaiseAmount = data.amount;
    }
  }

  for (const position of PREFLOP_ORDER) {
    if (foldedPositions.has(position)) continue;
    if (position === hero) {
      const heroSecond = secondActions.get(hero);
      if (heroSecond) {
        actions.push({ position: hero, action: heroSecond.action, amount: heroSecond.amount, isBoard: false });
      } else if (raiseCount > 1 && originalRaiser === hero && !foldedPositions.has(hero)) {
        actions.push({ position: hero, action: "Call", amount: finalRaiseAmount, isBoard: false });
      }
      break;
    }
    const data = secondActions.get(position);
    if (data) {
      actions.push({ position, action: data.action, amount: data.amount, isBoard: false });
      if (data.action === "Fold") foldedPositions.add(position);
    } else if (raiseCount > 1 && originalRaiser === position && !foldedPositions.has(position)) {
      actions.push({ position, action: "Call", amount: finalRaiseAmount, isBoard: false });
    }
  }

  return { actions, folded: foldedPositions };
}

function buildPostflopActions(
  streetData: Record<string, any>,
  hero: string,
  foldedPositions: Set<string>
): { actions: HandAction[]; newFolded: Set<string> } {
  const actions: HandAction[] = [];
  const newFolded = new Set<string>();

  const positionActions = new Map<string, ActionPair>();
  const secondActions = new Map<string, ActionPair>();
  let lastBetAmount = 0;

  for (const [key, value] of Object.entries(streetData)) {
    const parsed = parsePositionKey(key);
    if (!parsed) continue;
    if (!value || typeof value !== "object" || typeof value["Action"] !== "string") continue;

    const amount = typeof value["Amount"] === "number" ? value["Amount"] : 0;
    const normalized = normalizeAction(value["Action"]);

    if ((normalized === "Bet" || normalized === "Raise") && amount > 0) lastBetAmount = amount;

    if (parsed.isSecondAction) {
      secondActions.set(parsed.position, { action: normalized, amount });
    } else {
      positionActions.set(parsed.position, { action: normalized, amount });
    }
  }

  if (lastBetAmount > 0) {
    for (const [pos, data] of positionActions) {
      if (data.action === "Call" && data.amount === 0) positionActions.set(pos, { action: "Call", amount: lastBetAmount });
    }
    for (const [pos, data] of secondActions) {
      if (data.action === "Call" && data.amount === 0) secondActions.set(pos, { action: "Call", amount: lastBetAmount });
    }
  }

  const activePositions = POSTFLOP_ORDER.filter(p => !foldedPositions.has(p));

  let firstAggressorIndex: number | null = null;
  for (let i = 0; i < activePositions.length; i++) {
    const data = positionActions.get(activePositions[i]);
    if (data && (data.action === "Bet" || data.action === "Raise")) {
      firstAggressorIndex = i;
      break;
    }
  }

  for (let i = 0; i < activePositions.length; i++) {
    const position = activePositions[i];
    if (position === hero && !positionActions.has(hero)) break;

    const data = positionActions.get(position);
    if (data) {
      if (data.action === "Bet" || data.action === "Raise" || data.action === "Check") {
        actions.push({ position, action: data.action, amount: data.amount, isBoard: false });
        if (data.action === "Bet" || data.action === "Raise") break;
      } else if (data.action === "Call" || data.action === "Fold") {
        if (firstAggressorIndex !== null && i < firstAggressorIndex) {
          actions.push({ position, action: "Check", amount: 0, isBoard: false });
        }
      }
    } else {
      const laterHasAction = activePositions.slice(i + 1).some(p => positionActions.has(p));
      if (laterHasAction) {
        actions.push({ position, action: "Check", amount: 0, isBoard: false });
      }
    }

    if (position === hero && positionActions.has(hero)) {
      const heroData = positionActions.get(hero)!;
      if (heroData.action === "Bet" || heroData.action === "Raise") break;
    }
  }

  if (firstAggressorIndex !== null) {
    for (let i = firstAggressorIndex + 1; i < activePositions.length; i++) {
      const position = activePositions[i];
      if (position === hero && !positionActions.has(hero)) break;

      const data = positionActions.get(position);
      if (data) {
        if (data.action === "Call" || data.action === "Fold" || data.action === "Raise") {
          actions.push({ position, action: data.action, amount: data.amount, isBoard: false });
          if (data.action === "Fold") newFolded.add(position);
        }
      } else {
        actions.push({ position, action: "Call", amount: lastBetAmount, isBoard: false });
      }

      if (position === hero) break;
    }

    for (let i = 0; i < firstAggressorIndex; i++) {
      const position = activePositions[i];
      if (position === hero && !secondActions.has(hero) && positionActions.get(hero)?.action !== "Call") break;

      const secondData = secondActions.get(position);
      if (secondData) {
        actions.push({ position, action: secondData.action, amount: secondData.amount, isBoard: false });
        if (secondData.action === "Fold") newFolded.add(position);
      } else {
        const data = positionActions.get(position);
        if (data && (data.action === "Call" || data.action === "Fold" || data.action === "Raise")) {
          actions.push({ position, action: data.action, amount: data.amount, isBoard: false });
          if (data.action === "Fold") newFolded.add(position);
        }
      }

      if (position === hero) break;
    }
  }

  return { actions, newFolded };
}

function buildActionQueue(action: Record<string, any>, hero: string): HandAction[] {
  const queue: HandAction[] = [];
  let foldedPositions = new Set<string>();

  if (action["preflop"] && typeof action["preflop"] === "object") {
    const { actions, folded } = buildPreflopActions(action["preflop"], hero);
    queue.push(...actions);
    foldedPositions = folded;
  }

  const streets: Array<{ key: string; expectedCardLen: number }> = [
    { key: "flop", expectedCardLen: 6 },
    { key: "turn", expectedCardLen: 2 },
    { key: "river", expectedCardLen: 2 },
  ];

  for (const { key, expectedCardLen } of streets) {
    const streetData = action[key];
    if (!streetData || typeof streetData !== "object") continue;

    const cards = extractBoardCards(streetData, expectedCardLen);
    if (cards) {
      queue.push({ position: "", action: "Board", amount: 0, isBoard: true, boardCards: cards });
    }

    const { actions, newFolded } = buildPostflopActions(streetData, hero, foldedPositions);
    queue.push(...actions);
    for (const p of newFolded) foldedPositions.add(p);
  }

  return queue;
}

// --- End Action Queue Builder ---

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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { id } = req.query;

  if (!id || typeof id !== 'string') {
    return res.status(400).send('Missing challenge ID');
  }

  try {
    const db = getDb();
    const doc = await db.collection('daily10_challenges').doc(id).get();

    if (!doc.exists) {
      return res.status(404).send('Challenge not found');
    }

    const data = doc.data()!;
    const name = data.username || data.displayName || 'Someone';
    const score = Math.round(data.totalScore ?? 0);
    const maxScore = Math.round(data.maxScore ?? 100);
    const answers: { isCorrect: boolean }[] = data.answers || [];
    const scheduledDate = data.scheduledDate;

    const grid = answers.map((a) => (a.isCorrect ? '1' : '0')).join('');
    const ogImageUrl = `https://stackpoker.gg/api/daily10/og?name=${encodeURIComponent(name)}&score=${score}&maxScore=${maxScore}&grid=${grid}`;
    const title = `I scored ${score}/${maxScore} on Stack Daily 10`;
    const description = `Tap to play a hand from Today's Daily 10`;

    // Try to fetch the first puzzle for this date
    let puzzleJson: string | null = null;

    if (scheduledDate) {
      const puzzleSnap = await db
        .collection('new_daily_puzzles')
        .where('scheduled_date', '==', scheduledDate)
        .orderBy('Order', 'asc')
        .limit(1)
        .get();

      if (!puzzleSnap.empty) {
        const p = puzzleSnap.docs[0].data();
        const hero = p.Hero || '';
        const actionData = p.Action || {};
        const actionQueue = buildActionQueue(actionData, hero);

        // Extract hero cards from preflop action
        let heroCards = '';
        if (actionData.preflop && actionData.preflop[hero] && typeof actionData.preflop[hero].Cards === 'string') {
          heroCards = actionData.preflop[hero].Cards;
        }

        // Decision street from tags
        const tags: string[] = p.Tags || [];
        let decisionStreet = 'preflop';
        if (tags.includes('river')) decisionStreet = 'river';
        else if (tags.includes('turn')) decisionStreet = 'turn';
        else if (tags.includes('flop')) decisionStreet = 'flop';

        // Correct answer: first correct answer
        const correctAnswers: string[] = p.CorrectAnswers || [];
        const correctAnswer = correctAnswers[0] || '';
        const actionFreqs: Record<string, number> = p.ActionFrequencies || {};
        const correctFrequency = actionFreqs[correctAnswer] ?? 0;
        const explanations: Record<string, string> = p.Explanations || {};
        const correctExplanation = explanations[correctAnswer] || '';

        const puzzleData = {
          hero,
          heroCards,
          questionText: p.QuestionText || '',
          answerOptions: p.AnswerOptions || [],
          correctAnswer,
          correctExplanation,
          correctFrequency,
          actionQueue,
          effectiveStacks: p.EffectiveStacks || 100,
          decisionStreet,
          flavorText: p.FlavorText || null,
          challengerName: name,
          challengerScore: score,
          challengerMaxScore: maxScore,
        };

        puzzleJson = JSON.stringify(puzzleData);
      }
    }

    // If no puzzle found, fall back to redirect
    if (!puzzleJson) {
      const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:image" content="${ogImageUrl}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:type" content="website">
  <meta property="og:url" content="https://stackpoker.gg/daily10/challenge/${escapeHtml(id)}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeHtml(title)}">
  <meta name="twitter:description" content="${escapeHtml(description)}">
  <meta name="twitter:image" content="${ogImageUrl}">
  <meta http-equiv="refresh" content="0;url=https://stackpoker.gg/daily-practice">
</head>
<body><p>Redirecting to Stack...</p></body>
</html>`;
      res.setHeader('Content-Type', 'text/html');
      res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate');
      return res.status(200).send(html);
    }

    const html = buildInteractivePage(id, escapeHtml(title), escapeHtml(description), ogImageUrl, puzzleJson);
    res.setHeader('Content-Type', 'text/html');
    res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate');
    return res.status(200).send(html);
  } catch (error: any) {
    console.error('Error fetching challenge:', error?.message, error?.code, error?.stack);
    return res.status(500).send(`Internal server error: ${error?.message || 'unknown'}`);
  }
}

function buildInteractivePage(id: string, title: string, description: string, ogImageUrl: string, puzzleJson: string): string {
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
  <meta property="og:url" content="https://stackpoker.gg/daily10/challenge/${id}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${title}">
  <meta name="twitter:description" content="${description}">
  <meta name="twitter:image" content="${ogImageUrl}">
  <meta name="theme-color" content="#0B0E13">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
    html { -webkit-text-size-adjust: 100%; }
    body { background: #0B0E13; color: #fff; font-family: -apple-system, 'SF Pro Display', 'SF Pro Text', BlinkMacSystemFont, system-ui, sans-serif; min-height: 100vh; min-height: -webkit-fill-available; overflow-x: hidden; -webkit-font-smoothing: antialiased; background-image: url('https://stackpoker.gg/images/table-bg.png'); background-size: cover; background-position: top center; background-repeat: no-repeat; }
    #app { max-width: 480px; margin: 0 auto; padding: max(16px, env(safe-area-inset-top)) 16px max(32px, env(safe-area-inset-bottom)); position: relative; min-height: 100vh; }

    .header { display: flex; align-items: center; justify-content: center; padding: 8px 0 4px; }
    .header img { height: 28px; }

    .table-container { position: relative; width: 100%; aspect-ratio: 0.85; margin: 0 0 12px; }
    .felt { position: absolute; inset: 6% 3%; border-radius: 44%; background: rgba(255,255,255,0.03); border: 2px solid rgba(255,255,255,0.06); box-shadow: 0 0 60px rgba(0,0,0,0.3), inset 0 0 40px rgba(0,0,0,0.15); }

    .seat { position: absolute; display: flex; flex-direction: column; align-items: center; gap: 3px; transform: translate(-50%, -50%); transition: opacity 0.4s ease; z-index: 2; }
    .seat.folded { opacity: 0.25; }
    .seat-stack { font-size: 10px; color: rgba(255,255,255,0.35); font-weight: 500; font-variant-numeric: tabular-nums; }
    .seat-cards { display: flex; gap: 3px; }

    .card { width: 30px; height: 42px; border-radius: 5px; background: #fff; display: flex; flex-direction: column; align-items: center; justify-content: center; font-weight: 700; line-height: 1; position: relative; box-shadow: 0 1px 4px rgba(0,0,0,0.3); }
    .card .rank { font-size: 12px; position: absolute; top: 3px; left: 4px; }
    .card .suit { font-size: 15px; margin-top: 2px; }
    .card.red { color: #DC2626; }
    .card.black { color: #1a1a2e; }
    .card-back { width: 24px; height: 34px; border-radius: 4px; background: linear-gradient(145deg, #3b4a6b 0%, #2a3650 100%); border: 1px solid rgba(255,255,255,0.08); box-shadow: 0 1px 3px rgba(0,0,0,0.3); }

    .board-cards { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); display: flex; gap: 5px; z-index: 3; }
    .board-card { width: 36px; height: 50px; border-radius: 6px; background: #fff; display: flex; flex-direction: column; align-items: center; justify-content: center; font-weight: 700; opacity: 0; transition: opacity 0.35s ease, transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1); transform: scale(0.7) translateY(6px); box-shadow: 0 2px 8px rgba(0,0,0,0.3); }
    .board-card.visible { opacity: 1; transform: scale(1) translateY(0); }
    .board-card .rank { font-size: 14px; position: absolute; top: 3px; left: 5px; }
    .board-card .suit { font-size: 17px; margin-top: 2px; }
    .board-card.red { color: #DC2626; }
    .board-card.black { color: #1a1a2e; }

    .pot { position: absolute; top: 36%; left: 50%; transform: translate(-50%, -50%); background: rgba(255,255,255,0.08); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); padding: 4px 14px; border-radius: 14px; font-size: 12px; font-weight: 600; color: rgba(255,255,255,0.65); z-index: 3; white-space: nowrap; opacity: 0; transition: opacity 0.3s; font-variant-numeric: tabular-nums; }
    .pot.visible { opacity: 1; }

    .bet-chip { position: absolute; display: flex; align-items: center; gap: 4px; opacity: 0; transition: opacity 0.25s; z-index: 4; transform: translate(-50%, -50%); }
    .bet-chip.visible { opacity: 1; }
    .bet-chip .chip-icon { width: 16px; height: 16px; border-radius: 50%; background: linear-gradient(145deg, #e53935 0%, #b71c1c 100%); border: 2px solid #fff; box-shadow: 0 1px 3px rgba(0,0,0,0.4); }
    .bet-chip .chip-amount { font-size: 11px; font-weight: 600; color: #fff; font-variant-numeric: tabular-nums; text-shadow: 0 1px 2px rgba(0,0,0,0.5); }

    .dealer-btn { position: absolute; width: 20px; height: 20px; border-radius: 50%; background: #fff; color: #000; font-size: 9px; font-weight: 800; display: flex; align-items: center; justify-content: center; z-index: 5; transform: translate(-50%, -50%); box-shadow: 0 1px 4px rgba(0,0,0,0.4); }

    .controls { position: fixed; bottom: 0; left: 0; right: 0; display: flex; justify-content: center; align-items: center; gap: 20px; padding: 20px 24px max(24px, env(safe-area-inset-bottom)); background: linear-gradient(to top, rgba(11,14,19,0.95) 0%, rgba(11,14,19,0.8) 70%, transparent 100%); z-index: 50; }
    .control-btn { padding: 10px 20px; border-radius: 10px; background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.1); color: #fff; font-size: 14px; font-weight: 500; cursor: pointer; transition: transform 0.15s ease, background 0.2s, opacity 0.2s; }
    .control-btn:active { transform: scale(0.97); background: rgba(255,255,255,0.15); }
    .nav-btn { width: 56px; height: 56px; padding: 0; font-size: 24px; font-weight: 400; border-radius: 50%; display: flex; align-items: center; justify-content: center; background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.15); color: #fff; touch-action: manipulation; -webkit-user-select: none; user-select: none; }
    .nav-btn:active { background: rgba(255,255,255,0.2); }
    .nav-btn:disabled { opacity: 0.25; cursor: not-allowed; }
    .reset-btn { font-size: 13px; padding: 10px 16px; background: transparent; border: 1px solid rgba(255,255,255,0.2); color: rgba(255,255,255,0.6); touch-action: manipulation; }

    .question-area { text-align: center; padding: 4px 0 120px; }
    .flavor-text { font-size: 13px; color: rgba(255,255,255,0.4); margin-bottom: 14px; font-style: italic; line-height: 1.4; }
    .answer-buttons { display: flex; flex-wrap: wrap; gap: 10px; padding: 0 4px; justify-content: center; }
    .answer-btn { flex: 1 1 calc(50% - 5px); min-width: calc(50% - 5px); max-width: calc(50% - 5px); padding: 16px 12px; border-radius: 14px; background: rgba(255,255,255,0.06); border: 1.5px solid rgba(255,255,255,0.1); color: #fff; font-size: 15px; font-weight: 500; cursor: pointer; transition: transform 0.15s ease, background 0.2s, border-color 0.3s, color 0.3s; opacity: 0; transform: translateY(12px) scale(0.97); -webkit-appearance: none; letter-spacing: -0.1px; text-align: center; }
    .answer-btn.show { opacity: 1; transform: translateY(0) scale(1); }
    .answer-btn:active { transform: scale(0.97); background: rgba(255,255,255,0.1); }
    .answer-btn.correct { background: rgba(34,197,94,0.15); border-color: #22C55E; color: #22C55E; font-weight: 600; }
    .answer-btn.wrong { background: rgba(239,68,68,0.15); border-color: #EF4444; color: #EF4444; }
    .answer-btn.selected { border-width: 2px; }
    .answer-btn.disabled { pointer-events: none; }

    .result-info { text-align: center; margin-top: 20px; font-size: 15px; color: rgba(255,255,255,0.6); line-height: 1.5; opacity: 0; transition: opacity 0.4s; letter-spacing: -0.2px; }
    .result-info.visible { opacity: 1; }

    .cta-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0); z-index: 100; display: flex; align-items: flex-end; justify-content: center; pointer-events: none; transition: background 0.5s ease; }
    .cta-overlay.visible { background: rgba(0,0,0,0.65); pointer-events: auto; }
    .cta-card { background: #1c2133; border-radius: 24px 24px 0 0; padding: 28px 24px max(36px, env(safe-area-inset-bottom)); max-width: 480px; width: 100%; text-align: center; transform: translateY(100%); transition: transform 0.5s cubic-bezier(0.34, 1.3, 0.64, 1); }
    .cta-overlay.visible .cta-card { transform: translateY(0); }
    .cta-handle { width: 36px; height: 5px; border-radius: 3px; background: rgba(255,255,255,0.15); margin: 0 auto 20px; }
    .cta-title { font-size: 21px; font-weight: 700; margin-bottom: 6px; line-height: 1.3; letter-spacing: -0.4px; }
    .cta-sub { font-size: 14px; color: rgba(255,255,255,0.5); margin-bottom: 24px; line-height: 1.4; }
    .cta-appstore { display: inline-flex; align-items: center; justify-content: center; gap: 8px; padding: 16px 36px; background: #fff; color: #000; border-radius: 14px; font-size: 17px; font-weight: 600; text-decoration: none; transition: transform 0.15s ease; letter-spacing: -0.2px; }
    .cta-appstore:active { transform: scale(0.97); }
    .cta-appstore svg { width: 20px; height: 20px; }
    .cta-link { display: block; margin-top: 16px; font-size: 13px; color: rgba(255,255,255,0.35); text-decoration: none; }

    .hidden { display: none; }

    @media (max-width: 380px) {
      .card { width: 26px; height: 38px; }
      .card .rank { font-size: 10px; }
      .card .suit { font-size: 13px; }
      .card-back { width: 20px; height: 30px; }
      .board-card { width: 32px; height: 44px; }
      .board-card .rank { font-size: 12px; }
      .board-card .suit { font-size: 15px; }
      .answer-btn { padding: 14px 8px; font-size: 14px; }
    }
  </style>
</head>
<body>
  <div id="app">
    <div class="header">
      <img src="https://stackpoker.gg/images/logo.png" alt="Stack">
    </div>
    <div class="table-container" id="table">
      <div class="felt"></div>
      <div class="pot" id="pot">Pot: 0bb</div>
      <div class="board-cards" id="boardCards"></div>
    </div>
    <div class="question-area hidden" id="questionArea">
      <div class="flavor-text" id="flavorText"></div>
      <div class="answer-buttons" id="answerButtons"></div>
      <div class="result-info" id="resultInfo"></div>
    </div>
    <div class="controls" id="controls">
      <button class="control-btn nav-btn" id="prevBtn" disabled><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg></button>
      <button class="control-btn reset-btn" id="resetBtn">Reset</button>
      <button class="control-btn nav-btn" id="nextBtn"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg></button>
    </div>
  </div>
  <div class="cta-overlay" id="ctaOverlay">
    <div class="cta-card">
      <div class="cta-handle"></div>
      <div class="cta-title">Download Stack to see why<br>and play the remaining 9 puzzles</div>
      <div class="cta-sub">Train your poker decisions daily with solver-backed analysis</div>
      <a class="cta-appstore" href="https://apps.apple.com/us/app/stack-poker-learn-train/id6745683972" target="_blank"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/></svg>Download on the App Store</a>
      <a class="cta-link" href="https://stackpoker.gg">stackpoker.gg</a>
    </div>
  </div>
  <script>
    const PUZZLE = ${puzzleJson};

    // Seat positions (% of table-container), rotated so hero is seat 0 (bottom center)
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

    const POSITIONS = ["UTG", "HJ", "CO", "BTN", "SB", "BB"];

    // Rotate so hero is at seat index 0
    function getRotatedPositions() {
      const heroIdx = POSITIONS.indexOf(PUZZLE.hero);
      const rotated = [];
      for (let i = 0; i < 6; i++) {
        rotated.push(POSITIONS[(heroIdx + i) % 6]);
      }
      return rotated;
    }

    const rotated = getRotatedPositions();
    const posToSeat = {};
    rotated.forEach((p, i) => posToSeat[p] = i);

    const suitSymbol = { h: '\\u2665', d: '\\u2666', c: '\\u2663', s: '\\u2660' };
    const suitColor = { h: 'red', d: 'red', c: 'black', s: 'black' };

    function parseCards(str) {
      const cards = [];
      for (let i = 0; i < str.length; i += 2) {
        cards.push({ rank: str[i], suit: str[i + 1] });
      }
      return cards;
    }

    function makeCardEl(rank, suit, cls) {
      const col = suitColor[suit] || 'black';
      return '<div class="' + (cls || 'card') + ' ' + col + '"><span class="rank">' + rank + '</span><span class="suit">' + suitSymbol[suit] + '</span></div>';
    }

    // State
    const seatEls = [];
    const betEls = [];
    const foldedSet = new Set();
    let pot = 0;
    let currentBets = {};
    let boardCardEls = [];
    let phase = 'replay'; // replay, question, result, cta

    // Navigation state
    let currentActionIndex = -1;
    let actionHistory = [];
    let boardCardCount = 0;

    function init() {
      const table = document.getElementById('table');

      // Create seats
      rotated.forEach(function(pos, i) {
        const seat = document.createElement('div');
        seat.className = 'seat';
        seat.id = 'seat-' + pos;
        seat.style.top = SEAT_POSITIONS[i].top + '%';
        seat.style.left = SEAT_POSITIONS[i].left + '%';

        const isHero = pos === PUZZLE.hero;
        let cardsHtml = '';

        if (isHero && PUZZLE.heroCards) {
          const cards = parseCards(PUZZLE.heroCards);
          cardsHtml = '<div class="seat-cards">' + cards.map(function(c) { return makeCardEl(c.rank, c.suit); }).join('') + '</div>';
        } else {
          cardsHtml = '<div class="seat-cards"><div class="card-back"></div><div class="card-back"></div></div>';
        }

        seat.innerHTML = cardsHtml + '<div class="seat-stack">' + PUZZLE.effectiveStacks + 'bb</div>';
        table.appendChild(seat);
        seatEls[i] = seat;

        // Bet chip
        const chip = document.createElement('div');
        chip.className = 'bet-chip';
        chip.id = 'bet-' + pos;
        chip.style.top = BET_POSITIONS[i].top + '%';
        chip.style.left = BET_POSITIONS[i].left + '%';
        table.appendChild(chip);
        betEls[i] = chip;
      });

      // Dealer button on BTN seat
      const btnIdx = posToSeat['BTN'];
      if (btnIdx !== undefined) {
        const db = document.createElement('div');
        db.className = 'dealer-btn';
        db.textContent = 'D';
        const sp = SEAT_POSITIONS[btnIdx];
        db.style.top = (sp.top - 8) + '%';
        db.style.left = (sp.left + 6) + '%';
        table.appendChild(db);
      }

      // Pre-create board card slots (max 5)
      const boardContainer = document.getElementById('boardCards');
      for (let i = 0; i < 5; i++) {
        const el = document.createElement('div');
        el.className = 'board-card';
        boardContainer.appendChild(el);
        boardCardEls.push(el);
      }

      // Control buttons
      document.getElementById('resetBtn').onclick = resetState;
      document.getElementById('prevBtn').onclick = stepBackward;
      document.getElementById('nextBtn').onclick = stepForward;

      updateNavButtons();
    }

    function esc(s) { return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

    function showBet(pos, amount) {
      const idx = posToSeat[pos];
      if (idx === undefined) return;
      const el = betEls[idx];
      el.innerHTML = '<div class="chip-icon"></div><span class="chip-amount">' + amount + 'bb</span>';
      el.classList.add('visible');
      currentBets[pos] = amount;
    }

    function clearBets() {
      betEls.forEach(function(el) { el.classList.remove('visible'); el.innerHTML = ''; });
      currentBets = {};
    }

    function foldSeat(pos) {
      const idx = posToSeat[pos];
      if (idx === undefined) return;
      seatEls[idx].classList.add('folded');
      foldedSet.add(pos);
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
        el.textContent = 'Pot: ' + pot.toFixed(1).replace(/\\.0$/, '') + 'bb';
        el.classList.add('visible');
      }
    }

    function revealBoardCards(cardsStr) {
      collectPot();
      const cards = parseCards(cardsStr);
      cards.forEach(function(c, i) {
        const idx = boardCardCount + i;
        if (idx < boardCardEls.length) {
          const el = boardCardEls[idx];
          const col = suitColor[c.suit] || 'black';
          el.className = 'board-card ' + col;
          el.innerHTML = '<span class="rank">' + c.rank + '</span><span class="suit">' + suitSymbol[c.suit] + '</span>';
          setTimeout(function() { el.classList.add('visible'); }, i * 150);
        }
      });
      boardCardCount += cards.length;
    }

    function captureState() {
      return {
        pot: pot,
        currentBets: Object.assign({}, currentBets),
        foldedSet: new Set(foldedSet),
        boardCardCount: boardCardCount
      };
    }

    function restoreState(snapshot) {
      pot = snapshot.pot;
      currentBets = Object.assign({}, snapshot.currentBets);
      foldedSet.clear();
      snapshot.foldedSet.forEach(function(s) { foldedSet.add(s); });
      boardCardCount = snapshot.boardCardCount;

      // Restore visual state
      updatePot();
      if (pot === 0) {
        document.getElementById('pot').classList.remove('visible');
        document.getElementById('pot').textContent = 'Pot: 0bb';
      }

      // Clear bets
      betEls.forEach(function(el) { el.classList.remove('visible'); });

      // Restore bets
      for (const pos in currentBets) {
        const idx = posToSeat[pos];
        if (idx !== undefined) {
          const el = betEls[idx];
          el.textContent = currentBets[pos] + 'bb';
          el.classList.add('visible');
        }
      }

      // Restore folded state
      seatEls.forEach(function(el, i) {
        const pos = rotated[i];
        if (foldedSet.has(pos)) {
          el.classList.add('folded');
        } else {
          el.classList.remove('folded');
        }
      });

      // Restore board cards
      boardCardEls.forEach(function(el, i) {
        if (i < boardCardCount) {
          const cards = [];
          for (let j = 0; j < PUZZLE.actionQueue.length; j++) {
            const a = PUZZLE.actionQueue[j];
            if (a.isBoard && a.boardCards) {
              const parsed = parseCards(a.boardCards);
              cards.push.apply(cards, parsed);
            }
          }
          if (i < cards.length) {
            const c = cards[i];
            const col = suitColor[c.suit] || 'black';
            el.className = 'board-card visible ' + col;
            el.innerHTML = '<span class="rank">' + c.rank + '</span><span class="suit">' + suitSymbol[c.suit] + '</span>';
          }
        } else {
          el.classList.remove('visible');
          el.className = 'board-card';
          el.innerHTML = '';
        }
      });
    }

    function resetState() {
      pot = 0;
      currentBets = {};
      boardCardCount = 0;
      foldedSet.clear();
      currentActionIndex = -1;
      actionHistory = [];
      phase = 'replay';

      seatEls.forEach(function(el) { el.classList.remove('folded'); });
      betEls.forEach(function(el) { el.classList.remove('visible'); });
      boardCardEls.forEach(function(el) {
        el.classList.remove('visible');
        el.className = 'board-card';
        el.innerHTML = '';
      });

      document.getElementById('pot').classList.remove('visible');
      document.getElementById('pot').textContent = 'Pot: 0bb';
      document.getElementById('questionArea').classList.add('hidden');
      document.getElementById('answerButtons').innerHTML = '';
      document.getElementById('resultInfo').classList.remove('visible');
      document.getElementById('ctaOverlay').classList.remove('visible');
      document.getElementById('controls').style.display = '';
      updateNavButtons();
    }

    function updateNavButtons() {
      const prevBtn = document.getElementById('prevBtn');
      const nextBtn = document.getElementById('nextBtn');
      prevBtn.disabled = currentActionIndex < 0;
      nextBtn.disabled = currentActionIndex >= PUZZLE.actionQueue.length - 1;
    }

    function stepForward() {
      if (phase !== 'replay') return;
      if (currentActionIndex >= PUZZLE.actionQueue.length - 1) return;

      // Capture state before applying action
      actionHistory.push(captureState());

      currentActionIndex++;
      const a = PUZZLE.actionQueue[currentActionIndex];

      if (a.isBoard && a.boardCards) {
        revealBoardCards(a.boardCards);
      } else {
        const pos = a.position;
        if (a.action === 'Post') {
          showBet(pos, a.amount);
        } else if (a.action === 'Fold') {
          foldSeat(pos);
        } else if (a.action === 'Check') {
          // no visual needed
        } else if (a.action === 'Call') {
          showBet(pos, a.amount);
        } else if (a.action === 'Raise' || a.action === 'Bet') {
          showBet(pos, a.amount);
        }
      }

      updateNavButtons();

      // If this was the last action, show question (keep bets visible for context)
      if (currentActionIndex >= PUZZLE.actionQueue.length - 1) {
        setTimeout(showQuestion, 500);
      }
    }

    function stepBackward() {
      if (actionHistory.length === 0) return;

      const snapshot = actionHistory.pop();
      restoreState(snapshot);
      currentActionIndex--;

      // If we're going back from question phase
      if (phase !== 'replay') {
        phase = 'replay';
        document.getElementById('questionArea').classList.add('hidden');
        document.getElementById('answerButtons').innerHTML = '';
        document.getElementById('resultInfo').classList.remove('visible');
        document.getElementById('controls').style.display = '';
      }

      updateNavButtons();
    }

    function showQuestion() {
      phase = 'question';

      // Hide nav controls
      document.getElementById('controls').style.display = 'none';

      // Don't collect pot - keep bets visible for context

      const area = document.getElementById('questionArea');
      area.classList.remove('hidden');

      if (PUZZLE.flavorText) {
        document.getElementById('flavorText').textContent = PUZZLE.flavorText;
      }

      const container = document.getElementById('answerButtons');
      PUZZLE.answerOptions.forEach(function(opt, i) {
        const btn = document.createElement('button');
        btn.className = 'answer-btn';
        btn.textContent = opt;
        btn.onclick = function() { handleAnswer(opt, btn); };
        container.appendChild(btn);
        setTimeout(function() { btn.classList.add('show'); }, 50 * (i + 1));
      });
    }

    function handleAnswer(chosen, btnEl) {
      if (phase !== 'question') return;
      phase = 'result';

      const buttons = document.querySelectorAll('.answer-btn');
      buttons.forEach(function(b) { b.classList.add('disabled'); });
      btnEl.classList.add('selected');

      const isCorrect = chosen === PUZZLE.correctAnswer;

      setTimeout(function() {
        if (isCorrect) {
          btnEl.classList.add('correct');
        } else {
          btnEl.classList.add('wrong');
          // Highlight correct answer
          buttons.forEach(function(b) {
            if (b.textContent === PUZZLE.correctAnswer) b.classList.add('correct');
          });
        }

        const pct = Math.round(PUZZLE.correctFrequency * 100);
        const info = document.getElementById('resultInfo');
        info.innerHTML = '<strong>' + esc(PUZZLE.correctAnswer) + '</strong> &mdash; Solver plays this ' + pct + '% of the time';
        info.classList.add('visible');

        setTimeout(showCta, 1500);
      }, 400);
    }

    function showCta() {
      phase = 'cta';
      document.getElementById('ctaOverlay').classList.add('visible');
    }

    init();
  </script>
</body>
</html>`;
}
