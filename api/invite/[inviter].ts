import type { VercelRequest, VercelResponse } from "@vercel/node";
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";
import { randomUUID } from "crypto";

interface InviteClaim {
  token: string;
  inviterUsername: string;
  inviterUserId: string;
  source: "web" | "app";
  createdAt: FirebaseFirestore.FieldValue;
  expiresAt: FirebaseFirestore.Timestamp;
  status: "pending" | "redeemed" | "expired";
  redeemedByUserId: string | null;
  redeemedAt: FirebaseFirestore.FieldValue | null;
  redeemerIPAddress: string | null;
  redeemerUserAgent: string | null;
  redeemerIOSMajorVersion: string | null;
  redeemerDeviceType: string | null;
}

function parseUserAgent(userAgent: string): { iosMajorVersion: string | null; deviceType: string | null } {
  let iosMajorVersion: string | null = null;
  let deviceType: string | null = null;

  const iosMatch = userAgent.match(/(?:iPhone|iPad|iPod).*?OS (\d+)/i);
  if (iosMatch) {
    iosMajorVersion = iosMatch[1];
  }

  if (/iPhone/i.test(userAgent)) {
    deviceType = "iPhone";
  } else if (/iPad/i.test(userAgent)) {
    deviceType = "iPad";
  } else if (/iPod/i.test(userAgent)) {
    deviceType = "iPod";
  } else if (/Android/i.test(userAgent)) {
    deviceType = "Android";
  } else if (/Mac/i.test(userAgent)) {
    deviceType = "Mac";
  } else if (/Windows/i.test(userAgent)) {
    deviceType = "Windows";
  }

  return { iosMajorVersion, deviceType };
}

function getClientIP(req: VercelRequest): string | null {
  const xForwardedFor = req.headers["x-forwarded-for"];
  if (typeof xForwardedFor === "string") {
    return xForwardedFor.split(",")[0].trim();
  }
  const xRealIP = req.headers["x-real-ip"];
  if (typeof xRealIP === "string") {
    return xRealIP;
  }
  return null;
}

function getDb(): FirebaseFirestore.Firestore {
  if (getApps().length === 0) {
    const projectId = process.env.FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

    console.log(`[DEBUG] Firebase init - projectId exists: ${!!projectId}, clientEmail exists: ${!!clientEmail}, privateKey exists: ${!!privateKey}`);

    if (!projectId || !clientEmail || !privateKey) {
      throw new Error(`Missing Firebase credentials: projectId=${!!projectId}, clientEmail=${!!clientEmail}, privateKey=${!!privateKey}`);
    }

    initializeApp({
      credential: cert({
        projectId,
        clientEmail,
        privateKey,
      }),
    });
  }
  return getFirestore();
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<VercelResponse> {
  const { inviter } = req.query;

  if (!inviter || typeof inviter !== "string") {
    return res.status(400).send("Missing inviter ID");
  }

  const inviterUsername = inviter;

  try {
    const db = getDb();
    const token = randomUUID();

    const usersSnapshot = await db
      .collection("users")
      .where("username", "==", inviterUsername)
      .limit(1)
      .get();

    if (usersSnapshot.empty) {
      return res.status(404).send("User not found");
    }

    const inviterUserId = usersSnapshot.docs[0].id;

    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 1);

    const userAgent = (req.headers["user-agent"] as string) || "";
    const { iosMajorVersion, deviceType } = parseUserAgent(userAgent);
    const clientIP = getClientIP(req);

    const inviteClaim: InviteClaim = {
      token,
      inviterUsername,
      inviterUserId,
      source: "web",
      createdAt: FieldValue.serverTimestamp(),
      expiresAt: Timestamp.fromDate(expiresAt),
      status: "pending",
      redeemedByUserId: null,
      redeemedAt: null,
      redeemerIPAddress: clientIP,
      redeemerUserAgent: userAgent || null,
      redeemerIOSMajorVersion: iosMajorVersion,
      redeemerDeviceType: deviceType,
    };

    await db.collection("invite_claims").doc(token).set(inviteClaim);
    console.log(`[INVITE] Created invite claim - Token: ${token}, Inviter: ${inviterUsername}, IP: ${clientIP}, Device: ${deviceType}`);

    const title = "Join me on Stack Poker!";
    const description = "Your friend invited you to Stack Poker - the poker training app.";
    const ogImageUrl = "https://stackpoker.gg/images/og-invite.png";

    const html = buildInvitePage(inviterUsername, token, title, description, ogImageUrl);

    res.setHeader("Content-Type", "text/html");
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    return res.status(200).send(html);
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "unknown";
    console.error("Error creating pending invite:", errorMessage);
    return res.status(500).send(`Internal server error: ${errorMessage}`);
  }
}

function buildInvitePage(inviterUsername: string, token: string, title: string, description: string, ogImageUrl: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
  <title>${escapeHtml(title)}</title>
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:image" content="${ogImageUrl}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:type" content="website">
  <meta property="og:url" content="https://stackpoker.gg/invite/${escapeHtml(inviterUsername)}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeHtml(title)}">
  <meta name="twitter:description" content="${escapeHtml(description)}">
  <meta name="twitter:image" content="${ogImageUrl}">
  <meta name="theme-color" content="#0d5c3d">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Plus+Jakarta+Sans:wght@500;600;700&display=swap" rel="stylesheet">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { 
      height: 100%;
    }
    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
      background: linear-gradient(180deg, #0d5c3d 0%, #094d33 50%, #062d1f 100%);
      background-attachment: fixed;
      min-height: 100vh;
      min-height: 100dvh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 24px;
      padding-top: max(24px, env(safe-area-inset-top));
      padding-bottom: max(24px, env(safe-area-inset-bottom));
      padding-left: max(24px, env(safe-area-inset-left));
      padding-right: max(24px, env(safe-area-inset-right));
      color: #fff;
      -webkit-font-smoothing: antialiased;
      overflow-x: hidden;
    }

    .container {
      max-width: 400px;
      width: 100%;
      text-align: center;
    }

    .logo {
      width: 80px;
      height: 80px;
      margin: 0 auto 24px;
      background: #fff;
      border-radius: 20px;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 8px 32px rgba(0,0,0,0.2);
    }

    .logo img {
      width: 60px;
      height: 60px;
      object-fit: contain;
    }

    h1 {
      font-family: 'Plus Jakarta Sans', sans-serif;
      font-size: 28px;
      font-weight: 700;
      margin-bottom: 12px;
      line-height: 1.2;
      letter-spacing: -0.5px;
    }

    .subtitle {
      font-size: 16px;
      color: rgba(255,255,255,0.75);
      margin-bottom: 32px;
      line-height: 1.5;
    }

    .invite-card {
      background: rgba(255,255,255,0.1);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      border: 1px solid rgba(255,255,255,0.15);
      border-radius: 20px;
      padding: 24px;
      margin-bottom: 24px;
    }

    .invite-label {
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 1px;
      color: rgba(255,255,255,0.5);
      margin-bottom: 8px;
    }

    .inviter-name {
      font-family: 'Plus Jakarta Sans', sans-serif;
      font-size: 20px;
      font-weight: 600;
    }

    .features {
      display: flex;
      flex-direction: column;
      gap: 12px;
      margin-bottom: 32px;
      text-align: left;
    }

    .feature {
      display: flex;
      align-items: center;
      gap: 12px;
      font-size: 14px;
      color: rgba(255,255,255,0.85);
    }

    .feature-icon {
      width: 32px;
      height: 32px;
      background: rgba(255,255,255,0.1);
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }

    .feature-icon svg {
      width: 18px;
      height: 18px;
      color: #FFD700;
    }

    .download-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      width: 100%;
      padding: 18px 24px;
      background: #fff;
      color: #0d5c3d;
      font-size: 17px;
      font-weight: 600;
      border: none;
      border-radius: 14px;
      cursor: pointer;
      text-decoration: none;
      transition: transform 0.15s ease, box-shadow 0.15s ease;
      box-shadow: 0 4px 16px rgba(0,0,0,0.15);
    }

    .download-btn:active {
      transform: scale(0.98);
    }

    .download-btn svg {
      width: 22px;
      height: 22px;
    }

    .footer {
      margin-top: 24px;
      font-size: 12px;
      color: rgba(255,255,255,0.4);
    }

    .footer a {
      color: rgba(255,255,255,0.6);
      text-decoration: none;
    }

    .hidden-token {
      display: none;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="logo">
      <img src="/images/stack-logo-small.png" alt="Stack Poker" style="filter: brightness(0);">
    </div>

    <h1>You're Invited to Stack Poker</h1>
    <p class="subtitle">Your friend wants you to join the best poker training app</p>

    <div class="invite-card">
      <div class="invite-label">Invited by</div>
      <div class="inviter-name">${escapeHtml(inviterUsername)}</div>
    </div>

    <div class="features">
      <div class="feature">
        <div class="feature-icon">
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/>
          </svg>
        </div>
        <span>Daily poker puzzles with GTO feedback</span>
      </div>
      <div class="feature">
        <div class="feature-icon">
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/>
          </svg>
        </div>
        <span>Track your progress and improve faster</span>
      </div>
      <div class="feature">
        <div class="feature-icon">
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"/>
          </svg>
        </div>
        <span>Compete with friends on leaderboards</span>
      </div>
    </div>

    <a href="https://apps.apple.com/us/app/stack-poker-learn-train/id6745683972" class="download-btn" target="_blank">
      <svg viewBox="0 0 24 24" fill="currentColor">
        <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
      </svg>
      Download on the App Store
    </a>

    <div class="footer">
      <a href="https://stackpoker.gg">stackpoker.gg</a>
    </div>
  </div>

  <div class="hidden-token" data-token="${token}" data-inviter="${escapeHtml(inviterUsername)}"></div>
</body>
</html>`;
}
