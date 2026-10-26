(function () {
  const items = [
    ['carpet-cleaning','carpet-cleaning','Landing',3000,'fixed',''],
    ['carpet-cleaning','carpet-cleaning','Closet 3x5',5000,'fixed',''],
    ['carpet-cleaning','carpet-cleaning','Hallway 3x8',7500,'fixed',''],
    ['carpet-cleaning','carpet-cleaning','Bedroom 10x10 or 12x12',10000,'fixed',''],
    ['carpet-cleaning','carpet-cleaning','Dining Room 10x10 or 12x12',10000,'fixed',''],
    ['carpet-cleaning','carpet-cleaning','Flight of Stairs',15000,'fixed',''],
    ['carpet-cleaning','carpet-cleaning','Master Bedroom 12x15',15000,'fixed',''],
    ['carpet-cleaning','carpet-cleaning','Living Room 15x18',17500,'fixed',''],
    ['carpet-cleaning','carpet-cleaning','Family Room 15x18',17500,'fixed',''],
    ['carpet-cleaning','carpet-cleaning','Living/Dining Room Combo 15x18',20000,'fixed',''],
    ['carpet-cleaning','carpet-cleaning','Area Rug 4x6',7500,'fixed',''],
    ['carpet-cleaning','carpet-cleaning','Area Rug 5x7',10000,'fixed',''],
    ['carpet-cleaning','carpet-cleaning','Area Rug 8x10',12500,'fixed',''],
    ['carpet-cleaning','carpet-cleaning','Area Rug 10x12',15000,'fixed',''],
    ['carpet-cleaning','carpet-cleaning','Area Rug 12x14',17500,'fixed',''],
    ['housekeeping','house-cleaning','One Team Member Basic Cleaning (2 hrs)',20000,'fixed',''],
    ['housekeeping','house-cleaning','Two Team Members Basic Cleaning (2 hrs)',40000,'fixed',''],
    ['housekeeping','deep-cleaning','Two Team Members Advanced Cleaning (3 hrs)',60000,'fixed',''],
    ['housekeeping','deep-cleaning','Two Team Members Deep Cleaning (4 hrs)',80000,'fixed',''],
    ['housekeeping','house-cleaning','Two Team Members Additional Hour (1 hr)',20000,'fixed',''],
    ['housekeeping','window-cleaning','Window Cleaning 4x3',3000,'per_unit','each'],
    ['mattress-cleaning','mattress-cleaning','Twin Size Bed',15000,'fixed',''],
    ['mattress-cleaning','mattress-cleaning','Full Size Bed',22500,'fixed',''],
    ['mattress-cleaning','mattress-cleaning','Queen Size Bed',27500,'fixed',''],
    ['mattress-cleaning','mattress-cleaning','King Size Bed',30000,'fixed',''],
    ['upholstery-cleaning','upholstery-cleaning','Single Cushion Dining Room Chair',2500,'fixed',''],
    ['upholstery-cleaning','upholstery-cleaning','Double Cushion Dining Room Chair',5000,'fixed',''],
    ['upholstery-cleaning','upholstery-cleaning','Single Seat Sofa',10000,'fixed',''],
    ['upholstery-cleaning','upholstery-cleaning','Ottoman',5000,'fixed',''],
    ['upholstery-cleaning','upholstery-cleaning','Love Seat (2 seats)',15000,'fixed',''],
    ['upholstery-cleaning','upholstery-cleaning','Standard Couch (3 seats)',17500,'fixed',''],
    ['upholstery-cleaning','upholstery-cleaning','Sectional Couch (4 seats)',22500,'fixed',''],
    ['upholstery-cleaning','upholstery-cleaning','Sectional Couch (5 seats)',30000,'fixed',''],
    ['upholstery-cleaning','upholstery-cleaning','Sectional Couch (6 seats)',35000,'fixed',''],
    ['floor-cleaning','tile-grout-cleaning','Tile and Grout',500,'per_unit','per sq. ft.'],
    ['floor-cleaning','floor-polishing','Floor Polishing',500,'per_unit','per sq. ft.']
  ].map((row, index) => ({
    id:`${row[0]}-${row[2].toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')}`,
    category:row[0], service_slug:row[1], name:row[2], description:'', price_cents:row[3], pricing_type:row[4], unit_label:row[5], active:true, display_order:index + 1
  }));

  const categoryNames = {
    'carpet-cleaning':'Carpet Cleaning',
    'housekeeping':'Housekeeping',
    'mattress-cleaning':'Mattress Cleaning',
    'upholstery-cleaning':'Upholstery Cleaning',
    'floor-cleaning':'Floor Cleaning'
  };
  const money = cents => new Intl.NumberFormat('en-US', { style:'currency', currency:'USD', minimumFractionDigits:0 }).format(cents / 100);
  const priceLabel = item => `${money(item.price_cents)}${item.unit_label ? ` ${item.unit_label}` : ''}`;
  const loadPublic = async () => {
    try {
      const response = await fetch('https://mhhjzifeaofgskimvuom.supabase.co/rest/v1/service_price_items?select=id,category,service_slug,name,description,price_cents,pricing_type,unit_label,active,display_order&active=eq.true&order=display_order.asc', {
        headers: { apikey:'sb_publishable_13onHaeoGy3uEVnezcGZCQ_RtSzNOlM' }
      });
      if (!response.ok) return items;
      const published = await response.json();
      return Array.isArray(published) && published.length ? published : items;
    } catch (_error) { return items; }
  };
  window.OgreenaServiceCatalog = { items, categoryNames, money, priceLabel, loadPublic };
})();
