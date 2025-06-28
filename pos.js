/**
 * @typedef {Object} LayoutBlock
 * @property {number} x - Grid column position
 * @property {number} y - Grid row position  
 * @property {number} w - Width in grid cells
 * @property {number} h - Height in grid cells
 * @property {number} index - Block index
 */

/**
 * @typedef {Object} PositionResult
 * @property {number} x - Pixel x position on page
 * @property {number} y - Pixel y position on page
 * @property {number} width - Pixel width 
 * @property {number} height - Pixel height
 * @property {number} renderWidth - Actual render width (excluding padding)
 * @property {number} renderHeight - Actual render height (excluding padding)
 * @property {number} index - Block index from layout
 */

/**
 * @typedef {Object} GridConfig
 * @property {number} cols - Number of grid columns
 * @property {number} rows - Number of grid rows
 * @property {number} cellWidth - Width of each grid cell in pixels
 * @property {number} cellHeight - Height of each grid cell in pixels
 * @property {number} padding - Padding around each image in pixels
 * @property {number} bleed - Bleed margin in pixels (optional, defaults to 0)
 */

/**
 * Calculate expected pixel positions and dimensions for layout blocks
 * @param {LayoutBlock[]} layoutBlocks - Array of layout blocks from generateLayout
 * @param {GridConfig} gridConfig - Grid configuration object
 * @returns {PositionResult[]} Array of position results with pixel coordinates
 */
export function calculatePositions(layoutBlocks, gridConfig) {
  const {
    cols,
    rows,
    cellWidth,
    cellHeight,
    padding = 0,
    bleed = 0
  } = gridConfig;

  // Validate grid config
  if (!cellWidth || !cellHeight || !cols || !rows) {
    throw new Error('Invalid grid configuration: cellWidth, cellHeight, cols, and rows are required');
  }

  if (cellWidth <= 0 || cellHeight <= 0 || cols <= 0 || rows <= 0) {
    throw new Error('Grid dimensions must be positive numbers');
  }

  const positions = [];

  for (const block of layoutBlocks) {
    const { x: col, y: row, w: spanCols, h: spanRows, index } = block;

    // Validate block is within grid bounds
    if (col < 0 || row < 0 || col + spanCols > cols || row + spanRows > rows) {
      throw new Error(`Layout block ${index} is outside grid bounds: (${col},${row}) ${spanCols}×${spanRows} in ${cols}×${rows} grid`);
    }

    // Calculate actual render dimensions (excluding padding) - round to integers
    const renderWidth = Math.round(cellWidth * spanCols - padding * 2);
    const renderHeight = Math.round(cellHeight * spanRows - padding * 2);

    // Calculate position on page (including bleed offset) - round to integers
    const x = Math.round(col * cellWidth + padding + bleed);
    const y = Math.round(row * cellHeight + padding + bleed);

    // Calculate total dimensions (including padding) - round to integers
    const width = Math.round(cellWidth * spanCols);
    const height = Math.round(cellHeight * spanRows);

    // Validate dimensions are positive
    if (renderWidth <= 0 || renderHeight <= 0) {
      console.warn(`Block ${index} has invalid render dimensions: ${renderWidth}×${renderHeight} (cellSize: ${cellWidth}×${cellHeight}, span: ${spanCols}×${spanRows}, padding: ${padding})`);
    }

    positions.push({
      x,
      y,
      width,
      height,
      renderWidth,
      renderHeight,
      index
    });
  }

  return positions;
}

/**
 * Create grid configuration from page dimensions and grid size
 * @param {number} pageWidth - Page width in pixels
 * @param {number} pageHeight - Page height in pixels  
 * @param {number} gridCols - Number of grid columns
 * @param {number} gridRows - Number of grid rows
 * @param {number} padding - Padding around each image in pixels
 * @param {number} bleed - Bleed margin in pixels
 * @returns {GridConfig} Grid configuration object
 */
export function createGridConfig(pageWidth, pageHeight, gridCols, gridRows, padding = 0, bleed = 0) {
  // Calculate usable area (excluding bleed)
  const usableWidth = pageWidth - bleed * 2;
  const usableHeight = pageHeight - bleed * 2;

  // Calculate cell dimensions
  const cellWidth = Math.floor(usableWidth / gridCols);
  const cellHeight = Math.floor(usableHeight / gridRows);

  return {
    cols: gridCols,
    rows: gridRows,
    cellWidth,
    cellHeight,
    padding,
    bleed
  };
}

/**
 * Format position result for logging/debugging
 * @param {PositionResult} position - Position result object
 * @returns {string} Formatted string representation
 */
export function formatPosition(position) {
  const { x, y, width, height, renderWidth, renderHeight, index } = position;
  return `Block[${index}]: pos(${x},${y}) size(${width}×${height}) render(${renderWidth}×${renderHeight})`;
}
