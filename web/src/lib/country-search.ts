/** Rank countries by how well they match a partial search query. */
export function filterCountries(countries: readonly string[], query: string): string[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...countries];

  const queryWords = q.split(/\s+/).filter(Boolean);

  return countries
    .map((country) => {
      const lower = country.toLowerCase();
      const countryWords = lower.split(/[\s-]+/).filter(Boolean);
      let score = 0;

      if (lower === q) score = 200;
      else if (lower.startsWith(q)) score = 150;
      else if (countryWords.some((w) => w.startsWith(q))) score = 120;
      else if (queryWords.every((w) => countryWords.some((cw) => cw.startsWith(w)))) score = 100;
      else if (queryWords.every((w) => lower.includes(w))) score = 80;
      else if (queryWords.some((w) => countryWords.some((cw) => cw.startsWith(w)))) score = 40;

      return { country, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.country.localeCompare(b.country))
    .map((entry) => entry.country);
}
