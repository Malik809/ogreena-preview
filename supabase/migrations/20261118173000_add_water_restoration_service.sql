-- Publish Water Restoration as an estimate-only Ogreena service category.
-- No fixed price, emergency-response promise or specialized remediation claim is created.

insert into public.services (id,name,summary,description,display_order,visible)
values (
  'water-restoration',
  'Water Restoration',
  'Water extraction, drying and water-damage cleanup',
  'Water extraction, structural drying, moisture inspection, water-damage cleanup and restoration estimates for Bay Area properties, limited to the scope confirmed after assessment.',
  15,
  true
)
on conflict(id) do update set
  name=excluded.name,
  summary=excluded.summary,
  description=excluded.description,
  visible=true;

update public.services set display_order=16 where id='landscaping' and display_order<=15;
update public.services set display_order=17 where id='hauling' and display_order<=16;

insert into public.service_profile_media(service_slug,current_path)
values('water-restoration','assets/service-covers/pressure-washing.jpg')
on conflict(service_slug) do nothing;
