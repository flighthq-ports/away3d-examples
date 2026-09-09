/**
 * Normalize two Away3D-authored AWD files whose index streams are tagged uint32 even though their
 * payloads contain tightly packed uint16 values. Away3D's parser always reads triangle indices as
 * unsigned shorts, so the incorrect tag went unnoticed in the original samples. Flight honors the
 * declared type and would otherwise combine every pair into one out-of-range index.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { deflateSync, inflateSync } from 'node:zlib';
import { resolve } from 'node:path';

const HEADER_BYTES = 12;
const BLOCK_HEADER_BYTES = 11;
const COMPRESSION_NONE = 0;
const COMPRESSION_DEFLATE = 1;
const BLOCK_TRIANGLE_GEOMETRY = 1;
const STREAM_INDICES = 2;
const DATA_UINT16 = 5;
const DATA_UINT32 = 6;

const targets = [
  ['PolarBearAWDAnimation/PolarBear.awd', 1],
  ['SpriteSheetAnimation/tictac/tictac.awd', 13],
] as const;

function skipAttributeList(view: DataView, offset: number): number {
  return offset + 4 + view.getUint32(offset, true);
}

function normalizeIndexStreams(body: Buffer): number {
  const view = new DataView(body.buffer, body.byteOffset, body.byteLength);
  let blockOffset = 0;
  let changes = 0;

  while (blockOffset + BLOCK_HEADER_BYTES <= body.length) {
    const namespace = body[blockOffset + 4];
    const blockType = body[blockOffset + 5];
    const blockLength = view.getUint32(blockOffset + 7, true);
    const blockStart = blockOffset + BLOCK_HEADER_BYTES;
    const blockEnd = blockStart + blockLength;
    if (blockEnd > body.length) throw new Error('AWD block extends past the file body');

    if (namespace === 0 && blockType === BLOCK_TRIANGLE_GEOMETRY) {
      let offset = blockStart;
      const nameLength = view.getUint16(offset, true);
      offset += 2 + nameLength;
      const subMeshCount = view.getUint16(offset, true);
      offset += 2;
      offset = skipAttributeList(view, offset);

      for (let subMesh = 0; subMesh < subMeshCount; subMesh++) {
        const streamBytes = view.getUint32(offset, true);
        offset += 4;
        offset = skipAttributeList(view, offset);
        const streamsEnd = offset + streamBytes;

        while (offset + 6 <= streamsEnd) {
          const streamType = body[offset];
          const dataTypeOffset = offset + 1;
          const streamLength = view.getUint32(offset + 2, true);
          if (streamType === STREAM_INDICES && body[dataTypeOffset] === DATA_UINT32) {
            if (streamLength % 2 !== 0) throw new Error('AWD index stream has an odd byte length');
            body[dataTypeOffset] = DATA_UINT16;
            changes++;
          }
          offset += 6 + streamLength;
        }

        if (offset !== streamsEnd) throw new Error('AWD stream lengths do not match the sub-mesh header');
        offset = skipAttributeList(view, offset);
      }
    }

    blockOffset = blockEnd;
  }

  return changes;
}

const assetsRoot = resolve(import.meta.dirname, '../../assets/away3d');
for (const [relativePath, expectedChanges] of targets) {
  const path = resolve(assetsRoot, relativePath);
  const file = readFileSync(path);
  const compression = file[7];
  if (compression !== COMPRESSION_NONE && compression !== COMPRESSION_DEFLATE) {
    throw new Error(`${relativePath}: unsupported AWD compression ${compression}`);
  }

  const body = compression === COMPRESSION_DEFLATE
    ? inflateSync(file.subarray(HEADER_BYTES))
    : Buffer.from(file.subarray(HEADER_BYTES));
  const changes = normalizeIndexStreams(body);
  if (changes === 0) {
    console.log(`${relativePath}: already normalized`);
    continue;
  }
  if (changes !== expectedChanges) {
    throw new Error(`${relativePath}: expected ${expectedChanges} index streams, found ${changes}`);
  }

  const encodedBody = compression === COMPRESSION_DEFLATE ? deflateSync(body) : body;
  const header = Buffer.from(file.subarray(0, HEADER_BYTES));
  header.writeUInt32LE(encodedBody.length, 8);
  writeFileSync(path, Buffer.concat([header, encodedBody]));
  console.log(`${relativePath}: normalized ${changes} index stream(s)`);
}
