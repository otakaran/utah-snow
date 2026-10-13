// Footer attribution (spec §8.6, §8.2 footer): data-source credits, build id, repo link, no-affiliation note.
// The credits sentence is the spec's text verbatim; each source name links to its home page.
// Add "Some parsers adapted from Liftie (BSD-3-Clause)" only if a parser adapts Liftie code.

export const REPO_URL = 'https://github.com/otakaran/utah-snow';

/** Data sources the site credits; the settings About section lists them too. */
export const CREDITS = [
  { name: 'NWS', what: 'Forecasts, alerts, observations', href: 'https://www.weather.gov/slc/' },
  { name: 'Open-Meteo.com', what: 'Weather models (CC BY 4.0)', href: 'https://open-meteo.com/' },
  { name: 'USDA NRCS', what: 'SNOTEL snowpack', href: 'https://www.nrcs.usda.gov/wps/portal/wcc/home/' },
  { name: 'avalanche.org', what: 'Avalanche danger map', href: 'https://avalanche.org/' },
  { name: 'Utah Avalanche Center', what: 'Avalanche forecasts', href: 'https://utahavalanchecenter.org/' },
  { name: 'UDOT', what: 'Roads, signs and road cams', href: 'https://www.udottraffic.utah.gov/' },
] as const;

type CreditName = (typeof CREDITS)[number]['name'];

function Src({ name }: { name: CreditName }) {
  const c = CREDITS.find((x) => x.name === name);
  return (
    <a href={c?.href} target="_blank" rel="noreferrer">
      {name}
    </a>
  );
}

export function Attribution({ build }: { build: string }) {
  return (
    <div class="attribution">
      <p>
        Forecast: <Src name="NWS" />. Weather data by <Src name="Open-Meteo.com" /> (CC BY 4.0). Snowpack:{' '}
        <Src name="USDA NRCS" />. Avalanche: <Src name="avalanche.org" /> / <Src name="Utah Avalanche Center" />. Roads:{' '}
        <Src name="UDOT" />. Cams © resorts and their providers (HDRelay, Prism, Roundshot, YouTube).
      </p>
      <p>
        Build <span class="num">{build}</span> ·{' '}
        <a href={REPO_URL} target="_blank" rel="noreferrer">
          GitHub
        </a>{' '}
        · MIT license · Not affiliated with any resort
      </p>
    </div>
  );
}
