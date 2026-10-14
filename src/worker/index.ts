// Worker entry: /api/* -> router; any other request that reaches the Worker (an asset miss, e.g. a chunk
// deleted by a redeploy) -> 404 text/plain no-store so the client's chunk-load handler reloads.
// scheduled (*/5) -> cron dispatcher, then keeps the Scheduler DO alarm chain armed (scheduler.ts).
import { runTick } from './cron/dispatcher.ts';
import { plainNotFound } from './http.ts';
import { route } from './router.ts';
import { ensureScheduler } from './scheduler.ts';

export { Scheduler } from './scheduler.ts';

const handler = {
  fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> | Response {
    const { pathname } = new URL(req.url);
    if (pathname === '/api' || pathname.startsWith('/api/')) return route(req, env, ctx);
    return plainNotFound();
  },
  async scheduled(controller: ScheduledController, env: Env): Promise<void> {
    await runTick(env, controller.scheduledTime);
    await ensureScheduler(env);
  },
} satisfies ExportedHandler<Env>;

export default handler;
