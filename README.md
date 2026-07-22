# DogLight

Shine a light on your [dogflight.io](https://dogflight.io/) play.

### Use

#### Bugs

- Cannot consistently detect when you are on the red team.
- Firing and movement cause noticeable flickering.
- Some sessions become orphaned. The regular manual shutoff works if you keep the tab open, but the emergency fallbacks do not seem to catch them.
- Possible race condition if you finalize an orphaned session by creating a new one.
- One time, going back to the homepage with the back arrow started a new session altogether.

#### Small To-Dos

- Fix the flickering. It is now mostly gone.
- Fix orphaned sessions.
  - Add background fallbacks that actually detect tab changes.
  - At least wrap `startSession` and `finalizeActiveSession` in asynchronous functions to be safe about a race condition that probably does not exist between them.
  - When that is done, make sure both buttons actually work.
- Fix game results.
  - Figure out the pattern of team assignment, or find some signal I can listen for.
- Make the React code more idiomatic.
  - Use Tailwind CSS, maybe?

#### Big To-Dos

- Consistently track plane orientation (and position).
- Make the graph more interactive.

### Installing

Once you have cloned the repository:

```bash
npm install
```

### Development

This project is designed to be a Chrome extension and therefore works on Chromium-based browsers. After making changes, build the development extension with:

```bash
npm run build
```

This creates a `dist` folder, which is the actual extension that the browser loads. This build step is necessary because the project uses TypeScript.

To start the development server:

```bash
npm run dev -- --host 127.0.0.1
```

If this is your first time setting up the project, open `chrome://extensions` in Chrome or Chromium and enable **Developer mode** in the top-right corner. Then click **Load unpacked** in the top-left corner and select the generated `dist` folder. You should see the new extension appear.

Each time you update the code and run `npm run build`, the extension will be rebuilt automatically. However, you will still need to click the **Reload** button on the extension's card in `chrome://extensions` for the changes to take effect.
