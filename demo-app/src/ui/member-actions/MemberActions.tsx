import type { MemberCriteria } from '../../shared/member-types.js';
import type { MotuFit } from '@motu/core';

export interface MemberActionsProps {
  /** Injected footprint. In 'legacy' fit the cluster becomes a titled "Member" panel. */
  fit?: MotuFit;
  onNew?: () => void;
  onPaste?: () => void;
}

/**
 * The action cluster. It emits host intents only — New/Paste — which the archipelago maps onto the
 * host's existing routes/handlers via the HostBridge. A compact toolbar cluster in the native
 * footprint; in legacy fit it reshapes into the host's titled "Member" rail panel.
 */
export function MemberActions({
  fit = 'native',
  onNew: fireNew,
  onPaste: firePaste,
}: MemberActionsProps) {
  const onNew = () => fireNew?.();
  const onPaste = () => firePaste?.();

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
            <button type="button" className="gm-btn" onClick={onPaste}>
              Paste
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="gm-actions">
      <button type="button" className="gm-btn gm-btn--primary" onClick={onNew}>
        + New member
      </button>
      <button type="button" className="gm-btn" onClick={onPaste}>
        Paste
      </button>
    </div>
  );
}
