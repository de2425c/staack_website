import { getTableStyles } from './styles-table';
import { getOverlayStyles } from './styles-overlay';

const getBaseStyles = (): string => `
:root {
  --background: #0F1114;
  --surface: #1A1D24;
  --surface-raised: #252A33;
  --text-primary: #F0F2F5;
  --text-secondary: #9BA3B0;
  --text-muted: #5C6370;
  --positive: #4ADE80;
  --negative: #EF4444;
  --warning: #F59E0B;
  --felt-color: #1A1D24;
  --rail-color: #252A33;
  --border-subtle: rgba(255, 255, 255, 0.08);
}

* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
  -webkit-tap-highlight-color: transparent;
}

html {
  -webkit-text-size-adjust: 100%;
}

body {
  background: var(--background);
  color: var(--text-primary);
  font-family: -apple-system, 'SF Pro Display', 'SF Pro Text', BlinkMacSystemFont, system-ui, sans-serif;
  min-height: 100vh;
  min-height: -webkit-fill-available;
  overflow-x: hidden;
  -webkit-font-smoothing: antialiased;
}

#app {
  max-width: 100%;
  margin: 0 auto;
  padding: max(16px, env(safe-area-inset-top)) 16px 140px;
  position: relative;
  min-height: 100vh;
}

.header {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 16px 0 20px;
}

.header img {
  width: 90px;
  object-fit: contain;
}

.header-subtitle {
  font-size: 13px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.5);
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.sharer-info {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.7);
  margin: 0 auto 16px;
  padding: 6px 14px;
  background: rgba(255, 255, 255, 0.06);
  border-radius: 20px;
  font-weight: 500;
  width: fit-content;
}

.sharer-info::before {
  content: '📤';
  font-size: 12px;
}
`;

export const getReplayStyles = (): string => {
  return getBaseStyles() + getTableStyles() + getOverlayStyles();
};
