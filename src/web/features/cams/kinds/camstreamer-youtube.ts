// Deer Valley: YouTube live streams whose IDs the Worker reads from CamStreamer redirects (§6.1). In the browser
// they behave exactly like the youtube kind; the CamStreamer page itself is never embedded.
import type { KindSpec } from './kind.ts';
import { youtube } from './youtube.ts';

export const camstreamerYoutube: KindSpec = youtube;
