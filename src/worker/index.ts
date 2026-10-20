// Worker entry: /api/* -> router; any other request that reaches the Worker (an asset miss, e.g. a chunk
// deleted by a redeploy) -> 404 text/plain no-store so the client's chunk-load handler reloads.
// scheduled (*/5) -> the Scheduler DO runs the tick (scheduler.ts: 30 s of CPU there, 10 ms here) and keeps its
// alarm chain armed.
import { plainNotFound } from './http.ts';
import { route } from './router.ts';
import { tickViaScheduler } from './scheduler.ts';

export { Scheduler } from './scheduler.ts';

const handler = {
  fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> | Response {
    const { pathname } = new URL(req.url);
    if (pathname === '/api' || pathname.startsWith('/api/')) return route(req, env, ctx);
    return plainNotFound();
  },
  async scheduled(controller: ScheduledController, env: Env): Promise<void> {
    await tickViaScheduler(env, controller.scheduledTime);
  },
} satisfies ExportedHandler<Env>;

export default handler;
