// Mount point for DiffViewer. Short form — the boundary is read from the component (see repo-picker).
import { island } from './contracts.generated.js';
import { DiffViewer } from '../ui/diff-viewer/DiffViewer.js';

export const element = island('x-diff-viewer', DiffViewer);
