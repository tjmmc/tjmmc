// MMC Lab connection settings.
// The page calls the lab API directly first. If the school network blocks that,
// it switches to the relay (a Google Apps Script or Cloudflare Worker that forwards to the API).
window.MMC_LAB = {
  api: 'https://oderace.vercel.app/api/lab/',
  relay: '', // paste the Apps Script web app URL (ends in /exec) here
};
