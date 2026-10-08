import { describe, expect, it } from 'vitest';
import { findViolations, readSourceTree } from '../../scripts/architecture';

describe('layer rules', () => {
  it('flags a core file importing storage', () => {
    expect(findViolations({ 'src/core/a.ts': "import { x } from '../storage/db';" })).toHaveLength(
      1,
    );
  });

  it('flags one room importing another', () => {
    expect(
      findViolations({
        'src/rooms/lectorium/index.ts': "import { convert } from '../scriptorium/index';",
      }),
    ).toHaveLength(1);
  });

  it('allows a room to use core, reader and storage', () => {
    expect(
      findViolations({
        'src/rooms/lectorium/index.ts':
          "import '../../core/errors'; import '../../reader/location'; import '../../storage/db';",
      }),
    ).toEqual([]);
  });

  it('flags a dynamic import that crosses layers', () => {
    expect(
      findViolations({ 'src/reader/a.ts': "const m = await import('../storage/db');" }),
    ).toHaveLength(1);
  });

  it('flags svelte outside src/ui', () => {
    expect(findViolations({ 'src/core/a.ts': "import { mount } from 'svelte';" })).toHaveLength(1);
    expect(findViolations({ 'src/ui/App.ts': "import { mount } from 'svelte';" })).toEqual([]);
  });

  it('allows ordinary package imports', () => {
    expect(findViolations({ 'src/core/a.ts': "import { unzipSync } from 'fflate';" })).toEqual([]);
  });

  it('the source tree respects the layers', () => {
    expect(findViolations(readSourceTree('src'))).toEqual([]);
  });
});
