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
import { generateLayout, validateLayout, generateLayoutWithValidation } from './layout.js';
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

// Memory constraint detection
const checkMemoryConstraints = () => {
  const memUsage = process.memoryUsage();
  const heapUsedMB = memUsage.heapUsed / 1024 / 1024;
  const heapTotalMB = memUsage.heapTotal / 1024 / 1024;

  return {
    heapUsedMB: heapUsedMB,
    heapTotalMB: heapTotalMB,
    heapUtilization: heapUsedMB / heapTotalMB,
    needsBatching: heapUsedMB > 512 || heapTotalMB > 1024 // Conservative thresholds
  };
};

// Create a new page structure
const createPage = () => {
  return {
    width: PAGE_W,
    height: PAGE_H,
    files: [] // Array to store file layout data
  };
};

// Edge case detection and handling
const detectEdgeCase = (photoQueue, currentGrid) => {
  if (photoQueue.length === 0) return 'NO_PHOTOS';
  if (photoQueue.length === 1) return 'SINGLE_PHOTO';
  if (photoQueue.length < (currentGrid?.layoutBlocks?.length || 9)) return 'INSUFFICIENT_PHOTOS';

  // Check for orientation bias
  const landscapes = photoQueue.filter(p => (p.w / p.h) > 1.1).length;
  const portraits = photoQueue.filter(p => (p.w / p.h) < 0.9).length;
  const total = photoQueue.length;

  if (landscapes / total > 0.8) return 'ALL_LANDSCAPE';
  if (portraits / total > 0.8) return 'ALL_PORTRAIT';

  return 'NORMAL';
};

const handleEdgeCase = (edgeCase, photoQueue, opt) => {
  switch (edgeCase) {
    case 'SINGLE_PHOTO':
      return {
        gridSize: 1,
        specialHandling: 'single_photo',
        message: 'Creating 1x1 layout for single photo'
      };

    case 'INSUFFICIENT_PHOTOS':
      const optimalSize = Math.ceil(Math.sqrt(photoQueue.length));
      return {
        gridSize: Math.max(1, optimalSize),
        specialHandling: 'reduced_grid',
        message: `Reducing grid size to ${optimalSize}x${optimalSize} for ${photoQueue.length} photos`
      };

    case 'ALL_LANDSCAPE':
      return {
        gridSize: opt.grid,
        specialHandling: 'landscape_bias',
        message: 'Adjusting layout generation for landscape-heavy collection'
      };

    case 'ALL_PORTRAIT':
      return {
        gridSize: opt.grid,
        specialHandling: 'portrait_bias',
        message: 'Adjusting layout generation for portrait-heavy collection'
      };

    case 'NO_PHOTOS':
      throw new Error('No photos available for processing');

    default:
      return {
        gridSize: opt.grid,
        specialHandling: 'normal',
        message: null
      };
  }
};

// Calculate average hue for harmony scoring
const calculateAverageHue = (photos) => {
  if (!photos.length) return undefined;

  const validHues = photos.filter(p => p.hue !== undefined).map(p => p.hue);
  if (validHues.length === 0) return undefined;

  return validHues.reduce((sum, hue) => sum + hue, 0) / validHues.length;
};

// Generate a layout for the page using enhanced validation
const generateGrid = (page, photosRemaining = null) => {
  // Detect edge cases first
  const edgeCase = detectEdgeCase(photoQueue, null);
  const edgeHandling = handleEdgeCase(edgeCase, photoQueue, opt);

  // if (edgeHandling.message) {
  //   console.log(`  ℹ️  ${edgeHandling.message}`);
  // }

  // Use grid parameter from CLI, with edge case adjustments
  let gridSize = edgeHandling.gridSize || opt.grid || 6;
  let gridCols = gridSize;
  let gridRows = gridSize;

  // For the last page, optimize grid size to match remaining photos
  if (photosRemaining !== null && photosRemaining > 0) {
    const minGridSize = Math.ceil(Math.sqrt(photosRemaining));

    if (photosRemaining <= 4) {
      gridCols = gridRows = Math.max(2, minGridSize);
    } else if (photosRemaining <= 9) {
      gridCols = gridRows = Math.max(3, minGridSize);
    } else if (photosRemaining <= 16) {
      gridCols = gridRows = Math.max(4, minGridSize);
    } else if (photosRemaining <= 25) {
      gridCols = gridRows = Math.max(5, minGridSize);
    } else {
      gridCols = gridRows = gridSize;
    }
  }

  // Set up validation constraints
  const constraints = {
    minBlockVariety: 3,
    maxSingleCellPercent: 0.4,
    minLargeBlocks: 1,
    photoCount: photosRemaining,
    specialHandling: edgeHandling.specialHandling
  };

  // Adjust constraints for edge cases
  if (edgeHandling.specialHandling === 'single_photo') {
    constraints.minBlockVariety = 1;
    constraints.maxSingleCellPercent = 1.0;
    constraints.minLargeBlocks = 0;
  } else if (edgeHandling.specialHandling === 'reduced_grid') {
    constraints.minBlockVariety = Math.min(3, photosRemaining);
    constraints.minLargeBlocks = photosRemaining > 2 ? 1 : 0;
  }

  // Generate validated layout
  const layoutBlocks = generateLayoutWithValidation(gridRows, gridCols, constraints, 100);

  // Create grid configuration using pos.js
  const gridConfig = createGridConfig(
    PAGE_W,
    PAGE_H,
    gridCols,
    gridRows,
    Math.min(Number(opt.border) || 4, 8),
    BLEED
  );

  // Calculate positions for all layout blocks
  const positions = calculatePositions(layoutBlocks, gridConfig);

  const grid = {
    ...gridConfig,
    layoutBlocks,
    positions,
    validation: validateLayout(layoutBlocks, constraints),
    edgeCase: edgeCase,
    specialHandling: edgeHandling.specialHandling
  };

  page.grid = grid;
  return grid;
};


// Enhanced photo selection with weighted scoring system
const selectPhoto = (photoQueue, layoutBlock, pageContext = {}) => {
  const { w: spanCols, h: spanRows } = layoutBlock;
  const layoutAspect = spanCols / spanRows;
  let bestIndex = -1;
  let bestScore = -1;

  for (let i = 0; i < photoQueue.length; i++) {
    const photo = photoQueue[i];
    const score = calculatePhotoScore(photo, layoutBlock, pageContext);

    if (score > bestScore) {
      bestScore = score;
      bestIndex = i;
    }
  }

  // Handle tie-breaking with random selection
  if (bestScore > 0) {
    // Find all photos with similar scores (within 5% of best)
    const similarScoreIndices = [];
    const threshold = bestScore * 0.95;

    for (let i = 0; i < photoQueue.length; i++) {
      const score = calculatePhotoScore(photoQueue[i], layoutBlock, pageContext);
      if (score >= threshold) {
        similarScoreIndices.push(i);
      }
    }

    if (similarScoreIndices.length > 1) {
      bestIndex = similarScoreIndices[Math.floor(Math.random() * similarScoreIndices.length)];
    }
  }

  return bestIndex;
};

// Calculate weighted photo score based on multiple criteria
const calculatePhotoScore = (photo, layoutBlock, pageContext) => {
  const { w: spanCols, h: spanRows } = layoutBlock;

  // Calculate individual scores
  const aspectScore = calculateAspectCompatibility(photo, layoutBlock);
  const importanceScore = calculateImportanceMatch(photo, layoutBlock);
  const orientationScore = calculateOrientationMatch(photo, layoutBlock);
  const harmonyScore = calculateHarmonyScore(photo, pageContext);

  // Apply weights (40%, 30%, 20%, 10%)
  return (aspectScore * 0.4) + (importanceScore * 0.3) + (orientationScore * 0.2) + (harmonyScore * 0.1);
};

// Calculate aspect ratio compatibility score
const calculateAspectCompatibility = (photo, layoutBlock) => {
  const photoAspect = photo.w / photo.h;
  const layoutAspect = layoutBlock.w / layoutBlock.h;
  const aspectDiff = Math.abs(layoutAspect - photoAspect);

  // Score decreases as aspect difference increases
  return Math.max(0, 100 - (aspectDiff * 50));
};

// Calculate importance level matching score
const calculateImportanceMatch = (photo, layoutBlock) => {
  const layoutSize = layoutBlock.w * layoutBlock.h;
  const importance = photo.importance || 0;

  // High importance photos should get large layouts
  if (importance >= 3 && layoutSize >= 4) {
    return 100;
  }
  // Low importance photos fit well in small layouts
  if (importance <= 1 && layoutSize <= 2) {
    return 90;
  }
  // Medium importance photos work well in medium layouts
  if (importance >= 2 && layoutSize >= 2 && layoutSize <= 4) {
    return 80;
  }
  // Very large layouts should prioritize high importance
  if (layoutSize >= 6) {
    return importance >= 4 ? 100 : Math.max(0, 60 - (4 - importance) * 15);
  }

  // Default scoring based on size-importance correlation
  const sizeImportanceMatch = Math.abs(layoutSize - importance);
  return Math.max(30, 70 - sizeImportanceMatch * 10);
};

// Calculate orientation matching score
const calculateOrientationMatch = (photo, layoutBlock) => {
  const photoAspect = photo.w / photo.h;
  const layoutAspect = layoutBlock.w / layoutBlock.h;

  const isPhotoLandscape = photoAspect > 1.1;
  const isPhotoPortrait = photoAspect < 0.9;
  const isPhotoSquare = photoAspect >= 0.9 && photoAspect <= 1.1;

  const isLayoutLandscape = layoutAspect > 1.1;
  const isLayoutPortrait = layoutAspect < 0.9;
  const isLayoutSquare = layoutAspect >= 0.9 && layoutAspect <= 1.1;

  // Perfect orientation matches
  if (isPhotoSquare && isLayoutSquare) return 100;
  if (isPhotoLandscape && isLayoutLandscape) return 90;
  if (isPhotoPortrait && isLayoutPortrait) return 90;

  // Acceptable matches
  if (isPhotoSquare && !isLayoutSquare) return 70;
  if (!isPhotoSquare && isLayoutSquare) return 60;

  // Poor matches
  return 30;
};

// Calculate visual harmony score
const calculateHarmonyScore = (photo, pageContext) => {
  // Base harmony score
  let score = 50;

  // If harmony is enabled, use hue information
  if (opt.harmony && photo.hue !== undefined) {
    const photoHue = photo.hue;

    // If we have context about other photos on the page, calculate harmony
    if (pageContext.averageHue !== undefined) {
      const hueDiff = Math.abs(photoHue - pageContext.averageHue);
      const normalizedDiff = Math.min(hueDiff, 360 - hueDiff); // Handle hue wrap-around

      // Closer hues get higher scores
      score = Math.max(20, 100 - (normalizedDiff / 180) * 80);
    }
  }

  return score;
};

// Render a photo into the specified layout block
const renderPhoto = async (page, photo, layoutBlock, totalPhotosOnPage) => {
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

  // Check if this is a single photo page (one photo per page)
  const isSinglePhotoPage = totalPhotosOnPage === 1;

  // Check if aspect ratios are close (within 50% difference)
  const aspectDifference = Math.abs(photoAspectRatio - cellAspectRatio) / cellAspectRatio;

  // Force aspect match for single photo pages or when ratios are close
  const aspectMatch = isSinglePhotoPage || aspectDifference <= 0.5;

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

// Main page-centric processing loop
while (photoQueue.length > 0) {
  pageNumber++;
  const startTime = Date.now();
  const totalProcessed = totalPhotos - photoQueue.length;
  const progress = Math.round((totalProcessed / totalPhotos) * 100);

  // Check memory constraints
  const memCheck = checkMemoryConstraints();
  if (memCheck.needsBatching && photoQueue.length > 100) {
    console.log(`  ⚠️  High memory usage detected (${memCheck.heapUsedMB.toFixed(1)}MB), consider processing in smaller batches`);
  }

  // 2. Create a new page with intelligent planning
  // console.log(`📄 Creating page ${pageNumber} (${photoQueue.length} photos remaining)`);
  const page = createPage();
  const pageFile = path.join(outDir, `page-${pageNumber}.jpg`);

  // 3. Generate smart grid layout for this page
  let grid;
  try {
    grid = generateGrid(page, photoQueue.length);

    // Log validation results
    if (grid.validation) {
      const v = grid.validation;
      // if (v.isValid) {
      //   console.log(`  ✅ Layout validated (score: ${v.score})`);
      // } else {
      //   console.log(`  ⚠️  Layout validation issues: ${v.issues.join(', ')}`);
      // }
    }
  } catch (error) {
    console.log(`  ❌ Grid generation failed: ${error.message}`);
    // Create emergency fallback
    grid = {
      layoutBlocks: [{ x: 0, y: 0, w: 1, h: 1, index: 0 }],
      positions: [{ x: 0, y: 0, width: PAGE_W, height: PAGE_H, renderWidth: PAGE_W, renderHeight: PAGE_H, index: 0 }]
    };
  }

  let photosOnPage = 0;
  const layoutBlocks = grid.layoutBlocks || [];
  const maxPhotosOnPage = Math.min(layoutBlocks.length, photoQueue.length);

  // 4. Smart photo assignment using enhanced selection
  const pageContext = {
    pageNumber: pageNumber,
    totalPages: Math.ceil(totalPhotos / (opt.grid * opt.grid)),
    photosRemaining: photoQueue.length,
    averageHue: opt.harmony ? calculateAverageHue(photoQueue.slice(0, maxPhotosOnPage)) : undefined
  };

  for (let blockIndex = 0; blockIndex < maxPhotosOnPage; blockIndex++) {
    const layoutBlock = layoutBlocks[blockIndex];

    try {
      // Enhanced photo selection with weighted scoring
      const selectedPhotoIndex = selectPhoto(photoQueue, layoutBlock, pageContext);
      if (selectedPhotoIndex === -1) {
        console.log(`  ⚠️  No suitable photo found for block ${blockIndex}`);
        continue;
      }

      const selectedPhoto = photoQueue[selectedPhotoIndex];

      // Render photo into the layout block
      await renderPhoto(page, selectedPhoto, layoutBlock, maxPhotosOnPage);

      // Remove photo from queue
      photoQueue.splice(selectedPhotoIndex, 1);
      photosOnPage++;

    } catch (error) {
      console.log(`  ❌ Error processing block ${blockIndex}: ${error.message}`);
      // Continue with next block
    }
  }

  // 5. Page completion and validation
  const pageTime = Date.now() - startTime;
  const timePerPhoto = photosOnPage > 0 ? (pageTime / photosOnPage).toFixed(0) : 0;

  process.stdout.write(`\r✓ Page ${pageNumber}: ${photosOnPage} photos (${timePerPhoto}ms/photo), ${Math.round(((totalPhotos - photoQueue.length) / totalPhotos) * 100)}%`);

  // Performance validation
  if (pageTime > 2000) {
    console.log(`\n  ⚠️  Page generation took ${(pageTime / 1000).toFixed(1)}s (target: <2s)`);
  }

  // Handle output based on mode
  if (opt.json) {
    // JSON output mode
    layoutData.push({
      output: pageFile,
      files: page.files,
      metadata: {
        pageNumber: pageNumber,
        photosPlaced: photosOnPage,
        processingTime: pageTime,
        validation: grid.validation,
        edgeCase: grid.edgeCase
      }
    });
  } else {
    // Canvas rendering mode
    try {
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
    } catch (error) {
      console.log(`\n  ❌ Error rendering page ${pageNumber}: ${error.message}`);
    }
  }

  // Check for termination condition
  if (photoQueue.length === 0) {
    console.log(`\n  ✅ All photos processed successfully`);
    break;
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
