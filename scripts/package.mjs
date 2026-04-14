#!/usr/bin/env node
// Zip dist into a single release artefact.
import { createWriteStream, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import archiver from 'archiver';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const DIST = join(ROOT, 'dist');
const OUT = join(ROOT, 'quebi-branding.zip');

if (!existsSync(DIST)) { console.error('dist not found — run build first'); process.exit(1); }

const output = createWriteStream(OUT);
const archive = archiver('zip', { zlib: { level: 9 } });
output.on('close', () => console.log(`✓ ${OUT} (${archive.pointer()} bytes)`));
archive.on('error', (e) => { throw e; });
archive.pipe(output);
archive.directory(DIST, 'quebi-branding');
archive.finalize();
