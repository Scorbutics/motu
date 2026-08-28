// Mount point for StatusSummary. Short form — the boundary is read from the component (see repo-picker).
import { island } from './contracts.generated';
import { StatusSummary } from '@/components/review/status-summary/StatusSummary';

export const element = island('x-status-summary', StatusSummary);
