const serviceOrder = window.OgreenaServiceOrder;
let servicesExpanded = false;
function serviceCard(service) { return `<a class="service-card" data-service-slug="${service.slug}" href="services/${service.slug}/">${window.OgreenaServiceIcons.markup(service)}<span><h3>${service.name}</h3><p>${service.summary}</p></span><span class="chev">›</span></a>`; }
function isHaulingCard(card) {
  return card?.dataset.serviceSlug === 'hauling' || /\bhauling\b/i.test(card?.querySelector('h3')?.textContent || '');
}
function repairHaulingRoute() {
  document.querySelectorAll('a.service-card').forEach(card => {
    if (isHaulingCard(card) && new URL(card.href, location.href).pathname !== '/services/hauling/') card.href = 'services/hauling/';
  });
}
function renderServices() {
  const services = serviceOrder.getServices();
  const featuredSlugs = ['carpet-cleaning','house-cleaning','deep-cleaning','move-in-move-out-cleaning','landscaping','hauling'];
  const featured = services.filter(service => featuredSlugs.includes(service.slug));
  document.querySelector('#featuredServices').innerHTML = (servicesExpanded ? services : featured).map(serviceCard).join('');
  document.querySelector('#allServices').innerHTML = services.map(serviceCard).join('');
  repairHaulingRoute();
  const toggle = document.querySelector('#serviceToggle');
  toggle.textContent = servicesExpanded ? 'Show Less' : 'View All';
  toggle.setAttribute('aria-expanded', String(servicesExpanded));
}
document.querySelector('#serviceToggle').addEventListener('click', () => { servicesExpanded = !servicesExpanded; renderServices(); });
window.addEventListener('ogreena:service-order-updated', renderServices);
window.addEventListener('ogreena:service-icons-updated', renderServices);
window.addEventListener('storage', event => { if (event.key === 'ogreenaDemoServiceIcons:v1') renderServices(); });
renderServices();
window.addEventListener('pageshow', repairHaulingRoute);
document.addEventListener('click', event => {
  const card = event.target.closest?.('a.service-card');
  if (!isHaulingCard(card) || new URL(card.href, location.href).pathname === '/services/hauling/') return;
  event.preventDefault();
  location.assign(new URL('services/hauling/', location.href));
}, true);
function showTab(name){document.querySelectorAll('.tab').forEach(x=>x.classList.toggle('active',x.dataset.tab===name));document.querySelectorAll('.tab-panel').forEach(x=>x.classList.remove('active'));document.querySelector(`#panel-${name}`).classList.add('active');location.hash=name}document.querySelectorAll('[data-tab]').forEach(x=>x.addEventListener('click',()=>showTab(x.dataset.tab)));document.querySelector('[data-mobile-services]').addEventListener('click',e=>{e.preventDefault();showTab('services');scrollTo({top:0,behavior:'smooth'})});if(location.hash&&document.querySelector(`#panel-${location.hash.slice(1)}`))showTab(location.hash.slice(1));
document.querySelectorAll('[data-unavailable]').forEach(button => button.addEventListener('click', () => {
  location.href='messages/?service=general-inquiry';
}));
document.querySelectorAll('[data-unavailable]').forEach(button=>{
  const title=button.querySelector('b'),detail=button.querySelector('span');
  if(title)title.textContent='Message Ogreena';
  if(detail)detail.textContent='Chat directly with our team';
});
