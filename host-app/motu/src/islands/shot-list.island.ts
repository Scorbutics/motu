// Mount point for ShotList. Short form — see repo-picker.island.ts.
import { island } from './contracts.generated';
import { ShotList } from '@/components/review/shot-list/ShotList';

export const element = island('x-shot-list', ShotList);
