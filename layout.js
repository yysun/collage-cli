/**
 * @typedef {Object} LayoutBlock
 * @property {number} x
 * @property {number} y
 * @property {number} w
 * @property {number} h
 * @property {number} index
 */

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

  // More controlled shape placement to ensure multiple photos per page
  // Prioritize smaller shapes and limit large ones
  const smallShapes = [[1, 1], [2, 1], [1, 2]];
  const mediumShapes = [[2, 2]];
  const largeShapes = [[3, 1], [1, 3], [3, 2], [2, 3]];

  // First pass: try to place some medium shapes to create variety
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if (grid[y][x]) continue;

      // 30% chance to try a medium shape first
      if (Math.random() < 0.3) {
        for (let shape of shuffle(mediumShapes)) {
          const [w, h] = shape;
          if (canPlace(x, y, w, h)) {
            place(x, y, w, h);
            break;
          }
        }
      }
    }
  }

  // Second pass: fill remaining spaces with mostly small shapes
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if (grid[y][x]) continue;

      let placed = false;

      // 70% chance for small shapes, 20% for large, 10% skip for now
      const rand = Math.random();
      let shapesToTry = [];

      if (rand < 0.7) {
        shapesToTry = shuffle([...smallShapes]);
      } else if (rand < 0.9) {
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

      // Fallback: if nothing else fits, place a 1x1
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
