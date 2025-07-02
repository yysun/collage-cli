# Requirements: Page-Based Loop Implementation

## Overview
Transform the collage-cli main processing loop from photo-centric to page-centric approach. Currently, the system processes photos one by one and places them on pages. The new approach should create pages first, then fill them with optimal photo selections.

## Current State Analysis
The existing implementation in `index.js` already has elements of page-based processing:
- Creates pages with `createPage()`
- Generates layouts with `generateGrid()`  
- Selects photos with `selectPhoto()`
- Renders photos with `renderPhoto()`

However, the main loop still iterates through a photo queue rather than focusing on page creation and optimization.

## Requirements

### 1. Page Creation Process
**What:** Create a new page structure that can accommodate photos efficiently
- **Input:** Photo queue with remaining photos
- **Output:** Page object with layout grid ready for photo placement
- **Behavior:** 
  - Check quantity of photos remaining in queue
  - Generate layout that can accommodate available photos optimally
  - Validate layout meets aspect ratio requirements
  - Ensure number of layout blocks ≤ photos in queue

### 2. Layout Generation and Validation
**What:** Generate optimal grid layouts with photo-friendly aspect ratios
- **Constraints:** Only allow specific aspect ratios (1:1, 1:2, 2:1, 2:3, 3:2, 3:4, 4:3)
- **Validation Rules:**
  - All layout blocks must have acceptable aspect ratios
  - Number of blocks must not exceed available photos
  - Layout should be aesthetically pleasing and varied
- **Retry Logic:** If invalid layout generated, retry up to 100 times until valid layout found
- **Fallback:** If no valid layout found after maximum attempts, use simple grid layout
- **Layout Quality Metrics:**
  - Minimum 3 different block sizes per page (when possible)
  - Maximum 40% of blocks can be 1x1 size
  - At least 1 block larger than 2x2 per page (when grid size allows)

### 3. Photo Selection and Assignment
**What:** Select optimal photos from queue for each layout block
- **Input:** Photo queue, layout blocks for current page
- **Selection Criteria with Weights:**
  - Aspect ratio compatibility: 40% weight
  - Photo importance level: 30% weight
  - Orientation matching: 20% weight
  - Visual harmony considerations: 10% weight
- **Tie-breaking:** Use random selection when scores are equal
- **Output:** Photos assigned to layout positions, photos removed from queue

### 4. Page Completion
**What:** Complete page rendering once all layout blocks are filled
- **Actions:**
  - Render all assigned photos to their positions
  - Generate page image or JSON layout data
  - Update progress tracking
  - Prepare for next page creation

### 5. Loop Termination
**What:** Complete processing when photo queue is empty
- **Condition:** No photos remaining in queue
- **Final Actions:**
  - Complete any pending page renders
  - Generate PDF booklet if requested
  - Report final statistics

### 6. Edge Case Management
**What:** Handle special scenarios gracefully
- **Single Photo Remaining:** Create 1x1 layout grid
- **Photos < Minimum Grid:** Dynamically reduce grid size to match photo count
- **All Photos Same Orientation:** Adjust layout generation to favor matching blocks
- **Memory Constraints:** Process photos in batches if memory usage exceeds limits

## Quality Requirements

### Performance
- Layout generation should complete within reasonable time (< 2 seconds per page)
- Photo selection algorithm should be efficient for large photo collections
- Memory usage should remain stable across multiple pages
- Maximum 100 retry attempts for layout generation

### Memory Management
- Reuse photo buffers across pages to minimize memory allocation
- Clear processed photo metadata after successful assignment
- Implement batching for collections exceeding 1000 photos

### Layout Quality
- Generated layouts should be visually appealing and varied
- Aspect ratio constraints must be strictly enforced
- Important photos should receive prominent placement
- Measurable quality criteria as defined in Layout Generation section

### Reliability
- System should handle edge cases (odd numbers of photos, small queues)
- Validation should prevent invalid layouts from being processed
- Error handling should allow graceful degradation with defined fallback strategies

### Error Recovery Strategies
- **Layout Generation Failure:** Fall back to simple uniform grid
- **Photo Processing Error:** Skip problematic photo and continue processing
- **Memory Exhaustion:** Process remaining photos in smaller batches
- **Aspect Ratio Validation Failure:** Use closest acceptable ratio

## Success Criteria
1. Main loop processes pages instead of individual photos
2. Each page is optimally filled based on available photos
3. Layout validation ensures only acceptable aspect ratios
4. Photo selection considers multiple quality factors with defined weights
5. System terminates cleanly when queue is empty
6. Generated collages maintain visual quality standards
7. Edge cases are handled gracefully without system failure
8. Performance meets specified time and memory constraints
9. Error recovery mechanisms prevent data loss

## Dependencies
- Existing `layout.js` module for layout generation
- Existing `pos.js` module for position calculations
- Existing `render.js` module for image rendering
- Current photo analysis and queue management systems

## Non-Requirements
- Changing existing aspect ratio constraints
- Modifying photo analysis algorithms
- Altering rendering output formats
- Changing CLI interface or options
