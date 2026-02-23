import React from 'react';

export const Controls: React.FC = () => {
  return (
    <div className="controls">
      <button
        className="control-btn"
        id="replayBtn"
        type="button"
        aria-label="Replay hand"
      >
        Replay
      </button>
    </div>
  );
};
