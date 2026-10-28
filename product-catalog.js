(function () {
  const root = location.hostname.endsWith('.github.io') ? '/ogreena-preview/' : '/';
  window.OgreenaProductCatalog = Object.freeze([
    { id: 'og-trinity-32oz', name: 'Trinity All Purpose Cleaner', size: '32 oz', price: 15, image: `${root}assets/products/trinity-32oz.jpg`, squareUrl: 'https://square.link/u/Q0rHcOP5' },
    { id: 'og-floor-32oz', name: 'Floor Cleaner', size: '32 oz', price: 15, image: `${root}assets/products/floor-32oz.jpg`, squareUrl: 'https://square.link/u/sTOZ84R7' },
    { id: 'og-t-fresche-32oz', name: 'T-Fresche Deodorizer', size: '32 oz', price: 15, image: `${root}assets/products/t-fresche-32oz.jpg`, squareUrl: 'https://square.link/u/JW1cV72R' },
    { id: 'og-trinity-gallon', name: 'Trinity All Purpose Cleaner', size: 'Gallon', price: 30, image: `${root}assets/products/trinity-gallon.jpg`, squareUrl: 'https://square.link/u/Rh2ajlwu' },
    { id: 'og-floor-gallon', name: 'Floor Cleaner', size: 'Gallon', price: 30, image: `${root}assets/products/floor-gallon.jpg`, squareUrl: 'https://square.link/u/GfnXsOiP' }
  ]);
}());
