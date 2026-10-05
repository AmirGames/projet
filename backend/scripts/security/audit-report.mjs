import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = fileURLToPath(new URL('../../../docs/audits/', import.meta.url));

export async function writeAuditReport(filename, report) {
  await mkdir(directory, { recursive: true });
  const output = path.join(directory, filename);
  await writeFile(output, JSON.stringify(report, null, 2) + '\n');
  return output;
}
