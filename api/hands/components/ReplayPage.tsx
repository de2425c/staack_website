import React from 'react';
import { Header } from './Header.js';
import { TableContainer } from './TableContainer.js';
import { Controls } from './Controls.js';
import { WinOverlay } from './WinOverlay.js';
import { CtaOverlay } from './CtaOverlay.js';

interface ReplayPageProps {
  id: string;
  title: string;
  description: string;
  ogImageUrl: string;
  replayJson: string;
  styles: string;
  script: string;
}

export const ReplayPage: React.FC<ReplayPageProps> = ({
  id,
  title,
  description,
  ogImageUrl,
  replayJson,
  styles,
  script,
}) => {
  const canonicalUrl = `https://stackpoker.gg/hands/${id}`;

  return (
    <html lang="en">
      <head>
        <meta charSet="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
        <title>{title}</title>
        <meta name="description" content={description} />
        <meta property="og:title" content={title} />
        <meta property="og:description" content={description} />
        <meta property="og:image" content={ogImageUrl} />
        <meta property="og:url" content={canonicalUrl} />
        <meta property="og:type" content="website" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={title} />
        <meta name="twitter:description" content={description} />
        <meta name="twitter:image" content={ogImageUrl} />
        <link rel="canonical" href={canonicalUrl} />
        <link rel="icon" href="https://stackpoker.gg/images/favicon.ico" />
        <style dangerouslySetInnerHTML={{ __html: styles }} />
      </head>
      <body>
        <div id="app">
          <Header />
          <div className="sharer-info" id="sharerInfo" />
          <TableContainer />
          <Controls />
          <WinOverlay />
          <CtaOverlay />
        </div>
        <script
          id="replayData"
          type="application/json"
          dangerouslySetInnerHTML={{ __html: replayJson }}
        />
        <script dangerouslySetInnerHTML={{ __html: script }} />
      </body>
    </html>
  );
};
