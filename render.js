
/*  Collage Render Module - Reusable photo collage rendering
----------------------------------------------------------------*/
import sharp from 'sharp';
import fs from 'node:fs';
import fsp from 'node:fs/promises';

/**
 * @typedef {Object} PhotoPlacement
 * @property {string} input - Path to input photo file
 * @property {Buffer} [inputBuffer] - Pre-loaded image buffer for performance
 * @property {number} x - X position on canvas
 * @property {number} y - Y position on canvas
 * @property {number} w - Width of photo area
 * @property {number} h - Height of photo area
 * @property {boolean} [aspectMatch] - Whether photo and cell aspect ratios are close
 */

/**
 * @typedef {Object} RenderOptions
 * @property {number} width - Canvas width in pixels
 * @property {number} height - Canvas height in pixels
 * @property {string} background - Background color (hex, e.g., '#ffffff')
 * @property {number} padding - Padding between photos in pixels
 * @property {number} borderWidth - Border width around each photo in pixels
 * @property {string} borderColor - Border color (hex, e.g., '#000000')
 * @property {string} format - Output format ('jpeg' or 'png')
 * @property {number} quality - JPEG quality (1-100, ignored for PNG)
 */

/**
 * Render a collage from photo placements
 * @param {PhotoPlacement[]} photos - Array of photo placements
 * @param {RenderOptions} options - Render options
 * @returns {Promise<Buffer>} - Image buffer
 */
export async function renderCollage(photos, options) {
  const {
    width,
    height,
    background = '#ffffff',
    padding = 0,
    borderWidth = 0,
    borderColor = '#000000',
    format = 'jpeg',
    quality = 92
  } = options;

  const composites = [];

  // Process each photo
  for (let i = 0; i < photos.length; i++) {
    const photo = photos[i];
    const { input, inputBuffer, x, y, w, h, aspectMatch = false } = photo;

    try {
      // Use buffer if available, otherwise read from file
      let imageSource;
      if (inputBuffer) {
        imageSource = inputBuffer;
      } else {
        // Check if file exists
        if (!fs.existsSync(input)) {
          console.log(`  ❌ File not found: ${input}`);
          continue;
        }
        imageSource = input;
      }

      // Calculate photo area with padding - ensure integer values
      const photoX = Math.round(x + padding);
      const photoY = Math.round(y + padding);
      const photoWidth = Math.round(w - (padding * 2));
      const photoHeight = Math.round(h - (padding * 2));

      // Skip if area is too small after padding
      if (photoWidth <= 0 || photoHeight <= 0) {
        console.log(`  ⚠️  Photo area too small after padding: ${input}`);
        continue;
      }

      // Choose fit strategy based on aspect ratio matching
      const fitStrategy = aspectMatch ? 'contain' : 'cover';

      // Create the composite image
      let imageBuffer;

      if (borderWidth > 0) {
        // Create image with border
        const borderAreaWidth = Math.round(photoWidth + (borderWidth * 2));
        const borderAreaHeight = Math.round(photoHeight + (borderWidth * 2));

        // Create border background
        const borderBackground = await sharp({
          create: {
            width: borderAreaWidth,
            height: borderAreaHeight,
            channels: 3,
            background: borderColor
          }
        }).toBuffer();

        // Resize the photo with chosen fit strategy
        const resizedPhoto = await sharp(imageSource)
          .resize(photoWidth, photoHeight, {
            fit: fitStrategy,
            background: aspectMatch ? background : undefined
          })
          .toBuffer();

        // Composite photo on border background
        imageBuffer = await sharp(borderBackground)
          .composite([{
            input: resizedPhoto,
            top: Math.round(borderWidth),
            left: Math.round(borderWidth)
          }])
          .toBuffer();

        composites.push({
          input: imageBuffer,
          top: Math.round(photoY - borderWidth),
          left: Math.round(photoX - borderWidth)
        });
      } else {
        // No border - resize with chosen fit strategy
        imageBuffer = await sharp(imageSource)
          .resize(photoWidth, photoHeight, {
            fit: fitStrategy,
            background: aspectMatch ? background : undefined
          })
          .toBuffer();

        composites.push({
          input: imageBuffer,
          top: Math.round(photoY),
          left: Math.round(photoX)
        });
      }

      // console.log(`  ✅ ${i + 1}. ${input.split('/').pop()}: ${x},${y},${w},${h}`);

    } catch (error) {
      console.log(`  ❌ Error processing ${input}: ${error.message}`);
    }
  }

  // Create the final collage
  const collage = await sharp({
    create: {
      width,
      height,
      channels: 3,
      background
    }
  })
    .composite(composites);

  // Return buffer based on format
  if (format === 'png') {
    return await collage.png().toBuffer();
  } else {
    return await collage.jpeg({ quality }).toBuffer();
  }
}

/**
 * Render collage and save to file
 * @param {PhotoPlacement[]} photos - Array of photo placements  
 * @param {RenderOptions} options - Render options
 * @param {string} outputPath - Output file path
 */
export async function renderCollageToFile(photos, options, outputPath) {
  const buffer = await renderCollage(photos, options);
  await fsp.writeFile(outputPath, buffer);
}

/**
 * Render from JSON layout file
 * @param {string} jsonPath - Path to JSON layout file
 * @param {RenderOptions} options - Render options
 * @param {string} outputDir - Output directory
 */
export async function renderFromJSON(jsonPath, options, outputDir) {
  // Load JSON layout
  const layoutData = JSON.parse(await fsp.readFile(jsonPath, 'utf8'));

  if (!Array.isArray(layoutData) || layoutData.length === 0) {
    throw new Error('Invalid JSON format: expected array of page objects');
  }

  // Create output directory
  await fsp.mkdir(outputDir, { recursive: true });
  // Render each page
  for (let pageIndex = 0; pageIndex < layoutData.length; pageIndex++) {
    const pageData = layoutData[pageIndex];
    const { files } = pageData;

    if (!files || files.length === 0) {
      console.log(`⚠️  Page ${pageIndex + 1}: No files to render`);
      continue;
    }

    // Calculate page dimensions from layout
    let maxX = 0, maxY = 0;
    for (const file of files) {
      maxX = Math.max(maxX, file.x + file.w);
      maxY = Math.max(maxY, file.y + file.h);
    }

    const pageOptions = {
      ...options,
      width: maxX,
      height: maxY
    };

    // console.log(`🖼️  Page ${pageIndex + 1}: ${maxX}×${maxY}px with ${files.length} photos`);

    // Generate output filename
    const outputExtension = options.format === 'png' ? 'png' : 'jpg';
    const outputFilename = `page-${pageIndex + 1}.${outputExtension}`;
    const outputPath = `${outputDir}/${outputFilename}`;

    // Render the page
    await renderCollageToFile(files, pageOptions, outputPath);
    // console.log(`  💾 Saved: ${outputFilename}\n`);
  }

  // console.log(`✅ Rendering complete!`);
  // console.log(`📁 Output: ${outputDir}`);
}
