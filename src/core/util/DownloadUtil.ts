import Axios from 'axios';
import crypto from 'crypto';
import fs from 'fs-extra';
import path from 'path';

/**
 * Downloads a file and, when a hash is given, refuses to keep it unless the bytes match.
 *
 * Nothing in Spooder verified a download before this: plugin zips, web UI builds and module
 * UIs were all fetched over HTTPS and extracted on trust. HTTPS proves who served the file,
 * not that the file is the one a person reviewed - and a plugin runs in-process with the
 * user's tokens. The registry records the hash of the reviewed artifact; this is where that
 * record does its work.
 *
 * A failed check deletes the download rather than leaving it for something else to find.
 */
export async function downloadToFile(
  url: string,
  destPath: string,
  expectedSha256?: string | null,
): Promise<void> {
  const response = await Axios({
    url,
    method: 'GET',
    responseType: 'arraybuffer',
    headers: { Accept: 'application/octet-stream' },
  });

  const data = Buffer.from(response.data);

  if (expectedSha256) {
    const actual = crypto.createHash('sha256').update(data).digest('hex');
    if (actual !== expectedSha256.toLowerCase()) {
      throw new Error(
        `Download did not match the expected checksum, so it was discarded.\n` +
          `  expected ${expectedSha256}\n  actual   ${actual}`,
      );
    }
  }

  fs.ensureDirSync(path.dirname(destPath));
  fs.writeFileSync(destPath, data);
}

export function sha256OfFile(filePath: string): string {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}
