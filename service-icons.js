(function () {
  const clone = value => JSON.parse(JSON.stringify(value));
  const base = Object.fromEntries((window.OgreenaServiceOrder?.services || []).map(service => [service.slug, { mode:'default', image:null, zoom:1, x:50, y:50 }]));
  const read = () => clone(base);
  const get = slug => read()[slug] || { mode:'default', image:null, zoom:1, x:50, y:50 };
  const save = () => false;
  const inner = service => {
    const item = get(service.slug);
    if (item.mode === 'custom' && item.image) return `<img src="${item.image}" alt="${service.name} custom icon" style="object-position:${item.x}% ${item.y}%;transform:scale(${item.zoom})">`;
    if (item.mode === 'empty') return '<span class="empty-service-icon" aria-label="No custom service image">•</span>';
    return `<span aria-hidden="true">${service.icon}</span>`;
  };
  const markup = (service, className='service-icon') => `<span class="${className}" data-service-icon="${service.slug}">${inner(service)}</span>`;
  const renderInto = (element, service) => { if (!element) return; element.dataset.serviceIcon = service.slug; element.innerHTML = inner(service); };
  window.OgreenaServiceIcons = { get, save, markup, renderInto };
}());
