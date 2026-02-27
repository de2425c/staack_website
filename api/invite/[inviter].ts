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
  redeemerIPv4: string | null;
  redeemerIPv6: string | null;
  redeemerUserAgent: string | null;
  redeemerIOSMajorVersion: string | null;
  redeemerDeviceType: string | null;
}

interface ParsedIP {
  ipv4: string | null;
  ipv6: string | null;
}

function parseClientIP(rawIP: string | null): ParsedIP {
  if (!rawIP) {
    return { ipv4: null, ipv6: null };
  }
  const ipv4MappedPrefix = "::ffff:";
  if (rawIP.startsWith(ipv4MappedPrefix)) {
    return { ipv4: rawIP.slice(ipv4MappedPrefix.length), ipv6: null };
  }
  if (rawIP.includes(":")) {
    return { ipv4: null, ipv6: rawIP };
  }
  return { ipv4: rawIP, ipv6: null };
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

    const usersSnapshot = await db.collection("users").where("username", "==", inviterUsername).limit(1).get();

    if (usersSnapshot.empty) {
      res.setHeader("Content-Type", "text/html");
      return res.status(404).send(buildNotFoundPage());
    }

    const inviterUserId = usersSnapshot.docs[0].id;

    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 1);

    const userAgent = (req.headers["user-agent"] as string) || "";
    const { iosMajorVersion, deviceType } = parseUserAgent(userAgent);
    const rawIP = getClientIP(req);
    const { ipv4, ipv6 } = parseClientIP(rawIP);

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
      redeemerIPv4: ipv4,
      redeemerIPv6: ipv6,
      redeemerUserAgent: userAgent || null,
      redeemerIOSMajorVersion: iosMajorVersion,
      redeemerDeviceType: deviceType,
    };

    await db.collection("invite_claims").doc(token).set(inviteClaim);
    console.log(`[INVITE] Created invite claim - Token: ${token}, Inviter: ${inviterUsername}, IPv4: ${ipv4}, IPv6: ${ipv6}, Device: ${deviceType}`);

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
    html {
      height: 100%;
      background-color: #062d1f;
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
      display: inline-block;
      cursor: pointer;
      text-decoration: none;
      transition: transform 0.15s ease;
    }

    .download-btn:active {
      transform: scale(0.95);
    }

    .download-btn img {
      height: 64px;
      width: auto;
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

    <a href="https://apps.apple.com/us/app/stack-poker-learn-train/id6745683972" class="download-btn" target="_blank" aria-label="Download on the App Store">
      <img src="https://tools.applemediaservices.com/api/badges/download-on-the-app-store/white/en-us" alt="Download on the App Store" />
    </a>

    <div class="footer">
      <a href="https://stackpoker.gg">stackpoker.gg</a>
    </div>
  </div>

  <div class="hidden-token" data-token="${token}" data-inviter="${escapeHtml(inviterUsername)}"></div>
</body>
</html>`;
}

function buildNotFoundPage(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
  <title>Invite Not Found - Stack Poker</title>
  <meta name="theme-color" content="#0d5c3d">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Plus+Jakarta+Sans:wght@500;600;700&display=swap" rel="stylesheet">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html { height: 100%; background-color: #062d1f; }
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
      color: #fff;
      -webkit-font-smoothing: antialiased;
      text-align: center;
    }
    .container { max-width: 400px; width: 100%; }
    .error-icon {
      width: 80px;
      height: 80px;
      margin: 0 auto 24px;
      background: rgba(255,255,255,0.1);
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .error-icon svg { width: 40px; height: 40px; color: rgba(255,255,255,0.6); }
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
      color: rgba(255,255,255,0.65);
      margin-bottom: 32px;
      line-height: 1.5;
    }
    .home-link {
      display: inline-block;
      padding: 14px 32px;
      background: rgba(255,255,255,0.12);
      color: #fff;
      font-size: 16px;
      font-weight: 600;
      border-radius: 12px;
      text-decoration: none;
      transition: background 0.15s ease;
    }
    .home-link:active { background: rgba(255,255,255,0.18); }
  </style>
</head>
<body>
  <div class="container">
    <div class="error-icon">
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
      </svg>
    </div>
    <h1>Invite Not Found</h1>
    <p class="subtitle">This invite link is invalid or the user doesn't exist. Ask your friend for a new link.</p>
    <a href="https://stackpoker.gg" class="home-link">Go Back</a>
  </div>
</body>
</html>`;
}
