"""Convert the Sukabumi Overpass snapshot to the Warkost Leaflet basemap."""

import json
from math import hypot
from pathlib import Path
import sys

BBOX = [106.815, -7.035, 107.047, -6.808]
MAIN_ROADS = {"trunk", "primary", "secondary", "tertiary",
              "primary_link", "secondary_link", "tertiary_link"}
PLACES = {"city", "town", "suburb", "village"}


def position(point):
    return [round(point["lon"], 5), round(point["lat"], 5)]


def segment_distance(point, start, end):
    dx = end[0] - start[0]
    dy = end[1] - start[1]
    length = dx * dx + dy * dy
    if length == 0:
        return hypot(point[0] - start[0], point[1] - start[1])
    offset = ((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) / length
    offset = max(0, min(1, offset))
    return hypot(point[0] - start[0] - offset * dx,
                 point[1] - start[1] - offset * dy)


def simplify(coordinates):
    # Keep each way's endpoints. Tolerance is about four metres at Sukabumi.
    kept = {0, len(coordinates) - 1}
    pending = [(0, len(coordinates) - 1)]
    while pending:
        start, end = pending.pop()
        farthest, distance = None, 0.000036
        for index in range(start + 1, end):
            deviation = segment_distance(coordinates[index],
                                         coordinates[start], coordinates[end])
            if deviation > distance:
                farthest, distance = index, deviation
        if farthest is not None:
            kept.add(farthest)
            pending.extend([(start, farthest), (farthest, end)])
    return [coordinates[index] for index in sorted(kept)]


def feature(kind, geometry_type, coordinates, **properties):
    return {
        "type": "Feature",
        "properties": {"kind": kind, **properties},
        "geometry": {"type": geometry_type, "coordinates": coordinates},
    }


def convert(snapshot):
    lines = {"water": [], "road": [], "main": []}
    labels = []
    for element in snapshot["elements"]:
        tags = element["tags"]
        if element["type"] == "node" and tags.get("place") in PLACES:
            labels.append(feature("place", "Point", position(element),
                                  name=tags["name"]))
        elif element["type"] == "way":
            if tags.get("waterway") == "river":
                kind = "water"
            else:
                kind = "main" if tags.get("highway") in MAIN_ROADS else "road"
            coordinates = []
            for point in element["geometry"]:
                vertex = position(point)
                if not coordinates or coordinates[-1] != vertex:
                    coordinates.append(vertex)
            if len(coordinates) >= 2:
                lines[kind].append(simplify(coordinates))

    return {
        "type": "FeatureCollection",
        "bbox": BBOX,
        "source": "OpenStreetMap contributors",
        "snapshot": snapshot["osm3s"]["timestamp_osm_base"],
        "license": "https://opendatacommons.org/licenses/odbl/1-0/",
        "features": [
            feature(kind, "MultiLineString", coordinates)
            for kind, coordinates in lines.items()
        ] + labels,
    }


if __name__ == "__main__":
    source, destination = map(Path, sys.argv[1:])
    data = convert(json.loads(source.read_text(encoding="utf-8")))
    destination.write_text(
        json.dumps(data, ensure_ascii=False, separators=(",", ":")) + "\n",
        encoding="utf-8",
    )
