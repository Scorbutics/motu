import React from 'react';
import { Composition } from 'remotion';
import { Hero, totalFrames } from './Hero';
import { FPS } from './cut';

export const Root: React.FC = () => (
  <Composition id="Hero" component={Hero} durationInFrames={Math.max(1, totalFrames())} fps={FPS} width={1920} height={1080} />
);
