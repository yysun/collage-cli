# Collage CLI

A powerful command-line tool for creating beautiful photo collages with advanced features like face detection, color harmony, AI-powered clustering, and professional print output with bleed and crop marks.

## Features

- **Smart Layout**: Automatic photo arrangement based on orientation, importance, and content
- **Face Detection**: Optional face counting for better photo prioritization
- **Color Harmony**: Sort photos by dominant hue for visually pleasing arrangements
- **AI Clustering**: Group similar photos using CLIP embeddings
- **Professional Print**: Add bleed and crop marks for print-ready output
- **PDF Generation**: Create multi-page PDF booklets
- **Custom Shapes**: Support for circular and rounded corner masks
- **Saliency Analysis**: Automatic detection of important image regions

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

Create a 24x36 inch collage with face detection and color harmony:
```bash
collage -i ./photos -o ./output --size 24x36in --harmony --faces
```

Generate a themed collage with AI clustering and PDF output:
```bash
collage -i ./photos --theme --pdf --grid 4
```

Create print-ready collages with bleed and crop marks:
```bash
collage -i ./photos --bleed 3mm --pdf --dpi 300
```

## Command Line Options

| Option | Description | Default |
|--------|-------------|---------|
| `-i, --input <dir>` | Input directory containing photos | **Required** |
| `-o, --output <dir>` | Output directory | `./out` |
| `-p, --pages <n>` | Number of pages to generate | `1` |
| `-s, --size <WxH>` | Page size (e.g., 24x36in, 300x400mm, 1920x1080px) | `24x36in` |
| `--dpi <n>` | Resolution in DPI | `300` |
| `--bg <hex>` | Background color | `#ffffff` |
| `--border <px>` | Border width in pixels | `0` |
| `--borderColor <hex>` | Border color | `#ffffff` |
| `--shape <type>` | Photo shape: `none`, `circle`, `rounded` | `none` |
| `-g, --grid <n>` | Grid size for photo placement | `3` |
| `--no-faces` | Disable face detection | `false` |
| `--harmony` | Sort photos by dominant color hue | `false` |
| `--theme` | Cluster photos by AI similarity | `false` |
| `--bleed <size>` | Add bleed and crop marks (e.g., 3mm, 0.125in) | `none` |
| `--pdf` | Generate PDF booklet | `false` |

## Photo Importance System

Photos can be tagged with importance levels by including `imp1` through `imp5` in the filename:
- `vacation-imp3.jpg` - Medium importance (3/5)
- `portrait-imp5.jpg` - High importance (5/5)

Higher importance photos get larger grid spaces in the collage.

## Requirements

- Node.js 18 or higher
- Images in JPG, JPEG, or PNG format

## Dependencies

- **Sharp**: High-performance image processing
- **Smartcrop**: Intelligent image cropping
- **Face-API**: Face detection capabilities
- **Node Vibrant**: Color palette extraction
- **CLIP**: AI-powered image similarity
- **PDF-lib**: PDF generation

## File Structure

```
collage-cli/
├── index.js          # Main CLI application
├── package.json      # Project configuration
├── README.md         # This file
└── models/           # Face detection models (auto-downloaded)
```

## Output

The tool generates:
- Individual page images (JPEG format)
- Optional PDF booklet combining all pages
- Organized output in timestamped directories

Example output structure:
```
out/
└── collage-2025-06-28T10-30-45-123Z/
    ├── page-1.jpg
    ├── page-2.jpg
    └── booklet.pdf
```

## Development

### Running Locally

After linking with `npm link`, you can run the tool from anywhere:
```bash
collage -i ./test-photos --harmony --faces
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
