const serviceOrder = window.OgreenaServiceOrder;
let servicesExpanded = false;
function serviceCard(service) { return `<a class="service-card" href="services/${service.slug}/">${window.OgreenaServiceIcons.markup(service)}<span><h3>${service.name}</h3><p>${service.summary}</p></span><span class="chev">›</span></a>`; }
function renderServices() {
  const services = serviceOrder.getServices();
  document.querySelector('#featuredServices').innerHTML = (servicesExpanded ? services : services.slice(0, 4)).map(serviceCard).join('');
  document.querySelector('#allServices').innerHTML = services.map(serviceCard).join('');
  const toggle = document.querySelector('#serviceToggle');
  toggle.textContent = servicesExpanded ? 'Show Less' : 'View All';
  toggle.setAttribute('aria-expanded', String(servicesExpanded));
}
document.querySelector('#serviceToggle').addEventListener('click', () => { servicesExpanded = !servicesExpanded; renderServices(); });
window.addEventListener('ogreena:service-order-updated', renderServices);
window.addEventListener('ogreena:service-icons-updated', renderServices);
window.addEventListener('storage', event => { if (event.key === 'ogreenaDemoServiceIcons:v1') renderServices(); });
renderServices();
function showTab(name){document.querySelectorAll('.tab').forEach(x=>x.classList.toggle('active',x.dataset.tab===name));document.querySelectorAll('.tab-panel').forEach(x=>x.classList.remove('active'));document.querySelector(`#panel-${name}`).classList.add('active');location.hash=name}document.querySelectorAll('[data-tab]').forEach(x=>x.addEventListener('click',()=>showTab(x.dataset.tab)));document.querySelector('[data-mobile-services]').addEventListener('click',e=>{e.preventDefault();showTab('services');scrollTo({top:0,behavior:'smooth'})});if(location.hash&&document.querySelector(`#panel-${location.hash.slice(1)}`))showTab(location.hash.slice(1));
document.querySelectorAll('[data-unavailable]').forEach(button => button.addEventListener('click', () => {
  const toast = document.querySelector('#toast');
  toast.textContent = 'Online service requests are not available yet. Please call (510) 472-9327.';
  toast.classList.add('show');
  clearTimeout(window.ogreenaNoticeTimer);
  window.ogreenaNoticeTimer = setTimeout(() => toast.classList.remove('show'), 4200);
}));
