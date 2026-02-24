export const getOverlayStyles = (): string => `
.replay-overlay {
  position: fixed;
  inset: 0;
  display: none;
  align-items: center;
  justify-content: center;
  z-index: 100;
}

.replay-overlay.visible {
  display: flex;
}

.replay-backdrop {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
}

.replay-btn {
  position: relative;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 14px 28px;
  background: rgba(255, 255, 255, 0.15);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 14px;
  color: #fff;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
  -webkit-tap-highlight-color: transparent;
}

.replay-btn:hover {
  background: rgba(255, 255, 255, 0.2);
  transform: scale(1.02);
}

.replay-btn:active {
  transform: scale(0.98);
  background: rgba(255, 255, 255, 0.25);
}

.replay-btn svg {
  width: 20px;
  height: 20px;
}

.win-overlay {
  position: fixed;
  top: 35%;
  left: 50%;
  transform: translate(-50%, -50%) scale(0.9);
  background: var(--surface);
  border: 1px solid var(--border-subtle);
  border-radius: 20px;
  padding: 24px 32px;
  text-align: center;
  opacity: 0;
  pointer-events: none;
  transition: all 0.4s cubic-bezier(0.34, 1.3, 0.64, 1);
  z-index: 50;
}

.win-overlay.visible {
  opacity: 1;
  transform: translate(-50%, -50%) scale(1);
  pointer-events: none;
}

.win-title {
  font-size: 18px;
  font-weight: 600;
  color: var(--text-secondary);
  margin-bottom: 8px;
}

.win-amount {
  font-size: 36px;
  font-weight: 800;
  color: var(--positive);
  font-variant-numeric: tabular-nums;
  letter-spacing: -1px;
}

.win-amount.loss {
  color: var(--negative);
}

.win-description {
  font-size: 14px;
  color: var(--text-muted);
  margin-top: 8px;
}

.cta-overlay {
  position: fixed;
  inset: 0;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  align-items: center;
  z-index: 200;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.3s;
}

.cta-overlay.visible {
  opacity: 1;
  pointer-events: auto;
}

.cta-backdrop {
  position: absolute;
  inset: 0;
  background: rgba(0,0,0,0.7);
}

.cta-card {
  position: relative;
  background: var(--surface);
  border-radius: 24px 24px 0 0;
  padding: 28px 24px max(40px, env(safe-area-inset-bottom));
  max-width: 480px;
  width: 100%;
  text-align: center;
  transform: translateY(100%);
  transition: transform 0.5s cubic-bezier(0.34, 1.3, 0.64, 1);
}

.cta-overlay.visible .cta-card {
  transform: translateY(0);
}

.cta-close {
  position: absolute;
  top: 16px;
  right: 16px;
  width: 32px;
  height: 32px;
  border: none;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 50%;
  color: var(--text-secondary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s, color 0.15s;
}

.cta-close:hover {
  background: rgba(255, 255, 255, 0.15);
  color: var(--text-primary);
}

.cta-close:active {
  background: rgba(255, 255, 255, 0.2);
}

.cta-handle {
  width: 36px;
  height: 5px;
  border-radius: 3px;
  background: rgba(255,255,255,0.15);
  margin: 0 auto 20px;
}

.cta-title {
  font-size: 22px;
  font-weight: 700;
  margin-bottom: 8px;
  line-height: 1.3;
  letter-spacing: -0.4px;
}

.cta-sub {
  font-size: 14px;
  color: var(--text-muted);
  margin-bottom: 24px;
  line-height: 1.5;
}

.cta-appstore {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 16px 40px;
  background: #fff;
  color: #000;
  border-radius: 14px;
  font-size: 17px;
  font-weight: 600;
  text-decoration: none;
  transition: transform 0.15s ease;
  letter-spacing: -0.2px;
}

.cta-appstore:active {
  transform: scale(0.97);
}

.cta-appstore svg {
  width: 22px;
  height: 22px;
}

.cta-link {
  display: block;
  margin-top: 18px;
  font-size: 14px;
  color: var(--text-muted);
  text-decoration: none;
}

.cta-logo {
  display: none;
}

.cta-qr-container {
  display: none;
}

@media (min-width: 768px) {
  .cta-overlay {
    justify-content: center;
    align-items: center;
  }

  .cta-backdrop {
    background: rgba(0, 0, 0, 0.75);
    backdrop-filter: blur(4px);
    -webkit-backdrop-filter: blur(4px);
  }

  .cta-card {
    position: relative;
    border-radius: 24px;
    max-width: 520px;
    padding: 40px 48px;
    transform: translateY(30px) scale(0.95);
    opacity: 0;
    box-shadow: 0 25px 80px rgba(0, 0, 0, 0.5);
  }

  .cta-overlay.visible .cta-card {
    transform: translateY(0) scale(1);
    opacity: 1;
  }

  .cta-handle {
    display: none;
  }

  .cta-title {
    font-size: 28px;
    margin-bottom: 12px;
  }

  .cta-sub {
    font-size: 16px;
    margin-bottom: 32px;
    max-width: 380px;
    margin-left: auto;
    margin-right: auto;
  }

  .cta-appstore {
    padding: 18px 48px;
    font-size: 18px;
    border-radius: 16px;
  }

  .cta-appstore:hover {
    transform: scale(1.02);
    box-shadow: 0 4px 20px rgba(255, 255, 255, 0.2);
  }

  .cta-link {
    margin-top: 24px;
    font-size: 15px;
  }

  .cta-link:hover {
    color: var(--text-secondary);
  }

  .cta-logo {
    display: block;
    margin-bottom: 20px;
  }

  .cta-logo img {
    width: 90px;
    min-width: 90px;
    object-fit: contain;
    opacity: 0.9;
  }

  .cta-qr-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    margin-bottom: 24px;
  }

  .cta-qr {
    border-radius: 12px;
    border: 1px solid rgba(255, 255, 255, 0.1);
  }

  .cta-qr-text {
    font-size: 13px;
    color: var(--text-muted);
  }
}
`;
