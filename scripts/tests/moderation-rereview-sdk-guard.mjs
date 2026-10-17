import { readFileSync } from 'node:fs';
import { parseModerationRereviewRequest } from '../../apps/lythaus-admin-api/src/moderation-rereview-runtime.ts';

process.stdout.write(JSON.stringify(parseModerationRereviewRequest(JSON.parse(readFileSync(0, 'utf8')))));
