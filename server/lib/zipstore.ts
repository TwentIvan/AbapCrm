// Mini-ZIP "store" (nessuna compressione) in puro Node, senza dipendenze.
// Serve per consegnare un file .command con il bit di esecuzione (0755): un
// file scaricato dal browser perde +x, ma dentro uno ZIP i permessi Unix sono
// conservati nell'external attributes e macOS Archive Utility li rispetta.

const CRC_TABLE: number[] = (() => {
  const t: number[] = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// Crea uno ZIP con un singolo file eseguibile (mode 0755).
export function zipSingleExecutable(filename: string, content: Buffer): Buffer {
  const name = Buffer.from(filename, "utf8");
  const crc = crc32(content);
  const size = content.length;
  const mode = 0o100755; // regular file, rwxr-xr-x

  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0); // signature
  local.writeUInt16LE(20, 4);         // version needed
  local.writeUInt16LE(0, 6);          // flags
  local.writeUInt16LE(0, 8);          // method: store
  local.writeUInt16LE(0, 10);         // mod time
  local.writeUInt16LE(0, 12);         // mod date
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(size, 18);      // compressed size
  local.writeUInt32LE(size, 22);      // uncompressed size
  local.writeUInt16LE(name.length, 26);
  local.writeUInt16LE(0, 28);         // extra len
  const localHeader = Buffer.concat([local, name, content]);

  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);      // signature
  central.writeUInt16LE(0x031e, 4);          // version made by: 0x03=unix, 30
  central.writeUInt16LE(20, 6);              // version needed
  central.writeUInt16LE(0, 8);               // flags
  central.writeUInt16LE(0, 10);              // method: store
  central.writeUInt16LE(0, 12);              // mod time
  central.writeUInt16LE(0, 14);              // mod date
  central.writeUInt32LE(crc, 16);
  central.writeUInt32LE(size, 20);
  central.writeUInt32LE(size, 24);
  central.writeUInt16LE(name.length, 28);
  central.writeUInt16LE(0, 30);              // extra len
  central.writeUInt16LE(0, 32);              // comment len
  central.writeUInt16LE(0, 34);              // disk start
  central.writeUInt16LE(0, 36);              // internal attrs
  central.writeUInt32LE((mode << 16) >>> 0, 38); // external attrs (Unix mode)
  central.writeUInt32LE(0, 42);              // local header offset
  const centralHeader = Buffer.concat([central, name]);

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(1, 8);
  eocd.writeUInt16LE(1, 10);
  eocd.writeUInt32LE(centralHeader.length, 12);
  eocd.writeUInt32LE(localHeader.length, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([localHeader, centralHeader, eocd]);
}
