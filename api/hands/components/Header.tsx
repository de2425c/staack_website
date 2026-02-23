import React from "react";

export const Header: React.FC = () => {
  return (
    <div className="header">
      <img src="https://stackpoker.gg/images/logo.png" alt="Stack" width={110} />
      <span className="header-subtitle">Hand Replay</span>
    </div>
  );
};
