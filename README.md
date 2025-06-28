# Collage CLI

A powerful command-line tool for creating beautiful photo collages with smart layout, color harmony, and professional print output with bleed and crop marks.

## Features

- **Smart Layout**: Automatic photo arrangement based on orientation and importance
- **Aspect Ratio Optimization**: Intelligent layout generation that prevents extreme photo distortion
- **Adaptive Photo Fitting**: Shows full photos when aspect ratios match, crops when they don't
- **Color Harmony**: Sort photos by dominant hue for visually pleasing arrangements
- **Date Sorting**: Sort photos by date (oldest first or newest first)
- **Professional Print**: Add bleed and crop marks for print-ready output
- **PDF Generation**: Create multi-page PDF booklets
- **JSON Export**: Export layout data for external processing
- **Flexible Layout**: Intelligent last-page optimization to use full space
- **Auto-scaling**: Photos automatically scale to fit their assigned layout spaces
- **Multi-page Output**: Automatically generates as many pages as needed for all photos

## Installation

### For Development

1. Clone the repository and install dependencies:
```bash
git clone <repository-url>
cd collage-cli
npm install
```

2. Link the package globally for development:
```bash
npm link
```

This creates a global symlink to your local development version, allowing you to use the `collage` command anywhere on your system while making changes to the code.

### For Production

```bash
npm install -g collage-cli
```

## Usage

### Basic Usage

```bash
collage -i /path/to/photos
```

### Advanced Examples

Create a 24x36 inch collage with color harmony:
```bash
collage -i ./photos -o ./output --size 24x36in --harmony
```

Create print-ready collages with bleed and crop marks:
```bash
collage -i ./photos --bleed 3mm --pdf --dpi 300
```

Sort photos by date (newest first) with custom grid:
```bash
collage -i ./photos --dateSort desc --grid 5
```

Generate JSON layout for external processing:
```bash
collage -i ./photos --json --grid 4
```

Create collages with padding and borders:
```bash
collage -i ./photos --padding 10 --borderWidth 5 --borderColor "#333333"
```

## Command Line Options

| Option | Description | Default |
|--------|-------------|---------|
| `-i, --input <dir>` | Input directory containing photos | **Required** |
| `-o, --output <dir>` | Output directory | `./out` |
| `-s, --size <WxH>` | Page size (e.g., 24x36in, 300x400mm, 1920x1080px) | `24x36in` |
| `--dpi <n>` | Resolution in DPI | `300` |
| `--bg <hex>` | Background color | `#ffffff` |
| `--border <px>` | Border width in pixels | `0` |
| `--borderColor <hex>` | Border color | `#ffffff` |
| `-g, --grid <n>` | Grid size for photo placement | `3` |
| `--harmony` | Sort photos by dominant color hue | `false` |
| `--dateSort <order>` | Sort by date: `asc` (oldest first) or `desc` (newest first) | `asc` |
| `--bleed <size>` | Add bleed and crop marks (e.g., 3mm, 0.125in) | `none` |
| `--pdf` | Generate PDF booklet | `false` |
| `--json` | Output JSON layout files instead of rendering images | `false` |
| `--padding <n>` | Padding between photos in pixels | `0` |
| `--borderWidth <n>` | Border width around photos in pixels | `0` |

## Photo Importance System

Photos can be tagged with importance levels by including `imp1` through `imp5` in the filename:
- `vacation-imp3.jpg` - Medium importance (3/5)
- `portrait-imp5.jpg` - High importance (5/5)

Higher importance photos get larger grid spaces in the collage.

## Requirements

- Node.js 18 or higher
- Images in JPG, JPEG, or PNG format

## Dependencies

- **Sharp**: High-performance image processing and scaling
- **Node Vibrant**: Color palette extraction for harmony sorting
- **PDF-lib**: PDF generation for booklets
- **Commander**: CLI argument parsing
- **Fast-glob**: Efficient file pattern matching

## File Structure

```
collage-cli/
├── index.js          # Main CLI application
├── package.json      # Project configuration
├── README.md         # This file
└── photos/           # Sample photos for testing
```

## Output

The tool generates:
- Individual page images (JPEG format)
- Optional PDF booklet combining all pages
- Optional JSON layout files for external processing
- Organized output in timestamped directories
- Clean progress reporting during generation

Example output:
```
📸 Found 46 image files to process...

📖 Reading 46 out of 46 files... (100%)
✓ 46 photos loaded into queue

📁 Output: /path/to/output/collage-2025-06-28T10-30-45-123Z
📄 Pages created: 2
📸 Photos placed: 46
```

Example output structure:
```
out/
└── collage-2025-06-28T10-30-45-123Z/
    ├── page-1.jpg
    ├── page-2.jpg
    └── booklet.pdf
```

## Photo Scaling and Layout

### Aspect Ratio Optimization

The tool automatically optimizes layouts to prevent photos from being distorted:

- **Layout Generation**: Rejects layouts with extreme aspect ratios (blocks taller than 3:5 or wider than 5:2)
- **Photo-Friendly Blocks**: Ensures most layout blocks have reasonable proportions for photos
- **Smart Validation**: Accepts layouts only when less than 20% of blocks have extreme ratios

### Adaptive Photo Fitting

Photos are intelligently fitted based on aspect ratio compatibility:

- **Aspect Match (≤15% difference)**: Uses `fit: contain` to show the complete photo
  - Example: 4:3 photo in 4:3 cell shows the entire image
  - May have small letterboxing with background color
  - No cropping - preserves the full composition

- **Aspect Mismatch (>15% difference)**: Uses `fit: cover` to fill the cell
  - Example: Portrait photo in landscape cell crops to prevent distortion
  - Ensures no empty space in cells
  - Centers the crop for best composition

### Layout Features

- **Aspect Ratio Preservation**: Photos maintain their original proportions
- **Smart Cropping**: When needed, excess portions are cropped from the center
- **Orientation Matching**: Layout algorithm considers photo orientation and importance
- **Quality Preservation**: High-quality scaling with Sharp image processing

## Development

### Running Locally

After linking with `npm link`, you can run the tool from anywhere:
```bash
collage -i ./test-photos --harmony
```

### Making Changes

1. Edit the code in `index.js`
2. Test immediately using the globally linked command
3. No need to reinstall - changes are reflected immediately

### Unlinking

To remove the global link:
```bash
npm unlink -g collage
```

## License

ISC

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## Support

For issues and feature requests, please create an issue in the repository.
