# DogLight

Shine a light on your [dogflight.io](https://dogflight.io/) play.

### DISCLAIMER

I am not affilated with the creators of [dogflight.io](https://dogflight.io/) in any way. Because I forgot to mention that in my description before sending the extension for review, there will be a brief period when the Google Web Store page doesn't say that. Sorry.

### Use

#### Bugs

- Cannot always automatically detect when you are on the red team.
- Best ever ranks by type don't always update.

#### Small To-Dos

- Optimize my tools such that autosaving isn't preventitively costly.
- Improve team detection.
  - Figure out the pattern of team assignment, or find some signal I can listen for.
- Make the React code more idiomatic.
  - Use Tailwind CSS, maybe?
- Make sure firing location is saved for and only for the Barracuda.

#### Big To-Dos

- Consistently track plane orientation (and position).
  - Know when a click is actually a manuvering click.
  - Track when a the plane drifts (esspecially for Thunderbolt).
  - Know where the plane is when it isn't the center of the screen.
- Make the graph more interactive.
- Record your best weekly rank each week, best monthly rank each month, and each achieved all-time record separately with a timestamp.
- Create a tool for making insights about various variables relative to each other, such and plane type and kills and accuracy during manuevers versus stationary.

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

### Licensing

This is available under the standard MIT license. Details available in the [LICENSE](https://github.com/zevelijah/doglight/blob/master/LICENSE) in the GitHub repository.
