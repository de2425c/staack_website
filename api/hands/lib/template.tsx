import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { getReplayStyles } from './styles';
import { getReplayScript } from './replay-script';
import { ReplayPage } from '../components';

interface TemplateParams {
  id: string;
  title: string;
  description: string;
  ogImageUrl: string;
  replayJson: string;
}

export const buildHandReplayPage = (params: TemplateParams): string => {
  const { id, title, description, ogImageUrl, replayJson } = params;
  const styles = getReplayStyles();
  const script = getReplayScript();

  const html = renderToStaticMarkup(
    <ReplayPage
      id={id}
      title={title}
      description={description}
      ogImageUrl={ogImageUrl}
      replayJson={replayJson}
      styles={styles}
      script={script}
    />
  );

  return `<!DOCTYPE html>${html}`;
};
