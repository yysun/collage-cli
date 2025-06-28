#!/usr/bin/env node
/*  Collage CLI v3 – orientation, importance, color harmony, bleed, PDF   photos.push({ f, buf, w, h, imp, hue });
  console.log(`${path.basename(f)} (W:${w}, H:${h}, Imp:${imp}, Hue:${Math.round(hue)}) %`);oklet.
----------------------------------------------------------------*/
import { Command } from 'commander';
import fg from 'fast-glob';
import sharp from 'sharp';
import { Vibrant } from 'node-vibrant/node';
import { PDFDocument } from 'pdf-lib';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { generateLayout } from './layout.js';
import { calculatePositions, createGridConfig, formatPosition } from './pos.js';
import { renderCollageToFile } from './render.js';

// Cell size will be calculated based on page dimensions and grid size
/* ---------- CLI ---------- */
const cli = new Command('collage');
cli.version('3.0.0')
  .description('Create beautiful photo collages with smart layout and professional print features')
  .requiredOption('-i, --input <dir>', 'input directory containing photos')
  .option('-o, --output <dir>', 'output directory', './out')
  .option('-s, --size <WxH>', 'page size (e.g., 24x36in, 300x400mm, 1920x1080px)', '24x36in')
  .option('--dpi <n>', v => +v, 300)
  .option('--bg <hex>', '#ffffff')
  .option('--border <px>', v => +v, 0)
  .option('--borderColor <hex>', '#ffffff')
  .option('-g, --grid <n>', v => +v, 3)
  .option('--harmony', 'order by dominant hue')
  .option('--dateSort <order>', 'sort by date: asc (oldest first) or desc (newest first)', 'asc')
  .option('--bleed <mm|in>', 'add bleed + crop marks (e.g. 3mm, 0.125in)')
  .option('--pdf', 'generate booklet.pdf')
  .option('--json', 'output JSON layout files instead of rendering images')
  .option('--padding <n>', 'padding between photos in pixels', '0')
  .option('--borderWidth <n>', 'border width around photos in pixels', '0')
  .parse();
const opt = cli.opts();

/* ---------- utils ---------- */
const mm = v => v * opt.dpi / 25.4;                               // mm➜px
const inch = v => v * opt.dpi;                                    // in➜px
const parseBleed = b => b?.endsWith('mm') ? mm(+b.slice(0, -2))
  : b?.endsWith('in') ? inch(+b.slice(0, -2)) : 0;
const BLEED = parseBleed(opt.bleed) || 0;
const parseSize = (str, dpi) => {
  if (!str) {
    throw new Error('Size parameter is required. Use --size option (e.g., --size 24x36in)');
  }
  const m = str.match(/^(\d+(\.\d+)?)x(\d+(\.\d+)?)(in|mm|px)$/i);
  if (!m) {
    throw new Error(`Invalid size format: ${str}. Use format like 24x36in, 300x400mm, or 1920x1080px`);
  }
  const mul = m[5] === 'px' ? 1 : m[5] === 'in' ? dpi : dpi / 25.4;
  return { W: Math.round(+m[1] * mul) + BLEED * 2, H: Math.round(+m[3] * mul) + BLEED * 2 };
};
const { W: PAGE_W, H: PAGE_H } = parseSize(opt.size, opt.dpi);

// RGB to HSV conversion utility
const rgbToHsv = (r, g, b) => {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const diff = max - min;
  let h = 0;
  if (diff !== 0) {
    if (max === r) h = ((g - b) / diff) % 6;
    else if (max === g) h = (b - r) / diff + 2;
    else h = (r - g) / diff + 4;
  }
  return [h * 60, max === 0 ? 0 : diff / max, max];
};

// Hex color to RGB object conversion
const hexToRgb = (hex) => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : { r: 255, g: 255, b: 255 }; // default to white if invalid
};

/* ---------- scan + analyse photos ---------- */
const files = (await fg(['*.jpg', '*.jpeg', '*.png'],
  { cwd: opt.input, absolute: true }));

// Sort files by date unless harmony is enabled
if (!opt.harmony) {
  if (opt.dateSort === 'desc') {
    files.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs); // Newest first
  } else {
    files.sort((a, b) => fs.statSync(a).mtimeMs - fs.statSync(b).mtimeMs); // Oldest first (default)
  }
} else {
  // When harmony is enabled, still sort by date first as a secondary sort
  files.sort((a, b) => fs.statSync(a).mtimeMs - fs.statSync(b).mtimeMs);
}

if (!files.length) throw 'No images found';
const photos = [];
console.log(`📸 Found ${files.length} image files to process...\n`);

for (let i = 0; i < files.length; i++) {
  const f = files[i];
  const fileProgress = Math.round(((i + 1) / files.length) * 100);
  process.stdout.write(`\r📖 Reading ${i + 1} out of ${files.length} files... (${fileProgress}%)`);

  const buf = await fsp.readFile(f);
  const { width: w, height: h } = await sharp(buf).metadata();
  const imp = +(path.basename(f).toLowerCase().match(/imp(\d)/)?.[1] || 0);
  const vib = opt.harmony ? await Vibrant.from(buf).getPalette() : null;
  const hue = vib ? rgbToHsv(...vib.Vibrant.rgb)[0] : 0;
  photos.push({ f, buf, w, h, imp, hue }); // Keep buf for reuse
}
console.log(''); // New line after progress

/* ---------- optional ordering ---------- */
if (opt.harmony) photos.sort((a, b) => a.hue - b.hue);

/* ---------- Core Functions ---------- */

// Create a new page structure
const createPage = () => {
  return {
    width: PAGE_W,
    height: PAGE_H,
    files: [] // Array to store file layout data
  };
};


// Generate a layout for the page using the layout.js module
const generateGrid = (page, photosRemaining = null) => {
  // Use grid parameter from CLI, with sensible defaults
  let gridSize = opt.grid || 6;
  let gridCols = gridSize;
  let gridRows = gridSize;

  // For the last page, optimize grid size to match remaining photos
  if (photosRemaining !== null && photosRemaining > 0) {
    // Calculate minimum grid size needed for remaining photos
    const minGridSize = Math.ceil(Math.sqrt(photosRemaining));

    // Find optimal grid dimensions for remaining photos
    if (photosRemaining <= 4) {
      gridCols = gridRows = Math.max(2, minGridSize);
    } else if (photosRemaining <= 9) {
      gridCols = gridRows = Math.max(3, minGridSize);
    } else if (photosRemaining <= 16) {
      gridCols = gridRows = Math.max(4, minGridSize);
    } else if (photosRemaining <= 25) {
      gridCols = gridRows = Math.max(5, minGridSize);
    } else {
      // For larger numbers, use the original grid size
      gridCols = gridRows = gridSize;
    }
  }

  let layoutBlocks;
  let attempts = 0;
  const maxAttempts = 20;

  // Generate layout with photo-friendly aspect ratio validation
  do {
    attempts++;

    // Generate the layout blocks using the sophisticated algorithm from layout.js
    layoutBlocks = generateLayout(gridRows, gridCols);

    // Check if layout blocks have reasonable aspect ratios for photos
    let hasAcceptableBlocks = true;
    let extremeBlocksCount = 0;

    for (const block of layoutBlocks) {
      const blockAspectRatio = block.w / block.h;

      // Define acceptable aspect ratio range for photos (prevent extreme distortion)
      // Tightened bounds to prevent overly tall or wide blocks that distort photos
      const minPhotoFriendlyRatio = 0.6;  // Prevents blocks taller than 3:5 ratio
      const maxPhotoFriendlyRatio = 2.5;  // Prevents blocks wider than 5:2 ratio

      if (blockAspectRatio < minPhotoFriendlyRatio || blockAspectRatio > maxPhotoFriendlyRatio) {
        extremeBlocksCount++;
      }
    }

    // Accept layout if less than 20% of blocks have extreme aspect ratios
    const extremeBlocksPercentage = extremeBlocksCount / layoutBlocks.length;
    if (extremeBlocksPercentage < 0.2) {
      break; // Layout is photo-friendly
    }

    // If we've tried many times, accept the current layout
    if (attempts >= maxAttempts) {
      if (extremeBlocksCount > 0) {
        console.log(`  ⚠️ Layout has ${extremeBlocksCount} blocks with extreme aspect ratios after ${maxAttempts} attempts`);
      }
      break;
    }

  } while (attempts < maxAttempts);

  // Create grid configuration using pos.js
  const gridConfig = createGridConfig(
    PAGE_W,
    PAGE_H,
    gridCols,
    gridRows,
    Math.min(Number(opt.border) || 4, 8), // Use smaller padding, max 8px
    BLEED
  );

  // Calculate positions for all layout blocks
  const positions = calculatePositions(layoutBlocks, gridConfig);

  const grid = {
    ...gridConfig,
    layoutBlocks, // Store the generated layout blocks
    positions // Store the calculated positions
  };

  page.grid = grid;

  return grid;
};


// Select the best photo for a given layout block with improved orientation matching
const selectPhoto = (photoQueue, layoutBlock) => {
  const { w: spanCols, h: spanRows } = layoutBlock;
  const layoutAspect = spanCols / spanRows;
  let bestIndex = -1;
  let bestScore = -1;

  for (let i = 0; i < photoQueue.length; i++) {
    const photo = photoQueue[i];
    const photoAspect = photo.w / photo.h;
    let score = Math.random() * 0.3; // Reduced base randomness for better matching

    // Enhanced orientation matching (highest priority)
    const isLayoutLandscape = spanCols > spanRows;
    const isLayoutSquare = spanCols === spanRows;
    const isPhotoLandscape = photo.orientation === 'landscape';
    const isPhotoSquare = Math.abs(photoAspect - 1) < 0.1; // Within 10% of square

    if (isLayoutSquare && isPhotoSquare) {
      score += 3; // Perfect match for square layouts
    } else if (isLayoutLandscape === isPhotoLandscape) {
      score += 2.5; // Strong bonus for orientation match
    } else {
      score -= 0.5; // Penalty for orientation mismatch
    }

    // Aspect ratio compatibility
    const aspectDiff = Math.abs(layoutAspect - photoAspect);
    score += Math.max(0, 2 - aspectDiff); // Better aspect match = higher score

    // Importance vs layout size matching
    const layoutSize = spanCols * spanRows;
    if (photo.importance >= 3 && layoutSize >= 4) {
      score += 1.5; // High importance photos get large layouts
    } else if (photo.importance <= 1 && layoutSize <= 2) {
      score += 1; // Low importance photos get small layouts
    } else if (photo.importance >= 2 && layoutSize >= 2 && layoutSize <= 4) {
      score += 0.5; // Medium importance gets medium layouts
    }

    // Bonus for very large layouts getting high importance photos
    if (layoutSize >= 6 && photo.importance >= 4) {
      score += 2;
    }

    if (score > bestScore) {
      bestScore = score;
      bestIndex = i;
    }
  }

  return bestIndex;
};

// Render a photo into the specified layout block
const renderPhoto = async (page, photo, layoutBlock) => {
  const { index } = layoutBlock;

  // Get the pre-calculated position for this layout block
  const position = page.grid.positions.find(p => p.index === index);
  if (!position) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }

  const { x, y, renderWidth, renderHeight } = position;

  // Validate render dimensions
  if (renderWidth <= 0 || renderHeight <= 0) {
    return { x, y, width: 0, height: 0 };
  }

  // Calculate aspect ratios for matching
  const photoAspectRatio = photo.w / photo.h;
  const cellAspectRatio = renderWidth / renderHeight;

  // Check if aspect ratios are close (within 15% difference)
  const aspectDifference = Math.abs(photoAspectRatio - cellAspectRatio) / cellAspectRatio;
  const aspectMatch = aspectDifference <= 0.15;

  // Add to page files array for JSON output or Canvas rendering
  // Store buffer data for performance improvement
  page.files.push({
    input: photo.f,
    inputBuffer: photo.buf, // Add buffer for reuse
    x: x,
    y: y,
    w: renderWidth,
    h: renderHeight,
    aspectMatch: aspectMatch // Add aspect ratio matching flag
  });

  return { x, y, width: renderWidth, height: renderHeight };
};


/* ---------- output dir ---------- */
await fsp.mkdir(opt.output, { recursive: true });
const outDir = path.join(opt.output, 'collage-' + new Date().toISOString().replace(/[:.]/g, '-'));
await fsp.mkdir(outDir);

/* ---------- Main Processing Loop ---------- */
// 1. Load all photo meta (fn, imp, orientation) into a queue

const photoQueue = photos.map(photo => {
  const filename = path.basename(photo.f);
  const orientation = photo.w >= photo.h ? 'landscape' : 'portrait';


  return {
    filename,
    importance: photo.imp,
    orientation,
    ...photo
  };
});
console.log(`✓ ${photoQueue.length} photos loaded into queue`);

const pages = [];
const layoutData = []; // For JSON output
let pageNumber = 0;
const totalPhotos = photoQueue.length;

// Repeat creating new pages until queue is clear
while (photoQueue.length > 0) {
  pageNumber++;
  const totalProcessed = totalPhotos - photoQueue.length;
  const progress = Math.round((totalProcessed / totalPhotos) * 100);

  // 2. Create a new page
  const page = createPage();
  const pageFile = path.join(outDir, `page-${pageNumber}.jpg`);

  // 3. Generate grid layout for this page  
  // Check if this is the last page and optimize grid accordingly
  const isLastPage = photoQueue.length <= (opt.grid || 6) * (opt.grid || 6);
  let grid = generateGrid(page, isLastPage ? photoQueue.length : null);

  // For last page, regenerate layout until we have enough blocks for remaining photos
  if (isLastPage) {
    let attempts = 0;
    const maxAttempts = 50; // Increased attempts for better matching

    // Keep regenerating until we have exactly the right number of blocks or at least enough
    while (attempts < maxAttempts) {
      const blocksNeeded = photoQueue.length;
      const blocksAvailable = grid.layoutBlocks.length;

      // Perfect match - we have exactly the number of blocks we need
      if (blocksAvailable === blocksNeeded) {
        break;
      }

      // Not enough blocks - need to regenerate with larger grid
      if (blocksAvailable < blocksNeeded) {
        attempts++;
        const currentGridSize = Math.max(grid.cols, grid.rows);
        const newGridSize = Math.min(currentGridSize + 1, 10); // Increased cap to 10x10

        // Temporarily override the grid size for this generation
        const originalGrid = opt.grid;
        opt.grid = newGridSize;
        grid = generateGrid(page, photoQueue.length);
        opt.grid = originalGrid; // Restore original
        continue;
      }

      // Too many blocks - try to regenerate with same size to get different layout
      if (blocksAvailable > blocksNeeded && attempts < 20) {
        attempts++;
        grid = generateGrid(page, photoQueue.length);
        continue;
      }

      // If we have more blocks than needed after many attempts, that's acceptable
      break;
    }
  }

  let photosOnPage = 0;

  // Fill the page with photos using the generated layout blocks
  const layoutBlocks = grid.layoutBlocks;
  const maxPhotosOnPage = Math.min(layoutBlocks.length, photoQueue.length);

  for (let blockIndex = 0; blockIndex < maxPhotosOnPage; blockIndex++) {
    const layoutBlock = layoutBlocks[blockIndex];

    // Select photo for this layout block using improved matching
    const selectedPhotoIndex = selectPhoto(photoQueue, layoutBlock);
    if (selectedPhotoIndex === -1) {
      continue;
    }

    const selectedPhoto = photoQueue[selectedPhotoIndex];

    // Render photo into the layout block
    await renderPhoto(page, selectedPhoto, layoutBlock);

    // Remove photo from queue
    photoQueue.splice(selectedPhotoIndex, 1);
    photosOnPage++;
  }

  // Show page completion with files used
  process.stdout.write(`\r✓ Page ${pageNumber}: ${photosOnPage} files, ${Math.round(((totalPhotos - photoQueue.length) / totalPhotos) * 100)}%`);

  // Handle output based on mode
  if (opt.json) {
    // JSON output mode
    layoutData.push({
      output: pageFile,
      files: page.files
    });
  } else {
    // Canvas rendering mode
    const renderOptions = {
      width: page.width,
      height: page.height,
      background: opt.bg,
      padding: parseInt(opt.padding || 0),
      borderWidth: parseInt(opt.borderWidth || 0),
      borderColor: opt.borderColor,
      format: 'jpg',
      quality: 92
    };

    await renderCollageToFile(page.files, renderOptions, pageFile);
    pages.push(pageFile);
  }
}

// Clear the page progress line
process.stdout.write(' '.repeat(50) + '\r');


// Save JSON layout if requested
if (opt.json) {
  const jsonFile = path.join(outDir, 'layout.json');
  await fsp.writeFile(jsonFile, JSON.stringify(layoutData, null, 2));
} else {
  pages.push(...layoutData.map(page => page.output));
}

/* ---------- optional PDF booklet ---------- */
if (opt.pdf && !opt.json) {
  const pdf = await PDFDocument.create();
  for (const imgPath of pages) {
    const bytes = await fsp.readFile(imgPath);
    const jpg = await pdf.embedJpg(bytes);
    const p = pdf.addPage([PAGE_W / opt.dpi * 72, PAGE_H / opt.dpi * 72]);
    p.drawImage(jpg, { x: 0, y: 0, width: p.getWidth(), height: p.getHeight() });
  }
  await fsp.writeFile(path.join(outDir, 'booklet.pdf'), await pdf.save());
}

console.log(`\n\n📁 Output: ${outDir}`);
if (opt.json) {
  console.log(`📄 JSON layout file created`);
} else {
  console.log(`📄 Pages created: ${pages.length}`);
}
console.log(`✅ Photos placed: ${totalPhotos}`);
