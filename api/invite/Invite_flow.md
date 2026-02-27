# Invite System Documentation

## Overview

The invite system allows users to share invite links. When a new user signs up through an invite link, both users can be rewarded. The system handles two scenarios:

1. **App Installed**: User taps link → App opens directly
2. **App NOT Installed**: User taps link → Safari opens → User downloads app

---

## Endpoints

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/invite/:username` | GET | No | Generates invite page and creates invite claim |
| `/api/invite/claim-by-fingerprint` | POST | Yes | Claims invite by matching device fingerprint |
| `/api/invite/create-pending-invite` | POST | Yes | Creates pending invite (app installed case) |
| `/api/invite/redeem` | POST | Yes | Redeems an invite after signup |

---

## Flow 1: App NOT Installed

```
┌─────────────────────────────────────────────────────────────────┐
│                    APP NOT INSTALLED FLOW                       │
└─────────────────────────────────────────────────────────────────┘

1. User A shares link: stackpoker.gg/invite/kurtc
                              │
                              ▼
2. User B taps link (app not installed)
                              │
                              ▼
3. Safari opens → GET /invite/kurtc
                              │
                              ▼
4. Server creates invite_claim in Firestore:
   ┌────────────────────────────────────┐
   │ Collection: invite_claims          │
   │ Document ID: <uuid>                │
   ├────────────────────────────────────┤
   │ inviterUsername: "kurtc"           │
   │ inviterUserId: "abc123..."         │
   │ status: "pending"                  │
   │ createdAt: <timestamp>             │
   │ expiresAt: <1 hour from now>       │
   │ redeemerIPAddress: "192.168.1.1"   │
   │ redeemerUserAgent: "Mozilla/..."   │
   │ redeemerIOSMajorVersion: "17"      │
   │ redeemerDeviceType: "iPhone"       │
   │ redeemedByUserId: null             │
   │ redeemedAt: null                   │
   └────────────────────────────────────┘
                              │
                              ▼
5. Page shows "Download Stack Poker" → User B clicks
                              │
                              ▼
6. User B installs app from App Store
                              │
                              ▼
7. User B opens app → Signs up/logs in
                              │
                              ▼
8. App calls POST /api/invite/claim-by-fingerprint
   ┌────────────────────────────────────┐
   │ Headers:                           │
   │   Authorization: Bearer <token>    │
   │ Body:                              │
   │   deviceType: "iPhone"             │
   │   iosMajorVersion: "17"            │
   └────────────────────────────────────┘
                              │
                              ▼
9. Server matches by:
   - IP address (same WiFi network)
   - Device type (iPhone/iPad)
   - iOS version
   - Not expired (within 1 hour)
   - status: "pending"
                              │
                              ▼
10. Server updates invite_claim:
    status: "redeemed"
    redeemedByUserId: <User B's UID>
    redeemedAt: <timestamp>
                              │
                              ▼
11. Returns inviter info to app:
    ┌────────────────────────────────────┐
    │ {                                  │
    │   "success": true,                 │
    │   "inviterUsername": "kurtc",      │
    │   "inviterUserId": "abc123..."     │
    │ }                                  │
    └────────────────────────────────────┘
```

---

## Flow 2: App Installed

```
┌─────────────────────────────────────────────────────────────────┐
│                     APP INSTALLED FLOW                          │
└─────────────────────────────────────────────────────────────────┘

1. User A shares link: stackpoker.gg/invite/kurtc
                              │
                              ▼
2. User B taps link (app IS installed)
                              │
                              ▼
3. iOS Universal Link opens app directly
                              │
                              ▼
4. App extracts username from URL: "kurtc"
                              │
                              ▼
5. App calls POST /api/invite/create-pending-invite
   ┌────────────────────────────────────┐
   │ Headers:                           │
   │   Authorization: Bearer <token>    │
   └────────────────────────────────────┘
                              │
                              ▼
6. Server creates pending invite
                              │
                              ▼
7. After User B completes signup:
   App calls POST /api/invite/redeem
   ┌────────────────────────────────────┐
   │ Headers:                           │
   │   Authorization: Bearer <token>    │
   │ Body:                              │
   │   inviterId: "abc123..."           │
   └────────────────────────────────────┘
```

---

## Firestore Collections

### `invite_claims`

Created when Safari opens invite link (app not installed).

```typescript
interface InviteClaim {
  token: string;                    // UUID
  inviterUsername: string;          // "kurtc"
  inviterUserId: string;            // Firebase UID
  source: "web" | "app";
  status: "pending" | "redeemed" | "expired";
  createdAt: Timestamp;
  expiresAt: Timestamp;             // 1 hour TTL
  redeemedByUserId: string | null;
  redeemedAt: Timestamp | null;
  redeemerIPAddress: string | null;
  redeemerUserAgent: string | null;
  redeemerIOSMajorVersion: string | null;
  redeemerDeviceType: string | null;
}
```

### `redeemed_invites`

Created when invite is finalized after signup.

```typescript
interface RedeemedInvite {
  userId: string;           // User who redeemed
  inviterId: string;        // User who invited
  redeemedAt: Timestamp;
  source: string;           // "universal_link"
}
```

---

## iOS Implementation

### Claiming Invite on First Launch

```swift
func claimInviteIfAvailable() async throws -> InviteInfo? {
    guard let user = Auth.auth().currentUser else { return nil }
    
    let idToken = try await user.getIDToken()
    
    var request = URLRequest(url: URL(string: "https://stackpoker.gg/api/invite/claim-by-fingerprint")!)
    request.httpMethod = "POST"
    request.setValue("Bearer \(idToken)", forHTTPHeaderField: "Authorization")
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    
    let body: [String: Any] = [
        "deviceType": "iPhone",
        "iosMajorVersion": "\(ProcessInfo.processInfo.operatingSystemVersion.majorVersion)"
    ]
    request.httpBody = try JSONSerialization.data(withJSONObject: body)
    
    let (data, _) = try await URLSession.shared.data(for: request)
    let response = try JSONDecoder().decode(ClaimResponse.self, from: data)
    
    if response.success {
        return InviteInfo(
            inviterUsername: response.inviterUsername,
            inviterUserId: response.inviterUserId
        )
    }
    return nil
}
```

---

## Security

- All POST endpoints require Firebase Auth (Bearer token)
- Invites expire after 1 hour
- Users cannot claim their own invites
- Each user can only redeem one invite
- IP-based matching provides reasonable accuracy on same network

---

## Required Firestore Indexes

If you see `FAILED_PRECONDITION` errors, create composite indexes:

1. `invite_claims`:
   - `status` ASC, `expiresAt` ASC, `redeemerIPAddress` ASC

2. `pending_invites` (legacy):
   - `redeemed` ASC, `source` ASC, `createdAt` DESC
