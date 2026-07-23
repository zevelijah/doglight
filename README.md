# DogLight

Shine a light on your [dogflight.io](https://dogflight.io/) play.

### Use

#### Bugs

- Cannot always automatically detect when you are on the red team.
- Firing and movement cause noticeable flickering.
- Sometimes huge lag spikes on the home screen.

#### Small To-Dos

- Improve the flickering. It is now mostly gone.
  - `content.ts` might have to be lightend in favor of `injected.ts`.
- Track down the cause of the massive spike when the home page is open.
- Improve team identification.
  - Figure out the pattern of team assignment, or find some signal I can listen for.
- Make the React code more idiomatic.
  - Use Tailwind CSS, maybe?
- Make sure firing location is saved for and only for the Barracuda.
- Track team point increases that you don't get bonuses from.
  - Make sure that how that information is viewed is responsive to which team the player was on, and be prepared for team changes.

#### Big To-Dos

- Consistently track plane orientation (and position).
  - Know when a click is actually a manuvering click.
  - Track when a the plane drifts (esspecially for Thunderbolt).
  - Know where the plane is when it isn't the center of the screen.
- Make the graph more interactive.
- Record your best weekly rank each week, best monthly rank each month, and each achieved all-time record separately with a timestamp.
- Create a tool for making insights about various variables relative to each other, such and plane type and kills and accuracy during manuevers versus stationary.
- GitHub Actions for automatic publication to Chrome Web Store.
  - The easiest method uses Google Cloud, which can integrate with Chrome Web Store with a bit of magic.
- Make a website for users to share their data.
  - Overhaul privacy policy when that happens.

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
