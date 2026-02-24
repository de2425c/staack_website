export const getTableStyles = (): string => `
.table-container {
  position: relative;
  width: 100%;
  flex: 1;
  min-height: 0;
  margin: 0;
  perspective: 1000px;
  perspective-origin: center 40%;
}

.felt {
  position: absolute;
  width: 100%;
  height: 100%;
  left: 0;
  top: 0;
  border-radius: 50%;
  background: linear-gradient(180deg, var(--rail-color) 0%, rgba(40,40,40,1) 100%);
  box-shadow: 0 20px 60px rgba(0,0,0,0.5), inset 0 2px 0 rgba(255,255,255,0.1);
  transform: rotateX(12deg);
  transform-origin: center bottom;
  overflow: hidden;
}

.felt::after {
  content: '';
  position: absolute;
  inset: 8px;
  border-radius: 50%;
  background: var(--felt-color);
}

.felt::before {
  content: '';
  position: absolute;
  inset: 8px;
  border-radius: 50%;
  background: radial-gradient(ellipse at center, rgba(255,255,255,0.03) 0%, transparent 70%);
  border: 1px solid rgba(255,255,255,0.06);
  z-index: 1;
}

.seat {
  position: absolute;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  transform: translate(-50%, -50%);
  transition: opacity 0.4s ease, transform 0.3s ease, filter 0.4s ease;
  z-index: 2;
}

.seat.folded {
  opacity: 0.3;
}

.seat.winner {
  filter: drop-shadow(0 0 15px #8CFF26);
  transform: translate(-50%, -50%) scale(1.05);
}

.seat-info {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 8px;
  background: rgb(28, 28, 28);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 10px;
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
}

.seat.winner .seat-info {
  border: 2px solid #8CFF26;
  box-shadow: 0 0 10px #8CFF26;
}

.seat-emoji {
  font-size: 14px;
}

.seat-details {
  display: flex;
  flex-direction: column;
  gap: 0;
}

.seat-name {
  font-size: 10px;
  color: rgba(255, 255, 255, 0.92);
  font-weight: 600;
  line-height: 1.2;
  max-width: 50px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.seat-position {
  font-size: 9px;
  color: rgba(255, 255, 255, 0.5);
  line-height: 1.2;
}

.seat-stack {
  font-size: 10px;
  color: rgba(255, 255, 255, 0.6);
  font-weight: 500;
  font-variant-numeric: tabular-nums;
  padding: 3px 6px;
  background: rgb(38, 38, 38);
  border-radius: 6px;
  transition: all 0.3s ease;
}

.seat-stack.stack-updated {
  color: #4ADE80;
  background: rgba(74, 222, 128, 0.15);
}

.seat-dealer {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: linear-gradient(135deg, #FFFFFF 0%, #E0E0E0 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 8px;
  font-weight: 800;
  color: #000;
  box-shadow: 0 1px 3px rgba(0,0,0,0.3);
}

.hero-seat .seat-info {
  padding: 6px 10px;
  border-radius: 12px;
}

.hero-seat .seat-emoji {
  font-size: 16px;
}

.hero-seat .seat-name {
  font-size: 11px;
}

.hero-seat .seat-stack {
  font-size: 11px;
  padding: 4px 8px;
}

.hero-seat .seat-dealer {
  width: 20px;
  height: 20px;
  font-size: 9px;
}

.you-badge {
  font-size: 8px;
  font-weight: 700;
  padding: 2px 4px;
  background: rgb(94, 200, 168);
  color: #000;
  border-radius: 4px;
  margin-left: 4px;
}

.action-indicator {
  font-size: 10px;
  font-weight: 700;
  padding: 3px 8px;
  background: rgb(38, 38, 38);
  color: rgba(255, 255, 255, 0.92);
  border-radius: 10px;
  opacity: 0;
  transform: translateY(5px);
  transition: opacity 0.2s, transform 0.2s;
  white-space: nowrap;
  margin-bottom: 4px;
}

.action-indicator.visible {
  opacity: 1;
  transform: translateY(0);
}

.seat-cards {
  display: flex;
  margin-bottom: 3px;
  position: relative;
}

.card-wrapper {
  position: relative;
}

.card-wrapper.first {
  transform: rotate(-8deg);
  z-index: 0;
}

.card-wrapper.second {
  transform: rotate(8deg);
  margin-left: -12px;
  z-index: 1;
}

.hero-cards .card-wrapper.second {
  margin-left: -16px;
}

.card {
  width: 32px;
  height: 45px;
  border-radius: 5px;
  background: rgb(46, 46, 46);
  border: 0.5px solid rgba(255,255,255,0.1);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: -2px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.3);
}

.card .rank {
  font-size: 16px;
  line-height: 1;
  font-weight: 700;
  color: #fff;
}

.card .suit {
  font-size: 12px;
  line-height: 1;
}

.card.hearts .suit { color: #FF5A5F; }
.card.diamonds .suit { color: #5AC8FA; }
.card.spades .suit { color: rgba(255,255,255,0.9); }
.card.clubs .suit { color: #4CD964; }

.card-back {
  width: 32px;
  height: 45px;
  border-radius: 5px;
  background: rgb(38, 38, 38);
  border: 0.5px solid rgba(255,255,255,0.1);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 4px rgba(0,0,0,0.3);
}

.card-back img {
  width: 26px;
  height: 26px;
  opacity: 0.6;
  object-fit: contain;
}

.hero-cards .card {
  width: 42px;
  height: 59px;
  border-radius: 6px;
  box-shadow: 0 3px 8px rgba(0,0,0,0.4);
}

.hero-cards .card .rank { font-size: 21px; }
.hero-cards .card .suit { font-size: 16px; }

.center-content {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  z-index: 3;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

.board-cards {
  display: flex;
  gap: 6px;
}

.board-card {
  width: 44px;
  height: 62px;
  border-radius: 7px;
  background: rgb(46, 46, 46);
  border: 0.5px solid rgba(255,255,255,0.1);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: -2px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.3);
  opacity: 0;
  transform: scale(0.8);
  transition: opacity 0.3s, transform 0.3s;
}

.board-card.visible {
  opacity: 1;
  transform: scale(1);
}

.board-card .rank {
  font-size: 22px;
  line-height: 1;
  font-weight: 700;
  color: #fff;
}

.board-card .suit {
  font-size: 17px;
  line-height: 1;
}

.board-card.hearts .suit { color: #FF5A5F; }
.board-card.diamonds .suit { color: #5AC8FA; }
.board-card.spades .suit { color: rgba(255,255,255,0.9); }
.board-card.clubs .suit { color: #4CD964; }

.board-placeholder {
  width: 42px;
  height: 59px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px dashed rgba(255, 255, 255, 0.1);
}

.pot {
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  padding: 6px 12px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  gap: 6px;
  white-space: nowrap;
  opacity: 0;
  transition: opacity 0.3s;
}

.pot.visible {
  opacity: 1;
}

.pot-label {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-secondary);
}

.pot-amount {
  font-size: 14px;
  font-weight: 700;
  color: var(--text-primary);
  font-variant-numeric: tabular-nums;
}

.bet-chip {
  position: absolute;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  opacity: 0;
  transition: all 0.3s cubic-bezier(0.34, 1.3, 0.64, 1);
  z-index: 10;
  transform: translate(-50%, -50%) scale(0.5);
}

.bet-chip.visible {
  opacity: 1;
  transform: translate(-50%, -50%) scale(1);
}

.chip-stacks {
  display: flex;
  gap: -4px;
}

.chip-column {
  position: relative;
  width: 18px;
  height: 18px;
}

.chip-item {
  position: absolute;
  left: 0;
}

.chip {
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 1px 3px rgba(0,0,0,0.5);
}

.chip-face {
  border-radius: 50%;
  position: absolute;
}

.chip-label {
  font-size: 10px;
  font-weight: 700;
  color: #fff;
  white-space: nowrap;
  background: rgba(0, 0, 0, 0.7);
  padding: 2px 6px;
  border-radius: 4px;
  font-variant-numeric: tabular-nums;
}

.logo-center {
  display: flex;
  align-items: center;
  gap: 8px;
}

.logo-center img {
  width: 90px;
  min-width: 60px;
  object-fit: contain;
  opacity: 0.6;
}

.logo-center span {
  font-size: 18px;
  font-weight: 700;
  color: var(--text-primary);
  opacity: 0.6;
}

@media (max-width: 380px) {
  .card { width: 26px; height: 36px; }
  .card .rank { font-size: 13px; }
  .card .suit { font-size: 10px; }
  .card-back { width: 26px; height: 36px; }
  .card-back img { width: 20px; height: 20px; }
  .board-card { width: 38px; height: 53px; }
  .board-card .rank { font-size: 19px; }
  .board-card .suit { font-size: 15px; }
  .hero-cards .card { width: 36px; height: 50px; }
  .hero-cards .card .rank { font-size: 18px; }
  .hero-cards .card .suit { font-size: 14px; }
}
`;
