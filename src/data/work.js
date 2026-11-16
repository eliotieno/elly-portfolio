// The case studies, in display order. `slug` is the page under /work/.
export const work = [
  {
    slug: 'nursery-placement',
    title: 'Nursery placement model',
    text: '264 nursery sites that put all 18,055 mapped farms within a 30-minute walk, with terrain counted.',
    meta: 'Python, GeoPandas, SRTM elevation',
  },
  {
    slug: 'polygon-qa',
    title: 'Polygon QA pipeline and desktop app',
    text: 'A rule engine and a Windows app that sort farm polygons into fix queues before a carbon audit sees them.',
    meta: 'Python, Shapely, desktop app',
  },
  {
    slug: 'program-kpi',
    title: 'Program KPI model in Power BI',
    text: 'One Power BI model, read straight from Salesforce, that took over from two hand-refreshed Excel workbooks: 32 tables, 345 measures.',
    meta: 'Power BI, Power Query, DAX',
  },
  {
    slug: 'nursery-stock',
    title: 'Nursery stock dashboard in Power BI',
    text: 'A weekly nursery log turned into a dashboard that shows which counts are fresh, which were copied forward and which are missing.',
    meta: 'Power BI, Power Query, Python',
  },
  {
    slug: 'retail-analytics',
    title: 'Retail analytics dashboard',
    text: 'Six report pages on public sample data. Every number is defined once, as a named measure.',
    meta: 'Power BI',
  },
  {
    slug: 'polygon-lifecycle',
    title: 'Polygon lifecycle governance',
    text: 'One SOP from field capture to overwrite, and an approval loop for 829 polygons that needed retaking.',
    meta: 'SOP, ArcGIS Pro, TaroWorks',
  },
  {
    slug: 'nest-coverage',
    title: 'NEST coverage, Kenya against Uganda',
    text: 'Kenya logged 7.2% coverage and Uganda 48.2% over similar windows. The analysis traced the gap to collection and reporting habits.',
    meta: 'Analysis, Kenya and Uganda',
  },
];

// Shorter entries for the work index. No page of their own yet.
export const more = [
  {
    title: 'VM0047 deforestation compliance pipeline',
    where: 'Trees for the Future',
    text: 'A Python and Google Earth Engine pipeline that runs a ten-year retrospective deforestation check on project polygons and writes the VM0047 compliance report. It is in production use for the Uganda and Kenya projects.',
  },
  {
    title: 'TaroWorks to GIS converter',
    where: 'Trees for the Future',
    text: 'Field staff capture farm boundaries in TaroWorks, which exports them as GeoJSON text inside a CSV. This tool turns that export into GeoJSON, Shapefile and KML files ready for office review and for sending back to the field.',
  },
  {
    title: 'Boundary distance calculator',
    where: 'Trees for the Future',
    text: 'A Jupyter notebook using GeoPandas and Shapely. It loads the farm polygons, matches each monitoring point to its farm by ID, measures the distance to the boundary and exports the results to Excel, so the check no longer needs someone to inspect each point in GIS.',
  },
  {
    title: 'Land cover change detection',
    where: 'Trees for the Future',
    text: 'Change detection with Sentinel-2, Landsat and Google Earth Engine: NDVI maps, deforestation alerts and land cover classes. The 2024 land cover maps reached 85 percent classification accuracy, checked against Kenya Forest Service ground-truth data.',
  },
  {
    title: 'Three role-specific Power BI dashboards',
    where: 'Trees for the Future',
    text: 'Dashboards for targeting, verification readiness and programme coverage, used by more than 200 people a month. Reporting turnaround went from about three days to three hours.',
  },
  {
    title: 'Inactive and deceased farmer workflow',
    where: 'Trees for the Future',
    text: 'A written procedure for the most sensitive status changes in the farmer registry: what is recorded in TaroWorks, which field visit is required, how a successor is handled and when the farm polygon has to be retaken.',
  },
  {
    title: 'Nursery data standard',
    where: 'Trees for the Future',
    text: 'Rules for recording community tree nursery data: seed quantities in place of "bags", batches separated by date, defined nursery stages, survival-rate tracking and a reconciliation check from seeds received to live plants.',
  },
  {
    title: 'Informal settlement drone mapping',
    where: 'Oakar Services',
    text: 'Planned and flew drone missions over informal settlements for the Kenya Informal Settlements Improvement Project, then processed the imagery into orthomosaics and 3D models in Pix4D and Agisoft Metashape.',
  },
  {
    title: 'Farmer mapping for NARIGP',
    where: 'Oakar Services',
    text: 'Field data collection and spatial mapping for more than 20,000 farmers, feeding a national digital platform designed for one million.',
  },
  {
    title: 'Mosquito distribution and the physical environment',
    where: 'Technical University of Kenya, 2019',
    text: 'Final year project in Kisumu East. Landsat 8 land cover, land surface temperature and rainfall were compared with mosquito counts collected on the ground, and the output was a hotspot surface for targeting vector control.',
  },
];
