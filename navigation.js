(function () {
  const siteRoot = location.hostname.endsWith('.github.io') ? '/ogreena-preview/' : '/';
  const topbar = document.querySelector('.topbar');
  if (!topbar) return;
  const button = document.createElement('button');
  button.className = 'menu-toggle';
  button.type = 'button';
  button.setAttribute('aria-label', 'Open navigation menu');
  button.setAttribute('aria-expanded', 'false');
  button.innerHTML = '<span></span><span></span><span></span>';
  topbar.prepend(button);

  const drawer = document.createElement('aside');
  drawer.className = 'site-menu';
  drawer.setAttribute('aria-hidden', 'true');
  drawer.innerHTML = `<div class="site-menu-head"><div><img src="${siteRoot}assets/ogreena-original-logo.jpg" alt="Ogreena logo"><b>Ogreena</b></div><button type="button" aria-label="Close navigation menu">×</button></div>
    <div class="menu-search"><span>⌕</span><input type="search" aria-label="Search navigation" placeholder="Search services and pages…"><button type="button" aria-label="Clear navigation search" hidden>Clear</button></div>
    <nav aria-label="Ogreena navigation" class="menu-link-list">
      <a data-menu-search="home main ogreena profile" href="${siteRoot}">Home / Main Ogreena Profile</a>
      <a data-menu-search="about us company" href="${siteRoot}#about">About Us</a>
      <a data-menu-search="residential services house cleaning carpet deep move in move out upholstery windows pressure washing" href="${siteRoot}#services">Residential Services</a>
      <a data-menu-search="commercial services cleaning janitorial facilities business" href="${siteRoot}services/commercial-cleaning/">Commercial Services</a>
      <a data-menu-search="electrical services electrician outlets switches lighting" href="${siteRoot}services/electrical-services/">Electrical Services</a>
      <a data-menu-search="all services" href="${siteRoot}#services">All Services</a>
      <a data-menu-search="products natural cleaning products store" href="${siteRoot}products/">Products</a>
      <a data-menu-search="kinship network community" href="${siteRoot}kinship-network/">Kinship Network</a>
      <a data-menu-search="blog green articles cleaning tips" href="${siteRoot}eco-cleaning-home-1/">Blog / Green Articles</a>
      <a data-menu-search="careers hiring jobs application employment" href="${siteRoot}hiring-application/">Careers / Hiring</a>
      <a data-menu-search="contact phone call estimate" href="${siteRoot}#contact">Contact</a>
      <a data-auth-guest data-menu-search="create account sign up register customer" href="${siteRoot}auth/?mode=signup">Create Account</a>
      <a data-auth-guest data-menu-search="sign in login customer owner employee" href="${siteRoot}auth/?mode=signin">Sign In</a>
      <a data-auth-user data-menu-search="account profile requests appointments" href="${siteRoot}auth/" hidden>My Account</a>
      <a data-auth-signout data-menu-search="sign out logout" href="#" hidden>Sign Out</a>
    </nav>
    <div class="menu-no-results" hidden>No matching pages found.</div>
    <p>Ogreena service navigation. Payments remain disabled until separately activated by an authorized owner.</p>`;
  document.body.append(drawer);
  const backdrop = document.createElement('button');
  backdrop.className = 'menu-backdrop'; backdrop.type = 'button'; backdrop.setAttribute('aria-label', 'Close navigation menu'); document.body.append(backdrop);
  const close = () => { drawer.classList.remove('open'); backdrop.classList.remove('open'); drawer.setAttribute('aria-hidden', 'true'); button.setAttribute('aria-expanded', 'false'); };
  const open = (focusSearch = false) => { drawer.classList.add('open'); backdrop.classList.add('open'); drawer.setAttribute('aria-hidden', 'false'); button.setAttribute('aria-expanded', 'true'); (focusSearch ? drawer.querySelector('.menu-search input') : drawer.querySelector('.site-menu-head button')).focus(); };
  button.addEventListener('click', () => drawer.classList.contains('open') ? close() : open());
  drawer.querySelector('.site-menu-head button').addEventListener('click', close);
  backdrop.addEventListener('click', close);
  document.addEventListener('keydown', event => { if (event.key === 'Escape') close(); });
  const search = drawer.querySelector('.menu-search input');
  const clearSearch = drawer.querySelector('.menu-search button');
  const links = [...drawer.querySelectorAll('[data-menu-search]')];
  const noResults = drawer.querySelector('.menu-no-results');
  const filterLinks = () => {
    const query = search.value.trim().toLowerCase();
    let matches = 0;
    links.forEach(link => { const visible = !query || `${link.textContent} ${link.dataset.menuSearch}`.toLowerCase().includes(query); link.hidden = !visible; if (visible) matches += 1; });
    clearSearch.hidden = !query; noResults.hidden = matches > 0;
  };
  search.addEventListener('input', filterLinks);
  clearSearch.addEventListener('click', () => { search.value = ''; filterLinks(); search.focus(); });
  const topSearch = topbar.querySelector('.search');
  if (topSearch) {
    topSearch.setAttribute('role', 'button'); topSearch.setAttribute('tabindex', '0'); topSearch.setAttribute('aria-label', 'Search Ogreena services and pages');
    topSearch.addEventListener('click', () => open(true));
    topSearch.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); open(true); } });
  }
}());
