// Probe allowlist seed (spec §7, Appendix B): one cheap GET per Worker-side host, data only.
// /api/debug/probe uses the union of registered adapters' `probes` and this list (an adapter's entry wins on hostId).
// Delete entries here as adapters that cover their hosts are registered in sources/index.ts.

export const PROBE_SEED: readonly { hostId: string; url: string }[] = [
  // Resorts
  { hostId: 'alta', url: 'https://www.alta.com/lift-terrain-status' },
  { hostId: 'alta-do', url: 'https://alta-webcams.sfo3.cdn.digitaloceanspaces.com/Collins_Snow_Stake.jpg' },
  {
    hostId: 'snowbird',
    url: 'https://api.snowbird.com/api/v1/dor/drupal/snow-reports?sort=date&direction=desc&limit=1',
  },
  { hostId: 'brighton', url: 'https://apim-marketing-001.azure-api.net/FeedService/v1/Feed?resortName=br' },
  { hostId: 'brighton-roads', url: 'https://www.brightonresort.com/api/reportpal-roads?resortName=br' },
  { hostId: 'mtnpowder', url: 'https://mtnpowder.com/feed?resortId=65' },
  { hostId: 'snowbasin', url: 'https://www.snowbasin.com/the-mountain/mountain-report/' },
  // Roads
  { hostId: 'udot-wp-cc', url: 'https://cottonwoodcanyons.udot.utah.gov/wp-json/wp/v2/posts?per_page=1&_fields=id' },
  { hostId: 'udot-wp-wb', url: 'https://wasatchback.udot.utah.gov/wp-json/wp/v2/posts?per_page=1&_fields=id' },
  { hostId: 'udot-wp-ov', url: 'https://ogdenvalley.udot.utah.gov/wp-json/wp/v2/posts?per_page=1&_fields=id' },
  {
    hostId: 'udot-list',
    url:
      'https://www.udottraffic.utah.gov/List/GetData/MountainPasses?query=' +
      '%7B%22draw%22%3A1%2C%22columns%22%3A%5B%7B%22data%22%3Anull%2C%22name%22%3A%22%22%7D%5D%2C%22order%22%3A%5B%5D' +
      '%2C%22start%22%3A0%2C%22length%22%3A1%2C%22search%22%3A%7B%22value%22%3A%22%22%7D%7D&lang=en',
  },
  // Weather and snow
  { hostId: 'nws', url: 'https://api.weather.gov/alerts/active?zone=UTZ105,UTZ108,UTZ110,UTZ111' },
  { hostId: 'avy', url: 'https://api.avalanche.org/v2/public/products/map-layer/UAC' },
  {
    hostId: 'snotel',
    url:
      'https://wcc.sc.egov.usda.gov/awdbRestApi/services/v1/data?stationTriplets=1308:UT:SNTL' +
      '&elements=SNWD&duration=HOURLY&beginDate=-72&endDate=0',
  },
  // Cams
  { hostId: 'skiutah', url: 'https://www.skiutah.com/files/blob/webcam/LBSKmCQHw9GVGF5AcHnE2o' },
  { hostId: 'hdrelay-config', url: 'https://manage.hdrelay.com/player/f9e1b19a-a72f-4319-8c01-0fd3e4392efb' },
  {
    hostId: 'hdrelay-img',
    url: 'https://img.hdrelay.com/api/frames/info?camera=09f922af-169d-4949-9bb7-295c6a859daa&position=default',
  },
  {
    hostId: 'prism-caminit',
    url: 'https://php.prismcam.com/public/helpers/cam_init.php?cams=65&pages=&url=%2F%2Futah.otakar.dev%2F',
  },
  { hostId: 'prism-gcs', url: 'https://storage.googleapis.com/prism-cam-00065/00065_current.txt' },
  { hostId: 'roundshot', url: 'https://backend.roundshot.com/cams/09123258cc29cd6e86d3af9a3836c150/medium' },
  { hostId: 'roundshot-snowbird', url: 'https://snowbird.roundshot.com/structure.json' },
  { hostId: 'camstreamer', url: 'https://camstreamer.com/embed/M5ToybhwNTDP6Y5Yt6lIr9hylOONXTv892poZIyH' },
  { hostId: 'ytimg', url: 'https://i.ytimg.com/vi/QozKoFs-hL0/mqdefault_live.jpg' },
  // Other: keyless videos.list (a 403 proves egress and costs 0 units) and OSRM (SLC downtown -> Alta).
  { hostId: 'youtube-api', url: 'https://www.googleapis.com/youtube/v3/videos?part=id&id=lkEM6EC8NVA' },
  {
    hostId: 'osrm',
    url: 'https://router.project-osrm.org/route/v1/driving/-111.891,40.761;-111.638,40.590?overview=false',
  },
];
