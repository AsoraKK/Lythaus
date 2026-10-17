import sharp from 'sharp';

/** Build a real JPEG whose EXIF has orientation 6, a camera Make, and a GPS IFD. */
export async function createExifGpsJpeg() {
  const jpeg = await sharp({ create: { width: 3, height: 2, channels: 3,
    background: { r: 30, g: 80, b: 120 } } }).jpeg().toBuffer();
  const make = Buffer.from('Lythaus fixture\0', 'ascii');
  const ifd0Offset = 8;
  const ifd0Count = 3;
  const ifd0NextOffset = ifd0Offset + 2 + ifd0Count * 12;
  const makeOffset = ifd0NextOffset + 4;
  const gpsIfdOffset = makeOffset + make.length;
  const gpsIfdCount = 4;
  const latitudeOffset = gpsIfdOffset + 2 + gpsIfdCount * 12 + 4;
  const longitudeOffset = latitudeOffset + 24;
  const tiff = Buffer.alloc(longitudeOffset + 24);
  tiff.write('II', 0, 'ascii');
  tiff.writeUInt16LE(42, 2);
  tiff.writeUInt32LE(ifd0Offset, 4);
  tiff.writeUInt16LE(ifd0Count, ifd0Offset);

  let entryOffset = ifd0Offset + 2;
  const writeEntry = (tag, type, count, value) => {
    tiff.writeUInt16LE(tag, entryOffset);
    tiff.writeUInt16LE(type, entryOffset + 2);
    tiff.writeUInt32LE(count, entryOffset + 4);
    if (Buffer.isBuffer(value)) value.copy(tiff, entryOffset + 8);
    else tiff.writeUInt32LE(value, entryOffset + 8);
    entryOffset += 12;
  };

  writeEntry(0x010f, 2, make.length, makeOffset); // IFD0 Make
  writeEntry(0x0112, 3, 1, 6); // IFD0 Orientation
  writeEntry(0x8825, 4, 1, gpsIfdOffset); // IFD0 GPSInfo pointer
  tiff.writeUInt32LE(0, ifd0NextOffset);
  make.copy(tiff, makeOffset);

  tiff.writeUInt16LE(gpsIfdCount, gpsIfdOffset);
  entryOffset = gpsIfdOffset + 2;
  writeEntry(1, 2, 2, Buffer.from([0x4e, 0])); // GPSLatitudeRef: North
  writeEntry(2, 5, 3, latitudeOffset); // GPSLatitude: 37° 46' 30"
  writeEntry(3, 2, 2, Buffer.from([0x57, 0])); // GPSLongitudeRef: West
  writeEntry(4, 5, 3, longitudeOffset); // GPSLongitude: 122° 25' 00"
  tiff.writeUInt32LE(0, gpsIfdOffset + 2 + gpsIfdCount * 12);

  const coordinates = [[37, 1], [46, 1], [30, 1], [122, 1], [25, 1], [0, 1]];
  coordinates.forEach(([numerator, denominator], index) => {
    const base = index < 3 ? latitudeOffset : longitudeOffset;
    const offset = base + (index % 3) * 8;
    tiff.writeUInt32LE(numerator, offset);
    tiff.writeUInt32LE(denominator, offset + 4);
  });

  const payload = Buffer.concat([Buffer.from('Exif\0\0', 'binary'), tiff]);
  const app1 = Buffer.alloc(4 + payload.length);
  app1[0] = 0xff;
  app1[1] = 0xe1;
  app1.writeUInt16BE(payload.length + 2, 2);
  payload.copy(app1, 4);
  return Buffer.concat([jpeg.subarray(0, 2), app1, jpeg.subarray(2)]);
}
