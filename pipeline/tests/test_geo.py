"""geo.py: distance from India, on a synthetic square and on the real outline."""
import math

import pytest
from shapely.geometry import box

import geo

SQUARE = box(80.0, 20.0, 81.0, 21.0)  # lon/lat


def test_inside_is_zero():
    assert geo.km_from(SQUARE, 20.5, 80.5) == 0.0


def test_east_of_square_matches_great_circle():
    # 1 degree of longitude at 20.5 N
    expected = math.radians(1.0) * geo.EARTH_RADIUS_KM * math.cos(math.radians(20.5))
    assert geo.km_from(SQUARE, 20.5, 82.0) == pytest.approx(expected, rel=0.005)


def test_north_of_square():
    expected = math.radians(0.5) * geo.EARTH_RADIUS_KM
    assert geo.km_from(SQUARE, 21.5, 80.5) == pytest.approx(expected, rel=0.005)


@pytest.mark.parametrize("place, lat, lon", [
    ("Delhi", 28.61, 77.21),
    ("Port Blair (Andaman)", 11.62, 92.73),
    ("Kavaratti (Lakshadweep)", 10.57, 72.64),
    ("Leh (Ladakh)", 34.16, 77.58),
])
def test_real_outline_inside(place, lat, lon):
    assert geo.km_from_india(lat, lon) == 0.0, place


@pytest.mark.parametrize("place, lat, lon, low, high", [
    ("Lahore, ~25 km from the Wagah border", 31.55, 74.34, 5, 50),
    ("Dhaka", 23.81, 90.41, 30, 150),
    ("Karachi", 24.86, 67.01, 100, 250),
    ("Colombo", 6.93, 79.86, 150, 400),
    ("Hindu Kush (Jurm)", 36.5, 70.8, 100, 250),
])
def test_real_outline_outside(place, lat, lon, low, high):
    assert low < geo.km_from_india(lat, lon) < high, place
