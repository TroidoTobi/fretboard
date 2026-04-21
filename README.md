# Bass Fretboard Trainer

A web-based trainer for learning note positions on a 4-string bass fretboard.

## Features

- Learn mode and speed mode
- Natural-note and chromatic training
- Configurable fret range, enabled strings, timer, and question count
- Correct answer validation by pitch class, so every valid position counts
- Mobile-friendly fretboard UI
- GitHub Pages deployment workflow included

## Local Development

Requirements:

- Node.js 18+
- npm

Install dependencies:

```bash
npm install
```

Start the dev server:

```bash
npm run dev
```

To test on your phone over the local network:

```bash
npm run dev -- --host
```

## Build

```bash
npm run build
```

## GitHub Pages Deployment

This repository includes a GitHub Actions workflow that deploys the app to GitHub Pages.

Steps:

1. Create a GitHub repository and push this project to the `main` branch.
2. In GitHub, open `Settings` -> `Pages`.
3. Under `Build and deployment`, set `Source` to `GitHub Actions`.
4. Push to `main` again if needed.
5. GitHub will publish the site at:

```text
https://<your-username>.github.io/<repo-name>/
```

The Vite base path is derived automatically from the GitHub repository name during the Pages build.

## Notes

- For local development, the app uses `/` as the base path.
- For GitHub Pages builds, the app uses `/<repo-name>/` automatically.
