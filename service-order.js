(function () {
  const services = [
    { slug:'carpet-cleaning', name:'Carpet Cleaning', icon:'◫', summary:'Carpet care, spots and stains' },
    { slug:'house-cleaning', name:'House Cleaning', icon:'⌂', summary:'Routine and one-time home cleaning' },
    { slug:'deep-cleaning', name:'Deep Cleaning', icon:'✦', summary:'Detailed cleaning for a full reset' },
    { slug:'move-in-move-out-cleaning', name:'Move-In / Move-Out', icon:'↗', summary:'Move-ready cleaning support' },
    { slug:'electrical-services', name:'Electrical Services', icon:'ϟ', summary:'Outlets, switches and lighting' },
    { slug:'commercial-cleaning', name:'Commercial Cleaning', icon:'▦', summary:'Cleaning plans for business properties' },
    { slug:'janitorial-services', name:'Janitorial Services', icon:'✓', summary:'Recurring facility cleaning' },
    { slug:'facilities-maintenance', name:'Facilities Maintenance', icon:'⚙', summary:'Coordinated property support' },
    { slug:'tile-grout-cleaning', name:'Tile & Grout Cleaning', icon:'▤', summary:'Tile surfaces and grout lines' },
    { slug:'upholstery-cleaning', name:'Upholstery Cleaning', icon:'▰', summary:'Sofas, chairs and fabric care' },
    { slug:'window-cleaning', name:'Window Cleaning', icon:'▣', summary:'Interior and exterior glass care' },
    { slug:'pressure-washing', name:'Pressure Washing', icon:'≈', summary:'Exterior hard-surface cleaning' }
  ];
  const defaults = services.map(service => service.slug);
  const getOrder = () => defaults.slice();
  const getServices = () => { const bySlug = Object.fromEntries(services.map(service => [service.slug, service])); return getOrder().map(slug => bySlug[slug]); };
  const save = () => false;
  window.OgreenaServiceOrder = { services, defaults, getOrder, getServices, save };
})();
