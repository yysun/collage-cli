#!/usr/bin/env node
/*  Collage CLI v3 – orientation, importance, faces, saliency,
    color harmony, CLIP clustering, bleed, PDF booklet.
----------------------------------------------------------------*/
import { Command } from 'commander';
import fg from 'fast-glob';
import sharp from 'sharp';
import smartcrop from 'smartcrop-sharp';
import * as Vibrant from 'node-vibrant/node';
import salient from 'salient-autofocus';
import * as faceapi from '@vladmandic/face-api';
import * as tf from '@tensorflow/tfjs-node';
import { pipeline } from '@xenova/transformers';
import { PDFDocument } from 'pdf-lib';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';

const CELL = 300;                               // px per 1×1 cell
/* ---------- CLI ---------- */
const cli = new Command('collage');
cli.requiredOption('-i, --input <dir>')
  .option('-o, --output <dir>', './out')
  .option('-p, --pages <n>', v => +v, 1)
  .option('-s, --size <WxH>', '24x36in')
  .option('--dpi <n>', v => +v, 300)
  .option('--bg <hex>', '#ffffff')
  .option('--border <px>', v => +v, 0)
  .option('--borderColor <hex>', '#ffffff')
  .option('--shape <none|circle|rounded>', 'none')
  .option('-g, --grid <n>', v => +v, 3)
  .option('--no-faces', 'disable face count')
  .option('--harmony', 'order by dominant hue')
  .option('--theme', 'cluster by CLIP embeddings')
  .option('--bleed <mm|in>', 'add bleed + crop marks (e.g. 3mm, 0.125in)')
  .option('--pdf', 'generate booklet.pdf')
  .parse();
const opt = cli.opts();

/* ---------- utils ---------- */
const mm = v => v * opt.dpi / 25.4;                               // mm➜px
const inch = v => v * opt.dpi;                                    // in➜px
const parseBleed = b => b?.endsWith('mm') ? mm(+b.slice(0, -2))
  : b?.endsWith('in') ? inch(+b.slice(0, -2)) : 0;
const BLEED = parseBleed(opt.bleed) || 0;
const parseSize = (str, dpi) => {
  const m = str.match(/^(\d+(\.\d+)?)x(\d+(\.\d+)?)(in|mm|px)$/i);
  const mul = m[5] === 'px' ? 1 : m[5] === 'in' ? dpi : dpi / 25.4;
  return { W: Math.round(+m[1] * mul) + BLEED * 2, H: Math.round(+m[3] * mul) + BLEED * 2 };
};
const { W: PAGE_W, H: PAGE_H } = parseSize(opt.size, opt.dpi);
const COLS = Math.ceil(PAGE_W / CELL);
const SHAPES = [...Array(opt.grid)].flatMap((_, x) =>
  [...Array(opt.grid)].map((_, y) => [x + 1, y + 1]));
const maskSVG = (w, h, t) => t === 'none' ? null : Buffer.from(
  t === 'circle' ? `<svg><circle cx="${w / 2}" cy="${h / 2}" r="${Math.min(w, h) / 2}"
                                  fill="white"/></svg>`
    : `<svg><rect width="${w}" height="${h}"
                             rx="${w * 0.1}" ry="${w * 0.1}" fill="white"/></svg>`);

/* ---------- model warm-up ---------- */
let faceCnt = () => 0, clip = null;
if (opt.faces) {
  await faceapi.nets.ssdMobilenetv1.loadFromDisk('./models')
    .catch(async () => {
      await fsp.mkdir('./models', { recursive: true });
      await faceapi.nets.ssdMobilenetv1.loadFromUri(
        'https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@master/weights');
    });
  faceCnt = async buf => {
    const t = tf.node.decodeImage(buf, 3);
    const n = (await faceapi.detectAllFaces(t)).length;
    t.dispose(); return n;
  };
}
if (opt.theme) clip = await pipeline('feature-extraction', 'Xenova/clip-vit-base-patch32');

/* ---------- scan + analyse photos ---------- */
const files = (await fg(['*.jpg', '*.jpeg', '*.png'],
  { cwd: opt.input, absolute: true }))
  .sort((a, b) => fs.statSync(a).mtimeMs - fs.statSync(b).mtimeMs);
if (!files.length) throw 'No images found';
const photos = [];
for (const f of files) {
  const buf = await fsp.readFile(f);
  const { width: w, height: h } = await sharp(buf).metadata();
  const imp = +(path.basename(f).toLowerCase().match(/imp(\d)/)?.[1] || 0);
  const faces = opt.faces ? await faceCnt(buf) : 0;
  const sal = salient.score(buf);                   // 0-1 saliency
  const vib = opt.harmony ? await Vibrant.from(buf).getPalette() : null;
  const hue = vib ? Vibrant.Util.rgbToHsv(...vib.Vibrant.rgb)[0] : 0;
  const emb = opt.theme ? (await clip(buf, { pooling: 'mean' })).data : null;
  photos.push({ f, buf, w, h, imp, faces, sal, hue, emb });
}

/* ---------- optional ordering ---------- */
if (opt.harmony) photos.sort((a, b) => a.hue - b.hue);
if (opt.theme) {
  const axis = photos[0].emb.map(() => Math.random() * 2 - 1);
  photos.sort((a, b) => a.emb.reduce((s, v, i) => s + v * axis[i], 0) -
    b.emb.reduce((s, v, i) => s + v * axis[i], 0));
}

/* ---------- pack helpers ---------- */
const newCanvas = _ => ({
  img: sharp({
    create: {
      width: PAGE_W, height: PAGE_H,
      channels: 3, background: opt.bg
    }
  }),
  sky: Array(COLS).fill(0)
});
const place = (sky, cw, ch) => {
  for (let x = 0; x <= sky.length - cw; x++) {
    const y = Math.max(...sky.slice(x, x + cw));
    if (y + ch <= Math.ceil(PAGE_H / CELL)) {
      for (let i = x; i < x + cw; i++) sky[i] = y + ch; return { x, y };
    }
  }
  return null;
};
const pickSize = p => {
  const landscape = p.w >= p.h, portrait = !landscape;
  const big = p.imp >= 3 || p.faces >= 3 || p.sal > .55;
  const pool = SHAPES.filter(([x, y]) => {
    if (landscape && x >= y) return true;
    if (portrait && y >= x) return true;
    return x === y;
  }).filter(([x, y]) => big ? x * y >= 4 : x * y <= 4);
  return pool[Math.random() * pool.length | 0] || [1, 1];
};

/* ---------- output dir ---------- */
await fsp.mkdir(opt.output, { recursive: true });
const outDir = path.join(opt.output, 'collage-' + new Date().toISOString().replace(/[:.]/g, '-'));
await fsp.mkdir(outDir);

/* ---------- layout + render pages ---------- */
const pages = [];
let page = 0, idx = 0;
while (page < opt.pages && idx < photos.length) {
  const cnv = newCanvas(); pages.push(path.join(outDir, `page-${++page}.jpg`));
  if (BLEED) { // crop marks
    cnv.img.composite([
      {
        input: Buffer.from(`<svg width="${PAGE_W}" height="${PAGE_H}">
         <line x1="${BLEED}" y1="0" x2="${BLEED}" y2="${BLEED}" stroke="black" stroke-width="2"/>
         <line x1="0" y1="${BLEED}" x2="${BLEED}" y2="${BLEED}" stroke="black" stroke-width="2"/>
         <line x1="${PAGE_W - BLEED}" y1="0" x2="${PAGE_W - BLEED}" y2="${BLEED}" stroke="black" stroke-width="2"/>
         <line x1="${PAGE_W}" y1="${BLEED}" x2="${PAGE_W - BLEED}" y2="${BLEED}" stroke="black" stroke-width="2"/>
         <line x1="${BLEED}" y1="${PAGE_H}" x2="${BLEED}" y2="${PAGE_H - BLEED}" stroke="black" stroke-width="2"/>
         <line x1="0" y1="${PAGE_H - BLEED}" x2="${BLEED}" y2="${PAGE_H - BLEED}" stroke="black" stroke-width="2"/>
         <line x1="${PAGE_W - BLEED}" y1="${PAGE_H}" x2="${PAGE_W - BLEED}" y2="${PAGE_H - BLEED}" stroke="black" stroke-width="2"/>
         <line x1="${PAGE_W}" y1="${PAGE_H - BLEED}" x2="${PAGE_W - BLEED}" y2="${PAGE_H - BLEED}" stroke="black" stroke-width="2"/>
      </svg>`),
        blend: 'over'
      }]);
  }
  while (idx < photos.length) {
    const p = photos[idx], [cw, ch] = pickSize(p); const pos = place(cnv.sky, cw, ch); if (!pos) break;
    const w = CELL * cw - opt.border * 2, h = CELL * ch - opt.border * 2;
    const crop = await smartcrop.crop(p.buf, { width: w, height: h });
    let img = sharp(p.buf).extract(crop.topCrop).resize(w, h);
    if (opt.shape !== 'none') img = img.composite([{ input: maskSVG(w, h, opt.shape), blend: 'dest-in' }]);
    if (opt.border) img = img.extend({
      top: opt.border, left: opt.border,
      bottom: opt.border, right: opt.border,
      background: opt.borderColor
    });
    cnv.img.composite([{
      input: await img.toBuffer(),
      left: pos.x * CELL + BLEED, top: pos.y * CELL + BLEED
    }]);
    idx++;
  }
  await cnv.img.toFormat('jpg', { quality: 92 }).toFile(pages[page - 1]);
  console.log('✓ rendered', path.basename(pages[page - 1]));
}

/* ---------- optional PDF booklet ---------- */
if (opt.pdf) {
  const pdf = await PDFDocument.create();           // :contentReference[oaicite:5]{index=5}
  for (const imgPath of pages) {
    const bytes = await fsp.readFile(imgPath);
    const jpg = await pdf.embedJpg(bytes);
    const p = pdf.addPage([PAGE_W / opt.dpi * 72, PAGE_H / opt.dpi * 72]);
    p.drawImage(jpg, { x: 0, y: 0, width: p.getWidth(), height: p.getHeight() });
  }
  await fsp.writeFile(path.join(outDir, 'booklet.pdf'), await pdf.save());
  console.log('✓ booklet.pdf created');
}

console.log('All done →', outDir);
