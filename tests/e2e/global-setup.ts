import { execSync } from 'node:child_process';

/** Writes the fixtures the harness page fetches from /tests/fixtures/generated/. */
export default function globalSetup(): void {
  execSync('npm run fixtures', { stdio: 'inherit' });
}
