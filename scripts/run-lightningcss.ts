import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { transform } from 'lightningcss';

const sourcePath = 'src/styles.css';
const source = await readFile(sourcePath);
const result = transform({
  filename: sourcePath,
  code: source,
  minify: false,
  sourceMap: false,
});
if (result.code.length === 0) {
  throw new Error('Lightning CSS returned an empty stylesheet.');
}
await mkdir('artifacts/css', { recursive: true });
await writeFile('artifacts/css/lightningcss.css', result.code);
console.log(
  `Lightning CSS parsed ${source.length} bytes and emitted ${result.code.length} bytes.`,
);
