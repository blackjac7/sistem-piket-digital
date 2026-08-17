import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = path.join(root, "public/img/logo.png");
const output = path.join(root, "public/icons");
const background = { r: 18, g: 58, b: 90, alpha: 1 };

const variants = [
  ["icon-192.png", 192, 138],
  ["icon-512.png", 512, 368],
  ["icon-192-maskable.png", 192, 104],
  ["icon-512-maskable.png", 512, 280],
  ["apple-touch-icon.png", 180, 126],
  ["favicon-32.png", 32, 22],
];

const logo = await sharp(source).ensureAlpha();

await Promise.all(variants.map(async ([name, size, logoSize]) => {
  const logoBuffer = await logo.clone().resize(logoSize, logoSize, { fit: "contain" }).png().toBuffer();
  await sharp({
    create: { width: size, height: size, channels: 4, background },
  })
    .composite([{ input: logoBuffer, gravity: "center" }])
    .png()
    .toFile(path.join(output, name));
}));

console.log(`Generated ${variants.length} PWA icons in ${path.relative(root, output)}`);
