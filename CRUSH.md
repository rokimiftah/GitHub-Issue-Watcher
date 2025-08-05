# CRUSH Commands

## Build & Dev
- `npm run dev` - Start dev server
- `npm run build` - Build for production
- `npm run preview` - Preview build

## Lint & Format
- `npx @biomejs/biome check .` - Lint check
- `npx @biomejs/biome format . --write` - Format with Biome
- `npx prettier --write .` - Format with Prettier

## Code Style
- **Framework**: React 18.3 + TypeScript 5.8
- **Styling**: Tailwind CSS + Mantine
- **Bundler**: Rsbuild
- **Backend**: Convex
- **Imports**: Prettier auto-sorts (types → builtins → react → third-party → @components → relative → css)
- **Tabs**: 4 spaces
- **Strict**: TypeScript strict mode enabled
- **Naming**: PascalCase for components, camelCase for functions/variables
- **Error handling**: Use try-catch with specific error types