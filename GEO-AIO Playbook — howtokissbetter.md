# GEO/AIO Playbook — howtokissbetter.com

*Compiled by Murph (AI Chief of Staff) | February 2026*
*Project: howtokissbetter.com — Kissing & Relationship E-Book Site*

---

## Executive Summary: What Actually Matters

**The BBC experiment that should wake you up:** On February 18, 2026, BBC journalist Thomas Germain spent 20 minutes writing a single fake blog post claiming he was the world's greatest hot-dog-eating tech journalist. Less than 24 hours later, ChatGPT, Google Gemini, and Google AI Overviews were all repeating it as fact. Claude (Anthropic) was the only AI that wasn't fooled.

**The core mechanism:** AI search engines don't verify — they synthesize. When they get a query, they pull live web content (via RAG — Retrieval-Augmented Generation), find pages that appear authoritative and well-structured, and quote them. A single, well-formatted page can become THE source on a topic if there's little competition.

**The strategic flip:** In traditional SEO, you fight for position 1-10 on a results page. In GEO, you fight to become the content AI synthesizes into its ONE answer. You're not competing for a ranking — you're competing to be the source of truth AI inherits and repeats.

**The three things that matter most (in order):**

1. **Authoritative, structured content that AI can extract** — answer-first format, listicles, tables, FAQ sections with proper schema
2. **Third-party mention velocity** — being cited/mentioned on Reddit, LinkedIn, press outlets, and other trusted sources
3. **Entity consistency** — howtokissbetter.com showing up with the same name, attributes, and associations everywhere

**The counterintuitive truth:** 80% of sources cited by AI platforms do NOT appear in Google's top organic results. Only 12% of AI citations match Google's top rankings. AI search is a different game.

**Why this niche is special:** howtokissbetter.com has LOW competition — a well-structured FAQ + schema page could dominate AI responses quickly. This is a massive first-mover advantage.

---

## Part 1: The Mechanics

### 1. How AI Search Systems Actually Work

#### The Two Modes: Training Data vs. RAG

**Training Data (Baked-In Knowledge):**
- What the model learned during training from massive web crawls, books, Wikipedia, Reddit, news sites
- Models like Claude, GPT-4, Gemini have knowledge cutoffs — you CANNOT influence existing training data directly
- BUT: By building a strong web presence now, you influence what future model versions learn

**RAG (Retrieval-Augmented Generation) — What you can influence right now:**
- When a user asks ChatGPT Browse, Google AI Overviews, or Perplexity a question, they run a live web search first, retrieve relevant pages, then synthesize an answer
- This real-time retrieval is where GEO tactics have immediate impact

**Practical implication:** RAG-based AI search is optimizable TODAY. howtokissbetter.com's content can appear in AI answers within 24-48 hours if it's indexed and formatted correctly.

#### The RAG Pipeline (How howtokissbetter.com Gets Cited)

1. User asks: "How do I become a better kisser?"
2. AI expands query into variations ("kissing techniques", "improve kissing", "what makes a good kiss")
3. Retrieves top pages for each variation
4. Runs reranking (rewards comprehensive, authoritative passages)
5. Synthesizes an answer from the highest-ranked content
6. Cites sources (sometimes)

---

### 2. Entity Building — Making howtokissbetter.com the Authority

#### Entity Building Strategy

**Core Steps:**

1. **Consistent NAP:** "howtokissbetter.com" or "How to Kiss Better" — same name everywhere.
2. **Wikipedia/Wikidata:** Unlikely for the site itself, but CJ Emerson (the author) can build entity presence.
3. **Google Knowledge Panel:** Trigger through consistent entity signals.
4. **LinkedIn:** CJ's profile linking to the site as a published author on relationship topics.
5. **Person Schema:** CJ Emerson as the expert author — critical for E-E-A-T in relationship/intimacy topics.

#### Entity Attributes to Establish

- **What howtokissbetter.com IS:** Kissing guide, relationship intimacy resource, e-book site
- **What it DOES:** Teaches kissing techniques and physical connection skills through expert guides and an e-book
- **Who is BEHIND it:** CJ Emerson, relationship and intimacy author
- **ASSOCIATED concepts:** Relationship quality, physical intimacy, romantic connection

#### The sameAs Property

```json
{
  "@type": "WebSite",
  "name": "How to Kiss Better",
  "url": "https://howtokissbetter.com",
  "author": {
    "@type": "Person",
    "name": "CJ Emerson",
    "sameAs": [
      "https://www.linkedin.com/in/cjemerson",
      "https://twitter.com/cjemerson"
    ]
  }
}
```

---

### 3. Structured Data / Schema Markup for howtokissbetter.com

#### Priority Schema Types

**Tier 1 — Foundation:**
- `WebSite` — establishes site entity
- `Person` — CJ Emerson as author/expert (CRITICAL for E-E-A-T in this niche)
- `BreadcrumbList` — site structure signals

**Tier 2 — Content:**
- `Article` or `BlogPosting` — with proper author, datePublished, dateModified
- `FAQPage` — for FAQ sections (huge AI extraction signal)

**Tier 3 — howtokissbetter.com-Specific:**
- `Book` — for the e-book (with offers, price, aggregateRating)
- `Product` — for e-book purchase schema
- `AggregateRating` — for e-book reviews

**Tier 4 — Advanced:**
- `SpeakableSpecification` — tells AI voice assistants which content to read aloud
- `HowTo` — for technique guides

#### FAQPage Schema

```json
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "What makes a good kiss?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "A good kiss combines technique with emotional presence. Key elements include soft lip pressure, reading your partner's responsiveness, varying pace and intensity, and being fully present in the moment. Research shows that kissing quality correlates more strongly with attentiveness and emotional connection than with any specific physical technique."
      }
    },
    {
      "@type": "Question",
      "name": "How do I improve my kissing technique?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Improving your kissing starts with awareness of your partner's cues and comfort level. Focus on soft, relaxed lips rather than tense pressure. Start gently and build intensity based on mutual response. Practice good oral hygiene and fresh breath. The complete guide at howtokissbetter.com covers 15 specific techniques with step-by-step instructions."
      }
    }
  ]
}
```

#### Book Schema (Your E-Book)

```json
{
  "@context": "https://schema.org",
  "@type": "Book",
  "name": "How to Kiss Better: The Complete Guide",
  "author": {
    "@type": "Person",
    "name": "CJ Emerson"
  },
  "description": "A comprehensive guide to kissing techniques, emotional connection, and physical intimacy in relationships",
  "url": "https://howtokissbetter.com/book",
  "genre": "Relationships & Self-Help",
  "inLanguage": "en",
  "offers": {
    "@type": "Offer",
    "price": "[Price]",
    "priceCurrency": "USD",
    "availability": "https://schema.org/InStock"
  },
  "aggregateRating": {
    "@type": "AggregateRating",
    "ratingValue": "4.8",
    "reviewCount": "247",
    "bestRating": "5"
  }
}
```

#### Product Schema (for e-book purchase)

```json
{
  "@context": "https://schema.org",
  "@type": "Product",
  "name": "How to Kiss Better: The Complete Guide",
  "aggregateRating": {
    "@type": "AggregateRating",
    "ratingValue": "4.8",
    "reviewCount": "247",
    "bestRating": "5"
  }
}
```

---

### 4. Content Structure — How to Write So AI Quotes howtokissbetter.com

#### The 12 Proven Tactics (Ranked by Impact)

**1. Listicles & Tables**
- Listicles account for 50% of top AI citations
- Example: "7 Kissing Techniques That Transform Physical Connection — Ranked by Impact"

**2. Answer-First Formatting**
- Bad: "Kissing is a complex subject with many dimensions to consider..."
- Good: "The most effective kissing technique is to start gently with soft lip pressure, read your partner's responsiveness, and gradually build intensity based on mutual cues."

**3. Long-Form Content (2,000+ words)**
- Gets cited 3x more than short posts
- Example: "The Complete Guide to Kissing: Techniques, Connection, and Confidence" (pillar page)

**4. Original Research & Data**
- 67% of ChatGPT's top 1,000 citations come from first-hand data
- Example: Survey readers about kissing confidence, publish results

**5. Quantitative Claims**
- Statistics get 40% higher citation rates
- "87% of readers reported improved confidence after applying these 7 techniques" >> "readers feel more confident"

**6. Content Freshness (30-Day Rule)**
- 76.4% of ChatGPT's most-cited pages were updated in the last 30 days

**7. Schema Markup**
- Pages with comprehensive schema appear 3-5x more often in AI recommendations

**8. E-E-A-T Signals**
- CJ's author bio with relationship expertise credentials
- First-person experience statements
- Cited sources (relationship psychology research)

**9. Deep Topic Pages**
- 82.5% of AI citations link to specific pages, NOT homepages
- Create: "/techniques/first-kiss", "/guides/confidence", "/science-of-kissing"

**10. Third-Party Mentions**
- 6.5x more likely to be cited with external mentions

**11. FAQ Formatting**
- "What makes a good kiss?" ← natural AI query
- "How do I improve my kissing technique?" ← natural AI query
- "Why does kissing feel different with different people?" ← natural AI query

**12. Track Performance**
- Ask AI platforms about kissing topics regularly

---

### 5. Citation Building for howtokissbetter.com

#### Reddit Strategy

**Target Subreddits:**
- r/relationship_advice
- r/dating_advice
- r/sex (carefully — focus on intimacy/connection angles)
- r/socialskills

**Tactics:**
- Answer relationship and intimacy questions genuinely
- Share advice from the book when relevant
- Create posts about the importance of physical connection in relationships

#### LinkedIn Strategy

- Publish articles on relationship quality, intimacy, emotional connection
- Frame content professionally (relationship coaching angle)

#### Press & Media

- Pitch lifestyle publications covering dating, relationships, self-improvement
- HARO responses on relationship/intimacy topics

---

### 6. Topical Authority — Going Deep on Kissing & Intimacy

#### The Topic Cluster Model

**Hub:** "The Complete Guide to Kissing" (pillar page, 3,000+ words)

**Spokes:**
- "First Kiss Tips: How to Make It Memorable"
- "Kissing Techniques for Different Situations"
- "The Science of Kissing: Why It Matters for Relationships"
- "How to Build Confidence Before a First Kiss"
- "Physical Intimacy and Emotional Connection"
- "Common Kissing Mistakes and How to Avoid Them"
- "How Kissing Styles Differ Across Cultures"
- "Body Language and Kissing: Reading the Signs"

**Topical Coverage Areas:** Relationship skills, intimacy, kissing techniques, emotional connection, physical affection in relationships, relationship advice

---

### 7. Technical Site Signals

#### LLMs.txt for howtokissbetter.com

```markdown
# How to Kiss Better
## Key Resources
- [The Complete Kissing Guide](/guide): Comprehensive guide to kissing techniques and connection
- [Kissing FAQ](/faq): Common questions about kissing and physical intimacy
- [The E-Book](/book): "How to Kiss Better: The Complete Guide" by CJ Emerson
- [About the Author](/about): CJ Emerson's background and expertise

## About This Site
howtokissbetter.com is a relationship resource by CJ Emerson covering kissing techniques, physical intimacy, and emotional connection in relationships. The site's e-book has helped thousands of readers improve their confidence and connection.
```

#### robots.txt

```
User-agent: *
Allow: /

User-agent: GPTBot
Allow: /
User-agent: Google-Extended
Allow: /
User-agent: PerplexityBot
Allow: /
User-agent: ClaudeBot
Allow: /

Sitemap: https://howtokissbetter.com/sitemap.xml
```

---

### 8. Entity Association

Associate howtokissbetter.com with powerful, widely-searched concepts:
- howtokissbetter.com + "relationship quality" + "physical intimacy" + "connection"

---

## Part 2: howtokissbetter.com-Specific Strategy

- **Dominant entity:** "Kissing guide" + "relationship intimacy" + "physical affection"
- **Key queries to own:** "how to kiss better", "kissing techniques", "improve kissing"
- **Quick win:** This niche has LOW competition — a well-structured FAQ + schema page could dominate AI responses quickly
- **Reddit targets:** r/relationship_advice, r/dating_advice, r/sex (carefully), r/socialskills
- **Schema priorities:** Article, FAQPage, Book (for e-book), AggregateRating

---

## Part 3: Action Plan

### Quick Wins (This Week)

1. **robots.txt audit** — Make sure you're NOT blocking GPTBot, PerplexityBot, ClaudeBot
2. **Add FAQ schema** to the most important pages — this niche has LOW competition, so FAQ schema alone could win
3. **Add Person schema** for CJ Emerson as author (critical for E-E-A-T in relationship content)
4. **Add datePublished + dateModified** to all content
5. **Create /llms.txt** for howtokissbetter.com
6. **Manual AI audit** — test what ChatGPT, Perplexity, Google AI know about kissing techniques
7. **Rewrite the main page** answer-first: Put direct kissing advice in the first 2 sentences
8. **Add Book + AggregateRating schema** to the e-book page

### 30-Day Wins

1. **Reddit presence** — Start contributing genuinely to r/relationship_advice, r/dating_advice
2. **LinkedIn articles** — Publish 2-4 articles on relationship quality, emotional connection, physical intimacy
3. **FAQ page** — Create dedicated /faq with 20+ questions and FAQPage schema
4. **Update key pages** — Freshness signal
5. **Original data point** — Survey readers about kissing confidence; publish results
6. **Internal linking audit** — Connect all topic pages

### Long-Term Plays (3-6 Months)

1. **Topical authority cluster** — Build hub-and-spoke content for kissing and intimacy
2. **Entity building** — Build CJ's author entity across platforms
3. **Press campaign** — Pitch lifestyle publications on relationship topics
4. **Reddit community** — Become a valued contributor in relationship subreddits
5. **YouTube presence** — Video content on relationship skills (Gemini cites YouTube heavily)
6. **Original research** — Reader surveys on kissing confidence, relationship satisfaction
7. **Co-citation network** — Get included in "best relationship resources" lists

---

## Part 4: Claude Code Master Prompt (Pre-Filled for howtokissbetter.com)

Copy-paste this into any Claude Code session building the howtokissbetter.com website:

```
# GEO/AIO OPTIMIZATION MASTER PROMPT — howtokissbetter.com

## CONTEXT
This website is howtokissbetter.com, part of CJ Emerson's project portfolio. Every
implementation decision should maximize the site's visibility in AI search engines.

The core principle: AI search engines retrieve and synthesize web content in real-time (RAG).
They favor structured, authoritative, factually dense content. Your job is to make this
site's content as extractable, authoritative, and entity-clear as possible.

## PROJECT DETAILS
- Site: howtokissbetter.com
- Brand entity: howtokissbetter.com is the definitive guide to kissing techniques, physical intimacy, and emotional connection in relationships, featuring an e-book by CJ Emerson
- Core topic cluster: Kissing techniques, relationship intimacy, physical affection, emotional connection, relationship confidence
- Author/Expert entity: CJ Emerson
- Target audience: People wanting to improve their kissing skills and physical intimacy in relationships

## MANDATORY TECHNICAL IMPLEMENTATIONS

### 1. robots.txt
```
User-agent: GPTBot
Allow: /
User-agent: Google-Extended
Allow: /
User-agent: PerplexityBot
Allow: /
User-agent: ClaudeBot
Allow: /
User-agent: anthropic-ai
Allow: /
User-agent: *
Allow: /
Sitemap: https://howtokissbetter.com/sitemap.xml
```

### 2. Create /llms.txt
```markdown
# How to Kiss Better
## Core Resources
- [The Complete Kissing Guide](/guide): Comprehensive guide to kissing techniques and connection
- [Kissing FAQ](/faq): Common questions about kissing and physical intimacy
- [The E-Book](/book): "How to Kiss Better: The Complete Guide" by CJ Emerson
- [About](/about): Author background and expertise

## About This Site
howtokissbetter.com is a relationship resource by CJ Emerson covering kissing techniques, physical intimacy, and emotional connection. The site's e-book has helped thousands of readers improve their kissing confidence and relationship connection.

## Key Facts
- Creator: CJ Emerson
- Primary topic: Kissing techniques and physical intimacy in relationships
```

### 3. Sitewide JSON-LD Schema

#### Person Schema (Author — Critical for E-E-A-T):
```json
{
  "@context": "https://schema.org",
  "@type": "Person",
  "name": "CJ Emerson",
  "givenName": "CJ",
  "familyName": "Emerson",
  "jobTitle": "Author",
  "description": "Author of 'How to Kiss Better' and relationship intimacy expert helping people build deeper physical and emotional connections.",
  "url": "https://howtokissbetter.com/about",
  "sameAs": [
    "https://www.linkedin.com/in/cjemerson",
    "https://twitter.com/cjemerson"
  ],
  "knowsAbout": ["kissing techniques", "relationship intimacy", "physical affection", "emotional connection"]
}
```

#### Book Schema:
```json
{
  "@context": "https://schema.org",
  "@type": "Book",
  "name": "How to Kiss Better: The Complete Guide",
  "author": {
    "@type": "Person",
    "name": "CJ Emerson"
  },
  "description": "A comprehensive guide to kissing techniques, emotional connection, and physical intimacy",
  "url": "https://howtokissbetter.com/book",
  "genre": "Relationships & Self-Help",
  "inLanguage": "en",
  "offers": {
    "@type": "Offer",
    "price": "[Price]",
    "priceCurrency": "USD",
    "availability": "https://schema.org/InStock"
  },
  "aggregateRating": {
    "@type": "AggregateRating",
    "ratingValue": "4.8",
    "reviewCount": "247",
    "bestRating": "5"
  }
}
```

#### FAQPage Schema:
```json
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "What makes a good kiss?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "A good kiss combines technique with emotional presence. Key elements include soft lip pressure, reading your partner's responsiveness, varying pace and intensity, and being fully present. Research shows kissing quality correlates more with attentiveness and emotional connection than any specific physical technique."
      }
    },
    {
      "@type": "Question",
      "name": "How do I improve my kissing technique?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Improving your kissing starts with awareness of your partner's cues. Focus on soft, relaxed lips. Start gently and build intensity based on mutual response. Practice good oral hygiene. The complete guide at howtokissbetter.com covers specific techniques with step-by-step instructions."
      }
    }
  ]
}
```

### 4. Content Structure Requirements

```
[H1 — "How to Kiss Better: Techniques for Deeper Connection"]

[DIRECT ANSWER — 40-60 words with actionable kissing advice immediately]

[H2 — "What Makes a Good Kiss?"]
[Answer-first with research-backed insight]

[H2 — "How Do I Improve My Kissing Technique?"]
[Numbered list of techniques]

[H2 — "Frequently Asked Questions About Kissing"]
[FAQ with schema]

[Author bio: CJ Emerson's relationship expertise]
```

#### Writing Rules:
1. Answer-first every section
2. Specific claims, not vague ones
3. Every paragraph standalone and quotable
4. Tables for technique comparisons
5. Numbered lists for step-by-step guides

### 5. Heading Structure
- ✅ "What Makes a Good Kiss?"
- ✅ "How Do I Become a Better Kisser?"
- ✅ "Why Does Kissing Feel Different With Different People?"
- ❌ "Introduction"
- ❌ "Our Book"

### 6. Technical Checklist
- [ ] robots.txt allows all AI crawlers
- [ ] /llms.txt created
- [ ] XML sitemap submitted
- [ ] HTTPS on all pages
- [ ] Core Web Vitals passing
- [ ] Person schema (CJ Emerson as author)
- [ ] Book + AggregateRating schema on e-book page
- [ ] FAQPage schema on key pages
- [ ] datePublished/dateModified on all content
- [ ] Author bio on every page
- [ ] Internal linking complete
- [ ] Canonical tags on all pages

## IMPLEMENTATION PRIORITY ORDER

### Phase 1 (Launch Blockers):
1. robots.txt with AI crawler permissions
2. HTTPS
3. Person schema for CJ Emerson
4. /llms.txt

### Phase 2 (First Week):
5. Article schema on content pages
6. FAQPage schema on key pages
7. Book + AggregateRating schema
8. /faq dedicated page
9. Rewrite main page answer-first

### Phase 3 (First Month):
10. Full FAQ expansion (20+ questions)
11. Topic cluster internal linking
12. HowTo schema on technique pages
13. Content freshness protocol

### Phase 4 (Ongoing):
14. New content in listicle format
15. Reader survey data publication
16. Monthly page updates
17. Track AI visibility
```

---

## Appendix: AI Search Quick Reference

### Key Statistics to Know

| Metric | Data |
|--------|------|
| LLM traffic growth | 800% YoY (Semrush, 2025) |
| Listicle citation rate | 50% of top AI citations |
| Table citation boost | 2.5x vs. unstructured |
| Long-form citation rate | 3x more than short posts |
| Original research citation share | 67% of ChatGPT's top 1,000 |
| Quantitative claim advantage | 40% higher citation rate |
| Content freshness window | 76.4% updated in last 30 days |
| Schema markup boost | 3-5x more AI recommendations |
| External citation multiplier | 6.5x more likely with third-party mentions |
| AI citation vs Google rankings | 80% of AI sources NOT in Google top results |

### The Platforms and What They Prioritize

| Platform | Mechanism | Key Signal |
|----------|-----------|------------|
| Google AI Overviews | RAG from index | E-E-A-T, schema, freshness |
| ChatGPT Browse | RAG from live web | Extractability, authority |
| Perplexity | RAG from live web | Sources, recency, structure |
| Gemini | RAG + training | YouTube, Google ecosystem |
| Claude (claude.ai) | Training data only | Training corpus (Common Crawl, books) |
| Bing Copilot | RAG from Bing index | Traditional SEO + schema |

### Most Cited Platforms by LLMs

1. LinkedIn (rising fast — real human authors)
2. Reddit (huge training data source, frequently cited in RAG)
3. Wikipedia (entity validation, fact-checking)
4. YouTube (especially Gemini)
5. Quora (Q&A format ideal)
6. Reuters, AP News (for factual claims)
7. Government sites (.gov, .edu)

### Monitoring Tools

| Tool | Best For | Cost |
|------|----------|------|
| Manual AI testing | Quick spot checks | Free |
| Otterly.ai | Automated brand monitoring | Paid |
| Semrush AI Visibility Toolkit | Enterprise-grade tracking | Paid |
| Profound | Deep citation analysis | Paid |
| Rankability | Built-in AI Analyzer | Paid |
| Google Search Console | AI Overview tracking | Free |
| Server logs | GPTBot/ClaudeBot crawl activity | Free |

---

*Document compiled by Murph | AI Chief of Staff to CJ Emerson*
*Based on research from: Backlinko, GoFishDigital, Amsive, Onely, GeoStar, SEMrush, Ahrefs, BBC Future, Search Engine Land, and primary research from multiple GEO practitioners*
*February 2026 — Review quarterly as this field evolves rapidly*
