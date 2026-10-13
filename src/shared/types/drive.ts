// GET /api/drive wire shape (spec §7): OSRM drive times from a custom base. Imported through src/shared/types.ts.
import type { ResortId } from './resort.ts';

export interface DriveLeg {
  min: number; // free-flow minutes
  mi: number;
  via?: 'bcc-mouth'; // Brighton and Solitude route through the BCC mouth
  warning?: string; // the route crosses Guardsman Pass (closed in winter)
}

export interface DriveResponse {
  origin: { lat: number; lon: number }; // rounded to 3 dp
  results: Partial<Record<ResortId, DriveLeg>>; // a resort whose route failed is absent
  computedAt: string; // ISO UTC
  partial?: true; // some resort failed: not cached
}
