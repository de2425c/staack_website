import type { VercelRequest, VercelResponse } from '@vercel/node';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { customAlphabet } from 'nanoid';

// 8-char URL-safe alphabet (no confusing chars like 0/O, 1/l)
const nanoid = customAlphabet('23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz', 8);

function getDb() {
  if (getApps().length === 0) {
    initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      }),
    });
  }
  return getFirestore();
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { hand_id, user_id, display_name } = req.body;

    if (!hand_id || typeof hand_id !== 'string') {
      return res.status(400).json({ error: 'Missing hand_id' });
    }

    if (!user_id || typeof user_id !== 'string') {
      return res.status(400).json({ error: 'Missing user_id' });
    }

    const db = getDb();

    // Verify hand exists
    const handDoc = await db.collection('hands').doc(hand_id).get();
    if (!handDoc.exists) {
      return res.status(404).json({ error: 'Hand not found' });
    }

    // Check if this hand was already shared by this user
    const existingShare = await db
      .collection('shared_hands')
      .where('hand_id', '==', hand_id)
      .where('user_id', '==', user_id)
      .limit(1)
      .get();

    if (!existingShare.empty) {
      // Return existing share URL
      const existingDoc = existingShare.docs[0];
      const shareId = existingDoc.id;
      return res.status(200).json({
        share_id: shareId,
        share_url: `https://stackpoker.gg/hands/${shareId}`,
      });
    }

    // Generate unique share ID
    const shareId = nanoid();

    // Create shared_hands entry
    await db.collection('shared_hands').doc(shareId).set({
      share_id: shareId,
      hand_id: hand_id,
      user_id: user_id,
      sharer_name: display_name || 'Someone',
      created_at: FieldValue.serverTimestamp(),
      view_count: 0,
    });

    return res.status(200).json({
      share_id: shareId,
      share_url: `https://stackpoker.gg/hands/${shareId}`,
    });
  } catch (error: any) {
    console.error('Error creating share:', error?.message, error?.code, error?.stack);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
