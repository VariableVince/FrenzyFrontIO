#!/usr/bin/env python3
"""
Generate circular map binary files for OpenFront
Uses the same terrain packing as the Go map generator
"""
import struct
import math

def is_land(x, y, center_x, center_y, radius):
    """Check if a point is land (inside the circle)"""
    distance = math.sqrt((x - center_x)**2 + (y - center_y)**2)
    return distance <= radius

def generate_map(width, height, output_file):
    """Generate a circular map with proper terrain encoding"""
    center_x = width / 2
    center_y = height / 2
    radius = min(width, height) * 0.44  # 44% of size for nice circular land
    
    # Terrain encoding (from map_generator.go packTerrain function):
    # Bit 7: Is Land (1) or Water (0)
    # Bit 6: Is Shoreline
    # Bit 5: Is Ocean
    # Bits 0-4: Magnitude (0-31)
    
    LAND_BASE = 0b10000000  # 128
    OCEAN_BASE = 0b00100000  # 32
    
    # Create terrain data
    terrain = []
    land_count = 0
    
    for y in range(height):
        for x in range(width):
            distance = math.sqrt((x - center_x)**2 + (y - center_y)**2)
            
            if distance <= radius:
                # Land - add magnitude based on distance from edge
                magnitude = min(31, int((radius - distance) / radius * 20))
                terrain.append(LAND_BASE | magnitude)
                land_count += 1
            else:
                # Ocean - add magnitude based on distance from land
                magnitude = min(31, int((distance - radius) / 100 * 20))
                terrain.append(OCEAN_BASE | magnitude)
    
    # Write binary file (NO dimension headers - just raw terrain data)
    with open(output_file, 'wb') as f:
        f.write(bytes(terrain))
    
    print(f"Generated {output_file}: {width}x{height}, {land_count} land tiles")
    return land_count

# Generate all three map sizes
land_tiles_full = generate_map(800, 800, 'resources/maps/circlemap/map.bin')
land_tiles_4x = generate_map(400, 400, 'resources/maps/circlemap/map4x.bin')
land_tiles_16x = generate_map(200, 200, 'resources/maps/circlemap/map16x.bin')

print(f"\nLand tile counts:")
print(f"  Full (800x800): {land_tiles_full}")
print(f"  4x (400x400): {land_tiles_4x}")
print(f"  16x (200x200): {land_tiles_16x}")
print("\nUpdate these values in manifest.json")
