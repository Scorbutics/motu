import type { MemberCriteria } from '../../shared/member-types.js';
import type { MotuFit } from '@motu/core';

export interface MemberActionsProps {
  /** Injected footprint. In 'legacy' fit the cluster becomes a titled "Member" panel. */
  fit?: MotuFit;
  onNew?: () => void;
}

/**
 * The action cluster. It emits one host intent — New — which the archipelago maps onto the
 * host's existing routes/handlers via the HostBridge. A compact toolbar cluster in the native
 * footprint; in legacy fit it reshapes into the host's titled "Member" rail panel.
 */
export function MemberActions({
  fit = 'native',
  onNew: fireNew,
}: MemberActionsProps) {
  const onNew = () => fireNew?.();

  // Legacy fit: match the host's "Member" rail — a titled panel with a short intro and the actions
  // as a stacked button grid — instead of a compact inline toolbar. Same intents, same handlers.
  if (fit === 'legacy') {
    return (
      <div className="gm-panel gm-actionrail">
        <div className="gm-panel__head">
          <h2>Member</h2>
        </div>
        <div className="gm-panel__body">
          <p className="gm-actionrail__hint">To add a new member, click below:</p>
          <div className="gm-actionrail__grid">
            <button type="button" className="gm-btn gm-btn--primary" onClick={onNew}>
              New
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="gm-actions">
      <button type="button" className="cl-btn cl-btn--red cl-lg cl-newbtn" onClick={onNew}>
        <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round">
          <path d="M12 4v16M4 12h16" />
        </svg>
        New member
      </button>
      {/* NO PASTE. It navigated to a paste screen this app never had, and landed on "No such
          member" — a control that only ever led to an error is worse than no control. */}
    </div>
  );
}
