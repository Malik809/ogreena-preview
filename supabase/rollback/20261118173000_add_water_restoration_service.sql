-- Roll back the Water Restoration catalog publication without touching customer data.
delete from public.service_profile_media where service_slug='water-restoration';
delete from public.services where id='water-restoration';

update public.services set display_order=15 where id='landscaping' and display_order=16;
update public.services set display_order=16 where id='hauling' and display_order=17;
