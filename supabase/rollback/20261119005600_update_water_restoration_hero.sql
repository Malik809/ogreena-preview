-- Restore the previously published Water Restoration media reference.
update public.service_profile_media
set current_path='assets/service-covers/pressure-washing.jpg'
where service_slug='water-restoration';
