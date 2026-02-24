import type { VercelRequest, VercelResponse } from "@vercel/node";
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import type { BotHandLog, SharedHand, WebReplayData } from "./lib/types.js";
import { buildHandReplayPage } from "./lib/template.js";

const getDb = () => {
  if (getApps().length === 0) {
    initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
      }),
    });
  }
  return getFirestore();
};

const escapeHtml = (s: string): string => {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
};

const transformHandForWeb = (hand: BotHandLog, shared: SharedHand): WebReplayData => {
  const heroSeatRecord = hand.seats.find((s) => s.user_id === shared.user_id);
  const heroSeat = heroSeatRecord?.seat_index ?? 0;

  const positiveSum = Object.values(hand.stack_deltas)
    .filter((d) => d > 0)
    .reduce((a, b) => a + b, 0);

  const negativeSum = Math.abs(
    Object.values(hand.stack_deltas)
      .filter((d) => d < 0)
      .reduce((a, b) => a + b, 0),
  );

  const potSize = positiveSum > 0 ? positiveSum : negativeSum;
  const heroDelta = hand.stack_deltas[String(heroSeat)] ?? 0;

  const seats = hand.seats.map((s) => ({
    seatIndex: s.seat_index,
    displayName: s.display_name,
    isHero: s.user_id === shared.user_id,
    startingStack: s.starting_stack,
    holeCards: hand.hole_cards[String(s.seat_index)] ?? null,
  }));

  const actions = hand.actions.map((a) => ({
    seat: a.seat,
    action: a.action,
    amount: a.amount ?? 0,
    street: a.street,
    isAllIn: a.is_all_in,
  }));

  const winners = hand.winners.map((w) => ({
    seat: w.seat,
    amountWon: w.amount_won,
    handDescription: w.hand_description ?? null,
    shownCards: w.shown_cards ?? hand.hole_cards[String(w.seat)] ?? null,
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
};

const formatCents = (cents: number): string => {
  const dollars = Math.abs(cents) / 100;
  const sign = cents >= 0 ? "+" : "-";
  return `${sign}$${dollars.toFixed(2)}`;
};

const getHandDescription = (data: WebReplayData): string => {
  const winner = data.winners.find((w) => w.seat === data.heroSeat);

  if (winner && data.heroDelta > 0) {
    const handDesc = winner.handDescription ? ` with ${winner.handDescription}` : "";
    return `Won ${formatCents(data.heroDelta)}${handDesc}`;
  }

  if (data.heroDelta > 0) {
    return `Won ${formatCents(data.heroDelta)}`;
  }

  if (data.heroDelta < 0) {
    return `Lost ${formatCents(data.heroDelta)}`;
  }

  return "Watch the hand replay";
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { id } = req.query;

  if (!id || typeof id !== "string") {
    return res.status(400).send("Missing share ID");
  }

  try {
    const db = getDb();

    const sharedDoc = await db.collection("shared_hands").doc(id).get();
    if (!sharedDoc.exists) {
      return res.status(404).send("Hand not found");
    }

    const shared = sharedDoc.data() as SharedHand;

    const handDoc = await db.collection("hands").doc(shared.hand_id).get();
    if (!handDoc.exists) {
      return res.status(404).send("Hand data not found");
    }

    const hand = handDoc.data() as BotHandLog;

    db.collection("shared_hands")
      .doc(id)
      .update({
        view_count: FieldValue.increment(1),
      })
      .catch(() => {});

    const replayData = transformHandForWeb(hand, shared);
    const replayJson = JSON.stringify(replayData);

    const title = `Hand shared by @${escapeHtml(shared.sharer_name)} on Stack`;
    const description = escapeHtml(getHandDescription(replayData));
    const ogImageUrl = "https://stackpoker.gg/images/og-hand-share.png";

    const html = buildHandReplayPage({
      id,
      title,
      description,
      ogImageUrl,
      replayJson,
    });

    res.setHeader("Content-Type", "text/html");
    res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate");
    return res.status(200).send(html);
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "unknown";
    console.error("Error fetching hand:", errorMessage);
    return res.status(500).send(`Internal server error: ${errorMessage}`);
  }
}
