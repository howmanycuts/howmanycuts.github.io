// Settings you can change without touching the game code.
export const CONFIG = {
  // Link shown on the home screen ("Watch the videos"). Leave empty to hide the button.
  youtube: '',

  // Ads (Adsterra banners). Nothing loads while `on` is false; a banner with an empty key is skipped.
  // `key` and `src` come from the code Adsterra gives for each banner size ("Get code"):
  // key = the value after 'key', src = the address in the second <script src="...">.
  ads: {
    on: true,
    top: { key: '7ed5c9a2415a962792d753a9ec213ffd', src: 'https://bauval.org/22/7ed5c9a2415a962792d753a9ec213ffd', w: 320, h: 50 },   // top of the screen during a round
    card: { key: '', src: '', w: 300, h: 250 },                                                                                      // under the result card
    // Formats that Adsterra runs by itself on the whole page. Empty the address to turn one off.
    popunder: 'https://abscloud.org/1/039a5e04bb352e7f99b45d8aed3079a1',    // opens an ad tab on the first click
    socialBar: 'https://bauval.org/14/704e95d0b2d0fbd84964a41e3de2bbf7',    // a notification-style ad over the page
  },
};
