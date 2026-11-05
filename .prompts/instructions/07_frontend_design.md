# Build a Premium Spatial Liquid Glass Authentication Experience

Act as a senior creative frontend engineer, UI/UX designer, and full-stack architect.

Design and implement a highly distinctive, production-oriented authentication website using Next.js, TypeScript, Tailwind CSS, and modern React practices.

The project is intentionally minimal in functionality but must be exceptional in visual quality.

It has only two main application states:

1. Authentication: Login and Sign Up.
2. Authenticated Welcome Screen: A personalized welcome message displaying the user's username.

There must be no dashboard, navigation system, user profile page, landing-page sections, or unrelated application features.

The visual direction is a carefully balanced combination of:

- Liquid Glass.
- Spatial Glassmorphism.
- Cinematic Dark UI.
- Futuristic Minimalism.
- Subtle 3D visual design.

The result must feel like a custom-designed digital environment, not a generic AI-generated SaaS template.

---

## 1. CORE DESIGN CONCEPT

Create a dark, immersive digital environment that resembles a sophisticated spatial interface.

Imagine a minimal futuristic environment in which translucent glass surfaces, subtle reflections, soft atmospheric lighting, and carefully positioned floating objects create a sense of depth.

The design should communicate:

- Elegance.
- Technical sophistication.
- Privacy.
- Modernity.
- Precision.
- Simplicity.

The visual experience should be memorable without becoming visually noisy.

IMPORTANT DESIGN PRINCIPLE:

Do not create a typical login page with a centered white card on a gradient background.

Avoid recognizable generic AI-generated website patterns.

The composition, typography, surfaces, lighting, spacing, and visual hierarchy must feel intentionally art-directed.

## 2. COLOR SYSTEM

Use a sophisticated dark color palette.

Primary background:
#080B12

Secondary background:
#101724

Deep navy:
#111927

Primary text:
#F4F6FA

Secondary text:
#9DA9B8

Muted text:
#687588

Ice blue accent:
#9ACFE4

Lavender accent:
#AAA5D8

Glass background:
rgba(225, 240, 255, 0.055)

Glass border:
rgba(225, 240, 255, 0.14)

Subtle white reflection:
rgba(255, 255, 255, 0.2)

Use blue and lavender only as subtle lighting accents.

Do not cover the entire interface with purple-blue gradients.

The background should primarily remain dark and sophisticated.

## 3. BACKGROUND AND ATMOSPHERE

The entire application should occupy the full viewport.

Use:

- A near-black background.
- Extremely subtle radial lighting.
- Deep navy atmospheric shadows.
- Very faint spatial grid details.
- Soft light diffusion.
- Subtle background depth.

Create a custom abstract spatial glass sculpture using CSS, SVG, or carefully constructed layered shapes.

The sculpture should resemble a combination of translucent glass rings, curved surfaces, and reflective geometric forms.

It should have:

- Multiple translucent layers.
- Soft ice-blue reflections.
- Subtle lavender highlights.
- Realistic depth through shadows and gradients.
- Delicate edge highlights.
- Slightly blurred atmospheric lighting.

The 3D object must be visually sophisticated, not a random decorative blob.

It should remain subordinate to the authentication interface.

Prefer custom CSS/SVG artwork over generic stock images.

Do not rely on external image URLs.

## 4. PAGE COMPOSITION

Use an asymmetric desktop composition rather than a conventional centered authentication card.

The main content should occupy a carefully proportioned area with generous negative space.

Suggested desktop arrangement:

- One visual area containing the abstract spatial glass sculpture and minimal editorial typography.
- One authentication area containing the glass interface panel.
- A small amount of supporting microcopy.
- A persistent technical footer in the lower-left corner.

Use a sophisticated grid system and intentional alignment.

Suggested maximum content width: 1360px.

Avoid excessive card-based layouts.

The authentication panel should be the primary interactive focal point.

## 5. AUTHENTICATION PANEL

Create a premium translucent glass panel.

Suggested characteristics:

- Background: rgba(225, 240, 255, 0.055).
- Backdrop blur: approximately 24px.
- Thin translucent border.
- Soft internal highlights.
- Carefully controlled shadow.
- Subtle edge reflections.
- Approximately 20–26px corner radius.

The panel should feel like a physical glass surface floating in a dark environment.

Do not overuse glass effects on every component.

The form must remain highly readable.

### Authentication tabs

Create two modes:

- ورود (Login)
- ثبت‌نام (Sign Up)

Switching modes must happen within the same page, without a full-page reload.

The selected mode should have a subtle glass-highlight treatment.

Avoid conventional brightly colored tabs.

### Login form

Fields:

1. نام کاربری (Username)
2. رمز عبور (Password)

Primary action:

ورود

### Registration form

Fields:

1. نام کاربری (Username)
2. رمز عبور (Password)

Primary action:

ایجاد حساب کاربری

There must be no email address field, phone number field, social login, or third-party authentication.

Username and password are the only registration credentials.

Include a subtle password visibility toggle.

### Input styling

Inputs should have:

- Dark translucent surfaces.
- Fine borders.
- Subtle focus illumination.
- Smooth focus transitions.
- Clear placeholder text.
- Proper RTL alignment.
- Consistent vertical spacing.

Do not use bright neon outlines.

Input fields should feel integrated into the glass material.

## 6. AUTHENTICATION INTERACTIONS

Implement the following states:

- Login mode.
- Registration mode.
- Loading state.
- Authentication error.
- Registration success.
- Authenticated welcome state.

On successful registration, automatically establish an authenticated session and display the welcome screen.

On successful login, replace the authentication panel with the welcome screen.

The username returned by the backend must be displayed dynamically.

Welcome message:

«خوش آمدید، {username}»

The username must be inserted from the authenticated session, not hardcoded.

The welcome screen should preserve the same visual environment and spatial lighting.

Replace the authentication form with a more minimal welcome panel.

Include:

- A subtle success or confirmation visual.
- The welcome message.
- The authenticated username.
- A small logout button.

Do not create an additional dashboard or introduce unrelated actions.

On logout, return to the authentication interface.

## 7. ORCHESTRATION ARCHITECTURE

This project must be designed to support an orchestration-based backend architecture.

Do not implement orchestration as a purely decorative frontend concept.

Create a clean separation between:

- Authentication logic.
- Session management.
- Orchestration integration.
- Pod identification.
- Frontend presentation.

The frontend must communicate with server-side API routes.

Use a clearly defined orchestration adapter/interface so that the actual orchestration provider can be connected without rewriting the UI.

For example, define a server-side interface conceptually similar to:

```ts
interface OrchestrationResult<T> {
  data: T;
  podId: string;
}

interface OrchestrationAdapter {
  dispatch<T>(
    action: string,
    payload: unknown
  ): Promise<OrchestrationResult<T>>;
}
```

The actual adapter implementation should be isolated from the presentation layer.

Do not assume a particular orchestration vendor, service, or infrastructure provider unless explicitly configured.

Authentication requests must be handled through the server-side authentication and orchestration integration.

Suggested API contracts:

POST /api/auth/signup

Request:

```json
{
  "username": "example",
  "password": "secure-password"
}
```

POST /api/auth/login

Request:

```json
{
  "username": "example",
  "password": "secure-password"
}
```

POST /api/auth/logout

GET /api/auth/session

A successful authentication response should provide the authenticated user and the actual pod metadata returned by the orchestration layer.

Conceptual response:

```json
{
  "user": {
    "username": "example"
  },
  "podId": "actual-pod-identifier"
}
```

The exact integration must be adaptable to the real backend contract.

Do not fabricate pod identifiers.

If the orchestration service is not yet configured, provide a clearly separated adapter placeholder and document exactly where the real implementation must be connected.

Never pretend that a mock implementation represents real orchestration.

## 8. POD IDENTIFIER FOOTER

This is an important and mandatory feature.

Add a very small, elegant technical footer in the bottom-left corner of the viewport.

It must display the ID of the actual pod to which the current user request has been routed by the orchestration system.

Visual example:

POD · pod-7f3a92

Design requirements:

- Position: fixed to the bottom-left corner.
- Very small typography, approximately 10–11px.
- Muted gray or low-opacity ice-blue text.
- Minimal visual emphasis.
- Monospace font for the pod identifier.
- Extremely subtle separation from the main interface.
- Must remain visible in both authentication and welcome states.
- Must not overlap the authentication panel.
- Must respect mobile safe areas.

The footer must display a real dynamically supplied pod ID.

The pod ID must come from authoritative server-side orchestration metadata, such as:

- The `podId` field in an API response.
- An explicitly documented server-provided response header, such as `x-pod-id`.

The frontend must update the displayed identifier when a new orchestrated request returns a different pod ID.

Do not hardcode a sample pod ID in production.

Do not generate a random pod ID in the browser.

If no pod ID is available yet, display a subtle neutral placeholder such as:

POD · resolving...

Never display a fake identifier as if it were real.

The footer must be visually tiny and unobtrusive, but technically readable.

IMPORTANT: The footer is not a decorative label. It is a live infrastructure metadata indicator.

## 9. TYPOGRAPHY AND RTL

The user-facing interface must be in Persian.

Use RTL layout across the application.

Set the document language and direction appropriately:

```html
<html lang="fa" dir="rtl">
```

Use Vazirmatn or a similarly elegant Persian typeface.

Typography guidelines:

- Clear hierarchy.
- Balanced line heights.
- Comfortable spacing.
- Elegant title weights.
- Consistent form typography.
- Avoid excessively bold Persian typography.

The pod identifier should use a Latin monospace font and remain left-to-right.

The pod footer must specifically remain anchored to the physical bottom-left of the viewport, regardless of RTL document direction.

Technical identifiers, API metadata, and pod IDs must not inherit RTL text direction.

## 10. MOTION AND MICROINTERACTIONS

Use balanced and restrained animation.

Suggested interactions:

Background sculpture:
- Very slow floating motion.
- Subtle parallax response to pointer movement on desktop.
- Soft animated lighting.

Glass panel:
- Smooth appearance transitions.
- Slight entrance movement.
- Very subtle depth effect.

Buttons:
- Subtle brightness changes.
- Small elevation on hover.
- Smooth transitions.

Input fields:
- Gentle focus illumination.
- Smooth border transitions.

Authentication transitions:
- Smooth crossfade between Login and Sign Up.
- Subtle content transitions when switching to the Welcome state.

The animations should feel calm, intentional, and premium.

Respect `prefers-reduced-motion`.

Avoid excessive animations, spinning objects, strong neon glows, or distracting motion.

## 11. RESPONSIVE DESIGN

The application must work beautifully on:

- Large desktop displays.
- Standard laptops.
- Tablets.
- Mobile phones.

Desktop:
Use the asymmetric composition and spatial background.

Tablet:
Reduce the visual sculpture and adjust the content proportions.

Mobile:
Use a refined single-column layout.

The authentication panel must remain comfortably readable.

The background sculpture can appear partially behind or above the authentication panel.

Do not let decorative objects interfere with form interaction.

Maintain adequate bottom spacing for the pod footer.

Avoid horizontal scrolling.

## 12. ACCESSIBILITY AND UX

Implement:

- Proper semantic HTML.
- Accessible input labels.
- Keyboard navigation.
- Visible focus indicators.
- Accessible button labels.
- Correct form validation.
- Screen-reader-friendly error messages.
- Appropriate loading feedback.
- Disabled submit states during requests.
- Password input masking.
- Password visibility control.

Prevent duplicate form submission.

Display understandable Persian error messages.

Do not reveal sensitive authentication details.

## 13. SECURITY REQUIREMENTS

The application must not implement authentication entirely in the browser.

Use secure server-side authentication.

Required considerations:

- Secure password hashing using Argon2id or a suitable password-hashing alternative.
- HttpOnly session cookies.
- Secure cookie settings in production.
- SameSite cookie protection.
- Server-side validation.
- Username uniqueness.
- Rate limiting.
- Proper session expiration and logout invalidation.
- CSRF protection where applicable.
- No plaintext password storage.
- No sensitive credentials in client-side source code.
- No secrets committed to source control.

Use a database abstraction or clearly defined persistence adapter.

Do not claim persistence or real authentication if the backend database and authentication provider have not been configured.

## 14. TECHNICAL IMPLEMENTATION

Use:

- Next.js App Router.
- React.
- TypeScript.
- Tailwind CSS.
- Lucide icons when needed.
- CSS transitions and keyframe animations.
- Small reusable components.
- Clean separation of server and client logic.

Keep the architecture simple and maintainable.

Suggested components:

- `AuthPage`
- `AuthPanel`
- `LoginForm`
- `SignupForm`
- `WelcomePanel`
- `GlassSculpture`
- `PodFooter`
- `AuthTabs`

Do not create unnecessary components or complex abstractions.

Keep orchestration-specific logic outside presentation components.

Use environment variables for backend integration configuration.

Provide an `.env.example` containing the required configuration keys, without real secrets.

If the actual orchestration backend is not available, implement a documented integration boundary instead of inventing a production service.

## 15. VISUAL QUALITY REQUIREMENTS

This is one of the most important sections.

The design must NOT resemble common AI-generated website templates.

Strictly avoid:

- Generic centered login cards.
- Repeated three-card layouts.
- Excessive purple-blue gradients.
- Excessive glowing borders.
- Random floating decorative blobs.
- Generic SaaS dashboard aesthetics.
- Unnecessary glassmorphism on every element.
- Excessive rounded corners.
- Oversized decorative typography.
- Generic stock illustrations.
- Unnecessary navigation.
- Unnecessary content sections.
- Unnecessary buttons.

Instead, prioritize:

- Custom visual composition.
- Strong negative space.
- Sophisticated spatial depth.
- Realistic-looking glass surfaces.
- Subtle edge reflections.
- Refined typography.
- Intentional asymmetry.
- Carefully balanced lighting.
- Beautiful interaction details.

The final result should resemble a carefully art-directed futuristic product interface designed by an experienced digital design studio.

## 16. FINAL ACCEPTANCE CRITERIA

The finished application must satisfy all of the following:

1. There is only one page.
2. Users can register with only a username and password.
3. Users can log in with only a username and password.
4. Login and registration work within the same page.
5. Successful authentication displays a personalized Persian welcome message.
6. The authenticated username is dynamically displayed.
7. Users can log out.
8. The application supports a server-side authentication integration.
9. The application has a clearly defined orchestration adapter.
10. The current real pod ID is dynamically displayed in the bottom-left footer.
11. The footer works in both authentication and welcome states.
12. No fake pod IDs are used.
13. The interface is fully RTL and Persian.
14. The layout is responsive.
15. The design follows the Spatial Liquid Glass visual direction.
16. The visual result is original, restrained, and premium.
17. There are no additional dashboard or navigation features.

Build the complete application, not just a static mockup.

Prioritize a highly polished visual result while keeping the implementation architecturally clean and ready for real backend and orchestration integration.

Before finishing, review the entire interface on desktop and mobile, verify all UI states, and ensure that no element visually conflicts with the fixed pod identifier footer.