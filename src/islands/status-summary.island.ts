// Mount point for StatusSummary. Short form — the boundary is read from the component (see repo-picker).
import { island } from './contracts.generated.js';
import { StatusSummary } from '../ui/status-summary/StatusSummary.js';

export const element = island('x-status-summary', StatusSummary);
