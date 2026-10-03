import { createInitialAdmin, resetTestDatabase } from '../global-setup';

/** Phase 13 starting point: a clean commercial database whose only account is the initial ADMIN. */
export default async function journeysGlobalSetup(): Promise<void> {
  resetTestDatabase();
  await createInitialAdmin();
}
