import rawConfig from '../config/passes.json';
import { parsePassConfig, type Pass } from './data/passConfig.ts';

/** All passes, in swipe order. The first one is the home screen. */
export const PASSES: readonly Pass[] = parsePassConfig(rawConfig);
