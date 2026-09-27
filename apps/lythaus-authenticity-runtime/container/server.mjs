import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createHash, timingSafeEqual } from 'node:crypto';
import { generateForensicFeatureBundleV1 } from '../../../packages/authenticity/src/forensics.ts';
import { BETA_VERSION, SAFE_CHECKPOINT, SAFE_PREPROCESSING, readBoundedBytes } from '../../../packages/authenticity/src/beta.ts';
import { Readable } from 'node:stream';

const secret = process.env.AUTHENTICITY_BETA_DISPATCH_SECRET;
const runtimeDigest = process.env.RUNTIME_DIGEST;
if (!secret || !/^sha256:[0-9a-f]{64}$/.test(runtimeDigest ?? '')) throw new Error('runtime_configuration_missing');
const preprocessingHash = createHash('sha256').update(await readFile(new URL('./safe_process.py', import.meta.url))).digest('hex');
await mkdir('/tmp/beta', { recursive: true, mode: 0o700 });
const child = spawn('python', ['-u', new URL('./safe_process.py', import.meta.url).pathname], { stdio: ['pipe','pipe','ignore'], env: { ...process.env, OMP_NUM_THREADS: '1', MKL_NUM_THREADS: '1', OPENBLAS_NUM_THREADS: '1' } });
let ready = false, busy = false, startup = null, pending = null;
let completed = 0;
createInterface({ input: child.stdout }).on('line', line => {
  try {
    if (line.length > 65536) throw new Error('protocol_limit');
    const data = JSON.parse(line);
    if (Object.hasOwn(data,'ready')) { ready = data.ready === true; startup = data; if (ready) process.stdout.write('BETA_READY\n'); }
    else if (pending) { const resolver = pending; pending = null; resolver(data); }
  } catch { child.kill('SIGKILL'); }
});
child.on('exit', () => { ready=false; setTimeout(()=>process.exit(1),100).unref(); });
setTimeout(()=>process.exit(0),30*60*1000).unref();
const authorized = request => {
  const supplied = Buffer.from(request.headers.authorization ?? '');
  const expected = Buffer.from(`Bearer ${secret}`);
  return supplied.length === expected.length && timingSafeEqual(supplied,expected);
};
const reply = (res,code,body) => { res.writeHead(code,{'content-type':'application/json','cache-control':'no-store'}); res.end(JSON.stringify(body)); };
createServer(async (req,res) => {
  if (req.url === '/health') return reply(res,200,{alive:true});
  if (req.url === '/ready') return reply(res,ready?200:503,{ready});
  if (req.url !== '/infer' || req.method !== 'POST' || !authorized(req)) return reply(res,404,{error:'not_found'});
  if (!ready || busy) return reply(res,503,{error:'runtime_unavailable'});
  busy = true;
  process.stdout.write('BETA_START\n');
  const abort = () => { if (!res.writableFinished) process.stdout.write('BETA_ABORT\n'); };
  res.once('close', abort);
  let directory, timer;
  try {
    const binding = JSON.parse(req.headers['x-beta-binding'] ?? '{}');
    if (!/^[0-9a-f-]{36}$/.test(binding.caseId ?? '') || !/^[0-9a-f-]{36}$/.test(binding.runId ?? '') || !/^[0-9a-f]{64}$/.test(binding.inputHash ?? '') || !Number.isSafeInteger(binding.revision) || binding.revision<1) throw new Error('binding_invalid');
    const mime = req.headers['content-type'];
    if (!['image/png','image/jpeg'].includes(mime)) throw new Error('mime_invalid');
    req.setTimeout(10000,()=>req.destroy());
    const bytes = await readBoundedBytes(Readable.toWeb(req),10*1024*1024);
    if (createHash('sha256').update(bytes).digest('hex') !== binding.inputHash) throw new Error('hash_mismatch');
    directory = await mkdtemp('/tmp/beta/case-');
    await writeFile(`${directory}/input`,bytes,{mode:0o600});
    const raw = await new Promise((resolve,reject)=>{
      pending = resolve;
      timer=setTimeout(()=>{pending=null; child.kill('SIGKILL'); reject(new Error('timeout'));},96000);
      child.stdin.write(`${JSON.stringify({directory,mime})}\n`);
    });
    clearTimeout(timer);
    let forensics = null, display;
    if (raw.facts) {
      const pixels = await readFile(`${directory}/pixels`);
      if (pixels.length !== raw.facts.width*raw.facts.height*3 || pixels.length>50331648) throw new Error('pixels_invalid');
      forensics = await generateForensicFeatureBundleV1({caseId:binding.caseId,bytes,mime,decoded:{width:raw.facts.width,height:raw.facts.height,channels:3,pixels}});
      forensics.fileProvenance.encoderInformation = forensics.fileProvenance.encoderInformation ? 'PRESENT_REDACTED' : null;
      display = (await readFile(`${directory}/display.png`)).toString('base64');
    }
    let cgroupPeakBytes = null;
    try { const peak=Number((await readFile('/sys/fs/cgroup/memory.peak','utf8')).trim()); if(Number.isSafeInteger(peak)&&peak>0)cgroupPeakBytes=peak; } catch {}
    const measurements={startupMs:startup?.loadMs??null,startupPythonRssBytes:startup?.startupRssBytes??null,cgroupPeakBytes,nodeRssBytes:process.memoryUsage().rss,warm:completed>0};
    const result = { ...binding, schemaVersion:BETA_VERSION, checkpoint:SAFE_CHECKPOINT, preprocessing:SAFE_PREPROCESSING, preprocessingHash, runtimeDigest, status:raw.status, score:raw.score, facts:raw.facts??null, timings:raw.timings, forensics, measurements };
    completed++;
    reply(res,200,{result,display});
  } catch { if (!res.headersSent) reply(res,422,{error:'bounded_inference_failed'}); }
  finally { clearTimeout(timer); if(directory) await rm(directory,{recursive:true,force:true}); res.off('close',abort); busy=false; process.stdout.write('BETA_DONE\n'); }
}).listen(8080,'0.0.0.0');
