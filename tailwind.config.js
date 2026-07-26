/** Tailwind v3 config — compiles the utility classes the site was loading at
 *  runtime from cdn.tailwindcss.com into a static /assets/app.css (better LCP/CWV).
 *  Theme mirrors the former inline `tailwind.config` block. Rebuild with:
 *    npx -y tailwindcss@3.4.17 -c tailwind.config.js -i assets/tailwind.input.css -o assets/app.css --minify
 */
module.exports = {
  content: [
    './index.html',
    './404.html',
    './privacy/**/*.html',
    './terms/**/*.html',
    './blog/**/*.html',
    './book/**/*.html',
    './free-chapter-confirmed/**/*.html',
    // Class names are also emitted from Python f-strings at build time:
    './build_blog.py',
  ],
  // `hidden` is toggled by JS (classList.add('hidden')); keep it even if a scan misses it.
  safelist: ['hidden'],
  theme: {
    extend: {
      colors: {
        burgundy: '#722F37',
        wine: '#4A1C23',
        cream: '#FDF8F3',
        gold: '#D4AF37',
        'gold-dark': '#B8860B',
        charcoal: '#2D2D2D',
        'off-white': '#F5F5F5',
      },
      fontFamily: {
        serif: ['Cormorant Garamond', 'Georgia', 'serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
}
