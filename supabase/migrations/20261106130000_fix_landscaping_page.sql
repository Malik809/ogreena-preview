update public.services
set description = 'Professional landscaping, lawn care, yard maintenance, and property groundskeeping services throughout the Bay Area.'
where id = 'landscaping';

update public.service_profile_media
set previous_path = current_path,
    current_path = 'assets/service-covers/landscaping.jpg',
    draft_path = null,
    position_x = 50,
    position_y = 50,
    updated_at = now()
where service_slug = 'landscaping';
