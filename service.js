const common = {
  address: '5600 Martin Luther King Jr Way, Suite 102, Oakland, CA 94609',
  phone: '(510) 472-9327',
  hours: 'Published hours: 9:00 AM–5:00 PM. Call to confirm day-specific availability.',
  areas: ['Oakland', 'Berkeley', 'Alameda', 'Emeryville', 'San Leandro', 'Richmond', 'Hayward', 'San Francisco', 'Surrounding Bay Area communities']
};

const serviceData = {
  'carpet-cleaning': {
    name: 'Carpet Cleaning', icon: '◫', availability: 'Residential and commercial',
    description: 'Carpet care for homes, apartments, offices and managed properties, organized around the condition of the rooms and the customer’s priorities.',
    handles: ['Room-by-room carpet cleaning', 'Spot and stain treatment', 'High-traffic-area care', 'Residential and commercial carpet care', 'Upholstery cleaning when requested as a related service'],
    jobs: ['Homes and apartments', 'Rental and unit turnovers', 'Offices and commercial spaces', 'Individual spots or broader carpet-care projects']
  },
  'house-cleaning': {
    name: 'House Cleaning', icon: '⌂', availability: 'Residential',
    description: 'Housekeeping and home cleaning tailored to the size, condition and priorities of the household, with a clear scope agreed before service.',
    handles: ['Kitchen and bathroom cleaning', 'Bedrooms and living areas', 'Routine or one-time housekeeping', 'Surface and high-touch-area cleaning', 'Window, upholstery or carpet care as separately scoped services'],
    jobs: ['Apartments and single-family homes', 'One-time home cleaning', 'Recurring housekeeping requests', 'Landlord or resident-requested cleaning']
  },
  'deep-cleaning': {
    name: 'Deep Cleaning', icon: '✦', availability: 'Primarily residential; commercial by review',
    description: 'A more detailed cleaning for spaces that need extra attention beyond a routine visit, based on a room-by-room walkthrough or agreed checklist.',
    handles: ['Detailed kitchen and bathroom care', 'Built-up soil and high-touch surfaces', 'Room-by-room cleaning checklists', 'Detail work around accessible fixtures and surfaces', 'Coordination with carpet, upholstery or tile and grout cleaning'],
    jobs: ['Seasonal or one-time resets', 'Homes needing extra attention', 'Pre-event and post-event cleaning', 'Selected small commercial spaces after review']
  },
  'move-in-move-out-cleaning': {
    name: 'Move-In / Move-Out Cleaning', icon: '↗', availability: 'Residential and managed properties',
    description: 'Move-ready cleaning for renters, homeowners, landlords and property managers preparing a residence for occupancy or turnover.',
    handles: ['Vacant-unit and turnover cleaning', 'Kitchen, bathroom and living-area cleaning', 'Accessible interior surfaces and floors', 'Carpet, window or tile cleaning when included in the estimate', 'Free walkthrough and written scope when appropriate'],
    jobs: ['Apartment turnovers', 'Move-in preparation', 'Move-out cleaning', 'Landlord and property-manager requests']
  },
  'electrical-services': {
    name: 'Electrical Services', icon: 'ϟ', availability: 'Residential, rental and commercial property work',
    description: 'The official site advertises electrical maintenance and installation support for homes, rentals and commercial properties. Exact scope and required contractor qualifications are confirmed before work is accepted.',
    handles: ['Outlet, switch and lighting repair or replacement', 'Light fixtures and ceiling fans', 'Circuit-breaker and panel troubleshooting', 'Interior and exterior lighting, including LED upgrades', 'Safety inspections and code-compliance review', 'Unit-turnover electrical work and maintenance plans'],
    jobs: ['Home electrical service requests', 'Rental-unit turnover work', 'Commercial-property maintenance', 'Lighting and troubleshooting visits'],
    notice: 'Regulated electrical work must be performed by an appropriately licensed contractor. This demo does not claim that Ogreena itself holds a California C-10 license.'
  },
  'commercial-cleaning': {
    name: 'Commercial Cleaning', icon: '▦', availability: 'Commercial',
    description: 'Cleaning support for offices, retail spaces, managed properties and facilities, with the service frequency and task list defined for each property.',
    handles: ['Construction cleanup and property turnovers', 'Carpet, floor and window cleaning', 'Common-area and shared-space cleaning', 'Graffiti removal and pressure washing where appropriate', 'Coordination with recurring janitorial or porter service'],
    jobs: ['Offices and retail properties', 'Apartment and multi-unit common areas', 'Managed-property turnovers', 'One-time and recurring facility cleaning']
  },
  'janitorial-services': {
    name: 'Janitorial Services', icon: '✓', availability: 'Commercial and multi-unit properties',
    description: 'Scheduled janitorial and porter support aligned with the operating needs, traffic patterns and agreed cleaning checklist of each facility.',
    handles: ['Routine cleaning schedules', 'Restroom and shared-area care', 'Common-area presentation', 'Porter support', 'Task and supply coordination based on an approved scope'],
    jobs: ['Offices and workplaces', 'Apartment common areas', 'Retail and customer-facing spaces', 'Recurring facility service']
  },
  'facilities-maintenance': {
    name: 'Facilities Maintenance', icon: '⚙', availability: 'Residential, commercial and managed properties',
    description: 'Coordinated property upkeep and appropriate light maintenance intended to help homes and facilities remain safe, functional and presentable.',
    handles: ['General repairs and drywall patching', 'Carpentry, doors, windows, trim and shelving', 'Gutter clearing and seasonal upkeep', 'Pressure washing and exterior presentation', 'Coordination of minor plumbing or electrical needs within verified qualifications'],
    jobs: ['Apartment and rental-property upkeep', 'Office and retail maintenance', 'Home repair lists', 'Preventive and seasonal property tasks'],
    notice: 'Trade-specific or regulated work is accepted only when the required qualifications and licensing are confirmed.'
  },
  'tile-grout-cleaning': {
    name: 'Tile & Grout Cleaning', icon: '▤', availability: 'Residential and commercial',
    description: 'Detail-focused cleaning for tiled floors and grout lines in kitchens, bathrooms and other high-use areas.',
    handles: ['Tile-surface cleaning', 'Grout-line care', 'Kitchen and bathroom areas', 'High-use floor areas', 'Coordination with broader floor or deep-cleaning requests'],
    jobs: ['Homes and apartments', 'Rental-unit turnovers', 'Commercial tiled areas', 'Targeted kitchen and bathroom projects']
  },
  'upholstery-cleaning': {
    name: 'Upholstery Cleaning', icon: '▰', availability: 'Residential and commercial',
    description: 'Cleaning care for upholstered furniture in homes, offices and shared spaces, based on fabric condition and the requested scope.',
    handles: ['Sofas, chairs and upholstered seating', 'Spot and stain attention', 'Fabric and condition assessment before service', 'Residential furniture care', 'Office and common-area seating'],
    jobs: ['Household furniture', 'Rental or move-related cleaning', 'Office seating', 'Shared-space upholstery']
  },
  'window-cleaning': {
    name: 'Window Cleaning', icon: '▣', availability: 'Residential and commercial',
    description: 'Interior and exterior window care where access and site conditions allow, available alone or as part of a broader cleaning scope.',
    handles: ['Interior glass cleaning', 'Exterior glass cleaning where safely accessible', 'Reachable frames and sills', 'Window care within move-in, move-out or deep cleaning', 'Home and business requests'],
    jobs: ['Homes and apartments', 'Rental turnovers', 'Storefronts and offices', 'Targeted or whole-property requests after review']
  },
  'pressure-washing': {
    name: 'Pressure Washing', icon: '≈', availability: 'Residential and commercial',
    description: 'Exterior surface cleaning for property entries, walkways and suitable hard surfaces after the material, access and drainage needs are reviewed.',
    handles: ['Walkways and entry areas', 'Suitable hardscape and exterior surfaces', 'Property-presentation cleaning', 'Seasonal exterior upkeep', 'Coordination with graffiti removal or facility maintenance'],
    jobs: ['Residential exteriors', 'Apartment and commercial entries', 'Walkways and common areas', 'Managed-property maintenance']
  }
};

const item = serviceData[document.body.dataset.service];
const directionsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(common.address)}`;
const siteRoot = location.hostname.endsWith('.github.io') ? '/ogreena-preview/' : '/';

if (item) {
  const cover = document.querySelector('.service-profile .cover');
  cover.style.backgroundImage = `url('${siteRoot}assets/service-covers/${document.body.dataset.service}.jpg')`;
  cover.setAttribute('role', 'img');
  cover.setAttribute('aria-label', `${item.name} demonstration cover image`);
  document.querySelector('#serviceTitle').textContent = item.name;
  document.querySelector('#serviceDesc').textContent = item.description;
  window.OgreenaServiceIcons.renderInto(document.querySelector('#serviceIcon'), { slug:document.body.dataset.service, name:item.name, icon:item.icon });
  document.querySelectorAll('[data-request]').forEach(link => { link.removeAttribute('href'); link.setAttribute('aria-disabled', 'true'); link.classList.add('disabled-action'); link.textContent = 'Online unavailable'; });

  document.querySelector('#overview').innerHTML = `
    <article class="card profile-accent">
      <div class="card-title"><h2>About ${item.name}</h2><span class="tag">${item.availability}</span></div>
      <p>${item.description}</p>
    </article>
    <article class="card">
      <div class="card-title"><h2>What We Handle</h2><span class="tag">Service capabilities</span></div>
      <ul class="bullet-list">${item.handles.map(value => `<li>${value}</li>`).join('')}</ul>
      ${item.notice ? `<div class="safety-box">${item.notice}</div>` : ''}
    </article>
    <article class="card">
      <div class="card-title"><h2>Types of jobs covered</h2><span class="tag">${item.availability}</span></div>
      <div class="job-grid">${item.jobs.map(value => `<div class="job-chip">${value}</div>`).join('')}</div>
    </article>
    <article class="card action-card">
      <div><h2>Ready to discuss the work?</h2><p class="muted">This public website does not accept requests, bookings, payments, or uploads.</p></div>
      <div class="form-actions"><span class="small-btn disabled-action" aria-disabled="true">Online requests disabled</span></div>
    </article>`;

  document.querySelector('#coveragePanel').innerHTML = `
    <article class="card"><div class="card-title"><h2>Service areas</h2><span class="tag">Confirm availability</span></div>
      <div class="coverage">${common.areas.map(area => `<span>${area}</span>`).join('')}</div>
      <p class="muted">Availability depends on the service, schedule and travel requirements.</p>
    </article>
    <article class="card"><h2>Availability</h2><p><b>${item.availability}</b></p><p>${common.hours}</p></article>`;

  document.querySelector('#pricingPanel').innerHTML = `
    <article class="card"><h2>Pricing and estimates</h2><div class="notice">No unverified prices are published. Ogreena can review the requested work and provide a written estimate.</div>
      <p><span class="small-btn disabled-action" aria-disabled="true">Online estimates disabled</span></p>
    </article>`;

  document.querySelector('#contactPanel').innerHTML = `
    <article class="card"><div class="card-title"><h2>Contact Ogreena</h2><span class="tag">${item.name}</span></div>
      <div class="contact-grid">
        <a class="contact-option" href="tel:+15104729327"><b>Call Ogreena</b><span>${common.phone}</span></a>
        <a class="contact-option" href="${directionsUrl}" target="_blank" rel="noopener"><b>Get Directions</b><span>Open map directions</span></a>
      </div>
      <div class="address-block"><b>Ogreena</b><br>${common.address}<br>${common.hours}</div>
    </article>`;

  const sidebar = document.querySelector('.service-layout aside .info-list');
  sidebar.innerHTML = `
    <div class="info-row"><i>☎</i><div><b>Direct call</b><a href="tel:+15104729327">${common.phone}</a></div></div>
    <div class="info-row"><i>⌖</i><div><b>Business address</b><a href="${directionsUrl}" target="_blank" rel="noopener">${common.address}</a></div></div>
    <div class="info-row"><i>◷</i><div><b>Published hours</b><span>9:00 AM–5:00 PM; call to confirm the day</span></div></div>
    <div class="info-row"><i>⌂</i><div><b>Availability</b><span>${item.availability}</span></div></div>`;
}

document.querySelectorAll('.service-tab').forEach(button => button.addEventListener('click', () => {
  document.querySelectorAll('.service-tab').forEach(tab => tab.classList.remove('active'));
  button.classList.add('active');
  document.querySelectorAll('.service-panel').forEach(panel => { panel.hidden = true; });
  document.querySelector(`#${button.dataset.panel}`).hidden = false;
}));
