// Mount point for ShotList. Short form — see repo-picker.island.ts.
import { island } from './contracts.generated.js';
import { ShotList } from '../ui/shot-list/ShotList.js';

export const element = island('x-shot-list', ShotList);
