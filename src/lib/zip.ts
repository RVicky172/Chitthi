/* Minimal ZIP writer (stored, no compression): PNG, JPEG and PDF are already compressed, so this costs nothing in size. */

/** The CRC-32 table: the remainder of each byte value. */
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let byte = 0; byte < 256; byte++) {
    let remainder = byte;
    for (let bit = 0; bit < 8; bit++) remainder = remainder & 1 ? 0xedb88320 ^ (remainder >>> 1) : remainder >>> 1;
    table[byte] = remainder >>> 0;
  }
  return table;
})();

/**
 * The CRC-32 checksum ZIP stores for each file.
 * @param bytes the file's bytes
 * @returns the checksum, unsigned
 */
export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = (CRC_TABLE[(crc ^ byte) & 255] ?? 0) ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/** A file to put in a ZIP. */
export interface ZipEntry {
  /** Its path inside the ZIP (UTF-8). */
  name: string;
  data: Uint8Array<ArrayBuffer> | Blob | string;
}

/** What the local and central headers of one file share. */
interface EntryFields {
  /** The name as UTF-8 bytes. */
  name: Uint8Array;
  crc: number;
  /** The file's size (stored: the same packed and unpacked). */
  size: number;
  /** MS-DOS time and date of the ZIP. */
  time: number;
  date: number;
}

/** ZIP's flag for UTF-8 names. */
const UTF8_NAMES = 0x0800;
/** The ZIP version needed to read it (2.0). */
const VERSION = 20;

/**
 * A file's local header, written just before its bytes.
 * @param fields the file's name, checksum, size, time and date
 * @returns the header
 */
function localHeader({ name, crc, size, time, date }: EntryFields): Uint8Array<ArrayBuffer> {
  const header = new Uint8Array(30 + name.length);
  const view = new DataView(header.buffer);
  view.setUint32(0, 0x04034b50, true);
  view.setUint16(4, VERSION, true);
  view.setUint16(6, UTF8_NAMES, true);
  view.setUint16(10, time, true);
  view.setUint16(12, date, true);
  view.setUint32(14, crc, true);
  view.setUint32(18, size, true);
  view.setUint32(22, size, true);
  view.setUint16(26, name.length, true);
  header.set(name, 30);
  return header;
}

/**
 * A file's entry in the central directory, at the end of the ZIP.
 * @param fields the file's name, checksum, size, time and date
 * @param offset where its local header starts
 * @returns the entry
 */
function centralHeader({ name, crc, size, time, date }: EntryFields, offset: number): Uint8Array<ArrayBuffer> {
  const header = new Uint8Array(46 + name.length);
  const view = new DataView(header.buffer);
  view.setUint32(0, 0x02014b50, true);
  view.setUint16(4, VERSION, true);
  view.setUint16(6, VERSION, true);
  view.setUint16(8, UTF8_NAMES, true);
  view.setUint16(12, time, true);
  view.setUint16(14, date, true);
  view.setUint32(16, crc, true);
  view.setUint32(20, size, true);
  view.setUint32(24, size, true);
  view.setUint16(28, name.length, true);
  view.setUint32(42, offset, true);
  header.set(name, 46);
  return header;
}

/**
 * The end-of-central-directory record.
 * @param count how many files the ZIP holds
 * @param directorySize the central directory's size in bytes
 * @param directoryOffset where it starts
 * @returns the record
 */
function endRecord(count: number, directorySize: number, directoryOffset: number): Uint8Array<ArrayBuffer> {
  const record = new Uint8Array(22);
  const view = new DataView(record.buffer);
  view.setUint32(0, 0x06054b50, true);
  view.setUint16(8, count, true);
  view.setUint16(10, count, true);
  view.setUint32(12, directorySize, true);
  view.setUint32(16, directoryOffset, true);
  return record;
}

/**
 * A file's bytes.
 * @param data text (written as UTF-8), a Blob or bytes
 * @param encoder the UTF-8 encoder
 * @returns the bytes
 */
async function bytesOf(data: ZipEntry['data'], encoder: TextEncoder): Promise<Uint8Array<ArrayBuffer>> {
  if (typeof data === 'string') return encoder.encode(data);
  if (data instanceof Blob) return new Uint8Array(await data.arrayBuffer());
  return data;
}

/**
 * A ZIP of the given files, stored without compression and stamped with the current time.
 * @param entries the files, in order
 * @returns the ZIP
 */
export async function makeZip(entries: ZipEntry[]): Promise<Blob> {
  const encoder = new TextEncoder();
  const parts: BlobPart[] = [];
  const central: Uint8Array<ArrayBuffer>[] = [];
  const now = new Date();
  const time = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
  const date = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
  let offset = 0;
  for (const entry of entries) {
    const data = await bytesOf(entry.data, encoder);
    const fields: EntryFields = { name: encoder.encode(entry.name), crc: crc32(data), size: data.length, time, date };
    const local = localHeader(fields);
    parts.push(local, data);
    central.push(centralHeader(fields, offset));
    offset += local.length + data.length;
  }
  const directorySize = central.reduce((total, header) => total + header.length, 0);
  return new Blob([...parts, ...central, endRecord(entries.length, directorySize, offset)], { type: 'application/zip' });
}
