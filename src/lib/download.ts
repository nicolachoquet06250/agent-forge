interface ZipEntry { name: string; data: Uint8Array; }

const encoder = new TextEncoder();
const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(data: Uint8Array) {
  let c = 0xffffffff;
  for (const byte of data) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function u16(value: number) { return new Uint8Array([value & 0xff, (value >>> 8) & 0xff]); }
function u32(value: number) { return new Uint8Array([value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff]); }
function concat(parts: Uint8Array[]) {
  const size = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) { out.set(part, offset); offset += part.length; }
  return out;
}

function dosDateTime(date = new Date()) {
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const year = Math.max(1980, date.getFullYear());
  const dosDate = ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { time, date: dosDate };
}

export function textEntry(name: string, text: string): ZipEntry { return { name, data: encoder.encode(text) }; }

export function base64Entry(name: string, base64: string): ZipEntry {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return { name, data: bytes };
}

export function createZip(entries: ZipEntry[]): Blob {
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  const dt = dosDateTime();

  for (const entry of entries) {
    const name = encoder.encode(entry.name.replace(/\\/g, '/'));
    const crc = crc32(entry.data);
    const local = concat([
      u32(0x04034b50), u16(20), u16(0x0800), u16(0), u16(dt.time), u16(dt.date), u32(crc),
      u32(entry.data.length), u32(entry.data.length), u16(name.length), u16(0), name, entry.data,
    ]);
    locals.push(local);
    centrals.push(concat([
      u32(0x02014b50), u16(20), u16(20), u16(0x0800), u16(0), u16(dt.time), u16(dt.date), u32(crc),
      u32(entry.data.length), u32(entry.data.length), u16(name.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset), name,
    ]));
    offset += local.length;
  }

  const central = concat(centrals);
  const end = concat([
    u32(0x06054b50), u16(0), u16(0), u16(entries.length), u16(entries.length), u32(central.length), u32(offset), u16(0),
  ]);
  return new Blob([concat([...locals, central, end])], { type: 'application/zip' });
}

export function downloadBlob(blob: Blob, fileName: string) {
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = href;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}

export function downloadText(text: string, fileName: string, type = 'text/markdown;charset=utf-8') {
  downloadBlob(new Blob([text], { type }), fileName);
}
