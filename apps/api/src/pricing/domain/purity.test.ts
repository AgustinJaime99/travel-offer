import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/** CLAUDE.md: pure pricing domain logic, separated from controllers and database access. */
describe('pricing domain purity', () => {
  it('imports no framework, database or HTTP code', () => {
    const dir = new URL('.', import.meta.url);
    const sources = readdirSync(dir).filter((file) => file.endsWith('.ts'));
    expect(sources).toContain('pricing-engine.ts');
    for (const file of sources.filter((name) => !name.endsWith('.test.ts'))) {
      const imports = [...readFileSync(new URL(file, dir), 'utf8').matchAll(/from '([^']+)'/g)].map(
        (m) => m[1],
      );
      expect({ file, imports }).toEqual({ file, imports: [] });
    }
  });
});
