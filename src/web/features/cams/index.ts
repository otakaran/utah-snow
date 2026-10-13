// The cams feature's only import surface (spec §8.3): tiles, galleries, the stake row and the #/cams page, plus the
// YouTube player for the wall's featured cell (a changed videoId reuses the player via loadVideoById).
// Players mount inside tiles on a tap; nothing here autoplays except CamTile `autoLive`.
export { CamGallery, resortGallery } from './CamGallery.tsx';
export { CamsPage } from './CamsPage.tsx';
export { CamTile, type CamTileProps } from './CamTile.tsx';
export { CAM_BY_ID, camHidden, type LiveSource, liveSource, type Variant as CamVariant } from './cam-view.ts';
export { StakeRow } from './StakeRow.tsx';
export { YouTubePlayer } from './YouTubePlayer.tsx';

import './cams.css';
