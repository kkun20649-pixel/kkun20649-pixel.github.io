import { createWriteStream } from 'node:fs';
import { cp, mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const origin = 'https://aigc-screenworks-k7.kkun20649.chatgpt.site';
const root = process.cwd();
const output = resolve(process.argv[2] ?? 'dist');
if (output === root) throw new Error('Use an empty output directory.');

const aliases = JSON.parse(await readFile('scripts/portfolio-aliases.json', 'utf8'));
const template = await readFile('index.html', 'utf8');
const response = await fetch(origin + '/api/catalogue', { redirect: 'error', signal: AbortSignal.timeout(30000) });
if (!response.ok) throw new Error('Could not load the published catalogue: ' + response.status);
const { categories, works } = await response.json();
if (!Array.isArray(categories) || !Array.isArray(works) || !categories.length) throw new Error('Invalid catalogue');

const safeId = /^[a-f0-9-]{36}$/;
const safeKey = /^[a-f0-9-]{36}\.(mp4|webm|jpg|png|webp)$/;
const escape = value => String(value ?? '').replace(/[&<>"']/g, char =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const text = escape;
const route = work => aliases.routes[work.id] ?? work.id;
const assetName = key => aliases.media[key] ?? key;
const asset = key => '/api/media/' + assetName(key);
function external(url) {
  try { return new URL(url).protocol === 'https:' ? escape(url) : ''; }
  catch { return ''; }
}

const labels = new Map(categories.map(({ id, label }) => [id, label]));
const visible = works.filter(work => work.published === true);
const assets = new Set();
for (const work of visible) {
  if (!safeId.test(work.id) || !labels.has(work.category) || !Array.isArray(work.media)) {
    throw new Error('Invalid published work');
  }
  for (const key of [work.cover, ...work.media.map(item => item.key)].filter(Boolean)) {
    if (!safeKey.test(key)) throw new Error('Invalid asset identifier');
    assets.add(key);
  }
}

try {
  await mkdir(output);
} catch (error) {
  if (error.code !== 'EEXIST') throw error;
  if ((await readdir(output)).length) throw new Error('Use an empty output directory.');
}
for (const file of ['portfolio.css', 'portfolio.js', 'player.js', 'favicon.svg', 'admin']) {
  await cp(join(root, file), join(output, file), { recursive: true });
}
await mkdir(join(output, 'api/media'), { recursive: true });

let size = 0;
for (const key of assets) {
  const name = assetName(key);
  const source = join(root, 'api/media', name);
  const target = join(output, 'api/media', name);
  const cached = await stat(source).catch(error => {
    if (error.code !== 'ENOENT') throw error;
    return null;
  });
  if (cached?.isFile() && cached.size > 0) {
    size += cached.size;
    await cp(source, target);
    continue;
  }
  const media = await fetch(origin + '/api/media/' + key, { redirect: 'error', signal: AbortSignal.timeout(180000) });
  if (!media.ok || !media.body) throw new Error('Could not fetch public media: ' + key);
  const length = Number(media.headers.get('content-length'));
  if (!Number.isSafeInteger(length) || length <= 0 || size + length > 950 * 1024 * 1024) {
    throw new Error('The media collection exceeds the Pages size budget or has an unknown size.');
  }
  await pipeline(Readable.fromWeb(media.body), createWriteStream(target));
  if ((await stat(target)).size !== length) throw new Error('Incomplete media download: ' + key);
  size += length;
}

function tagline(work) {
  if (work.tagline) return work.tagline;
  const images = work.media.filter(item => item.kind === 'image').length;
  if (work.category === 'design') return images > 1 ? 'PS 平面设计 · ' + images + ' 张成稿' : 'PS 平面设计 · 成稿展示';
  const videos = work.media.length - images;
  return work.category === 'drama' && videos > 1 ? 'AI 漫剧 · ' + videos + ' 集' : labels.get(work.category) + ' · 成片展示';
}

function card(work) {
  const modifier = work.category === 'design' ? ' poster-card' : work.category === 'digital' ? ' portrait-card' : '';
  const cover = work.cover ? '<img src="' + asset(work.cover) + '" alt="" loading="lazy">' : '';
  const stats = work.stats ? '<p class="work-stats">' + text(work.stats) + '</p>' : '';
  return '<a class="work-card' + modifier + '" href="/works/' + route(work) + '/">' +
    '<div class="work-image">' + cover + '</div><div class="work-card-info"><div><span class="work-category">' +
    text(labels.get(work.category)) + '</span><h3>' + text(work.title) + '</h3><p>' +
    text(tagline(work)) + '</p>' + stats + '</div><span class="card-arrow" aria-hidden="true">↗</span></div></a>';
}

const populated = categories.map(category => ({
  ...category, members: visible.filter(work => work.category === category.id)
})).filter(category => category.members.length);
const filters = '<button type="button" aria-pressed="true" data-category="all">全部 <small>' + visible.length + '</small></button>' +
  populated.map(({ id, label }) => '<button type="button" aria-pressed="false" data-category="' + escape(id) + '">' + text(label) + '</button>').join('');
const groups = populated.map(({ id, label, members }) =>
  '<section class="work-group" id="category-' + escape(id) + '"><div class="group-header"><h2>' +
  text(label) + '</h2><span>' + members.length + ' 件</span></div><div class="card-list">' +
  members.map(card).join('') + '</div></section>').join('');

const featured = [
  [visible.find(work => work.category === 'drama' && work.title.includes('诡王萝莉') && work.cover), 'AI 漫剧海报', ' hero-print-main'],
  [visible.find(work => work.category === 'design' && work.title.includes('昭君出塞') && work.cover), 'PS 视觉设计', '']
].filter(([work]) => work);
const hero = featured.length ? '<div class="hero-artwork" aria-label="精选作品图片">' + featured.map(([work, label, cls], i) =>
  '<figure class="hero-print' + cls + '"><div class="print-frame"><img src="' + asset(work.cover) + '" alt="' +
  escape(work.title) + '" fetchpriority="' + (i === 0 ? 'high' : 'auto') + '"></div><figcaption><span>' +
  text(work.title) + '</span><small>' + label + '</small></figcaption></figure>').join('') + '</div>' : '';

const start = template.indexOf('<section class="work-group"');
const end = template.indexOf('<p class="empty"', start);
if (start < 0 || end < 0 || !template.includes('aria-label="作品分类筛选"') || !template.includes('class="hero-artwork"')) {
  throw new Error('The homepage template has changed.');
}
const index = (template.slice(0, start) + groups + template.slice(end))
  .replace(/(<nav class="section-nav" aria-label="作品分类筛选">)[\s\S]*?<\/nav>/, (_, open) => open + filters + '</nav>')
  .replace(/(<p class="result-count" role="status">)[^<]+/, (_, open) => open + visible.length + ' 件作品')
  .replace(/<div class="hero-artwork"[\s\S]*?<\/figure><\/div>/, () => hero);
await writeFile(join(output, 'index.html'), index);

function detail(work) {
  const poster = work.cover ? asset(work.cover) : '';
  const videos = work.media.filter(item => item.kind !== 'image' && (item.key || external(item.url)));
  const images = work.media.filter(item => item.kind === 'image' && item.key);
  let player = '';
  if (videos.length) {
    const options = videos.map((item, index) => '<button type="button" data-episode data-src="' +
      (item.key ? asset(item.key) : external(item.url)) + '" data-kind="' + (item.key ? 'file' : 'link') +
      '" aria-pressed="' + (index === 0) + '">' + text(item.label) + '</button>').join('');
    const first = videos[0];
    const initial = first.key
      ? '<button type="button" class="video-cover" data-play aria-label="播放 ' + escape(first.label) + '">' +
        (poster ? '<img src="' + poster + '" alt="">' : '') + '<span>▶ 播放' +
        (videos.length > 1 ? ' ' + text(first.label) : '视频') + '</span></button>'
      : '<div class="player-link"><a class="button primary" target="_blank" rel="noreferrer" href="' +
        external(first.url) + '">' + text(first.label) + ' ↗</a></div>';
    player = '<section class="player" aria-label="作品视频" data-poster="' + poster + '"><div data-screen>' + initial +
      '</div><div class="episodes" aria-label="选择分集"' + (videos.length === 1 ? ' hidden' : '') + '>' + options + '</div></section>';
  }
  const gallery = images.length ? '<section class="poster-gallery" aria-label="完整设计图">' + images.map(image =>
    '<figure><a href="' + asset(image.key) + '" target="_blank" rel="noreferrer"><img src="' +
    asset(image.key) + '" alt="' + escape(image.label) + '" loading="lazy"></a><figcaption>' +
    text(image.label) + '</figcaption></figure>').join('') + '</section>' : '';
  const cover = !player && !gallery && poster ? '<img class="detail-cover" src="' + poster + '" alt="' + escape(work.title) + '封面">' : '';
  const platform = external(work.platformUrl);
  return '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>' +
    text(work.title) + ' · 影像与视觉作品集</title><link rel="stylesheet" href="/portfolio.css"><script src="/player.js" defer></script></head><body>' +
    '<main class="wrap detail"><a class="back-link" href="/#category-' + escape(work.category) + '">← 返回' +
    text(labels.get(work.category)) + '</a><div class="detail-title"><p class="eyebrow">' + text(labels.get(work.category)) +
    '</p><h1>' + text(work.title) + '</h1><p class="detail-tagline">' + text(tagline(work)) + '</p>' +
    (work.stats ? '<p class="detail-stats">' + text(work.stats) + '</p>' : '') + '</div>' +
    player + gallery + cover + '<div class="detail-copy">' +
    (work.summary ? '<section><h2>作品简介</h2><p>' + text(work.summary) + '</p></section>' : '') +
    (work.role ? '<section><h2>个人分工</h2><p>' + text(work.role) + '</p></section>' : '') +
    (platform ? '<a class="button secondary" href="' + platform + '" target="_blank" rel="noreferrer">前往发布平台 ↗</a>' : '') +
    '</div></main></body></html>';
}
for (const work of visible) {
  const pageDir = join(output, 'works', route(work));
  await mkdir(pageDir, { recursive: true });
  await writeFile(join(pageDir, 'index.html'), detail(work));
}
console.log('Built ' + visible.length + ' published works and ' + assets.size + ' media files.');
