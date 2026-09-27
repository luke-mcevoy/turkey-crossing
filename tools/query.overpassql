[out:json][timeout:90];
(
  way["building"](42.3655,-71.1265,42.3790,-71.1110);
  relation["building"](42.3655,-71.1265,42.3790,-71.1110);
  way["highway"](42.3655,-71.1265,42.3790,-71.1110);
  way["leisure"~"park|garden|pitch"](42.3655,-71.1265,42.3790,-71.1110);
  way["landuse"~"grass|recreation_ground"](42.3655,-71.1265,42.3790,-71.1110);
  way["natural"~"water|wood"](42.3655,-71.1265,42.3790,-71.1110);
  relation["natural"="water"](42.3655,-71.1265,42.3790,-71.1110);
  way["waterway"="riverbank"](42.3655,-71.1265,42.3790,-71.1110);
  node["name"](42.3655,-71.1265,42.3790,-71.1110);
  node["historic"](42.3655,-71.1265,42.3790,-71.1110);
  node["tourism"](42.3655,-71.1265,42.3790,-71.1110);
);
out body;
>;
out skel qt;
