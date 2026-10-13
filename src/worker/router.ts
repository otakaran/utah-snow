// /api path table (spec §7): exact paths, then patterns (the stake routes carry ids in the path; the handler parses
// them). Unknown path -> 404, wrong method -> 405 (both no-store); a thrown handler -> 500.
// Security headers and X-Build are applied to every response here, after the handler (and its cache lookup).
import { cams } from './api/cams.ts';
import { health } from './api/health.ts';
import { probe } from './api/probe.ts';
import { snapshot } from './api/snapshot.ts';
import { STAKE_PATH, stake } from './api/stake.ts';
import { apiError, methodNotAllowed, notFound, withApiHeaders } from './http.ts';
import { errorText, logLine } from './lib/log.ts';

export type Handler = (req: Request, env: Env, ctx: ExecutionContext, url: URL) => Response | Promise<Response>;

type Route = Partial<Record<'GET' | 'POST', Handler>>;

const ROUTES: Record<string, Route> = {
  '/api/health': { GET: health },
  '/api/snapshot': { GET: snapshot },
  '/api/cams': { GET: cams },
  '/api/debug/probe': { GET: probe },
};
const PATTERNS: readonly [RegExp, Route][] = [[STAKE_PATH, { GET: stake }]];

const routeOf = (path: string): Route | undefined => ROUTES[path] ?? PATTERNS.find(([re]) => re.test(path))?.[1];

async function dispatch(req: Request, env: Env, ctx: ExecutionContext, url: URL): Promise<Response> {
  const route = routeOf(url.pathname);
  if (!route) return notFound();
  const method = req.method === 'HEAD' ? 'GET' : req.method;
  const handler = route[method as 'GET' | 'POST'];
  if (!handler) return methodNotAllowed(Object.keys(route));
  try {
    return await handler(req, env, ctx, url);
  } catch (err) {
    logLine({ route: url.pathname, ok: false, err: errorText(err) });
    return apiError(500, 'internal');
  }
}

export async function route(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const url = new URL(req.url);
  return withApiHeaders(await dispatch(req, env, ctx, url));
}
