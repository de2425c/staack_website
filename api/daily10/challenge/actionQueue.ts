// Action queue builder - ported from DailySpotModels.swift

export interface HandAction {
  position: string;
  action: string;   // "Post", "Raise", "Call", "Check", "Fold", "Bet", "Board"
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

  // Infer call amounts
  for (const [pos, data] of positionActions) {
    if (data.action === "Call" && data.amount === 0) positionActions.set(pos, { action: "Call", amount: lastRaiseAmount });
  }
  for (const [pos, data] of secondActions) {
    if (data.action === "Call" && data.amount === 0) secondActions.set(pos, { action: "Call", amount: lastRaiseAmount });
  }

  const hasRaise = [...positionActions.values()].some(a => a.action === "Raise");

  // First orbit - positions before hero
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

  // Hero's action
  const heroAction = positionActions.get(hero);
  if (heroAction) {
    actions.push({ position: hero, action: heroAction.action, amount: heroAction.amount, isBoard: false });
  }

  // Positions after hero
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

  // Track raises for second orbit
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

  // Second orbit
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

  // Infer call amounts
  if (lastBetAmount > 0) {
    for (const [pos, data] of positionActions) {
      if (data.action === "Call" && data.amount === 0) positionActions.set(pos, { action: "Call", amount: lastBetAmount });
    }
    for (const [pos, data] of secondActions) {
      if (data.action === "Call" && data.amount === 0) secondActions.set(pos, { action: "Call", amount: lastBetAmount });
    }
  }

  const activePositions = POSTFLOP_ORDER.filter(p => !foldedPositions.has(p));

  // Find first aggressor
  let firstAggressorIndex: number | null = null;
  for (let i = 0; i < activePositions.length; i++) {
    const data = positionActions.get(activePositions[i]);
    if (data && (data.action === "Bet" || data.action === "Raise")) {
      firstAggressorIndex = i;
      break;
    }
  }

  // First orbit: checks until aggressor
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

  // Second orbit: responses to the bet
  if (firstAggressorIndex !== null) {
    const aggressor = activePositions[firstAggressorIndex];

    // Positions after aggressor
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

    // Positions before aggressor (checked, now respond)
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

export function buildActionQueue(action: Record<string, any>, hero: string): HandAction[] {
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
