import { work } from '../data/work.js';

// One entry per page. New case studies appear here on their own because they come from the same list.
export function GET({ site }) {
  const paths = ['/', '/work/', '/about/', ...work.map((w) => `/work/${w.slug}/`)];
  const urls = paths.map((p) => `<url><loc>${new URL(p, site)}</loc></url>`).join('');
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`, {
    headers: { 'Content-Type': 'application/xml' },
  });
}
