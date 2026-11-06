// Minimale PNG-schrijver (RGB, 8 bit) voor controleplaatjes in het verslag. Geen afhankelijkheden.
import { deflateSync } from 'node:zlib';

const CRC = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
const crc32 = buf => { let c = -1; for (const b of buf) c = CRC[(c ^ b) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
const blok = (type, data) => {
  const b = Buffer.alloc(12 + data.length);
  b.writeUInt32BE(data.length, 0); b.write(type, 4, 'ascii'); data.copy(b, 8);
  b.writeUInt32BE(crc32(b.subarray(4, 8 + data.length)), 8 + data.length);
  return b;
};

// rgb: Uint8Array van breedte*hoogte*3
export function maakPng(breedte, hoogte, rgb) {
  const rauw = Buffer.alloc((breedte * 3 + 1) * hoogte);
  for (let y = 0; y < hoogte; y++) Buffer.from(rgb.buffer, rgb.byteOffset + y * breedte * 3, breedte * 3).copy(rauw, y * (breedte * 3 + 1) + 1);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(breedte, 0); ihdr.writeUInt32BE(hoogte, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), blok('IHDR', ihdr), blok('IDAT', deflateSync(rauw, { level: 9 })), blok('IEND', Buffer.alloc(0))]);
}
