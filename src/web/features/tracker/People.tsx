// Crew management (spec §9.5): add, rename, ski/board, remove. A person with mode 'unknown' shows a "?" chip
// reading "Confirm ski/board". Removing is a two-tap action and keeps the person's days (undo in Recent changes).
import { useState } from 'preact/hooks';
import type { SkiMode } from '../../../shared/types.ts';
import { mutate, type PersonRow, people } from '../../data/tracker.ts';
import { StatusChip } from '../../ui/StatusChip.tsx';
import { Toggle } from '../../ui/Toggle.tsx';

const MAX_PEOPLE = 12;
const MAX_NAME = 40;
const MODES = [
  { value: 'ski', label: 'Ski' },
  { value: 'board', label: 'Board' },
  { value: 'unknown', label: 'Not sure' },
] as const;

/** A trimmed 1-40 char name not used by anyone else (case-insensitive), or the reason it is not. */
export function nameProblem(name: string, list: readonly { id: string; name: string }[], selfId?: string) {
  const n = name.trim();
  if (n.length === 0) return 'Enter a name';
  if (n.length > MAX_NAME) return `At most ${MAX_NAME} characters`;
  const lower = n.toLowerCase();
  return list.some((p) => p.id !== selfId && p.name.toLowerCase() === lower) ? 'Someone already has that name' : null;
}

function PersonItem({ p, list }: { p: PersonRow; list: readonly PersonRow[] }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(p.name);
  const [arming, setArming] = useState(false);
  const problem = editing ? nameProblem(name, list, p.id) : null;
  const save = (e: Event) => {
    e.preventDefault();
    if (problem) return;
    if (name.trim() !== p.name) void mutate({ op: 'updatePerson', personId: p.id, name: name.trim() });
    setEditing(false);
  };
  return (
    <li class="trk-person-item" data-testid="tracker-person">
      <div class="trk-person-top">
        {editing ? (
          <form class="trk-inline-form" onSubmit={save}>
            <label class="field">
              <span class="sr-only">New name for {p.name}</span>
              <input value={name} maxLength={MAX_NAME} onInput={(e) => setName(e.currentTarget.value)} />
            </label>
            <button type="submit" class="btn btn-primary" disabled={problem !== null}>
              Save
            </button>
            <button
              type="button"
              class="btn"
              onClick={() => {
                setEditing(false);
                setName(p.name);
              }}
            >
              Cancel
            </button>
          </form>
        ) : (
          <>
            <span class="trk-person-label">{p.name}</span>
            {p.mode === 'unknown' ? <StatusChip tone="warn" word="? Confirm ski/board" /> : null}
            <button
              type="button"
              class="link-btn"
              onClick={() => {
                setEditing(true);
                setName(p.name);
              }}
            >
              Rename
            </button>
          </>
        )}
      </div>
      {problem ? <p class="field-note trk-problem">{problem}</p> : null}
      <div class="trk-person-controls">
        <Toggle
          label={`${p.name} rides`}
          name={`trk-mode-${p.id}`}
          value={p.mode}
          options={MODES}
          onChange={(mode: SkiMode) => void mutate({ op: 'updatePerson', personId: p.id, mode })}
        />
        <button
          type="button"
          class={`btn${arming ? ' trk-danger' : ''}`}
          onClick={() => {
            setArming(!arming);
            if (arming) void mutate({ op: 'removePerson', personId: p.id });
          }}
          onBlur={() => setArming(false)}
        >
          {arming ? `Tap again to remove ${p.name}` : 'Remove'}
        </button>
      </div>
    </li>
  );
}

function AddPerson({ list }: { list: readonly PersonRow[] }) {
  const [name, setName] = useState('');
  const [mode, setMode] = useState<SkiMode>('unknown');
  const [busy, setBusy] = useState(false);
  const full = list.length >= MAX_PEOPLE;
  const problem = name ? nameProblem(name, list) : null;
  const submit = async (e: Event) => {
    e.preventDefault();
    if (full || busy || nameProblem(name, list)) return;
    setBusy(true);
    const ok = await mutate({ op: 'addPerson', name: name.trim(), mode });
    setBusy(false);
    if (ok) {
      setName('');
      setMode('unknown');
    }
  };
  return (
    <form class="trk-add" onSubmit={submit} data-testid="tracker-add-person">
      <label class="field">
        <span class="field-label">Add a person</span>
        <input
          value={name}
          maxLength={MAX_NAME}
          placeholder="Name"
          autoComplete="off"
          disabled={full}
          onInput={(e) => setName(e.currentTarget.value)}
        />
      </label>
      <Toggle label="Rides" name="trk-add-mode" value={mode} options={MODES} onChange={setMode} />
      <button type="submit" class="btn btn-primary" disabled={full || busy || !name.trim() || problem !== null}>
        {busy ? 'Adding…' : 'Add'}
      </button>
      {problem ? <p class="field-note trk-problem">{problem}</p> : null}
      {full ? <p class="field-note">The crew is full ({MAX_PEOPLE} people).</p> : null}
    </form>
  );
}

export function People() {
  const list = people.value;
  return (
    <div class="stack trk-people">
      {list.length > 0 ? (
        <ul class="trk-person-list">
          {list.map((p) => (
            <PersonItem key={p.id} p={p} list={list} />
          ))}
        </ul>
      ) : null}
      <AddPerson list={list} />
      <p class="field-note">Alta and Deer Valley are skiers-only, so boarders cannot be booked there.</p>
    </div>
  );
}
