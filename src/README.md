# NMC Official UI Theme Pack

This package contains a reusable official government UI theme for the Metrology License Report System.

## Files

- `nmc-official-theme.css`  
  Main CSS theme file.

- `NMCOfficialThemeExample.tsx`  
  Optional React/TSX example showing how to use the CSS classes.

- `codex-prompt-apply-theme.txt`  
  A safe Codex prompt to apply the theme without changing logic.

## Recommended location

Copy:

```text
nmc-official-theme.css
```

to:

```text
src/styles/nmc-official-theme.css
```

Then import it in `src/main.tsx`:

```ts
import './styles/nmc-official-theme.css';
```

Or import it inside `src/index.css`:

```css
@import './styles/nmc-official-theme.css';
```
