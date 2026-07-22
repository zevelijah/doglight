# DogLight

Shine a light on your [dogflight.io](https://dogflight.io/) play.

### Use

#### Bugs

- Cannot detect red team when scores are reversed.
- Firing and other tracked local storage changes cause a noticable flicker.
- Some sessioned get orphaned. The regular manual shutoff works if you keep the tab open, but the emergecy stoppers don't seem to catch them.
- Possible Race codition if you finalize an orphaned session by creating a new one.
- One time going back to the homepage with the arrow started a new session altogether.

#### Small To-Dos

- Fixing the flicker. It is now mostly gone.
- Fixing the orphans
  - Background fallbacks that actually pick up on tab changes.
  - At least putting an an async function wrapper around `startSession` and `finalizeActiveSession` just to be careful with a race codition that probably doesn't exist between them.
  - When that is done, make sure both my buttons actually work.
- Fixing the game results:
  - Figure out the pattern of team assignment, or some signal I can listen for
- Make React code more native.
  - Use tailwind CSS, maybe?

#### Big To-Dos

- Consistent tracking of plane orientaion (and position).
- Make graph more interactive.

### Installing

Once you have cloned the repo:

```bash
npm install
```

### Dev Testing

This is designed to be a chrome extension, and as such works on chromium. To build the development extesnion after changes are made:

```bash
npm run build
```

This creates a `dist` folder that acts tha actual extension that the browser will see. This is nesscesary because we are using typescript. To start up the the extension server:

```bash
npm run dev -- --host 127.0.0.1
```

If you are doing this for the first time, go to `chrome://extensions` in chrome or chromium and activate developer mode in the top right. Then, press "load unpacked" in the top left and select the generated `dist` folder. You should see a new extension pop up.

Every time you update the code and run `npm run build`, the server will restart automatically, but you will have to press the reload button on the extension's card in `chrome://extensions`.
