# GrowUp Agency — Design System

## Philosophy
Apple-minimal: white space, clean typography, subtle shadows, no heavy colors.

## Design Tokens
| Token | Value | Usage |
|---|---|---|
| `--bg` | `#ffffff` | Main background |
| `--bg-secondary` | `#f5f5f7` | Cards, sections |
| `--text` | `#1d1d1f` | Primary text |
| `--text-secondary` | `#6e6e73` | Subtext |
| `--accent` | `#0071e3` | Apple blue — buttons, links |
| `--accent-hover` | `#0077ed` | Button hover |
| `--border` | `#d2d2d7` | Dividers, borders |
| `--success` | `#34c759` | Green |
| `--error` | `#ff3b30` | Red |
| `--radius` | `12px` | Card radius |
| `--radius-sm` | `8px` | Button/input radius |

## Typography
- Arabic: Cairo (Google Fonts)
- Latin/French: Inter (Google Fonts)
- Scale: hero clamp(2rem,5vw,4rem), h2 clamp(1.5rem,3vw,2.5rem), h3 1.25rem, body 1rem

## Layout
- Container max-width: 1100px
- Section padding: 5rem 0
- Responsive: 1 column on mobile, auto-fit grid for cards

## Dark Mode
Toggle via `[data-dark]` attribute on body. Uses same tokens inverted.
