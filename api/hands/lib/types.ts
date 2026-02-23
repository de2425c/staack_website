export interface BotHandLog {
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

export interface SharedHand {
  share_id: string;
  hand_id: string;
  user_id: string;
  sharer_name: string;
  view_count: number;
}

export interface WebReplayData {
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
