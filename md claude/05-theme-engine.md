# THEME ENGINE - Architecture complète

---

## 1. ARCHITECTURE GLOBALE DU THEME ENGINE

```
┌─────────────────────────────────────────────────────────────────────┐
│                    THEME ENGINE ARCHITECTURE                        │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │  THEME CONFIGURATION LAYER                                   │ │
│  │  (Design Tokens + Metadata)                                  │ │
│  │                                                               │ │
│  │  - colors (primary, secondary, neutral, etc.)               │ │
│  │  - typography (fonts, sizes, weights, line-height)         │ │
│  │  - spacing (xs, sm, md, lg, xl scale)                      │ │
│  │  - border-radius (rounded corners)                          │ │
│  │  - shadows (depth effects)                                  │ │
│  │  - layout (grid, max-width, breakpoints)                   │ │
│  │  - components (button, card, form, etc. styles)           │ │
│  └──────────────────────────────────────────────────────────────┘ │
│           ↓                                                        │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │  COMPONENTS LIBRARY (React)                                  │ │
│  │  (Themeable, reusable, pre-built)                            │ │
│  │                                                               │ │
│  │  Layout:                                                      │ │
│  │  ├── Header (with logo, nav, search)                        │ │
│  │  ├── Footer (info, links, social)                           │ │
│  │  ├── Sidebar (categories)                                   │ │
│  │  └── Container (responsive grid)                            │ │
│  │                                                               │ │
│  │  Product:                                                     │ │
│  │  ├── ProductCard (image, price, options)                    │ │
│  │  ├── ProductDetail (full product page)                      │ │
│  │  ├── ProductImage (gallery, zoom)                           │ │
│  │  ├── ProductOptions (size, toppings picker)                 │ │
│  │  └── ProductPrice (with discount, calculation)              │ │
│  │                                                               │ │
│  │  Cart & Checkout:                                            │ │
│  │  ├── Cart (items list, modify quantities)                   │ │
│  │  ├── CartSummary (subtotal, fees, total)                    │ │
│  │  ├── Checkout (form, address, delivery choice)              │ │
│  │  └── PaymentForm (Stripe, Bancontact QR)                    │ │
│  │                                                               │ │
│  │  Common:                                                      │ │
│  │  ├── Button (primary, secondary, sizes)                     │ │
│  │  ├── Input (text, email, phone, etc.)                       │ │
│  │  ├── Select (dropdowns)                                     │ │
│  │  ├── Modal (dialogs)                                        │ │
│  │  ├── Alert (notifications)                                  │ │
│  │  ├── Spinner (loading)                                      │ │
│  │  ├── Badge (labels, tags)                                   │ │
│  │  └── ...                                                     │ │
│  │                                                               │ │
│  │  Custom Slots (for developer mode):                          │ │
│  │  ├── HeroSlot (above fold)                                  │ │
│  │  ├── CategoryCarouselSlot (featured categories)             │ │
│  │  ├── ProductListSlot (custom product rendering)             │ │
│  │  ├── CartSummarySlot (before checkout)                      │ │
│  │  └── ...                                                     │ │
│  └──────────────────────────────────────────────────────────────┘ │
│           ↓                                                        │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │  RENDERING ENGINE                                            │ │
│  │                                                               │ │
│  │  1. Apply Design Tokens to CSS variables                    │ │
│  │  2. Inject custom CSS (scoped)                              │ │
│  │  3. Apply component customizations (JSON)                   │ │
│  │  4. Render React components with context                    │ │
│  │  5. Inject custom JS (restricted, sandboxed)                │ │
│  └──────────────────────────────────────────────────────────────┘ │
│           ↓                                                        │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │  STOREFRONT OUTPUT                                           │ │
│  │  (HTML + CSS + Client JavaScript)                            │ │
│  │                                                               │ │
│  │  - Fully rendered storefront                                 │ │
│  │  - Multi-device responsive (mobile, tablet, desktop)         │ │
│  │  - Fast (SSR from Next.js)                                   │ │
│  │  - Accessible (WCAG 2.1 AA)                                  │ │
│  └──────────────────────────────────────────────────────────────┘ │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 2. DESIGN TOKENS

### Structure complète

```typescript
// types/theme.ts

interface ThemeDesignTokens {
  // Colors
  colors: {
    primary: string;          // #D71920
    secondary: string;        // #111111
    accent: string;           // #FFA500
    background: string;       // #FFFFFF
    surface: string;          // #F5F5F5
    text: {
      primary: string;        // #222222
      secondary: string;      // #666666
      muted: string;          // #999999
    };
    status: {
      success: string;        // #22C55E
      warning: string;        // #F59E0B
      error: string;          // #EF4444
      info: string;           // #3B82F6
    };
  };

  // Typography
  typography: {
    heading: {
      fontFamily: string;     // "Montserrat"
      fontSize: {
        h1: string;           // "2.5rem"
        h2: string;           // "2rem"
        h3: string;           // "1.5rem"
        h4: string;           // "1.25rem"
        h5: string;           // "1.125rem"
        h6: string;           // "1rem"
      };
      fontWeight: {
        regular: number;      // 500
        bold: number;         // 700
      };
      lineHeight: number;     // 1.2
    };
    body: {
      fontFamily: string;     // "Inter"
      fontSize: {
        large: string;        // "1.125rem"
        base: string;         // "1rem"
        small: string;        // "0.875rem"
        xs: string;           // "0.75rem"
      };
      fontWeight: {
        regular: number;      // 400
        medium: number;       // 500
        semibold: number;     // 600
      };
      lineHeight: number;     // 1.5
    };
  };

  // Spacing (8px base unit)
  spacing: {
    xs: "4px";
    sm: "8px";
    md: "16px";
    lg: "24px";
    xl: "32px";
    "2xl": "48px";
    "3xl": "64px";
  };

  // Border radius
  borderRadius: {
    none: "0";
    sm: "4px";
    md: "8px";
    lg: "12px";
    xl: "16px";
    full: "9999px";
  };

  // Shadows
  shadows: {
    sm: "0 1px 2px 0 rgba(0, 0, 0, 0.05)";
    md: "0 4px 6px -1px rgba(0, 0, 0, 0.1)";
    lg: "0 10px 15px -3px rgba(0, 0, 0, 0.1)";
    xl: "0 20px 25px -5px rgba(0, 0, 0, 0.1)";
  };

  // Breakpoints
  breakpoints: {
    sm: "640px";
    md: "768px";
    lg: "1024px";
    xl: "1280px";
    "2xl": "1536px";
  };

  // Layout
  layout: {
    maxWidth: "1200px";
    containerPadding: "16px"; // on mobile
    navHeight: "64px";
    footerHeight: "auto";
  };

  // Component customizations
  components?: {
    button?: {
      primary?: {
        backgroundColor?: string;
        color?: string;
        padding?: string;
        borderRadius?: string;
      };
      secondary?: { /* ... */ };
    };
    card?: {
      backgroundColor?: string;
      borderRadius?: string;
      boxShadow?: string;
      padding?: string;
    };
    input?: {
      borderColor?: string;
      focusBorderColor?: string;
      borderRadius?: string;
    };
    // ... more components
  };
}
```

### CSS Variables Output

```css
/* theme.css - Auto-generated from Design Tokens */

:root {
  /* Colors */
  --color-primary: #D71920;
  --color-secondary: #111111;
  --color-accent: #FFA500;
  --color-background: #FFFFFF;
  --color-surface: #F5F5F5;
  --color-text-primary: #222222;
  --color-text-secondary: #666666;
  --color-text-muted: #999999;
  --color-status-success: #22C55E;
  --color-status-warning: #F59E0B;
  --color-status-error: #EF4444;
  --color-status-info: #3B82F6;

  /* Typography */
  --font-heading: "Montserrat", sans-serif;
  --font-body: "Inter", sans-serif;
  --text-h1: 2.5rem;
  --text-h2: 2rem;
  --text-h3: 1.5rem;
  --text-h4: 1.25rem;
  --text-h5: 1.125rem;
  --text-h6: 1rem;
  --text-lg: 1.125rem;
  --text-base: 1rem;
  --text-sm: 0.875rem;
  --text-xs: 0.75rem;
  --font-weight-regular: 400;
  --font-weight-medium: 500;
  --font-weight-semibold: 600;
  --font-weight-bold: 700;
  --line-height-heading: 1.2;
  --line-height-body: 1.5;

  /* Spacing */
  --space-xs: 4px;
  --space-sm: 8px;
  --space-md: 16px;
  --space-lg: 24px;
  --space-xl: 32px;
  --space-2xl: 48px;
  --space-3xl: 64px;

  /* Border radius */
  --radius-none: 0;
  --radius-sm: 4px;
  --radius-md: 8px;
  --radius-lg: 12px;
  --radius-xl: 16px;
  --radius-full: 9999px;

  /* Shadows */
  --shadow-sm: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
  --shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
  --shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
  --shadow-xl: 0 20px 25px -5px rgba(0, 0, 0, 0.1);

  /* Layout */
  --max-width: 1200px;
  --container-padding: 16px;
  --nav-height: 64px;
}

/* Component styles using tokens */
.button {
  padding: var(--space-md) var(--space-lg);
  border-radius: var(--radius-md);
  font-family: var(--font-body);
  font-size: var(--text-base);
  cursor: pointer;
  transition: all 0.2s ease;
}

.button--primary {
  background-color: var(--color-primary);
  color: white;
}

.button--primary:hover {
  opacity: 0.9;
}

.card {
  background-color: var(--color-surface);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-md);
  padding: var(--space-lg);
}

h1 {
  font-family: var(--font-heading);
  font-size: var(--text-h1);
  font-weight: var(--font-weight-bold);
  line-height: var(--line-height-heading);
  color: var(--color-text-primary);
}

body {
  font-family: var(--font-body);
  font-size: var(--text-base);
  line-height: var(--line-height-body);
  color: var(--color-text-primary);
  background-color: var(--color-background);
}
```

---

## 3. COMPOSANTS THEMABLES

### Exemple: ProductCard

```typescript
// components/ProductCard.tsx

import React from 'react';
import { useTheme } from '@/hooks/useTheme';

interface ProductCardProps {
  product: {
    id: string;
    name: string;
    description: string;
    image: string;
    basePrice: number;
    discountPrice?: number;
  };
  onClick?: () => void;
}

export const ProductCard: React.FC<ProductCardProps> = ({
  product,
  onClick,
}) => {
  const theme = useTheme(); // Get current theme tokens

  const discountPercent = product.discountPrice
    ? Math.round(
        ((product.basePrice - product.discountPrice) /
          product.basePrice) *
          100
      )
    : 0;

  return (
    <div
      className="product-card"
      style={{
        borderRadius: theme.borderRadius.lg,
        boxShadow: theme.shadows.md,
        padding: theme.spacing.lg,
        backgroundColor: theme.colors.surface,
        cursor: 'pointer',
        transition: 'transform 0.2s ease',
      }}
      onClick={onClick}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'translateY(-4px)';
        e.currentTarget.style.boxShadow = theme.shadows.lg;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'translateY(0)';
        e.currentTarget.style.boxShadow = theme.shadows.md;
      }}
    >
      {/* Product Image */}
      <div
        style={{
          overflow: 'hidden',
          borderRadius: theme.borderRadius.md,
          marginBottom: theme.spacing.md,
          aspectRatio: '1 / 1',
          backgroundColor: theme.colors.background,
        }}
      >
        <img
          src={product.image}
          alt={product.name}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
          }}
        />
      </div>

      {/* Product Info */}
      <h3
        style={{
          fontFamily: theme.typography.heading.fontFamily,
          fontSize: theme.typography.heading.fontSize.h4,
          fontWeight: theme.typography.heading.fontWeight.bold,
          color: theme.colors.text.primary,
          margin: `0 0 ${theme.spacing.sm} 0`,
        }}
      >
        {product.name}
      </h3>

      <p
        style={{
          fontFamily: theme.typography.body.fontFamily,
          fontSize: theme.typography.body.fontSize.small,
          color: theme.colors.text.secondary,
          margin: `0 0 ${theme.spacing.md} 0`,
          lineHeight: theme.typography.body.lineHeight,
        }}
      >
        {product.description}
      </p>

      {/* Price Section */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: theme.spacing.md,
          marginBottom: theme.spacing.md,
        }}
      >
        {product.discountPrice ? (
          <>
            <span
              style={{
                textDecoration: 'line-through',
                color: theme.colors.text.muted,
                fontSize: theme.typography.body.fontSize.small,
              }}
            >
              €{product.basePrice.toFixed(2)}
            </span>
            <span
              style={{
                fontSize: theme.typography.body.fontSize.lg,
                fontWeight: theme.typography.body.fontWeight.bold,
                color: theme.colors.primary,
              }}
            >
              €{product.discountPrice.toFixed(2)}
            </span>
            <span
              style={{
                backgroundColor: theme.colors.status.warning,
                color: '#000',
                padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
                borderRadius: theme.borderRadius.sm,
                fontSize: theme.typography.body.fontSize.xs,
                fontWeight: theme.typography.body.fontWeight.semibold,
              }}
            >
              -{discountPercent}%
            </span>
          </>
        ) : (
          <span
            style={{
              fontSize: theme.typography.body.fontSize.lg,
              fontWeight: theme.typography.body.fontWeight.bold,
              color: theme.colors.primary,
            }}
          >
            €{product.basePrice.toFixed(2)}
          </span>
        )}
      </div>

      {/* Add to Cart Button */}
      <button
        style={{
          width: '100%',
          padding: `${theme.spacing.md} ${theme.spacing.lg}`,
          backgroundColor: theme.colors.primary,
          color: '#fff',
          border: 'none',
          borderRadius: theme.borderRadius.md,
          fontFamily: theme.typography.body.fontFamily,
          fontSize: theme.typography.body.fontSize.base,
          fontWeight: theme.typography.body.fontWeight.semibold,
          cursor: 'pointer',
          transition: 'opacity 0.2s ease',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.opacity = '0.9';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.opacity = '1';
        }}
      >
        Ajouter au panier
      </button>
    </div>
  );
};
```

### Hook useTheme

```typescript
// hooks/useTheme.ts

import { useContext } from 'react';
import { ThemeContext } from '@/context/ThemeContext';

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return context.tokens;
};
```

---

## 4. THEME VERSIONING & DEPLOYMENT

### Version Management

```
Theme "Pizza Namur"
│
├─ v1.0.0 (Production) ← Live on storefront
│  ├─ config.json (tokens, colors, fonts)
│  ├─ custom.css
│  ├─ custom.js
│  └─ assets/ (logo.png, banner.jpg, etc.)
│
├─ v1.1.0 (Preview) ← Accessible via preview URL
│  ├─ config.json (modified colors)
│  ├─ custom.css
│  ├─ custom.js
│  └─ assets/
│
├─ v1.2.0 (Draft) ← WIP modifications
│  ├─ config.json
│  ├─ custom.css
│  ├─ custom.js
│  └─ assets/
│
└─ v0.9.0 (Archived) ← Old version (rollback possible)
   ├─ config.json
   ├─ custom.css
   ├─ custom.js
   └─ assets/
```

### Database Structure

```typescript
// Prisma relations for versioning

model Theme {
  id: string;
  organizationId?: string; // org-level theme
  storeId?: string;        // store-level theme
  name: string;
  slug: string;
  
  // Current active version
  activeVersionId?: string;
  activeVersion?: ThemeVersion;
  
  versions: ThemeVersion[];
  assets: ThemeAsset[];
  
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  
  createdAt: DateTime;
  updatedAt: DateTime;
}

model ThemeVersion {
  id: string;
  theme: Theme;
  themeId: string;
  
  version: string; // "1.0.0", "1.1.0"
  
  // Design tokens
  config: Json; // ThemeDesignTokens
  
  // Custom code
  customCss?: string;
  customJs?: string;
  
  // Status
  status: "DRAFT" | "PREVIEW" | "PUBLISHED" | "ARCHIVED";
  isActive: boolean;
  
  // Metadata
  notes?: string;
  createdBy?: string; // user ID
  createdAt: DateTime;
}

model ThemeAsset {
  id: string;
  theme: Theme;
  themeId: string;
  
  name: string; // "logo.png"
  type: "image" | "font" | "css" | "js";
  url: string; // Cloudinary/S3 URL
  size: Int;   // bytes
  
  createdAt: DateTime;
}
```

### API for Version Management

```graphql
type Query {
  # Get theme versions
  themeVersions(themeId: ID!): [ThemeVersion!]!
  themeVersion(versionId: ID!): ThemeVersion!
}

type Mutation {
  # Create new version (from existing)
  duplicateThemeVersion(
    fromVersionId: ID!
    newVersion: String!
  ): ThemeVersion!

  # Update version
  updateThemeVersion(
    versionId: ID!
    input: UpdateThemeVersionInput!
  ): ThemeVersion!

  # Publish version to production
  publishThemeVersion(versionId: ID!): ThemeVersion!

  # Rollback to previous version
  rollbackTheme(themeId: ID!, toVersionId: ID!): ThemeVersion!

  # Preview a version
  previewThemeVersion(versionId: ID!): String! # preview URL
}

input UpdateThemeVersionInput {
  config: Json
  customCss: String
  customJs: String
  notes: String
}
```

---

## 5. DEVELOPER MODE - SANDBOXING

### Custom CSS Scoping

```typescript
// service/theme.sandbox.ts

export class ThemeSandbox {
  // Scope custom CSS to prevent conflicts
  static scopeCSS(customCSS: string, tenantId: string): string {
    const scope = `.theme-tenant-${tenantId}`;
    
    // Parse CSS and add scope to all selectors
    const scoped = customCSS
      .split('}')
      .map((rule) => {
        if (!rule.trim()) return '';
        
        const [selector, styles] = rule.split('{');
        
        // Add scope to selector
        const scopedSelector = selector
          .split(',')
          .map((s) => `${scope} ${s.trim()}`)
          .join(', ');
        
        return `${scopedSelector} {${styles}`;
      })
      .join('}');
    
    return scoped;
  }
}

// Usage:
const customCSS = `
  button {
    background: red;
  }
  .product-card {
    padding: 20px;
  }
`;

const scoped = ThemeSandbox.scopeCSS(customCSS, 'org_123');
// Output:
// .theme-tenant-org_123 button { background: red; }
// .theme-tenant-org_123 .product-card { padding: 20px; }
```

### Custom JavaScript Sandboxing

```typescript
// service/theme.javascript.ts

export class ThemeJavaScript {
  // Evaluate custom JS in restricted context
  static createSandboxContext() {
    return {
      // Allowed globals
      console: {
        log: (...args: any[]) => console.log('[Theme]', ...args),
      },
      window: {
        location: {
          href: undefined, // prevent navigation
        },
        localStorage: undefined, // prevent storage access
        sessionStorage: undefined,
      },
      // Allowed APIs
      fetch: async (url: string, options?: any) => {
        // Only allow calls to our own API
        if (!url.startsWith('/api/')) {
          throw new Error('Fetch not allowed to external URLs');
        }
        return fetch(url, options);
      },
      // Event listeners
      addEventListener: (event: string, callback: any) => {
        // Only allow certain events
        const allowed = ['click', 'submit', 'change', 'input'];
        if (!allowed.includes(event)) {
          throw new Error(`Event ${event} not allowed`);
        }
        document.addEventListener(event, callback);
      },
      // Prevent eval
      eval: undefined,
      Function: undefined,
      // DOM manipulation (limited)
      document: {
        querySelector: (selector: string) => {
          // Only allow queries in .theme-content
          if (!selector.includes('.theme-content')) {
            throw new Error('DOM manipulation outside theme content not allowed');
          }
          return document.querySelector(selector);
        },
      },
    };
  }

  static executeCustomJS(code: string, context: any) {
    try {
      // Create function with restricted context
      const fn = new Function(...Object.keys(context), code);
      return fn(...Object.values(context));
    } catch (error) {
      console.error('JavaScript execution error:', error);
      throw error;
    }
  }
}

// Usage:
const customJS = `
console.log('Theme loaded');

document.querySelector('.theme-content .add-to-cart')
  .addEventListener('click', () => {
    console.log('Item added to cart');
  });
`;

const context = ThemeJavaScript.createSandboxContext();
ThemeJavaScript.executeCustomJS(customJS, context);
```

### Content Security Policy (CSP)

```typescript
// middleware/csp.ts

export const themeCspHeaders = (req: Request, res: Response) => {
  // Strict CSP for storefront
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'", // inline theme scripts only
      "style-src 'self' 'unsafe-inline'",   // inline theme styles
      "img-src 'self' data: https://images.cloudinary.com",
      "font-src 'self' https://fonts.googleapis.com",
      "connect-src 'self' /api/",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; ')
  );
};
```

---

## 6. IMPORT DE DESIGN EXISTANT

### Design Analysis Service

```typescript
// service/design-import.service.ts

export class DesignImportService {
  // Analyze website and extract design tokens
  static async analyzeWebsite(url: string): Promise<ExtractedDesign> {
    try {
      const response = await fetch(url);
      const html = await response.text();

      // Parse HTML
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');

      // Extract colors
      const colors = this.extractColors(doc);

      // Extract typography
      const typography = this.extractTypography(doc);

      // Extract spacing
      const spacing = this.extractSpacing(doc);

      // Extract border-radius
      const borderRadius = this.extractBorderRadius(doc);

      return {
        colors,
        typography,
        spacing,
        borderRadius,
        metadata: {
          source: url,
          analyzedAt: new Date(),
        },
      };
    } catch (error) {
      throw new Error(`Failed to analyze website: ${error}`);
    }
  }

  private static extractColors(doc: Document): ExtractedColors {
    const colors: ExtractedColors = {};

    // Get dominant colors from images and elements
    const elements = doc.querySelectorAll('*');
    const colorMap = new Map<string, number>();

    elements.forEach((el) => {
      const bgColor = window.getComputedStyle(el).backgroundColor;
      const textColor = window.getComputedStyle(el).color;

      [bgColor, textColor].forEach((color) => {
        if (color && color !== 'rgba(0, 0, 0, 0)') {
          colorMap.set(color, (colorMap.get(color) || 0) + 1);
        }
      });
    });

    // Sort by frequency
    const sorted = Array.from(colorMap.entries())
      .sort(([, a], [, b]) => b - a)
      .slice(0, 8)
      .map(([color]) => color);

    // Assign to categories
    colors.primary = sorted[0] || '#000';
    colors.secondary = sorted[1] || '#999';
    colors.background = sorted[sorted.length - 1] || '#FFF';

    return colors;
  }

  private static extractTypography(doc: Document): ExtractedTypography {
    const typography: ExtractedTypography = {};

    const headings = doc.querySelectorAll('h1, h2, h3');
    if (headings.length > 0) {
      const style = window.getComputedStyle(headings[0]);
      typography.headingFont = style.fontFamily;
      typography.headingSize = style.fontSize;
    }

    const body = doc.querySelectorAll('p, span');
    if (body.length > 0) {
      const style = window.getComputedStyle(body[0]);
      typography.bodyFont = style.fontFamily;
      typography.bodySize = style.fontSize;
    }

    return typography;
  }

  private static extractSpacing(doc: Document): ExtractedSpacing {
    // Similar extraction logic
    return {};
  }

  private static extractBorderRadius(doc: Document): ExtractedBorderRadius {
    // Similar extraction logic
    return {};
  }
}

interface ExtractedDesign {
  colors: ExtractedColors;
  typography: ExtractedTypography;
  spacing: ExtractedSpacing;
  borderRadius: ExtractedBorderRadius;
  metadata: {
    source: string;
    analyzedAt: Date;
  };
}

interface ExtractedColors {
  primary?: string;
  secondary?: string;
  background?: string;
  [key: string]: string | undefined;
}

interface ExtractedTypography {
  headingFont?: string;
  headingSize?: string;
  bodyFont?: string;
  bodySize?: string;
}

interface ExtractedSpacing {
  [key: string]: string;
}

interface ExtractedBorderRadius {
  [key: string]: string;
}
```

### Theme Creation from Extracted Design

```typescript
// Mutation to create theme from import

export const importDesignMutation = async (
  input: ImportDesignInput
): Promise<Theme> => {
  // Analyze website
  const extracted = await DesignImportService.analyzeWebsite(
    input.websiteUrl
  );

  // Create theme config
  const themeConfig: ThemeDesignTokens = {
    colors: {
      primary: extracted.colors.primary || '#000',
      secondary: extracted.colors.secondary || '#666',
      background: extracted.colors.background || '#FFF',
      // ... map rest
    },
    typography: {
      heading: {
        fontFamily: extracted.typography.headingFont || 'Arial',
        // ... defaults for rest
      },
      body: {
        fontFamily: extracted.typography.bodyFont || 'Arial',
        // ... defaults
      },
    },
    // ... rest of tokens with defaults
  };

  // Create theme in database
  const theme = await prisma.theme.create({
    data: {
      storeId: input.storeId,
      name: `Imported Design (${new Date().toLocaleDateString()})`,
      slug: `imported-${Date.now()}`,
      status: 'DRAFT',
      versions: {
        create: {
          version: '1.0.0',
          status: 'DRAFT',
          config: themeConfig,
        },
      },
    },
  });

  return theme;
};
```

---

## 7. PREVIEW & LIVE RENDERING

### Theme Preview System

```typescript
// service/theme.preview.ts

export class ThemePreviewService {
  // Generate preview URL
  static generatePreviewURL(
    storeId: string,
    versionId: string
  ): string {
    return `/preview/${storeId}/${versionId}`;
  }

  // Get preview data (mock products, etc.)
  static getPreviewData() {
    return {
      store: {
        name: 'Preview Store',
        logo: '/placeholder-logo.png',
      },
      categories: [
        { id: '1', name: 'Category 1', image: '/placeholder.jpg' },
        { id: '2', name: 'Category 2', image: '/placeholder.jpg' },
      ],
      products: [
        {
          id: '1',
          name: 'Product 1',
          price: 12.99,
          image: '/placeholder-product.jpg',
          description: 'Preview product',
        },
        {
          id: '2',
          name: 'Product 2',
          price: 15.99,
          image: '/placeholder-product.jpg',
          description: 'Preview product',
        },
      ],
      cart: {
        items: [],
        total: 0,
      },
    };
  }

  // Render preview page with specific version
  static async renderPreview(
    storeId: string,
    versionId: string
  ): Promise<string> {
    // Fetch theme version
    const version = await prisma.themeVersion.findUnique({
      where: { id: versionId },
      include: { theme: true },
    });

    if (!version) {
      throw new Error('Theme version not found');
    }

    // Get preview data
    const data = this.getPreviewData();

    // Render with theme tokens
    const html = await renderStorefront(data, version.config);

    return html;
  }
}
```

---

## 8. EDITOR UI - THEME EDITOR

### Simple Mode (Non-technical)

```
┌─────────────────────────────────────────────────────────────┐
│                    THEME EDITOR - Simple Mode               │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Apparence / Design                                        │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━      │
│                                                             │
│  Logo                                                       │
│  ┌──────────────────────────────────┐                      │
│  │ [Importer logo]                  │ [X] (uploaded)       │
│  └──────────────────────────────────┘                      │
│                                                             │
│  Couleur principale                                        │
│  ┌──────────┐  ┌──────────────────────────┐                │
│  │ ████████ │  │ #D71920 ✓                │ (Color picker) │
│  └──────────┘  └──────────────────────────┘                │
│                                                             │
│  Couleur secondaire                                        │
│  ┌──────────┐  ┌──────────────────────────┐                │
│  │ ████████ │  │ #111111 ✓                │                │
│  └──────────┘  └──────────────────────────┘                │
│                                                             │
│  Accent                                                     │
│  ┌──────────┐  ┌──────────────────────────┐                │
│  │ ████████ │  │ #FFA500 ✓                │                │
│  └──────────┘  └──────────────────────────┘                │
│                                                             │
│  Police titres                                             │
│  ┌──────────────────────────────────┐                      │
│  │ Montserrat ▼                     │                      │
│  └──────────────────────────────────┘                      │
│                                                             │
│  Police corps                                              │
│  ┌──────────────────────────────────┐                      │
│  │ Inter ▼                          │                      │
│  └──────────────────────────────────┘                      │
│                                                             │
│  Style des boutons                                         │
│  ┌──────────────────────────────────┐                      │
│  │ Arrondi ▼                        │                      │
│  └──────────────────────────────────┘                      │
│                                                             │
│  Style des cartes produit                                  │
│  ┌──────────────────────────────────┐                      │
│  │ Moderne ▼                        │                      │
│  └──────────────────────────────────┘                      │
│                                                             │
│  Disposition                                               │
│  ┌──────────────────────────────────┐                      │
│  │ Classique ▼                      │                      │
│  └──────────────────────────────────┘                      │
│                                                             │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━      │
│                                                             │
│  [Annuler] [Aperçu] [Enregistrer]                          │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Advanced Mode (Technical)

```
┌──────────────────────────────────────────────────────────────────┐
│                   THEME EDITOR - Advanced Mode                   │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌───────────────────┬──────────────────────────────────────┐   │
│  │ Fichiers         │ Design Tokens (JSON)                 │   │
│  ├───────────────────┼──────────────────────────────────────┤   │
│  │ ✓ theme.json     │ {                                    │   │
│  │  └ colors        │   "colors": {                        │   │
│  │  └ typography    │     "primary": "#D71920",            │   │
│  │  └ spacing       │     "secondary": "#111111",          │   │
│  │  └ components    │     "background": "#FFFFFF"          │   │
│  │                  │   },                                 │   │
│  │ ✓ custom.css     │   "typography": {                    │   │
│  │ ✓ custom.js      │     "heading": {                     │   │
│  │ ✓ assets/        │       "fontFamily": "Montserrat"     │   │
│  │  └ logo.png      │     }                                │   │
│  │  └ banner.jpg    │   }                                  │   │
│  │                  │ }                                    │   │
│  │ [+ Ajouter]      │                                      │   │
│  │ [X Supprimer]    └──────────────────────────────────────┘   │
│  │                                                               │
│  │ CSS Personnalisé                                            │
│  │ ────────────────────────────────────────────────────────    │
│  │ .button {                                                    │
│  │   background: var(--color-primary);                        │
│  │   padding: var(--space-md);                                │
│  │ }                                                            │
│  │                                                             │
│  │ JS Personnalisé                                            │
│  │ ────────────────────────────────────────────────────────    │
│  │ console.log('Theme loaded');                               │
│  │ document.querySelectorAll('.add-to-cart')                  │
│  │   .forEach(btn => {                                        │
│  │     btn.addEventListener('click', () => {                 │
│  │       console.log('Item added');                           │
│  │     });                                                     │
│  │   });                                                       │
│  │                                                             │
│  └───────────────────────────────────────────────────────────┘   │
│                                                                  │
│  Live Preview (Mobile)     Live Preview (Desktop)               │
│  ┌──────────────┐         ┌─────────────────────┐               │
│  │              │         │                     │               │
│  │   (preview)  │         │    (preview)        │               │
│  │              │         │                     │               │
│  │              │         │                     │               │
│  └──────────────┘         └─────────────────────┘               │
│                                                                  │
│  [Annuler] [Aperçu complet] [Publier] [Sauvegarder brouillon]  │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

---

## 9. RÉSUMÉ THEME ENGINE

| Feature | Description |
|---------|-------------|
| **Design Tokens** | Système centralisé de couleurs, typographies, espacements |
| **Components** | Composants React themables et composables |
| **CSS Variables** | Auto-générées depuis les tokens |
| **Versioning** | v1.0.0, v1.1.0, etc. avec drafts et preview |
| **Deployment** | Draft → Preview → Production avec rollback |
| **Developer Mode** | CSS + JS personnalisé avec sandboxing strict |
| **CSP** | Content Security Policy pour sécurité |
| **Design Import** | Analyser site existant et extraire tokens |
| **Simple Mode** | UI non-technique pour commerçants |
| **Advanced Mode** | Mode technique pour développeurs |
| **Customization Slots** | Points d'extension pour contenu custom |
| **Responsive** | Mobile-first, breakpoints gérés par tokens |

---

**PROCHAINE ÉTAPE** : API GraphQL ? 👉
