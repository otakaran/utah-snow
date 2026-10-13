// /api path table (spec §7). Unknown path -> 404, wrong method -> 405 (both no-store); a thrown handler -> 500.
// Security headers and X-Build are applied to every response here, after the handler (and its cache lookup).
import { health } from './api/health.ts';
import { probe } from './api/probe.ts';
import { snapshot } from './api/snapshot.ts';
import { apiError, methodNotAllowed, notFound, withApiHeaders } from './http.ts';
import { errorText, logLine } from './lib/log.ts';

export type Handler = (req: Request, env: Env, ctx: ExecutionContext, url: URL) => Response | Promise<Response>;

const ROUTES: Record<string, Partial<Record<'GET' | 'POST', Handler>>> = {
  '/api/health': { GET: health },
  '/api/snapshot': { GET: snapshot },
  '/api/debug/probe': { GET: probe },
};

async function dispatch(req: Request, env: Env, ctx: ExecutionContext, url: URL): Promise<Response> {
  const route = ROUTES[url.pathname];
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
