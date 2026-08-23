// Mount point for AcceptBar. Short form — the boundary is read from the component (see repo-picker).
import { island } from './contracts.generated.js';
import { AcceptBar } from '../ui/accept-bar/AcceptBar.js';

export const element = island('x-accept-bar', AcceptBar);
