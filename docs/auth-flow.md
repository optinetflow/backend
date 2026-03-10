# Authentication Flow

## Overview

Phone-based authentication with OTP verification. JWT tokens stored in HTTP-only cookies. Three auth levels: unauthenticated, authenticated (user), and admin.

## Signup Flow

```mermaid
sequenceDiagram
    participant U as User (Frontend)
    participant A as API (AuthService)
    participant S as SMS Provider
    participant T as Telegram Bot
    participant DB as PostgreSQL

    U->>A: signup(phone, password, fullname, promoCode, domainName)
    A->>DB: Resolve brand by domainName
    A->>DB: Validate promoCode → get parent user
    A->>DB: Check for existing unverified user
    alt Existing unverified user
        A->>DB: Update user with new data + OTP
    else New user
        A->>DB: Create user (isVerified: false)
        A->>DB: Create UserGift if promo has gift
    end
    A->>S: Send OTP via SMS (fire-and-forget)
    A->>T: Send registration report to brand group
    A->>T: Notify reseller (parent user)
    A-->>U: Return user (not yet verified)

    U->>A: verifyPhone(otp, domainName)
    A->>DB: Validate OTP + expiration
    A->>DB: Set isVerified = true, clear OTP
    A->>A: Generate JWT access + refresh tokens
    A-->>U: Set HTTP-only cookie with tokens
```

## Login Flow

```mermaid
sequenceDiagram
    participant U as User (Frontend)
    participant A as API (AuthService)
    participant DB as PostgreSQL

    U->>A: login(phone, password, domainName)
    A->>DB: Resolve brand by domainName
    A->>DB: Find user by (phone, brandId)
    alt User not found
        A->>DB: Check if password is a valid promo code
        alt Valid promo code
            A-->>U: {isPromoCodeValid: true}
            Note over U: Frontend redirects to signup with promo
        else Invalid
            A-->>U: 404 Not Found
        end
    else User found
        A->>A: Validate password (bcrypt compare)
        A->>A: Generate JWT tokens
        A-->>U: Set HTTP-only cookie + return user data
    end
```

## Token Management

- **Access token**: Signed with `JWT_ACCESS_SECRET`, expires per `ACCESS_TOKEN_EXPIRE_IN` (default: 7d).
- **Refresh token**: Signed with `JWT_REFRESH_SECRET`, longer-lived.
- **Storage**: Both tokens stored in a single HTTP-only cookie named `token` as JSON: `{accessT, refreshT}`.
- **Cookie settings**: `sameSite: strict`, `secure: true` in production, `httpOnly: true`, 2-year expiry.

## Auth Guards

| Guard | Behavior | Used for |
|---|---|---|
| `GqlAuthGuard` | Requires valid JWT. Returns 401 if missing/invalid. | All authenticated operations |
| `OptionalGqlAuthGuard` | Parses JWT if present, sets `req.user`. Allows unauthenticated access. | Signup (existing user creating sub-users) |
| `AdminGqlAuthGuard` | Requires valid JWT AND `user.role === 'ADMIN'`. | Admin-only operations |

## Password Validation

1. Compare against bcrypt hash of user's password.
2. If user has a `parentId`, also try the parent's password (allows resellers to access child accounts).

## OTP Details

- 4-digit numeric code: `Math.floor(1000 + Math.random() * 9000)`
- Configurable expiration via `OTP_EXPIRATION` env var (in minutes)
- Delivered via SMS.ir API
- Stored in `user.otp` and `user.otpExpiration` fields
- Cleared after successful verification
