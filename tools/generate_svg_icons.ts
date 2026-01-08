/**
 * SVG Icon Generator for FrenzyFront
 *
 * This script generates SVG files for all procedurally generated unit and structure icons.
 * Run with: npx ts-node tools/generate_svg_icons.ts
 *
 * Output: resources/icons/generated/
 */

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Icon sizes matching StructureDrawingUtils.ts
const ICON_SIZE: Record<string, number> = {
  circle: 28,
  octagon: 28,
  pentagon: 30,
  square: 28,
  triangle: 28,
  cross: 20,
};

// Structure types and their shapes
const STRUCTURE_SHAPES: Record<string, string> = {
  City: "circle",
  Port: "pentagon",
  Factory: "circle",
  DefensePost: "octagon",
  SAMLauncher: "square",
  MissileSilo: "triangle",
  Warship: "cross",
  AtomBomb: "cross",
  HydrogenBomb: "cross",
  MIRV: "cross",
};

// Colors - using a neutral color scheme that can be recolored via CSS
const FILL_COLOR = "#FFFFFF";
const STROKE_COLOR = "#333333";
const STROKE_WIDTH = 1;

function generateTriangleSVG(size: number): string {
  const half = size / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
  <polygon 
    points="${half},1 ${size - 1},${size - 1} 0,${size - 1}" 
    fill="${FILL_COLOR}" 
    stroke="${STROKE_COLOR}" 
    stroke-width="${STROKE_WIDTH}"
  />
</svg>`;
}

function generateSquareSVG(size: number): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
  <rect 
    x="1" y="1" 
    width="${size - 2}" height="${size - 2}" 
    fill="${FILL_COLOR}" 
    stroke="${STROKE_COLOR}" 
    stroke-width="${STROKE_WIDTH}"
  />
</svg>`;
}

function generateOctagonSVG(size: number): string {
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 1;
  const step = (Math.PI * 2) / 8;

  const points: string[] = [];
  for (let i = 0; i < 8; i++) {
    const angle = step * i - Math.PI / 8; // slight rotation for flat top
    const x = cx + r * Math.cos(angle);
    const y = cy + r * Math.sin(angle);
    points.push(`${x.toFixed(2)},${y.toFixed(2)}`);
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
  <polygon 
    points="${points.join(" ")}" 
    fill="${FILL_COLOR}" 
    stroke="${STROKE_COLOR}" 
    stroke-width="${STROKE_WIDTH}"
  />
</svg>`;
}

function generatePentagonSVG(size: number): string {
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 1;
  const step = (Math.PI * 2) / 5;

  const points: string[] = [];
  for (let i = 0; i < 5; i++) {
    const angle = step * i - Math.PI / 2; // rotate to have point up
    const x = cx + r * Math.cos(angle);
    const y = cy + r * Math.sin(angle);
    points.push(`${x.toFixed(2)},${y.toFixed(2)}`);
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
  <polygon 
    points="${points.join(" ")}" 
    fill="${FILL_COLOR}" 
    stroke="${STROKE_COLOR}" 
    stroke-width="${STROKE_WIDTH}"
  />
</svg>`;
}

function generateCircleSVG(size: number): string {
  const half = size / 2;
  const radius = half - 1;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
  <circle 
    cx="${half}" cy="${half}" r="${radius}" 
    fill="${FILL_COLOR}" 
    stroke="${STROKE_COLOR}" 
    stroke-width="${STROKE_WIDTH}"
  />
</svg>`;
}

function generateCrossSVG(size: number): string {
  const half = size / 2;
  const gap = size * 0.18;
  const lineLen = size / 2;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
  <g stroke="#000000" stroke-width="${STROKE_WIDTH}" stroke-linecap="round">
    <!-- Up -->
    <line x1="${half}" y1="${half - gap}" x2="${half}" y2="${half - lineLen}" />
    <!-- Down -->
    <line x1="${half}" y1="${half + gap}" x2="${half}" y2="${half + lineLen}" />
    <!-- Left -->
    <line x1="${half - gap}" y1="${half}" x2="${half - lineLen}" y2="${half}" />
    <!-- Right -->
    <line x1="${half + gap}" y1="${half}" x2="${half + lineLen}" y2="${half}" />
  </g>
</svg>`;
}

function generateShapeSVG(shape: string, size: number): string {
  switch (shape) {
    case "triangle":
      return generateTriangleSVG(size);
    case "square":
      return generateSquareSVG(size);
    case "octagon":
      return generateOctagonSVG(size);
    case "pentagon":
      return generatePentagonSVG(size);
    case "circle":
      return generateCircleSVG(size);
    case "cross":
      return generateCrossSVG(size);
    default:
      throw new Error(`Unknown shape: ${shape}`);
  }
}

// Generate larger, more detailed versions for UI use
function generateUIIconSVG(
  shape: string,
  unitType: string,
  size: number = 64,
): string {
  const half = size / 2;
  const strokeWidth = 2;

  let svgContent = "";

  switch (shape) {
    case "triangle": {
      const topY = size * 0.1;
      const bottomY = size * 0.9;
      svgContent = `<polygon 
        points="${half},${topY} ${size * 0.9},${bottomY} ${size * 0.1},${bottomY}" 
        fill="${FILL_COLOR}" 
        stroke="${STROKE_COLOR}" 
        stroke-width="${strokeWidth}"
        stroke-linejoin="round"
      />`;
      break;
    }
    case "square": {
      const padding = size * 0.1;
      svgContent = `<rect 
        x="${padding}" y="${padding}" 
        width="${size - padding * 2}" height="${size - padding * 2}" 
        fill="${FILL_COLOR}" 
        stroke="${STROKE_COLOR}" 
        stroke-width="${strokeWidth}"
        rx="2" ry="2"
      />`;
      break;
    }
    case "octagon": {
      const r = size / 2 - size * 0.1;
      const step = (Math.PI * 2) / 8;
      const points: string[] = [];
      for (let i = 0; i < 8; i++) {
        const angle = step * i - Math.PI / 8;
        const x = half + r * Math.cos(angle);
        const y = half + r * Math.sin(angle);
        points.push(`${x.toFixed(2)},${y.toFixed(2)}`);
      }
      svgContent = `<polygon 
        points="${points.join(" ")}" 
        fill="${FILL_COLOR}" 
        stroke="${STROKE_COLOR}" 
        stroke-width="${strokeWidth}"
        stroke-linejoin="round"
      />`;
      break;
    }
    case "pentagon": {
      const r = size / 2 - size * 0.1;
      const step = (Math.PI * 2) / 5;
      const points: string[] = [];
      for (let i = 0; i < 5; i++) {
        const angle = step * i - Math.PI / 2;
        const x = half + r * Math.cos(angle);
        const y = half + r * Math.sin(angle);
        points.push(`${x.toFixed(2)},${y.toFixed(2)}`);
      }
      svgContent = `<polygon 
        points="${points.join(" ")}" 
        fill="${FILL_COLOR}" 
        stroke="${STROKE_COLOR}" 
        stroke-width="${strokeWidth}"
        stroke-linejoin="round"
      />`;
      break;
    }
    case "circle": {
      const radius = size / 2 - size * 0.1;
      svgContent = `<circle 
        cx="${half}" cy="${half}" r="${radius}" 
        fill="${FILL_COLOR}" 
        stroke="${STROKE_COLOR}" 
        stroke-width="${strokeWidth}"
      />`;
      break;
    }
    case "cross": {
      const gap = size * 0.15;
      const lineLen = size * 0.4;
      const lineWidth = size * 0.08;
      svgContent = `<g fill="${STROKE_COLOR}">
        <!-- Vertical bar -->
        <rect x="${half - lineWidth / 2}" y="${size * 0.1}" width="${lineWidth}" height="${size * 0.8}" rx="1" />
        <!-- Horizontal bar -->
        <rect x="${size * 0.1}" y="${half - lineWidth / 2}" width="${size * 0.8}" height="${lineWidth}" rx="1" />
        <!-- Center gap (white circle) -->
        <circle cx="${half}" cy="${half}" r="${gap}" fill="${FILL_COLOR}" />
      </g>`;
      break;
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
  <!-- ${unitType} icon (${shape}) -->
  ${svgContent}
</svg>`;
}

function main() {
  const outputDir = path.join(
    __dirname,
    "..",
    "resources",
    "icons",
    "generated",
  );

  // Create output directory if it doesn't exist
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  console.log("Generating SVG icons...\n");
  console.log(`Output directory: ${outputDir}\n`);

  // Generate base shape icons (small, for game use)
  console.log("=== Base Shape Icons (small) ===");
  const shapes = ["triangle", "square", "octagon", "pentagon", "circle", "cross"];
  for (const shape of shapes) {
    const size = ICON_SIZE[shape];
    const svg = generateShapeSVG(shape, size);
    const filename = `shape_${shape}.svg`;
    const filepath = path.join(outputDir, filename);
    fs.writeFileSync(filepath, svg);
    console.log(`  ✓ ${filename} (${size}x${size})`);
  }

  // Generate structure-specific icons (larger, for UI use)
  console.log("\n=== Structure Icons (UI size 64x64) ===");
  for (const [unitType, shape] of Object.entries(STRUCTURE_SHAPES)) {
    const svg = generateUIIconSVG(shape, unitType, 64);
    const filename = `${unitType.toLowerCase()}_icon.svg`;
    const filepath = path.join(outputDir, filename);
    fs.writeFileSync(filepath, svg);
    console.log(`  ✓ ${filename} (${unitType} - ${shape})`);
  }

  // Generate white versions for radial menu
  console.log("\n=== White Icons for Radial Menu (64x64) ===");
  for (const [unitType, shape] of Object.entries(STRUCTURE_SHAPES)) {
    const svg = generateUIIconSVG(shape, unitType, 64)
      .replace(/fill="#FFFFFF"/g, 'fill="#FFFFFF"')
      .replace(/stroke="#333333"/g, 'stroke="#FFFFFF"')
      .replace(/fill="#333333"/g, 'fill="#FFFFFF"');
    const filename = `${unitType.toLowerCase()}_icon_white.svg`;
    const filepath = path.join(outputDir, filename);
    fs.writeFileSync(filepath, svg);
    console.log(`  ✓ ${filename}`);
  }

  console.log("\n✅ All SVG icons generated successfully!");
  console.log(`\nTotal files: ${shapes.length + Object.keys(STRUCTURE_SHAPES).length * 2}`);
  console.log(`\nTo use in radial menu, import from: resources/icons/generated/`);
}

main();
