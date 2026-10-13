// Tracker helpers for smoke.spec.ts: direct POST /api/tracker calls (same headers as the app) and one throwaway
// person per test. Every Playwright project runs in parallel against the same local D1, so each test works on its
// own "E2E <project> <rand>" person, under its own CF-Connecting-IP (its own rate-limit counters), and removes the
// person afterwards. People of an aborted earlier run of the same project are removed first (max 12 active).
import type { APIRequestContext, Page } from '@playwright/test';

export interface Who {
  id: string;
  name: string;
}

interface Row {
  id: string;
  name: string;
  updatedAt: number;
}

export interface Api {
  post: (op: Record<string, unknown>) => Promise<{ status: number; body: Record<string, unknown> }>;
  people: () => Promise<Row[]>;
  ip: string;
}

const rand = (): string => Math.random().toString(16).slice(2, 8);

export function trackerApi(request: APIRequestContext, baseURL: string): Api {
  const ip = `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;
  const headers = {
    'Content-Type': 'application/json',
    'X-Requested-With': 'utahsnow',
    Origin: baseURL,
    'CF-Connecting-IP': ip,
  };
  return {
    ip,
    post: async (op) => {
      const res = await request.post('/api/tracker', {
        headers,
        data: { clientId: '0e2e0e2e0e2e0e2e', ...op },
      });
      return { status: res.status(), body: (await res.json()) as Record<string, unknown> };
    },
    people: async () => ((await (await request.get('/api/tracker')).json()) as { people: Row[] }).people,
  };
}

/** The browser's tracker writes count against the test's own IP too. */
export async function useIp(page: Page, api: Api): Promise<void> {
  await page.setExtraHTTPHeaders({ 'CF-Connecting-IP': api.ip });
}

/** A fresh person for this test (stale ones of the same project removed first). */
export async function freshPerson(api: Api, project: string): Promise<Who> {
  const prefix = `E2E ${project} `;
  for (const p of await api.people()) {
    if (p.name.startsWith(prefix)) await api.post({ op: 'removePerson', personId: p.id, prevUpdatedAt: p.updatedAt });
  }
  const name = `${prefix}${rand()}`;
  const res = await api.post({ op: 'addPerson', name, mode: 'ski' });
  const state = res.body.state as { people: Row[] } | undefined;
  const row = state?.people.find((p) => p.name === name);
  if (!row) throw new Error(`addPerson failed: ${res.status} ${JSON.stringify(res.body)}`);
  return { id: row.id, name };
}

export async function removePerson(api: Api, who: Who): Promise<void> {
  const row = (await api.people()).find((p) => p.id === who.id);
  if (row) await api.post({ op: 'removePerson', personId: row.id, prevUpdatedAt: row.updatedAt });
}

/** Upserts a planned day on `date` (no prior row). */
export const planDay = (api: Api, who: Who, date: string, resortId: string) =>
  api.post({ op: 'upsertDay', personId: who.id, date, resortId, status: 'planned', prevUpdatedAt: null });

/** The grid cell of `who` on `date` (trip date 'YYYY-MM-DD'). */
export const cell = (page: Page, who: Who, date: string) =>
  page.locator(`tr[data-date="${date}"] [data-testid="tracker-cell"][aria-label^="${who.name},"]`);
