/* Site settings used by the build (npm run build). Change these, then rebuild.
   MOBILE_SITE_URL: the GitHub Pages address of docs/, e.g. https://USERNAME.github.io/REPOSITORY/
   It is what the stall QR code (docs/qr.html, docs/qr.png, docs/qr.svg) points to.
   It can also be set for one build with the MOBILE_SITE_URL environment variable. */
module.exports = {
  MOBILE_SITE_URL: process.env.MOBILE_SITE_URL || 'https://study-holic.github.io/algosoc-fair/',
  JOIN_URL: 'https://linktr.ee/uom_algosoc',
};
