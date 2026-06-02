// Run with: node generate-icons.js
// Generates simple purple circle PNG icons for the extension
const { createCanvas } = require('canvas');
const fs = require('fs');

function makeIcon(size) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#7c5cfc';
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 5, 0, Math.PI * 2);
  ctx.fill();
  fs.writeFileSync(`icon${size}.png`, canvas.toBuffer('image/png'));
  console.log(`icon${size}.png written`);
}

[16, 48, 128].forEach(makeIcon);
