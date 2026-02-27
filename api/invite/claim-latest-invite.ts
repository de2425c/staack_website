import type { VercelRequest, VercelResponse } from '@vercel/node';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

interface ClaimLatestInviteRequest {
  token?: string;
}

interface ClaimLatestInviteResponse {
  success: boolean;
  inviterUsername?: string;
  inviterUid?: string | null;
  token?: string;
  message?: string;
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

  let authenticatedUserId: string;
  try {
    const idToken = authHeader.slice(7);
    const decodedToken = await getAuth().verifyIdToken(idToken);
    authenticatedUserId = decodedToken.uid;
  } catch (authError) {
    console.error('Auth error:', authError);
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  const body = req.body as ClaimLatestInviteRequest;

  try {
    const db = getDb();

    let inviteDoc: FirebaseFirestore.QueryDocumentSnapshot | FirebaseFirestore.DocumentSnapshot;
    let inviteData: FirebaseFirestore.DocumentData;

    if (body.token && typeof body.token === 'string') {
      const tokenDoc = await db.collection('pending_invites').doc(body.token).get();

      if (!tokenDoc.exists) {
        return res.status(404).json({
          success: false,
          message: 'Invalid invite token',
        });
      }

      const tokenData = tokenDoc.data();
      if (!tokenData || tokenData.redeemed) {
        return res.status(400).json({
          success: false,
          message: 'Invite already redeemed',
        });
      }

      inviteDoc = tokenDoc;
      inviteData = tokenData;
    } else {
      const invitesSnapshot = await db
        .collection('pending_invites')
        .where('redeemed', '==', false)
        .where('source', '==', 'web')
        .orderBy('createdAt', 'desc')
        .limit(1)
        .get();

      if (invitesSnapshot.empty) {
        return res.status(404).json({
          success: false,
          message: 'No pending invite found',
        });
      }

      inviteDoc = invitesSnapshot.docs[0];
      inviteData = inviteDoc.data();
    }

    if (inviteData.expiresAt && inviteData.expiresAt.toDate() < new Date()) {
      return res.status(400).json({
        success: false,
        message: 'Invite has expired',
      });
    }

    if (inviteData.inviterUid === authenticatedUserId) {
      return res.status(400).json({
        success: false,
        message: 'Cannot claim your own invite',
      });
    }

    await inviteDoc.ref.update({
      redeemed: true,
      redeemedBy: authenticatedUserId,
      redeemedAt: FieldValue.serverTimestamp(),
    });

    const response: ClaimLatestInviteResponse = {
      success: true,
      inviterUsername: inviteData.inviterUsername || inviteData.inviterId,
      inviterUid: inviteData.inviterUid || null,
      token: inviteDoc.id,
    };

    return res.status(200).json(response);
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'unknown';
    console.error('Error claiming invite:', errorMessage);
    return res.status(500).json({ error: `Internal server error: ${errorMessage}` });
  }
}
