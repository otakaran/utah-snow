// Roundshot 360 viewer (Snowbird Hidden Peak 360): the provider's own panorama page as an iframe, from the CamDef's
// live.url, loaded only after a tap. It is not video, so no playerManager lease; closing the tile unloads it.
interface Props {
  url: string;
  title: string;
}

export function Roundshot360({ url, title }: Props) {
  return (
    <div class="cam-player cam-player-360">
      <iframe class="cam-iframe" src={url} title={`${title}, 360° panorama`} allow="fullscreen" allowFullScreen />
    </div>
  );
}
