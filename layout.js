/**
 * @typedef {Object} LayoutBlock
 * @property {number} x
 * @property {number} y
 * @property {number} w
 * @property {number} h
 * @property {number} index
 */

/**
 * @typedef {Object} ValidationResult
 * @property {boolean} isValid
 * @property {number} score
 * @property {string[]} issues
 * @property {Object} metrics
 */

/**
 * Validate layout blocks against aspect ratio and quality requirements
 * @param {LayoutBlock[]} layoutBlocks - Array of layout blocks to validate
 * @param {Object} constraints - Validation constraints
 * @returns {ValidationResult} Validation result with score and issues
 */
export function validateLayout(layoutBlocks, constraints = {}) {
  const allowedRatios = [1 / 1, 2 / 3, 3 / 2, 3 / 4, 4 / 3];
  const tolerance = 0.01;
  const issues = [];
  let score = 100;

  // Validate aspect ratios
  let invalidAspectCount = 0;
  for (const block of layoutBlocks) {
    const blockAspectRatio = block.w / block.h;
    const isValidRatio = allowedRatios.some(ratio =>
      Math.abs(blockAspectRatio - ratio) <= tolerance
    );

    if (!isValidRatio) {
      invalidAspectCount++;
      issues.push(`Block ${block.index} has invalid aspect ratio: ${blockAspectRatio.toFixed(2)}`);
    }
  }

  if (invalidAspectCount > 0) {
    score -= invalidAspectCount * 20; // Penalty for invalid aspect ratios
  }

  // Calculate quality metrics
  const blockSizes = layoutBlocks.map(block => block.w * block.h);
  const uniqueSizes = new Set(blockSizes);
  const oneByOneCount = layoutBlocks.filter(block => block.w === 1 && block.h === 1).length;
  const largeBlocKCount = layoutBlocks.filter(block => block.w > 2 || block.h > 2).length;

  const oneByOnePercent = oneByOneCount / layoutBlocks.length;
  const minBlockVariety = constraints.minBlockVariety || 3;
  const maxSingleCellPercent = constraints.maxSingleCellPercent || 0.4;
  const minLargeBlocks = constraints.minLargeBlocks || 1;

  // Validate quality metrics
  if (uniqueSizes.size < minBlockVariety && layoutBlocks.length >= minBlockVariety) {
    issues.push(`Insufficient block variety: ${uniqueSizes.size} < ${minBlockVariety}`);
    score -= 15;
  }

  if (oneByOnePercent > maxSingleCellPercent) {
    issues.push(`Too many 1x1 blocks: ${(oneByOnePercent * 100).toFixed(1)}% > ${maxSingleCellPercent * 100}%`);
    score -= 10;
  }

  if (largeBlocKCount < minLargeBlocks && layoutBlocks.length >= 4) {
    issues.push(`Insufficient large blocks: ${largeBlocKCount} < ${minLargeBlocks}`);
    score -= 10;
  }

  const metrics = {
    blockCount: layoutBlocks.length,
    uniqueSizes: uniqueSizes.size,
    oneByOnePercent: oneByOnePercent,
    largeBlocKCount: largeBlocKCount,
    invalidAspectCount: invalidAspectCount
  };

  const isValid = invalidAspectCount === 0 && score >= 70; // Minimum score threshold

  return {
    isValid,
    score: Math.max(0, score),
    issues,
    metrics
  };
}

/**
 * Generate layout with validation and retry logic
 * @param {number} rows - Grid rows
 * @param {number} cols - Grid columns
 * @param {Object} constraints - Layout constraints
 * @param {number} maxAttempts - Maximum retry attempts
 * @returns {LayoutBlock[]} Validated layout blocks
 */
export function generateLayoutWithValidation(rows, cols, constraints = {}, maxAttempts = 100) {
  let bestLayout = null;
  let bestScore = -1;
  let attempts = 0;

  while (attempts < maxAttempts) {
    const layout = generateLayout(rows, cols);
    const validation = validateLayout(layout, constraints);

    if (validation.isValid) {
      return layout; // Return first valid layout
    }

    if (validation.score > bestScore) {
      bestLayout = layout;
      bestScore = validation.score;
    }

    attempts++;
  }

  // If no valid layout found, return best attempt or create fallback
  if (bestLayout && bestScore > 50) {
    return bestLayout;
  }

  // Create simple fallback grid layout
  return createFallbackLayout(rows, cols);
}

/**
 * Create a simple uniform grid as fallback
 * @param {number} rows - Grid rows
 * @param {number} cols - Grid columns
 * @returns {LayoutBlock[]} Simple grid layout
 */
function createFallbackLayout(rows, cols) {
  const blocks = [];
  let index = 0;

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      blocks.push({ x, y, w: 1, h: 1, index: index++ });
    }
  }

  return blocks;
}

export function generateLayout(rows, cols) {
  const grid = Array.from({ length: rows }, () =>
    Array(cols).fill(false)
  );

  const blocks = [];
  let index = 0;

  function canPlace(x, y, w, h) {
    if (x + w > cols || y + h > rows) return false;
    for (let dy = 0; dy < h; dy++) {
      for (let dx = 0; dx < w; dx++) {
        if (grid[y + dy][x + dx]) return false;
      }
    }
    return true;
  }

  function place(x, y, w, h) {
    for (let dy = 0; dy < h; dy++) {
      for (let dx = 0; dx < w; dx++) {
        grid[y + dy][x + dx] = true;
      }
    }
    blocks.push({ x, y, w, h, index: index++ });
  }

  // Constrained shape placement to enforce specific aspect ratios only
  // Allowed aspect ratios: 1:1, 1:2, 2:1, 2:3, 3:2, 3:4, 4:3
  const allowedShapes = [
    [1, 1],   // 1:1 ratio
    [1, 2],   // 1:2 ratio
    [2, 1],   // 2:1 ratio
    [2, 2],   // 1:1 ratio (larger)
    [2, 3],   // 2:3 ratio
    [3, 2],   // 3:2 ratio
    [3, 4],   // 3:4 ratio
    [4, 3]    // 4:3 ratio
  ];

  // Categorize shapes by size for better placement strategy
  const smallShapes = [[1, 1], [1, 2], [2, 1]];
  const mediumShapes = [[2, 2], [2, 3], [3, 2]];
  const largeShapes = [[3, 4], [4, 3]];

  // First pass: try to place some medium and large shapes for variety
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if (grid[y][x]) continue;

      // 25% chance to try a large shape, 35% for medium shape
      const rand = Math.random();
      let shapesToTry = [];

      if (rand < 0.25 && (rows >= 4 && cols >= 4)) {
        // Only try large shapes if grid is big enough
        shapesToTry = shuffle([...largeShapes]);
      } else if (rand < 0.6) {
        shapesToTry = shuffle([...mediumShapes]);
      }

      for (let shape of shapesToTry) {
        const [w, h] = shape;
        if (canPlace(x, y, w, h)) {
          place(x, y, w, h);
          break;
        }
      }
    }
  }

  // Second pass: fill remaining spaces with small and medium shapes
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if (grid[y][x]) continue;

      let placed = false;

      // Try shapes in order of preference: small (60%), medium (30%), large (10%)
      const rand = Math.random();
      let shapesToTry = [];

      if (rand < 0.6) {
        shapesToTry = shuffle([...smallShapes]);
      } else if (rand < 0.9) {
        shapesToTry = shuffle([...mediumShapes]);
      } else {
        shapesToTry = shuffle([...largeShapes]);
      }

      for (let shape of shapesToTry) {
        const [w, h] = shape;
        if (canPlace(x, y, w, h)) {
          place(x, y, w, h);
          placed = true;
          break;
        }
      }

      // Fallback: try any allowed shape that fits
      if (!placed) {
        for (let shape of shuffle([...allowedShapes])) {
          const [w, h] = shape;
          if (canPlace(x, y, w, h)) {
            place(x, y, w, h);
            placed = true;
            break;
          }
        }
      }

      // Final fallback: place a 1x1 (which has 1:1 ratio)
      if (!placed) {
        place(x, y, 1, 1);
      }
    }
  }

  // Third pass: fill any remaining empty cells with 1x1
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if (!grid[y][x]) {
        place(x, y, 1, 1);
      }
    }
  }

  return blocks;
}

// Helper to randomize shape order
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
