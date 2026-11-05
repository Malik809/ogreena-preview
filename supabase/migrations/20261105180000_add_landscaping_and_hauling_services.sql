-- Add owner-managed Landscaping and Hauling profiles without changing existing services.

insert into public.services (id, name, summary, description, display_order, visible)
values
  ('landscaping', 'Landscaping', 'Lawn care, yard cleanup and grounds maintenance', 'Lawn care, yard cleanup, landscaping and property grounds maintenance for Bay Area homes, rental properties and businesses.', 15, true),
  ('hauling', 'Hauling', 'Junk removal, debris hauling and property cleanouts', 'Junk removal, debris hauling, property cleanouts and unwanted-item removal for Bay Area homes, rentals and commercial properties.', 16, true)
on conflict (id) do update set
  name = excluded.name,
  summary = excluded.summary,
  description = excluded.description,
  visible = true;

insert into public.service_profile_media (service_slug, current_path)
values
  ('landscaping', 'assets/service-covers/facilities-maintenance.jpg'),
  ('hauling', 'assets/service-covers/pressure-washing.jpg')
on conflict (service_slug) do nothing;
