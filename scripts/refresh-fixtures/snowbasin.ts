// Snowbasin mountain-report trim, on cleanHtml() output (~70 KB off-season, ~120 KB in season). parse() reads the
// <body> season class, the alert bar, the header dropdown's Snowfall cell (the fallback when the main report has no
// Snow Report), the narrative, and the main report: Conditions, lifts, the parking gauge and the trail tables. Menus,
// the forecast slider, the footer and trail rows without the groomed icon (outside Access Gates) are dropped;
// groomed rows are capped, so an in-season `trails.groomed` can read lower than the full page.
const WEATHER = '<div class="mc-weather">';
const MAIN = /<div class="mc-weather__wrap">\s*<p class="mc__timestamp/; // the report itself, not the dropdown
const NAVS = /<nav class="(?:main|local)-nav[^"]*">[\s\S]*?<\/nav>\n?/g;
const FORECAST = /<div class="mc-forecast[\s\S]*?(?=<div class="mc-lifts">)/;
const FOOTER = /<footer\b[\s\S]*<\/footer>\n?/;
const ROW = /<tr>[\s\S]*?<\/tr>\n?/g;
const TD_CLASS = /<td class="[^"]*">/g; // the cell regexes accept any <td> attributes
const GROOMED = 'mc__icon-groomed"';
const MAX_GROOMED_ROWS = 12;
const ACCORDION = '<div class="accordion js-accordion';

/** Each alert-bar block up to the end of its copy (what the alert regex reads). */
function alerts(head: string): string[] {
  const out: string[] = [];
  for (let i = head.indexOf('<div class="alert -'); i >= 0; i = head.indexOf('<div class="alert -', i + 1)) {
    const copy = head.indexOf('alert__content-copy', i);
    const end = copy < 0 ? -1 : head.indexOf('</div>', copy);
    if (end > 0) out.push(`${head.slice(i, end + 6)}\n</div>\n</div>\n`);
  }
  return out;
}

/** The dropdown's Snowfall cell through its 'Last Updated' stamp, or '' when the markers moved. */
function snowfall(drop: string): string {
  const at = drop.indexOf('">Snowfall</p>');
  const stamp = at < 0 ? -1 : drop.indexOf('Last Updated', at);
  const end = stamp < 0 ? -1 : drop.indexOf('</p>', stamp);
  return end < 0 ? '' : `${drop.slice(drop.lastIndexOf('<', at), end + 4)}\n`;
}

/** Trail rows: every Access Gates row, groomed rows up to MAX_GROOMED_ROWS; area accordions left empty go too. */
function trailRows(trails: string): string {
  const gatesAt = trails.search(/>Access Gates\s*<span/);
  const gatesEnd = gatesAt < 0 ? -1 : trails.indexOf('</table>', gatesAt);
  let groomed = 0;
  const thin = (s: string) =>
    s.replace(ROW, (row) => (row.includes(GROOMED) && groomed++ < MAX_GROOMED_ROWS ? row : ''));
  const rows =
    gatesEnd < 0
      ? thin(trails)
      : thin(trails.slice(0, gatesAt)) + trails.slice(gatesAt, gatesEnd) + thin(trails.slice(gatesEnd));
  const parts = rows.split(ACCORDION); // sibling area blocks; the first and last also hold the section's wrappers
  const table = parts.findIndex((p) => p.includes('mc-trails__table')); // one table keeps `groomed` 0, not null
  return parts.filter((p, i) => i === 0 || i === parts.length - 1 || i === table || p.includes('<td')).join(ACCORDION);
}

export function trimSnowbasin(clean: string): string {
  const html = clean.replace(NAVS, '').replace(FOOTER, '').replace(TD_CLASS, '<td>');
  const mainAt = html.search(MAIN);
  const drop = html.indexOf(WEATHER);
  const narrative = drop < 0 ? -1 : html.indexOf(WEATHER, drop + 1);
  if (mainAt < 0 || narrative < 0 || narrative > mainAt) return html; // layout changed: cleanHtml output only
  const head = html.slice(0, mainAt);
  const main = html.slice(mainAt).replace(FORECAST, '');
  const trailsAt = main.indexOf('<div class="mc-trails">');
  return [
    head.slice(0, drop),
    WEATHER,
    '\n',
    snowfall(head.slice(drop, narrative)),
    ...alerts(head.slice(drop, narrative)), // the alert bar sits between the dropdown and the narrative
    head.slice(narrative),
    trailsAt < 0 ? main : main.slice(0, trailsAt) + trailRows(main.slice(trailsAt)),
  ].join('');
}
