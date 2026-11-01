# Logo

A magnifier over three lines of config. In the main mark, the middle line is out of place: pageslens shows what a site hides. In the pass mark, the lines are aligned.

| File                                        | Use                                                                               |
| ------------------------------------------- | --------------------------------------------------------------------------------- |
| `mark-light.svg`, `mark-dark.svg`           | The main mark, for light and dark backgrounds                                     |
| `mark-pass-light.svg`, `mark-pass-dark.svg` | The pass mark, where a result is shown                                            |
| `lockup-light.svg`, `lockup-dark.svg`       | The mark with the wordmark, as in the README header                               |
| `icon.svg`, `icon-pass.svg`                 | 32 px and smaller: two thicker lines. They follow the system's light or dark mode |

The docs site uses copies: `site/src/assets/lockup-*.svg` for the header, `site/src/assets/mark-*.svg` for the home page, and `site/public/favicon.svg` (`icon.svg`). Change them together.

Colours: teal `#1D9E75`, amber `#EF9F27`, ink `#1F2937` on light and `#F9FAFB` on dark.

The wordmark is [Manrope](https://fonts.google.com/specimen/Manrope) Bold (SIL Open Font License), turned into outlines at 62 px from x 116 on baseline 70, so it needs no font installed. To change it, outline the text again with a font tool such as opentype.js.

Don't use the pass and main marks to tell results apart by colour alone: put words next to them.
