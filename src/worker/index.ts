// Placeholder: replaced by the real Worker entry (router + cron dispatcher).
export default {
  fetch: () =>
    new Response('Not found', { status: 404, headers: { 'content-type': 'text/plain', 'cache-control': 'no-store' } }),
  scheduled: () => {},
} satisfies ExportedHandler<Env>;
