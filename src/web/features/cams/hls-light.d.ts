// hls.js ships no typings for its "./light" export (no alternate audio, subtitles, DRM or CMCD, about 40% smaller);
// its API is the full build's.
declare module 'hls.js/light' {
  export { default } from 'hls.js';
}
