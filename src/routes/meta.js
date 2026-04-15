import { Router } from 'express';
import { getCountriesExcludingIsrael } from '../utils/countries.js';

export function metaRoutes() {
  const r = Router();

  let cache = null;
  r.get('/countries', (_req, res) => {
    if (!cache) {
      cache = getCountriesExcludingIsrael();
    }
    res.json({ countries: cache });
  });

  return r;
}
