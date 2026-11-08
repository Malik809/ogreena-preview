(function () {
  const root = location.hostname.endsWith('.github.io') ? '/ogreena-preview/' : '/';
  window.OgreenaProductCatalog = Object.freeze([
    { id: 'og-trinity-32oz', name: 'Trinity All Purpose Cleaner', size: '32 oz', price: 15, checkoutEligible: true, image: `${root}assets/products/trinity-32oz-480.webp` },
    { id: 'og-floor-32oz', name: 'Floor Cleaner', size: '32 oz', price: 15, checkoutEligible: true, image: `${root}assets/products/floor-32oz-480.webp` },
    { id: 'og-t-fresche-32oz', name: 'T-Fresche Deodorizer', size: '32 oz', price: 15, checkoutEligible: false, image: `${root}assets/products/t-fresche-32oz-480.webp` },
    { id: 'og-trinity-gallon', name: 'Trinity All Purpose Cleaner', size: 'Gallon', price: 30, checkoutEligible: true, image: `${root}assets/products/trinity-gallon-480.webp` },
    { id: 'og-floor-gallon', name: 'Floor Cleaner', size: 'Gallon', price: 30, checkoutEligible: true, image: `${root}assets/products/floor-gallon-480.webp` }
  ]);
}());
