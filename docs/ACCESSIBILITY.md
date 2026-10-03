# Accessibility

Chitthi aims to meet **WCAG 2.2 level AA** in the web and desktop apps, in both light and dark themes, from 1920 px
down to 360 px wide.

## What is in place

- Every control can be reached and used with the keyboard. On the preview, arrow keys move the photo in the selected
  slot (Shift for bigger steps), and plus and minus zoom.
- Buttons and icon-only controls have accessible names; toggles report their state (`aria-pressed`); grouped choices
  are labelled groups.
- Messages (toasts) are announced through a live region.
- Text and controls meet AA contrast in both themes.
- Animations respect the system's reduced-motion setting.
- No sideways scrolling at any width from 1920 to 360 px.

## How it is checked

Every pull request runs an [axe](https://github.com/dequelabs/axe-core) scan of the home page, the studio and the
sizes guide at desktop and phone sizes, and fails on any serious or critical WCAG 2.2 A/AA problem
([TESTING.md](TESTING.md#browser-tests-playwright)).

## Known limits

- **The card preview is a picture.** The design itself is drawn on a canvas, so a screen reader announces it as one
  image with a description, not the words on it. Every word on the card is also in the form fields of the studio
  steps, where it can be read and edited.
- **The 3D views** (card, calendar ring, paper sizes) are visual extras: everything they show is also available in
  the flat preview and the sizes guide.
- **Drag and drop** in the photo dock has keyboard alternatives (tap or press a photo to place it), but swapping two
  slots by dragging has no single-key equivalent yet.
- The app has not yet been tested end to end with screen readers (NVDA, JAWS, VoiceOver). Reports are welcome.

## Reporting a problem

Open an [issue](https://github.com/RVicky172/Chitthi/issues/new/choose) with the **Bug report** template and say
which screen, browser and assistive technology you use. Accessibility bugs are treated like any other bug that blocks
someone from using the app.
