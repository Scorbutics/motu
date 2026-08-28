// Mount point for DiffViewer. Short form — the boundary is read from the component (see repo-picker).
import { island } from './contracts.generated';
import { DiffViewer } from '@/components/review/diff-viewer/DiffViewer';

export const element = island('x-diff-viewer', DiffViewer);
