// Process argv:
// 0 path to node
// 1 path to js
// 2 zip file
// 3 path to extract

import * as BrowserFS from 'browserfs';
import * as fs from 'fs';
import * as path from 'path';
import explode = require('./explode');
import unshrink = require('./unshrink');
import * as crypto from 'crypto';
const crcHash: typeof crypto = require('crc-hash');

const args = process.argv;
if (args.length < 4) {
  console.log(`Syntax: extract.js [zip file] [path to extract]`);
  process.exit(0);
}

const zipfs = new BrowserFS.FileSystem.ZipFS(fs.readFileSync(process.argv[2]));
const item = (<any> zipfs)._index.getInode(process.argv[3]);
if (!item) {
  console.log(`Could not find item ${process.argv[3]} in zip file.`);
  process.exit(0);
}
const itemData = item.getData();
const csize = itemData.compressedSize();
const ucsize = itemData.uncompressedSize();
const flags = itemData.getFileData().getHeader().flags();
const compressedData = itemData.getRawData();
const output = new Uint8Array(ucsize);
const method = itemData.compressionMethod();
if (method !== 6 && method !== 1) {
  console.log(`${process.argv[3]} is not IMPLODEd or SHRUNK. Expected 6 or 1 for compression method, received ${method}.`);
  process.exit(0);
}
const outputPath = path.resolve(`./${process.argv[3]}`);
console.log(`Zip: ${process.argv[2]}
File: ${process.argv[3]}
CRC32: ${itemData.crc32().toString(16)}
Compressed Size: ${csize}
Uncompressed Size: ${ucsize}
`);

let rv: number;
if (method === 6) {
  console.log(`Exploding to ${outputPath}...`);
  rv = explode(flags, compressedData.subarray(0, csize), output, ucsize);
} else {
  console.log(`Unshrinking to ${outputPath}...`);
  rv = unshrink(compressedData.subarray(0, csize), output, ucsize)
}

console.log(`Return code: ${rv}
${rv === 0 ? 'Success!' : 'Failed :('}\n`);

const outBuf = new Buffer(output);
const crc32 = crcHash.createHash('crc32');
crc32.update(outBuf);
console.log(`CRC32 of Output: ${crc32.digest('hex')}`);

fs.writeFileSync(outputPath, outBuf);


