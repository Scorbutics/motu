// Mount point for RepoPicker.
//
// SHORT FORM: no `contract` here. The props, the callback-events and the host modules this reaches are
// read from the component into `islands/contracts.generated.ts` by `motu island sync`, so the boundary
// cannot drift from the component that defines it. What would stay hand-written is a DECISION — an
// event whose region name differs from the callback's — and this one has none: `onRepoSelected`
// already reads as `repo-selected`.
import { island } from './contracts.generated.js';
import { RepoPicker } from '../ui/repo-picker/RepoPicker.js';

export const element = island('x-repo-picker', RepoPicker);
