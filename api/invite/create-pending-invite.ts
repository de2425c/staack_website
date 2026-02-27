import type { VercelRequest, VercelResponse } from '@vercel/node';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { randomUUID } from 'crypto';

interface PendingInvite {
  token: string;
  inviterUid: string;
  inviterUsername: string | null;
  createdAt: FirebaseFirestore.FieldValue;
  expiresAt: FirebaseFirestore.Timestamp;
  redeemed: boolean;
  redeemedBy: string | null;
  redeemedAt: FirebaseFirestore.FieldValue | null;
  source: 'app' | 'web';
}

function initFirebase(): void {
  if (getApps().length === 0) {
    initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      }),
    });
  }
}

function getDb(): FirebaseFirestore.Firestore {
  initFirebase();
  return getFirestore();
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<VercelResponse> {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid Authorization header' });
  }

  initFirebase();

  let inviterUid: string;
  try {
    const idToken = authHeader.slice(7);
    const decodedToken = await getAuth().verifyIdToken(idToken);
    inviterUid = decodedToken.uid;
  } catch (authError) {
    console.error('Auth error:', authError);
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  try {
    const db = getDb();
    const token = randomUUID();

    let inviterUsername: string | null = null;
    const userDoc = await db.collection('users').doc(inviterUid).get();
    if (userDoc.exists) {
      inviterUsername = userDoc.data()?.username || null;
    }

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

    const pendingInvite: PendingInvite = {
      token,
      inviterUid,
      inviterUsername,
      createdAt: FieldValue.serverTimestamp(),
      expiresAt: Timestamp.fromDate(expiresAt),
      redeemed: false,
      redeemedBy: null,
      redeemedAt: null,
      source: 'app',
    };

    await db.collection('pending_invites').doc(token).set(pendingInvite);

    return res.status(200).json({
      success: true,
      token,
      inviterUid,
      inviterUsername,
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'unknown';
    console.error('Error creating pending invite:', errorMessage);
    return res.status(500).json({ error: `Internal server error: ${errorMessage}` });
  }
}
