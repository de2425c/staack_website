import { getReplayStyles } from './styles.js';
import { getReplayScript } from './replay-script.js';

interface TemplateParams {
  id: string;
  title: string;
  description: string;
  ogImageUrl: string;
  replayJson: string;
}

const getHeaderHtml = (): string => `
  <div class="header">
    <img src="https://stackpoker.gg/images/logo.png" alt="Stack" width="110" />
    <span class="header-subtitle">Hand Replay</span>
  </div>
`;

const getTableContainerHtml = (): string => `
  <div class="table-container" id="table">
    <div class="felt"></div>
    <div class="center-content">
      <div class="logo-center">
        <img src="https://stackpoker.gg/images/logo.png" alt="Stack" width="60" height="60" />
      </div>
      <div class="board-cards" id="boardCards"></div>
      <div class="pot" id="pot">
        <span class="pot-label">Pot</span>
        <span class="pot-amount">$0.00</span>
      </div>
    </div>
  </div>
`;

const getControlsHtml = (): string => `
  <div class="replay-overlay" id="replayOverlay">
    <div class="replay-backdrop"></div>
    <button class="replay-btn" id="replayBtn" type="button" aria-label="Replay hand">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
        <path d="M3 3v5h5"/>
      </svg>
      Replay
    </button>
  </div>
`;

const getWinOverlayHtml = (): string => `
  <div class="win-overlay" id="winOverlay">
    <div class="win-card">
      <div class="win-title" id="winTitle">You Win!</div>
      <div class="win-amount" id="winAmount">+$0.00</div>
      <div class="win-description" id="winDescription"></div>
    </div>
  </div>
`;

const getAppleIconSvg = (): string => `
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
  </svg>
`;

const getCtaOverlayHtml = (): string => `
  <div class="cta-overlay" id="ctaOverlay">
    <div class="cta-backdrop" onclick="closeCta()"></div>
    <div class="cta-card">
      <button class="cta-close" onclick="closeCta()" aria-label="Close">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </button>
      <div class="cta-handle"></div>
      <div class="cta-logo">
        <img src="https://stackpoker.gg/images/logo.png" alt="Stack" width="90" />
      </div>
      <div class="cta-title">Play poker hands like this on Stack</div>
      <div class="cta-sub">Practice against bots and improve your game with AI-powered analysis</div>
      <div class="cta-qr-container">
        <img
          src="https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=https://apps.apple.com/us/app/stack-poker-learn-train/id6745683972&bgcolor=1A1D24&color=FFFFFF"
          alt="Scan to download"
          class="cta-qr"
          width="120"
          height="120"
        />
        <span class="cta-qr-text">Scan to download</span>
      </div>
      <a
        class="cta-appstore"
        href="https://apps.apple.com/us/app/stack-poker-learn-train/id6745683972"
        target="_blank"
        rel="noopener noreferrer"
      >
        ${getAppleIconSvg()}
        Download on App Store
      </a>
      <a class="cta-link" href="https://stackpoker.gg">
        stackpoker.gg
      </a>
    </div>
  </div>
`;

export const buildHandReplayPage = (params: TemplateParams): string => {
  const { id, title, description, ogImageUrl, replayJson } = params;
  const styles = getReplayStyles();
  const script = getReplayScript();
  const canonicalUrl = `https://stackpoker.gg/hands/${id}`;

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
    <title>${escapeHtml(title)}</title>
    <meta name="description" content="${escapeHtml(description)}" />
    <meta property="og:title" content="${escapeHtml(title)}" />
    <meta property="og:description" content="${escapeHtml(description)}" />
    <meta property="og:image" content="${escapeHtml(ogImageUrl)}" />
    <meta property="og:url" content="${canonicalUrl}" />
    <meta property="og:type" content="website" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapeHtml(title)}" />
    <meta name="twitter:description" content="${escapeHtml(description)}" />
    <meta name="twitter:image" content="${escapeHtml(ogImageUrl)}" />
    <link rel="canonical" href="${canonicalUrl}" />
    <link rel="icon" href="https://stackpoker.gg/images/favicon.ico" />
    <style>${styles}</style>
  </head>
  <body>
    <div id="app">
      ${getHeaderHtml()}
      <div class="sharer-info" id="sharerInfo"></div>
      ${getTableContainerHtml()}
      ${getControlsHtml()}
      ${getWinOverlayHtml()}
      ${getCtaOverlayHtml()}
    </div>
    <script id="replayData" type="application/json">${replayJson}</script>
    <script>${script}</script>
  </body>
</html>`;
};

const escapeHtml = (str: string): string => {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
};
