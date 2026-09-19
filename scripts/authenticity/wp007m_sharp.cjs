const sharp = require(process.argv[2]);
const chunks = [];
process.stdin.on('data', b => chunks.push(b));
process.stdin.on('end', async () => {
  try {
    const bytes = Buffer.concat(chunks);
    if (bytes.length !== 256 * 256 * 3) throw new Error('INVALID_RAW_LENGTH');
    const output = await sharp(bytes, { raw: { width: 256, height: 256, channels: 3 } })
      .jpeg({ quality: 95, chromaSubsampling: '4:2:0', progressive: false }).toBuffer();
    process.stdout.write(output);
  } catch (e) { process.stderr.write(String(e)); process.exitCode = 1; }
});
