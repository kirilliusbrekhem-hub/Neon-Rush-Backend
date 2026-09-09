import { env } from '../config/env';

/**
 * Thin Firestore adapter. Real Firebase Admin SDK wiring is intentionally
 * deferred: no service-account keys are stored in this repo. When
 * FIRESTORE_ENABLED=true and GOOGLE_APPLICATION_CREDENTIALS points to a local
 * (untracked) service account file, swap the body of `writeLeaderboard` for a
 * real `firebase-admin` Firestore batch write.
 *
 * Postgres (season_player_stats) remains the source of truth for money/rush.
 * Firestore only ever holds a denormalised, disposable read cache.
 */

export interface LeaderboardEntry {
  userId: string;
  username: string;
  rushEarned: number;
  rank: number;
}

export async function writeLeaderboard(seasonId: string, entries: LeaderboardEntry[]): Promise<void> {
  if (!env.firestoreEnabled) {
    // eslint-disable-next-line no-console
    console.log(`[firestore:stub] would sync ${entries.length} leaderboard rows for season ${seasonId}`);
    return;
  }
  // TODO: real sync, e.g.:
  // const db = getFirestoreAdmin();
  // const batch = db.batch();
  // for (const e of entries) {
  //   batch.set(db.collection('seasons').doc(seasonId).collection('leaderboard').doc(e.userId), e);
  // }
  // await batch.commit();
  throw new Error('Firestore sync not yet wired up — set FIRESTORE_ENABLED=false until implemented');
}
