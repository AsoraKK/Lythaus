import { constants } from 'node:fs';
import { open } from 'node:fs/promises';

export async function readRegularSource(path) {
  if (constants.O_NOFOLLOW === undefined) throw new Error('no_follow_file_open_unavailable');
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    if (!(await file.stat()).isFile()) throw new Error('regular_file_input_required');
    return await file.readFile();
  } finally {
    await file.close();
  }
}
