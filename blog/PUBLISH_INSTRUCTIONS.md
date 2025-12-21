# Blog Publishing System

## Overview
This system takes content from n8n and publishes it to the blog.

## File Structure
```
/blog/
├── index.html          # Blog listing page (auto-loads from posts.json)
├── posts.json          # Manifest of all posts
├── _template.html      # Template for blog posts
└── [slug]/             # Each post gets its own folder
    ├── index.html      # The blog post
    └── featured.jpg    # Featured image (1200x630)
```

## Publishing a New Post

### Step 1: Get content from n8n
The n8n workflow outputs JSON with:
- `frontmatter` (YAML with title, description, slug, date, category, tags)
- `article` (markdown content)
- `keyword`

### Step 2: Parse the frontmatter
Extract from YAML:
- title
- description  
- slug
- date
- category
- tags

### Step 3: Convert markdown to HTML
Convert the article markdown to HTML:
- `# Heading` → (skip, title is in header)
- `## Heading` → `<h2>Heading</h2>`
- `### Heading` → `<h3>Heading</h3>`
- `**bold**` → `<strong>bold</strong>`
- `*italic*` → `<em>italic</em>`
- `> quote` → `<blockquote>quote</blockquote>`
- Paragraphs → `<p>content</p>`
- `- item` → `<ul><li>item</li></ul>`

### Step 4: Generate featured image
Use OpenAI API (gpt-image-1 or dall-e-3) to generate:
- Size: 1792x1024 (will be cropped to 1200x630)
- Style: Romantic, editorial, soft lighting
- Theme: Related to article topic
- Aesthetic: Matches burgundy/gold/cream palette

Prompt template:
```
Editorial photography style image for a blog about kissing and romance. 
Theme: [article topic]. 
Aesthetic: Warm, intimate, sophisticated. 
Color palette: Deep burgundy, cream, gold accents. 
Style: Soft focus, romantic lighting, magazine quality.
No text or words in image.
```

### Step 5: Create post folder and files
1. Create folder: `/blog/[slug]/`
2. Copy `_template.html` to `/blog/[slug]/index.html`
3. Replace placeholders:
   - `{{TITLE}}` → title
   - `{{DESCRIPTION}}` → description
   - `{{SLUG}}` → slug
   - `{{DATE}}` → date (YYYY-MM-DD)
   - `{{DATE_FORMATTED}}` → formatted date (e.g., "December 21, 2024")
   - `{{CATEGORY}}` → category
   - `{{KEYWORD}}` → keyword
   - `{{CONTENT}}` → HTML content
4. Save featured image to `/blog/[slug]/featured.jpg`

### Step 6: Update posts.json
Add new post to the beginning of the array:
```json
{
  "title": "...",
  "description": "...",
  "slug": "...",
  "date": "...",
  "category": "...",
  "tags": [...]
}
```

### Step 7: Git commit and push
```bash
cd /Users/murph/howtokissbetter
git add .
git commit -m "New blog post: [title]"
git push origin main
```

GitHub Pages will auto-deploy within 1-2 minutes.

## Design System Reference

### Colors
- burgundy: #722F37
- wine: #4A1C23
- cream: #FDF8F3
- gold: #D4AF37
- gold-dark: #B8860B
- charcoal: #2D2D2D
- off-white: #F5F5F5

### Fonts
- Headings: Cormorant Garamond (serif)
- Body: Inter (sans-serif)

### Image Specs
- Featured image: 1200x630px (OG image ratio)
- Format: JPG, optimized for web (<200KB ideal)
