// Recent changes (spec §9.3-9.4): the last 50 audit rows, newest first, each with Undo and the person's crew mark.
// Shows no IP or device data. The server refuses an undo that is already undone or was changed since (page notice).
import { useMemo, useState } from 'preact/hooks';
import { formatClockRel } from '../../../shared/time.ts';
import { serverNow } from '../../data/snapshot.ts';
import { audit, people, undoChange } from '../../data/tracker.ts';
import { StatusChip } from '../../ui/StatusChip.tsx';
import { auditPerson, describeAudit } from './audit-model.ts';
import { CrewMark } from './CrewMark.tsx';
import { crewClasses } from './crew-color.ts';

export function AuditLog() {
  const rows = audit.value;
  const now = serverNow.value;
  const list = people.value;
  const names = new Map(list.map((p) => [p.id, p.name]));
  const nameOf = (id: string) => names.get(id) ?? 'someone';
  const crewOf = useMemo(() => crewClasses(list), [list]);
  const [busy, setBusy] = useState<number | null>(null);
  if (rows.length === 0) return <p class="field-note">No changes yet.</p>;
  const undo = async (id: number) => {
    setBusy(id);
    await undoChange(id);
    setBusy(null);
  };
  return (
    <ol class="trk-list trk-audit" data-testid="tracker-audit-list">
      {rows.map((e) => {
        const canUndo = e.action !== 'undo' && e.undoneBy === null;
        return (
          <li key={e.id} class="trk-list-item" data-audit={e.id}>
            <span class="trk-list-main">
              <CrewMark crew={crewOf.get(auditPerson(e) ?? '')} />
              {describeAudit(e, nameOf)}
            </span>
            <span class="trk-list-note">{formatClockRel(e.at, now) || '—'}</span>
            <span class="trk-list-actions">
              {e.undoneBy !== null ? <StatusChip tone="off" word="Undone" /> : null}
              {canUndo ? (
                <button type="button" class="btn" disabled={busy !== null} onClick={() => void undo(e.id)}>
                  {busy === e.id ? 'Undoing…' : 'Undo'}
                </button>
              ) : null}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
