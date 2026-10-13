// Footer attribution text (spec §8.6). Add the Liftie line only if a parser adapts Liftie code.
export function Attribution() {
  return (
    <p class="attribution">
      Forecast: NWS. Weather data by{' '}
      <a href="https://open-meteo.com/" rel="noreferrer">
        Open-Meteo.com
      </a>{' '}
      (CC BY 4.0). Snowpack: USDA NRCS. Avalanche: avalanche.org / Utah Avalanche Center. Roads: UDOT. Cams © resorts
      and their providers (HDRelay, Prism, Roundshot, YouTube).
    </p>
  );
}
