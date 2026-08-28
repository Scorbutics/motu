// Mount point for AcceptBar. Short form — the boundary is read from the component (see repo-picker).
import { island } from './contracts.generated';
import { AcceptBar } from '@/components/review/accept-bar/AcceptBar';

export const element = island('x-accept-bar', AcceptBar);
