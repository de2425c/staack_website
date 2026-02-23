import React from 'react';

export const WinOverlay: React.FC = () => {
  return (
    <div className="win-overlay" id="winOverlay">
      <div className="win-card">
        <div className="win-title" id="winTitle">You Win!</div>
        <div className="win-amount" id="winAmount">+$0.00</div>
        <div className="win-description" id="winDescription" />
      </div>
    </div>
  );
};
