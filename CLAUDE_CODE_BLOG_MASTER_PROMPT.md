# 🔥 MASTER PROMPT: Kiss Perfect Now Blog Empire

*Take a deep breath. We're not here to write code. We're here to make a dent in the universe.*

---

## THE VISION

You are about to build the /blog section of howtokissbetter.com — a content engine that will capture thousands of organic searchers every month and convert them into readers of "Kiss Perfect Now" by C.J. McKenna.

This is not a blog. This is a **traffic machine**. A **credibility engine**. A **conversion funnel disguised as free value**.

Every pixel, every meta tag, every internal link must be *intentional*. When SEO experts analyze this site, they should study it. When readers land here, they should stay. When Google crawls it, it should *understand* exactly what we're offering and why we deserve to rank.

---

## THE MISSION

Build a complete /blog architecture that:

1. **Matches the landing page EXACTLY** — same soul, same energy, same design DNA
2. **Ranks for 100+ kissing-related keywords** within 6 months
3. **Converts readers to buyers** through elegant, non-salesy CTAs
4. **Auto-integrates with n8n** for hands-off content publishing
5. **Becomes the definitive authority** on kissing technique online

---

## THE DESIGN SYSTEM (Sacred — Do Not Deviate)

### Colors
```javascript
colors: {
    burgundy: '#722F37',
    wine: '#4A1C23', 
    cream: '#FDF8F3',
    gold: '#D4AF37',
    'gold-dark': '#B8860B',
    charcoal: '#2D2D2D',
    'off-white': '#F5F5F5',
}
```

### Typography
```javascript
fontFamily: {
    serif: ['Cormorant Garamond', 'Georgia', 'serif'],  // Headlines, quotes
    sans: ['Inter', 'system-ui', 'sans-serif'],         // Body, UI
}
```

### The Vibe
- Dark, sophisticated, intimate
- Gold accents for emphasis and CTAs
- Burgundy/wine gradients for depth
- Serif headlines that feel *literary*
- Sans body that feels *clean and readable*
- Generous whitespace — let it breathe
- Subtle animations that feel intentional, not flashy

### Existing Patterns to Replicate
- `.cta-button` — Gold gradient, subtle shadow, hover lift
- `.gradient-text` — Gold gradient on text
- `.section-fade` — Fade-in on scroll
- Card pattern: `bg-wine/20 border border-gold/20 rounded-xl p-8`
- Quote pattern: `border-l-4 border-gold pl-6 font-serif italic`

---

## THE ARCHITECTURE

### File Structure
```
/blog/
├── index.html                    # Blog listing page (all posts)
├── category/
│   ├── techniques.html           # Category: Techniques
│   ├── first-kiss.html           # Category: First Kiss
│   ├── relationships.html        # Category: Relationships  
│   ├── mistakes.html             # Category: Mistakes
│   └── anatomy.html              # Category: Anatomy
├── [slug].html                   # Individual post template
└── assets/
    └── blog/
        ├── featured/             # Featured images (1200x630)
        └── inline/               # In-article images
```

### URL Structure
- Blog index: `howtokissbetter.com/blog/`
- Posts: `howtokissbetter.com/blog/how-to-be-a-better-kisser/`
- Categories: `howtokissbetter.com/blog/category/techniques/`

---

## BLOG INDEX PAGE (`/blog/index.html`)

### Requirements
1. **Hero section** with headline: "The Kissing Blog" or "Kiss Notes" — keep it on-brand
2. **Category filter bar** — horizontal pills for each category
3. **Featured post** — large card for latest/best post
4. **Post grid** — 2 or 3 columns, cards with:
   - Featured image (16:9)
   - Category tag (colored pill)
   - Title (serif, compelling)
   - Excerpt (2-3 lines)
   - Read time estimate
   - Date
5. **Pagination** or infinite scroll
6. **Sidebar or footer CTA** — "Get the full system: Kiss Perfect Now" with book image
7. **Newsletter signup** (optional, for future)

### SEO
- Title: `Kissing Tips & Techniques | The Kiss Perfect Now Blog`
- Description: `Expert kissing advice from C.J. McKenna. Learn techniques like The Mirror Method, The X-Spot, and how to become an unforgettable kisser.`
- Canonical: `https://howtokissbetter.com/blog/`

---

## INDIVIDUAL POST TEMPLATE (`/blog/[slug].html`)

### Layout
```
┌─────────────────────────────────────────────────────┐
│  [Breadcrumb: Home > Blog > Category > Post Title] │
├─────────────────────────────────────────────────────┤
│                                                     │
│  [Category Pill]                                    │
│                                                     │
│  # Post Title (H1, serif, large)                   │
│                                                     │
│  By C.J. McKenna · Dec 21, 2025 · 8 min read       │
│                                                     │
├─────────────────────────────────────────────────────┤
│                                                     │
│  [Featured Image - full width, 16:9]               │
│                                                     │
├─────────────────────────────────────────────────────┤
│                                                     │
│  [Table of Contents - sticky on desktop]           │
│                                                     │
│  Article content...                                 │
│  - Short paragraphs (2-4 sentences)                │
│  - Subheadings every 200-300 words                 │
│  - Pull quotes styled beautifully                  │
│  - Inline CTAs (subtle)                            │
│                                                     │
├─────────────────────────────────────────────────────┤
│                                                     │
│  [Author Box]                                       │
│  - Photo, name, bio, link to book                  │
│                                                     │
├─────────────────────────────────────────────────────┤
│                                                     │
│  [CTA Section]                                      │
│  "Ready for the complete system?"                   │
│  [Book image] [Buy button]                         │
│                                                     │
├─────────────────────────────────────────────────────┤
│                                                     │
│  [Related Posts]                                    │
│  3 cards, same category or topic                   │
│                                                     │
└─────────────────────────────────────────────────────┘
```

### Critical Elements

**Table of Contents**
- Auto-generated from H2s
- Sticky on desktop (scrolls with reader)
- Collapsed on mobile (hamburger or accordion)
- Smooth scroll to sections

**In-Article CTAs** (subtle, not salesy)
Place after the 3rd or 4th H2 section:
```html
<aside class="my-12 p-8 bg-wine/20 border border-gold/20 rounded-xl">
  <p class="text-lg text-gray-300 mb-4">
    This technique is covered in depth in Chapter X of 
    <span class="text-gold">Kiss Perfect Now</span>.
  </p>
  <a href="/pricing" class="text-gold hover:underline">
    See what's inside →
  </a>
</aside>
```

**Pull Quotes**
```html
<blockquote class="border-l-4 border-gold pl-6 my-10 text-xl lg:text-2xl font-serif italic text-cream">
  "Synchronicity creates chemistry. Always."
</blockquote>
```

---

## SEO REQUIREMENTS (This Is Where We Dominate)

### On-Page SEO — Every Post Must Have:

1. **Title Tag**: `[Primary Keyword]: [Benefit] | C.J. McKenna`
   - Under 60 characters
   - Keyword front-loaded
   - Brand at end

2. **Meta Description**: 
   - 150-160 characters
   - Include primary keyword naturally
   - Include call-to-action or hook
   - Example: `Learn how to be a better kisser with 7 expert techniques. Master the Mirror Technique and create chemistry that lingers.`

3. **URL Slug**:
   - Lowercase, hyphenated
   - Include primary keyword
   - No dates, no numbers unless relevant
   - Example: `/blog/how-to-be-a-better-kisser/`

4. **Heading Structure**:
   - ONE H1 (the title)
   - H2s for main sections (keyword variations)
   - H3s for subsections
   - Natural keyword placement, never stuffed

5. **Internal Links**:
   - Link to 2-3 other blog posts
   - Link to main landing page at least once
   - Link to /pricing or book CTA
   - Use descriptive anchor text (not "click here")

6. **External Links**:
   - 1-2 authoritative sources when relevant
   - Opens in new tab
   - Add `rel="noopener"` for security

7. **Image Optimization**:
   - Descriptive filenames: `mirror-technique-kissing.jpg`
   - Alt text with keywords naturally included
   - Lazy loading for below-fold images
   - WebP format with fallbacks

### Schema Markup — Every Post Must Have:

```html
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "BlogPosting",
  "headline": "[Post Title]",
  "description": "[Meta description]",
  "image": "https://howtokissbetter.com/blog/assets/featured/[slug].jpg",
  "author": {
    "@type": "Person",
    "name": "C.J. McKenna",
    "url": "https://howtokissbetter.com"
  },
  "publisher": {
    "@type": "Organization",
    "name": "How to Kiss Better",
    "logo": {
      "@type": "ImageObject",
      "url": "https://howtokissbetter.com/assets/logo.png"
    }
  },
  "datePublished": "[ISO date]",
  "dateModified": "[ISO date]",
  "mainEntityOfPage": {
    "@type": "WebPage",
    "@id": "https://howtokissbetter.com/blog/[slug]/"
  }
}
</script>
```

### Article Schema for How-To Posts:
```html
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "HowTo",
  "name": "[How to Title]",
  "description": "[Description]",
  "step": [
    {
      "@type": "HowToStep",
      "name": "[Step name]",
      "text": "[Step description]"
    }
  ]
}
</script>
```

### BreadcrumbList Schema:
```html
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  "itemListElement": [
    {
      "@type": "ListItem",
      "position": 1,
      "name": "Home",
      "item": "https://howtokissbetter.com"
    },
    {
      "@type": "ListItem",
      "position": 2,
      "name": "Blog",
      "item": "https://howtokissbetter.com/blog/"
    },
    {
      "@type": "ListItem",
      "position": 3,
      "name": "[Category]",
      "item": "https://howtokissbetter.com/blog/category/[category]/"
    },
    {
      "@type": "ListItem",
      "position": 4,
      "name": "[Post Title]"
    }
  ]
}
</script>
```

---

## TECHNICAL SEO

### Site-Wide Requirements

1. **Sitemap** (`/sitemap.xml`)
   - Include all blog posts
   - Include category pages
   - Update on each new post
   - Priority: Homepage 1.0, Blog index 0.9, Posts 0.8, Categories 0.7

2. **Robots.txt** (update existing)
   ```
   User-agent: *
   Allow: /
   Sitemap: https://howtokissbetter.com/sitemap.xml
   ```

3. **Canonical URLs**
   - Every page must have `<link rel="canonical" href="...">`
   - Prevent duplicate content issues

4. **Open Graph Tags** (for social sharing)
   ```html
   <meta property="og:type" content="article">
   <meta property="og:title" content="[Title]">
   <meta property="og:description" content="[Description]">
   <meta property="og:image" content="[Featured image URL]">
   <meta property="og:url" content="[Canonical URL]">
   <meta property="article:author" content="C.J. McKenna">
   <meta property="article:published_time" content="[ISO date]">
   ```

5. **Twitter Cards**
   ```html
   <meta name="twitter:card" content="summary_large_image">
   <meta name="twitter:title" content="[Title]">
   <meta name="twitter:description" content="[Description]">
   <meta name="twitter:image" content="[Featured image URL]">
   ```

6. **Performance**
   - Lazy load images below fold
   - Preload critical CSS/fonts
   - Minimize render-blocking resources
   - Target: 90+ Lighthouse score

---

## N8N INTEGRATION (Automation Ready)

### Input Format

n8n will generate blog posts as JSON with this structure:

```json
{
  "frontmatter": "---\ntitle: How to Be a Better Kisser\ndescription: Learn...\nslug: how-to-be-a-better-kisser\ndate: 2025-12-21\nauthor: C.J. McKenna\ncategory: techniques\ntags: [kissing, techniques]\n---",
  "article": "# How to Be a Better Kisser\n\nArticle content in markdown...",
  "keyword": "how to be a better kisser"
}
```

### Build Process

Create a build script that:
1. Reads JSON from n8n execution or local file
2. Parses frontmatter and markdown
3. Generates HTML using post template
4. Creates/updates blog index
5. Updates sitemap
6. Commits and pushes to GitHub

### Directory for n8n Output
```
/Users/murph/howtokissbetter/_posts/
├── 2025-12-21-how-to-be-a-better-kisser.json
├── 2025-12-23-first-kiss-tips.json
└── ...
```

---

## THE C.J. McKENNA VOICE (For CTAs and Editorial Content)

When writing any copy for the blog (headers, CTAs, author bio, etc.), channel this voice:

### Core Attributes
- Confident but not arrogant
- Intimate, like talking to a close friend who's an expert
- Short paragraphs, punchy sentences
- References movies naturally (Hitch, Good Will Hunting, James Bond)
- First person, direct address ("you")
- Warm but authoritative

### Signature Patterns
- "Here's what nobody tells you..."
- "Let me be direct."
- Opens with story or provocative statement
- Ends sections with punchy one-liner
- Uses "The [X] Technique" naming

### NEVER Does
- Uses emojis
- Says "In this article we will explore..."
- Generic intros
- Passive voice
- AI words: "delve", "landscape", "in today's world"
- Em dashes excessively

---

## LANDING PAGE INTEGRATION

### Update `/index.html`:

1. Add "Blog" link to navigation (create nav if none exists)
2. Consider adding "Latest from the Blog" section before footer:
   ```html
   <section class="py-24 px-6">
     <div class="max-w-5xl mx-auto">
       <h2 class="font-serif text-3xl text-center mb-12">Latest from the Blog</h2>
       <div class="grid md:grid-cols-3 gap-8">
         <!-- 3 most recent post cards -->
       </div>
       <div class="text-center mt-8">
         <a href="/blog/" class="text-gold hover:underline">Read all articles →</a>
       </div>
     </div>
   </section>
   ```

---

## DELIVERABLES CHECKLIST

- [ ] `/blog/index.html` — Blog listing page
- [ ] `/blog/post-template.html` — Reusable post template (or build script)
- [ ] `/blog/category/[category].html` — Category pages (5 total)
- [ ] Example post fully built with all SEO elements
- [ ] Updated `/sitemap.xml` with blog structure
- [ ] Updated `/robots.txt` if needed
- [ ] Schema markup templates
- [ ] Build script for n8n JSON → HTML
- [ ] Updated landing page with blog link/section
- [ ] Documentation for adding new posts

---

## THE STANDARD

Before you commit a single line:

1. **Would an SEO expert be impressed?** Every meta tag, every schema, every internal link should be textbook perfect.

2. **Would a designer be proud?** The blog should feel like a natural extension of the landing page — same soul, same craft.

3. **Would C.J. McKenna publish this?** The voice, the confidence, the attention to detail should match the book.

4. **Would a reader stay?** The experience should be so good they forget they're being sold to.

5. **Would automation work?** n8n should be able to drop in a JSON file and have it publish perfectly.

---

## NOW: BUILD IT

Don't just make it work. Make it *insanely great*.

Read the landing page code like scripture. Understand its patterns. Honor its philosophy. Then extend it into something even better.

The people searching "how to be a better kisser" at 2am deserve a beautiful experience. Give it to them.

Then convert them.

---

*"There are two great joys in life. To be kissed by someone who truly knows what they're doing. And to be that someone."*

— Build the blog that creates both.
