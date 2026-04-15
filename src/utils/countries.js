import { getCountryCallingCode } from 'libphonenumber-js';
import countries from 'world-countries';

const EXCLUDED = new Set(['IL']);

export function getCountriesExcludingIsrael() {
  return countries
    .filter((c) => c.cca2 && !EXCLUDED.has(c.cca2))
    .map((c) => {
      try {
        const dial = `+${getCountryCallingCode(c.cca2)}`;
        return {
          code: c.cca2,
          name: c.name.common,
          dial,
        };
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name));
}
