#!/usr/bin/env python3
"""Convert raw OpenStreetMap Overpass JSON into the compact map the game loads.

Usage:
  curl -X POST --data-urlencode "data@query.overpassql" \
       https://maps.mail.ru/osm/tools/overpass/api/interpreter -o osm_raw.json
  python3 build_map.py            # writes ../data/harvard.json

Coordinates are metres in a local frame centred on Harvard Square:
x = east, z = south (Three.js convention, so north is -z).
Map data (c) OpenStreetMap contributors, ODbL.
"""
import json
import math
import os

HERE = os.path.dirname(os.path.abspath(__file__))
LAT0, LON0 = 42.373350, -71.118956   # Harvard Square (the T kiosk)
KX = math.cos(math.radians(LAT0)) * 111320.0
KY = 110540.0
HALF = 700  # keep things within this many metres of the centre

ROAD_WIDTH = {
    'motorway': 13, 'trunk': 13, 'primary': 13, 'secondary': 11, 'tertiary': 9,
    'motorway_link': 8, 'primary_link': 8, 'secondary_link': 8, 'trunk_link': 8,
    'residential': 8, 'unclassified': 8, 'living_street': 6, 'busway': 7, 'service': 5,
}
PATH_WIDTH = {'footway': 2.4, 'pedestrian': 6, 'path': 2, 'cycleway': 2.2, 'steps': 2.4}
DRIVABLE = {'motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'residential', 'unclassified',
            'primary_link', 'secondary_link', 'busway'}


def proj(lat, lon):
    return (round((lon - LON0) * KX, 1), round(-(lat - LAT0) * KY, 1))


def inside(p):
    return abs(p[0]) < HALF and abs(p[1]) < HALF


def main():
    raw = json.load(open(os.path.join(HERE, 'osm_raw.json')))['elements']
    nodes = {e['id']: proj(e['lat'], e['lon']) for e in raw if e['type'] == 'node' and 'lat' in e}
    ways = {e['id']: e for e in raw if e['type'] == 'way'}

    def way_pts(w):
        return [nodes[n] for n in w['nodes'] if n in nodes]

    def rings_from_relation(rel):
        """Join a multipolygon's outer member ways into closed rings."""
        segs = [way_pts(ways[m['ref']]) for m in rel.get('members', [])
                if m['type'] == 'way' and m.get('role', 'outer') in ('outer', '') and m['ref'] in ways]
        segs = [s for s in segs if len(s) > 1]
        rings = []
        while segs:
            ring = segs.pop(0)
            changed = True
            while ring[0] != ring[-1] and changed:
                changed = False
                for i, s in enumerate(segs):
                    if s[0] == ring[-1]: ring += s[1:]
                    elif s[-1] == ring[-1]: ring += s[::-1][1:]
                    elif s[-1] == ring[0]: ring = s + ring[1:]
                    elif s[0] == ring[0]: ring = s[::-1] + ring[1:]
                    else: continue
                    segs.pop(i); changed = True; break
            if len(ring) > 3: rings.append(ring)
        return rings

    def height_of(t):
        try:
            if 'height' in t: return float(str(t['height']).split()[0].replace('m', ''))
        except ValueError: pass
        try:
            if 'building:levels' in t: return float(t['building:levels']) * 3.5 + 1.5
        except ValueError: pass
        b = t.get('building')
        if b in ('house', 'detached', 'residential', 'garage', 'shed'): return 9.0
        if b in ('church', 'cathedral', 'chapel'): return 14.0
        return 13.0

    out = {'origin': [LAT0, LON0], 'buildings': [], 'roads': [], 'paths': [], 'green': [], 'water': [], 'pois': []}

    for e in raw:
        t = e.get('tags', {})
        if e['type'] == 'node' or not t: continue
        if e['type'] == 'way': polys = [way_pts(e)]
        else: polys = rings_from_relation(e)
        for pts in polys:
            if len(pts) < 2 or not any(inside(p) for p in pts): continue
            closed = len(pts) > 3 and pts[0] == pts[-1]
            if t.get('building') and closed:
                b = {'p': pts[:-1], 'h': round(height_of(t), 1)}
                if t.get('name'): b['n'] = t['name']
                if t.get('building') in ('church', 'chapel', 'cathedral') or t.get('amenity') == 'place_of_worship':
                    b['k'] = 'church'
                elif t.get('building') in ('house', 'detached', 'residential'):
                    b['k'] = 'house'
                elif t.get('building') in ('university', 'college', 'school') or 'Harvard' in t.get('operator', ''):
                    b['k'] = 'uni'
                if t.get('building:colour'): b['c'] = t['building:colour']
                out['buildings'].append(b)
            elif t.get('highway') in ROAD_WIDTH:
                r = {'p': pts, 'w': ROAD_WIDTH[t['highway']], 't': t['highway']}
                if t.get('name'): r['n'] = t['name']
                if t['highway'] in DRIVABLE and t.get('access') not in ('no', 'private'):
                    r['d'] = 1
                    r['o'] = 1 if t.get('oneway') == 'yes' else 0
                out['roads'].append(r)
            elif t.get('highway') in PATH_WIDTH and t.get('area') != 'yes':
                out['paths'].append({'p': pts, 'w': PATH_WIDTH[t['highway']]})
            elif t.get('highway') == 'pedestrian' and closed:
                out['paths'].append({'p': pts, 'w': 6})
            elif closed and (t.get('natural') == 'water' or t.get('waterway') == 'riverbank'):
                out['water'].append({'p': pts[:-1]})
            elif closed and (t.get('leisure') in ('park', 'garden', 'pitch') or t.get('landuse') in ('grass', 'recreation_ground')
                             or t.get('natural') == 'wood'):
                g = {'p': pts[:-1]}
                if t.get('name'): g['n'] = t['name']
                out['green'].append(g)

    seen = set()
    for e in raw:
        if e['type'] != 'node' or 'lat' not in e: continue
        t = e.get('tags', {})
        name = t.get('name')
        if not name: continue
        kind = (t.get('historic') or t.get('tourism') or t.get('amenity') or t.get('shop')
                or t.get('leisure') or t.get('railway') or t.get('public_transport'))
        if not kind or kind in ('bench', 'waste_basket', 'bicycle_parking', 'parking_entrance'): continue
        p = nodes[e['id']]
        if not inside(p) or (name, kind) in seen: continue
        seen.add((name, kind))
        out['pois'].append({'x': p[0], 'z': p[1], 'n': name, 'k': kind})

    path = os.path.join(HERE, '..', 'data', 'harvard.json')
    os.makedirs(os.path.dirname(path), exist_ok=True)
    json.dump(out, open(path, 'w'), separators=(',', ':'))
    print({k: len(v) for k, v in out.items() if isinstance(v, list)}, f'{os.path.getsize(path) / 1024:.0f} KB')


if __name__ == '__main__':
    main()
