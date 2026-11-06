update public.services
set name = 'Hauling & Junk Removal',
    summary = 'Professional hauling, junk removal, furniture removal, and property cleanout services throughout the Bay Area.',
    description = 'Professional hauling, junk removal, furniture removal, and property cleanout services throughout the Bay Area.'
where id = 'hauling';

update public.service_profile_media
set previous_path = current_path,
    current_path = 'assets/service-covers/hauling.jpg',
    draft_path = null,
    position_x = 50,
    position_y = 50,
    updated_at = now()
where service_slug = 'hauling';
