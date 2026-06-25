# iPhone Portfolio by Dmitrij Kraliks

An interactive portfolio built as a fully working iOS-style iPhone. Unlock the
phone, swipe between home pages, and tap the apps. Each one is a real,
functional mini-app rather than a static mock-up.

> No frameworks, no build step, no dependencies. Just vanilla HTML, CSS and JavaScript.

## Live apps

| App | What it does |
| --- | --- |
| **About / Projects / Experience / Skills** | The actual portfolio content |
| **Phone / Mail** | Contact details (tap to call or email) |
| **Camera** | Live webcam preview, capture a photo, multi-camera switch |
| **Clock** | Live world clock, working stopwatch, countdown timer, alarms |
| **Weather** | Real live forecast for Dublin via the Open-Meteo API |
| **Maps** | Themed map view of the location |
| **Music** | A working player with a small library |
| **Notes** | Create, edit and delete notes, saved to `localStorage` |
| **Settings** | Real brightness, airplane mode, wallpaper-blur toggles |
| **App Store** | A showcase "Today" page linking to the portfolio sections |

Plus a lock screen with a live clock, flashlight and camera shortcuts, and an
unlock animation; a swipeable multi-page home screen with a page indicator and
dock; Spotlight search; a boot screen; and a control centre.

## Tech

- **HTML**: single `index.html`; every app screen is a `<template>` cloned on demand.
- **CSS**: single `style.css`; grid/flexbox, CSS variables, transforms, `backdrop-filter`, keyframe animations.
- **JavaScript**: single `script.js`; vanilla ES6+, no libraries.
- **Browser APIs**: `getUserMedia` (camera), `localStorage` (notes), `fetch` plus `Intl` (weather/clock), Canvas 2D (photo capture), Pointer Events (swipe/drag gestures).
- **External**: [Open-Meteo](https://open-meteo.com) (free weather, no key), Google Fonts (Inter).

## Run locally

It is a static site, so serve the folder with anything, for example:

```bash
python -m http.server 8123
# then open http://localhost:8123
```

A secure context (`localhost` or `https`) is required for the Camera app's
`getUserMedia` to work.

## Deploy

Hosted on [Vercel](https://vercel.com) as a static site with no configuration
needed; the repository root is served as is.

## Author

**Dmitrij Kraliks**
[GitHub](https://github.com/dkode4) and [LinkedIn](https://www.linkedin.com/in/dmitrij-kraliks)
