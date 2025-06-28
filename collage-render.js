#!/usr/bin/env node
/*  Collage Renderer - Create JPEG outputs from JSON layout files
----------------------------------------------------------------*/
import { Command } from 'commander';
import { renderFromJSON } from './render.js';
import fs from 'node:fs';

/* ---------- CLI ---------- */
const cli = new Command('render');
cli.version('1.0.0')
  .description('Render JPEG collages from JSON layout files')
  .requiredOption('-j, --json <file>', 'JSON layout file to render')
  .option('-o, --output <dir>', 'output directory', './rendered')
  .option('-f, --format <format>', 'output format (jpg|png)', 'jpg')
  .option('-q, --quality <n>', 'JPEG quality (1-100)', '92')
  .option('--bg <hex>', 'background color', '#ffffff')
  .option('--padding <n>', 'padding between photos in pixels', '0')
  .option('--border <n>', 'border width around photos in pixels', '0')
  .option('--borderColor <hex>', 'border color', '#000000')
  .parse();

const opt = cli.opts();

/* ---------- Validation ---------- */
if (!fs.existsSync(opt.json)) {
  console.error(`❌ JSON file not found: ${opt.json}`);
  process.exit(1);
}

/* ---------- Main ---------- */
console.log(`📄 Reading layout from: ${opt.json}`);

const renderOptions = {
  background: opt.bg,
  padding: parseInt(opt.padding),
  borderWidth: parseInt(opt.border),
  borderColor: opt.borderColor,
  format: opt.format,
  quality: parseInt(opt.quality)
};

try {
  await renderFromJSON(opt.json, renderOptions, opt.output);
} catch (error) {
  console.error(`❌ Rendering failed: ${error.message}`);
  process.exit(1);
}
