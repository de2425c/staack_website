import React from 'react';

export const TableContainer: React.FC = () => {
  return (
    <div className="table-container" id="table">
      <div className="felt" />
      <div className="center-content">
        <div className="logo-center">
          <img
            src="https://stackpoker.gg/images/logo.png"
            alt="Stack"
            width={60}
            height={60}
          />
        </div>
        <div className="board-cards" id="boardCards" />
        <div className="pot" id="pot">
          <span className="pot-label">Pot</span>
          <span className="pot-amount">$0.00</span>
        </div>
      </div>
    </div>
  );
};
