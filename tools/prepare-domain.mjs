import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const oldUrlsFile = process.argv[2];
if (!oldUrlsFile) throw new Error('Pass the old-site urls.txt path.');

const canonical = (pathname) => `https://ogreena.com${pathname}`;
const serviceSlugs = fs.readdirSync(path.join(root, 'services'));

function updatePrimaryPage(file, pathname, title, description) {
  let html = fs.readFileSync(file, 'utf8');
  html = html
    .replaceAll('/ogreena-preview/assets/', pathname === '/' ? 'assets/' : '../../assets/')
    .replace('<meta name="robots" content="noindex,nofollow">', '<meta name="robots" content="index,follow">')
    .replace(/<meta name="description" content="[^"]*">/, `<meta name="description" content="${description}">`)
    .replace(/<title>[^<]*<\/title>/, `<title>${title}</title>`);
  if (!html.includes('rel="canonical"')) {
    html = html.replace('</title>', `</title><link rel="canonical" href="${canonical(pathname)}">`);
  }
  fs.writeFileSync(file, html);
}

updatePrimaryPage(
  path.join(root, 'index.html'),
  '/',
  'Ogreena | Bay Area Cleaning and Property Services',
  'Ogreena provides residential and commercial cleaning, carpet care, electrical support, janitorial and property-maintenance services across the San Francisco Bay Area.'
);

for (const slug of serviceSlugs) {
  const file = path.join(root, 'services', slug, 'index.html');
  const source = fs.readFileSync(file, 'utf8');
  const heading = source.match(/<h1[^>]*>([^<]+)<\/h1>/)?.[1] || slug;
  updatePrimaryPage(
    file,
    `/services/${slug}/`,
    `${heading} | Ogreena`,
    `${heading} from Ogreena for homes, properties and businesses in the San Francisco Bay Area. Call (510) 472-9327 to discuss availability.`
  );
}

function destinationFor(oldPath) {
  const value = oldPath.toLowerCase();
  if (value === '/commercial-services') return 'services/commercial-cleaning/';
  if (value === '/electrical-services') return 'services/electrical-services/';
  if (value === '/residential-services') return '#services';
  if (value.startsWith('/products')) return 'products/';
  if (value.includes('carpet') || value.includes('rug') || value.includes('bedroom') || value.includes('stair') || value.includes('closet') || value.includes('dining-room')) return 'services/carpet-cleaning/';
  if (value.includes('upholster') || value.includes('couch') || value.includes('sofa') || value.includes('cushion') || value.includes('mattress') || value.includes('chair')) return 'services/upholstery-cleaning/';
  if (value.includes('tile') || value.includes('grout')) return 'services/tile-grout-cleaning/';
  if (value.includes('window')) return 'services/window-cleaning/';
  if (value.includes('janitorial')) return 'services/janitorial-services/';
  if (value.includes('move-in') || value.includes('move-out') || value.includes('turnover')) return 'services/move-in-move-out-cleaning/';
  if (value.includes('deep-clean')) return 'services/deep-cleaning/';
  if (value.includes('pressure-wash') || value.includes('graffiti')) return 'services/pressure-washing/';
  if (value.includes('facility') || value.includes('handyman') || value.includes('repair')) return 'services/facilities-maintenance/';
  if (value.includes('appointment') || value.includes('book-a-cleaning')) return '#contact';
  return '';
}

function redirectPage(oldPath, destination) {
  const targetPath = destination ? `/${destination}` : '/';
  const targetUrl = canonical(targetPath);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,follow"><title>Page moved | Ogreena</title><link rel="canonical" href="${targetUrl}"><script>const r=location.hostname.endsWith('.github.io')?'/ogreena-preview/':'/';location.replace(r+${JSON.stringify(destination)});</script></head><body><main><h1>This Ogreena page has moved</h1><p><a href="${targetUrl}">Continue to the current Ogreena page</a>.</p></main></body></html>`;
}

const oldUrls = fs.readFileSync(oldUrlsFile, 'utf8').split(/\r?\n/).filter(Boolean);
for (const url of oldUrls) {
  const oldPath = decodeURIComponent(new URL(url).pathname).replace(/\/$/, '') || '/';
  if (oldPath === '/' || oldPath === '/products' || oldPath.endsWith('.xml')) continue;
  const output = path.join(root, oldPath.slice(1), 'index.html');
  if (fs.existsSync(output)) continue;
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, redirectPage(oldPath, destinationFor(oldPath)));
}

