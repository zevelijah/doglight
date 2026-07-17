# DogLight

Shine a light on your [dogflight.io](https://dogflight.io/) play.

### Use

#### Bugs

- When you play for red team the scores are reversed. It is possible that other records break as well.

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
npm run dev
```

If you are doing this for the first time, go to `chrome://extensions` in chrome or chromium and activate developer mode in the top right. Then, press "load unpacked" in the top left and select the generated `dist` folder. You should see a new extension pop up.

Every time you update the code and run `npm run build`, the server will restart automatically, but you will have to press the reload button on the extension's card in `chrome://extensions`.
