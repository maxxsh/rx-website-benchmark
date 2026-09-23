import { json } from '@sveltejs/kit';
import { mkdir, writeFile } from 'fs/promises';
import { dirname } from 'path';

export async function POST({ request }) {
  try {
    const body = await request.json().catch(() => null);

    if (!body || !Array.isArray(body.data)) {
      return json(
        { saved: false, error: 'Request must include "data" array' },
        { status: 400 }
      );
    }

    if (!body.page) {
      return json(
        { saved: false, error: 'Request must include "page" parameter' },
        { status: 400 }
      );
    }

    const filename = `${body.page}.json`;
    const outputPath = `static/json/${filename}`;
    const outputDir = dirname(outputPath);

    await mkdir(outputDir, { recursive: true });
    await writeFile(outputPath, JSON.stringify(body.data, null, 2), 'utf8');
    return json({ saved: true, count: body.data.length, path: outputPath });
  } catch (err) {
    return json({ saved: false, error: err.message || String(err) }, { status: 500 });
  }
}

