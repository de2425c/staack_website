import type { VercelRequest, VercelResponse } from '@vercel/node';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';

interface ClaimByFingerprintRequest {
  iosMajorVersion?: string;
  deviceType?: string;
}

interface ClaimByFingerprintResponse {
  success: boolean;
  inviterUsername?: string;
  inviterUserId?: string;
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

function getClientIP(req: VercelRequest): string | null {
  const xForwardedFor = req.headers['x-forwarded-for'];
  if (typeof xForwardedFor === 'string') {
    return xForwardedFor.split(',')[0].trim();
  }
  const xRealIP = req.headers['x-real-ip'];
  if (typeof xRealIP === 'string') {
    return xRealIP;
  }
  return null;
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

  const body = req.body as ClaimByFingerprintRequest;
  const clientIP = getClientIP(req);
  const userAgent = (req.headers['user-agent'] as string) || '';

  try {
    const db = getDb();
    const now = Timestamp.now();

    let query = db
      .collection('invite_claims')
      .where('status', '==', 'pending')
      .where('expiresAt', '>', now);

    if (clientIP) {
      query = query.where('redeemerIPAddress', '==', clientIP);
    }

    if (body.deviceType) {
      query = query.where('redeemerDeviceType', '==', body.deviceType);
    }

    const claimsSnapshot = await query.orderBy('expiresAt', 'asc').orderBy('createdAt', 'desc').limit(5).get();

    if (claimsSnapshot.empty) {
      const response: ClaimByFingerprintResponse = {
        success: false,
        message: 'No matching invite found',
      };
      return res.status(404).json(response);
    }

    let matchedClaim: FirebaseFirestore.QueryDocumentSnapshot | null = null;

    for (const doc of claimsSnapshot.docs) {
      const claimData = doc.data();

      if (claimData.inviterUserId === authenticatedUserId) {
        continue;
      }

      if (body.iosMajorVersion && claimData.redeemerIOSMajorVersion) {
        if (claimData.redeemerIOSMajorVersion !== body.iosMajorVersion) {
          continue;
        }
      }

      matchedClaim = doc;
      break;
    }

    if (!matchedClaim) {
      const response: ClaimByFingerprintResponse = {
        success: false,
        message: 'No matching invite found for your device',
      };
      return res.status(404).json(response);
    }

    const claimData = matchedClaim.data();

    await matchedClaim.ref.update({
      status: 'redeemed',
      redeemedByUserId: authenticatedUserId,
      redeemedAt: FieldValue.serverTimestamp(),
    });

    console.log(`[INVITE] Claimed by fingerprint - Token: ${matchedClaim.id}, Redeemer: ${authenticatedUserId}, IP: ${clientIP}`);

    const response: ClaimByFingerprintResponse = {
      success: true,
      inviterUsername: claimData.inviterUsername,
      inviterUserId: claimData.inviterUserId,
      token: matchedClaim.id,
    };

    return res.status(200).json(response);
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'unknown';
    console.error('Error claiming invite:', errorMessage);
    return res.status(500).json({ error: `Internal server error: ${errorMessage}` });
  }
}
