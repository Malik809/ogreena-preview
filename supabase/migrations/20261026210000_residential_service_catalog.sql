-- Owner-managed residential service pricing. Selecting a catalog item creates
-- only a service request; estimates and payable invoices remain owner-approved.

create table if not exists public.service_price_items (
  id text primary key check (id ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  category text not null check (category in ('carpet-cleaning','housekeeping','mattress-cleaning','upholstery-cleaning','floor-cleaning')),
  service_slug text not null check (service_slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  name text not null check (char_length(trim(name)) between 2 and 150),
  price_cents integer not null check (price_cents >= 0),
  pricing_type text not null default 'fixed' check (pricing_type in ('fixed','per_unit')),
  unit_label text not null default '',
  active boolean not null default true,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.service_price_items enable row level security;
revoke all on table public.service_price_items from anon, authenticated;
grant select on table public.service_price_items to anon, authenticated;
grant insert, update, delete on table public.service_price_items to authenticated;

create policy service_price_items_public_read_active
on public.service_price_items for select to anon, authenticated
using (active);

create policy service_price_items_owner_read_all
on public.service_price_items for select to authenticated
using ((select public.is_ogreena_owner()));

create policy service_price_items_owner_insert
on public.service_price_items for insert to authenticated
with check ((select public.is_ogreena_owner()));

create policy service_price_items_owner_update
on public.service_price_items for update to authenticated
using ((select public.is_ogreena_owner()))
with check ((select public.is_ogreena_owner()));

create policy service_price_items_owner_delete
on public.service_price_items for delete to authenticated
using ((select public.is_ogreena_owner()));

alter table public.service_requests
  add column if not exists service_price_item_id text references public.service_price_items(id) on delete set null,
  add column if not exists requested_quantity numeric(10,2) check (requested_quantity is null or requested_quantity > 0),
  add column if not exists approved_quantity numeric(10,2) check (approved_quantity is null or approved_quantity > 0);

insert into public.service_price_items (id,category,service_slug,name,price_cents,pricing_type,unit_label,display_order)
values
('carpet-cleaning-landing','carpet-cleaning','carpet-cleaning','Landing',3000,'fixed','',1),
('carpet-cleaning-closet-3x5','carpet-cleaning','carpet-cleaning','Closet 3x5',5000,'fixed','',2),
('carpet-cleaning-hallway-3x8','carpet-cleaning','carpet-cleaning','Hallway 3x8',7500,'fixed','',3),
('carpet-cleaning-bedroom-10x10-or-12x12','carpet-cleaning','carpet-cleaning','Bedroom 10x10 or 12x12',10000,'fixed','',4),
('carpet-cleaning-dining-room-10x10-or-12x12','carpet-cleaning','carpet-cleaning','Dining Room 10x10 or 12x12',10000,'fixed','',5),
('carpet-cleaning-flight-of-stairs','carpet-cleaning','carpet-cleaning','Flight of Stairs',15000,'fixed','',6),
('carpet-cleaning-master-bedroom-12x15','carpet-cleaning','carpet-cleaning','Master Bedroom 12x15',15000,'fixed','',7),
('carpet-cleaning-living-room-15x18','carpet-cleaning','carpet-cleaning','Living Room 15x18',17500,'fixed','',8),
('carpet-cleaning-family-room-15x18','carpet-cleaning','carpet-cleaning','Family Room 15x18',17500,'fixed','',9),
('carpet-cleaning-living-dining-room-combo-15x18','carpet-cleaning','carpet-cleaning','Living/Dining Room Combo 15x18',20000,'fixed','',10),
('carpet-cleaning-area-rug-4x6','carpet-cleaning','carpet-cleaning','Area Rug 4x6',7500,'fixed','',11),
('carpet-cleaning-area-rug-5x7','carpet-cleaning','carpet-cleaning','Area Rug 5x7',10000,'fixed','',12),
('carpet-cleaning-area-rug-8x10','carpet-cleaning','carpet-cleaning','Area Rug 8x10',12500,'fixed','',13),
('carpet-cleaning-area-rug-10x12','carpet-cleaning','carpet-cleaning','Area Rug 10x12',15000,'fixed','',14),
('carpet-cleaning-area-rug-12x14','carpet-cleaning','carpet-cleaning','Area Rug 12x14',17500,'fixed','',15),
('housekeeping-one-team-member-basic-cleaning-2-hrs','housekeeping','house-cleaning','One Team Member Basic Cleaning (2 hrs)',20000,'fixed','',16),
('housekeeping-two-team-members-basic-cleaning-2-hrs','housekeeping','house-cleaning','Two Team Members Basic Cleaning (2 hrs)',40000,'fixed','',17),
('housekeeping-two-team-members-advanced-cleaning-3-hrs','housekeeping','deep-cleaning','Two Team Members Advanced Cleaning (3 hrs)',60000,'fixed','',18),
('housekeeping-two-team-members-deep-cleaning-4-hrs','housekeeping','deep-cleaning','Two Team Members Deep Cleaning (4 hrs)',80000,'fixed','',19),
('housekeeping-two-team-members-additional-hour-1-hr','housekeeping','house-cleaning','Two Team Members Additional Hour (1 hr)',20000,'fixed','',20),
('housekeeping-window-cleaning-4x3','housekeeping','window-cleaning','Window Cleaning 4x3',3000,'per_unit','each',21),
('mattress-cleaning-twin-size-bed','mattress-cleaning','mattress-cleaning','Twin Size Bed',15000,'fixed','',22),
('mattress-cleaning-full-size-bed','mattress-cleaning','mattress-cleaning','Full Size Bed',22500,'fixed','',23),
('mattress-cleaning-queen-size-bed','mattress-cleaning','mattress-cleaning','Queen Size Bed',27500,'fixed','',24),
('mattress-cleaning-king-size-bed','mattress-cleaning','mattress-cleaning','King Size Bed',30000,'fixed','',25),
('upholstery-cleaning-single-cushion-dining-room-chair','upholstery-cleaning','upholstery-cleaning','Single Cushion Dining Room Chair',2500,'fixed','',26),
('upholstery-cleaning-double-cushion-dining-room-chair','upholstery-cleaning','upholstery-cleaning','Double Cushion Dining Room Chair',5000,'fixed','',27),
('upholstery-cleaning-single-seat-sofa','upholstery-cleaning','upholstery-cleaning','Single Seat Sofa',10000,'fixed','',28),
('upholstery-cleaning-ottoman','upholstery-cleaning','upholstery-cleaning','Ottoman',5000,'fixed','',29),
('upholstery-cleaning-love-seat-2-seats','upholstery-cleaning','upholstery-cleaning','Love Seat (2 seats)',15000,'fixed','',30),
('upholstery-cleaning-standard-couch-3-seats','upholstery-cleaning','upholstery-cleaning','Standard Couch (3 seats)',17500,'fixed','',31),
('upholstery-cleaning-sectional-couch-4-seats','upholstery-cleaning','upholstery-cleaning','Sectional Couch (4 seats)',22500,'fixed','',32),
('upholstery-cleaning-sectional-couch-5-seats','upholstery-cleaning','upholstery-cleaning','Sectional Couch (5 seats)',30000,'fixed','',33),
('upholstery-cleaning-sectional-couch-6-seats','upholstery-cleaning','upholstery-cleaning','Sectional Couch (6 seats)',35000,'fixed','',34),
('floor-cleaning-tile-and-grout','floor-cleaning','tile-grout-cleaning','Tile and Grout',500,'per_unit','per sq. ft.',35),
('floor-cleaning-floor-polishing','floor-cleaning','floor-polishing','Floor Polishing',500,'per_unit','per sq. ft.',36)
on conflict (id) do update set
  category=excluded.category, service_slug=excluded.service_slug, name=excluded.name,
  price_cents=excluded.price_cents, pricing_type=excluded.pricing_type,
  unit_label=excluded.unit_label, display_order=excluded.display_order, updated_at=now();

create index if not exists service_price_items_public_order
  on public.service_price_items (active, category, display_order);
